/**
 * Epic 3 BLOCK Risk R3-006: Fallback x Retry Cost Explosion
 *
 * Simulates Inngest retry loops calling callWithFallback() multiple times,
 * verifying total API call counts across all retries stay within bounds.
 *
 * Existing unit tests (fallbackRunner.test.ts) cover individual fallback behavior.
 * These integration tests verify the multiplicative effect: retries x chain length.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    warn: vi.fn((..._args: unknown[]) => undefined),
    info: vi.fn((..._args: unknown[]) => undefined),
    error: vi.fn((..._args: unknown[]) => undefined),
    debug: vi.fn((..._args: unknown[]) => undefined),
  },
}))

vi.mock('@/lib/logger', () => ({ logger: mockLogger }))

class MockNonRetriableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetriableError'
  }
}

vi.mock('inngest', () => ({ NonRetriableError: MockNonRetriableError }))

// ── Test helpers ──

function makeRateLimitError(): Error {
  const err = new Error('rate limit exceeded')
  ;(err as Error & { status: number }).status = 429
  return err
}

// ── Suite ──

describe('Fallback x Retry Integration — R3-006', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P0] should resolve with total calls = 2 when primary 429 and fallback succeeds (no Inngest retry needed)', async () => {
    const { callWithFallback } = await import('@/lib/ai/fallbackRunner')

    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(makeRateLimitError())
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })

    // Single callWithFallback — no retry loop needed
    const result = await callWithFallback(chain, modelFn)

    expect(modelFn).toHaveBeenCalledTimes(2)
    expect(result.modelUsed).toBe('gemini-2.0-flash')
    expect(result.fallbackUsed).toBe(true)
  })

  it('[P0] should total 3 calls when all providers 429 on first attempt and primary succeeds on second attempt', async () => {
    const { callWithFallback } = await import('@/lib/ai/fallbackRunner')

    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }
    let globalCallCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      globalCallCount++
      // Round 1: calls 1 (primary) and 2 (fallback) both fail with 429
      // Round 2: call 3 (primary) succeeds
      if (globalCallCount <= 2) return Promise.reject(makeRateLimitError())
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })

    const MAX_RETRIES = 3
    let succeeded = false

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        const result = await callWithFallback(chain, modelFn)
        // Success — verify result
        expect(result.modelUsed).toBe('gpt-4o-mini')
        expect(result.fallbackUsed).toBe(false)
        succeeded = true
        break
      } catch (err) {
        if (err instanceof MockNonRetriableError) break
        // Retriable 429 — Inngest would retry
      }
    }

    expect(succeeded).toBe(true)
    // Round 1: primary(429) + fallback(429) = 2 calls, re-throw
    // Round 2: primary(success) = 1 call
    // Total = 3
    expect(modelFn.mock.calls.length).toBe(3)
  })

  it('[P0] should total 6 calls when 3 Inngest retries all fail with 2-model chain', async () => {
    const { callWithFallback } = await import('@/lib/ai/fallbackRunner')

    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }
    // Every call returns 429
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(makeRateLimitError()))

    const MAX_RETRIES = 3
    let lastError: Error | null = null

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        await callWithFallback(chain, modelFn)
        break
      } catch (err) {
        lastError = err as Error
        if (err instanceof MockNonRetriableError) break
        // Retriable 429 — Inngest would retry
      }
    }

    // After 3 exhausted retries, simulate Inngest giving up
    expect(lastError).not.toBeNull()
    expect(lastError!.message).toBe('rate limit exceeded')

    // 3 retries x 2 models per retry = 6 total API calls
    expect(modelFn.mock.calls.length).toBe(6)
  })

  it('[P0] should enforce upper bound: retries(3) x chain(3) = 9 max calls per chunk', async () => {
    const { callWithFallback } = await import('@/lib/ai/fallbackRunner')

    const chain = {
      primary: 'gpt-4o-mini',
      fallbacks: ['gemini-2.0-flash', 'gpt-4o'],
    }
    // Every call returns 429
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(makeRateLimitError()))

    const MAX_RETRIES = 3

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        await callWithFallback(chain, modelFn)
        break
      } catch (err) {
        if (err instanceof MockNonRetriableError) break
        // Retriable 429 — Inngest would retry
      }
    }

    // 3 retries x 3 models = 9 total API calls
    expect(modelFn.mock.calls.length).toBe(9)
  })

  it('[P0] should track cost metadata: fallbackUsed, modelUsed, and attemptsLog on fallback success', async () => {
    const { callWithFallback } = await import('@/lib/ai/fallbackRunner')

    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(makeRateLimitError())
      return Promise.resolve({ findings: [], usage: { inputTokens: 100, outputTokens: 50 } })
    })

    const result = await callWithFallback(chain, modelFn)

    // Verify fallback metadata for cost tracking
    expect(result.fallbackUsed).toBe(true)
    expect(result.modelUsed).toBe('gemini-2.0-flash')

    // attemptsLog should contain only the failed primary attempt
    expect(result.attemptsLog).toHaveLength(1)
    expect(result.attemptsLog[0]).toEqual(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        kind: 'rate_limit',
      }),
    )
  })
})
