/** Story 3.4 ATDD — callWithFallback utility */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockLogger } = vi.hoisted(() => {
  return {
    mockLogger: {
      warn: vi.fn((..._args: unknown[]) => undefined),
      info: vi.fn((..._args: unknown[]) => undefined),
      error: vi.fn((..._args: unknown[]) => undefined),
      debug: vi.fn((..._args: unknown[]) => undefined),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

// Stub error class used by production code
class MockNonRetriableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonRetriableError'
  }
}

vi.mock('inngest', () => ({
  NonRetriableError: MockNonRetriableError,
}))

// ── Test helpers ──

function makeRateLimitError(): Error {
  const err = new Error('rate limit exceeded')
  ;(err as Error & { status: number }).status = 429
  return err
}

function makeTimeoutError(): Error {
  return new Error('request timeout ETIMEDOUT')
}

function makeAuthError(): Error {
  const err = new Error('unauthorized')
  ;(err as Error & { status: number }).status = 401
  return err
}

function makeUnknownError(): Error {
  return new Error('unexpected failure')
}

// ── Suite ──

describe('callWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // T01
  it('[P0] should return result from primary model when it succeeds on first try', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const primaryFn = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ findings: [{ id: '1' }], usage: { inputTokens: 100, outputTokens: 50 } }),
    )
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    const result = await callWithFallback(chain, primaryFn)

    expect(result.data).toEqual({
      findings: [{ id: '1' }],
      usage: { inputTokens: 100, outputTokens: 50 },
    })
    expect(result.modelUsed).toBe('gpt-4o-mini')
    expect(result.fallbackUsed).toBe(false)
    expect(primaryFn).toHaveBeenCalledTimes(1)
    expect(primaryFn).toHaveBeenCalledWith('gpt-4o-mini')
  })

  // T02
  it('[P0] should try fallback when primary fails with rate_limit error', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    const result = await callWithFallback(chain, modelFn)

    expect(result.modelUsed).toBe('gemini-2.0-flash')
    expect(result.fallbackUsed).toBe(true)
    expect(modelFn).toHaveBeenCalledTimes(2)
    expect(modelFn).toHaveBeenNthCalledWith(1, 'gpt-4o-mini')
    expect(modelFn).toHaveBeenNthCalledWith(2, 'gemini-2.0-flash')
  })

  // T03
  it('[P1] should try fallback when primary fails with timeout error', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const timeoutErr = makeTimeoutError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(timeoutErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'claude-sonnet-4-5-20250929', fallbacks: ['gpt-4o'] }

    const result = await callWithFallback(chain, modelFn)

    expect(result.modelUsed).toBe('gpt-4o')
    expect(result.fallbackUsed).toBe(true)
  })

  // T04
  it('[P0] should throw NonRetriableError when all models fail with auth error', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const authErr = makeAuthError()
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(authErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    await expect(callWithFallback(chain, modelFn)).rejects.toThrow(MockNonRetriableError)
    // Verify both primary and fallback were tried before throwing
    expect(modelFn).toHaveBeenCalledTimes(2)
    expect(modelFn).toHaveBeenNthCalledWith(1, 'gpt-4o-mini')
    expect(modelFn).toHaveBeenNthCalledWith(2, 'gemini-2.0-flash')
  })

  // T05
  it('[P0] should throw directly when primary fails and fallbacks array is empty', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(rateLimitErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: [] }

    await expect(callWithFallback(chain, modelFn)).rejects.toThrow(rateLimitErr)
    expect(modelFn).toHaveBeenCalledTimes(1)
  })

  // T05b — H5: auth error with empty fallbacks → NonRetriableError (not retriable)
  it('[P0] should throw NonRetriableError when primary fails with auth error and no fallbacks', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const authErr = makeAuthError()
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(authErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: [] }

    // Auth error with no fallbacks: exhausted immediately → NonRetriableError
    await expect(callWithFallback(chain, modelFn)).rejects.toThrow(MockNonRetriableError)
    expect(modelFn).toHaveBeenCalledTimes(1)
  })

  // T06
  it('[P1] should log each fallback attempt with model, error, and kind', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    await callWithFallback(chain, modelFn)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        failedModel: 'gpt-4o-mini',
        nextModel: 'gemini-2.0-flash',
        errorKind: expect.stringMatching(/rate_limit/),
      }),
      expect.stringContaining('fallback'),
    )
  })

  // T07
  it('[P0] should set fallbackUsed=true when fallback model succeeds', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    const result = await callWithFallback(chain, modelFn)

    expect(result.fallbackUsed).toBe(true)
  })

  // T08
  it('[P1] should return modelUsed as actual fallback model (not primary)', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    const result = await callWithFallback(chain, modelFn)

    expect(result.modelUsed).toBe('gemini-2.0-flash')
    expect(result.modelUsed).not.toBe('gpt-4o-mini')
  })

  // T09
  it('[P0] should record actual model used for finding aiModel field', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const fallbackData = {
      findings: [{ id: 'f1', aiModel: 'gemini-2.0-flash' }],
      usage: { inputTokens: 50, outputTokens: 20 },
    }
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(rateLimitErr)
      return Promise.resolve(fallbackData)
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    const result = await callWithFallback(chain, modelFn)

    // modelUsed is the source of truth for aiModel stamping on findings
    expect(result.modelUsed).toBe('gemini-2.0-flash')
    expect(result.data).toEqual(fallbackData)
  })

  // T60
  it('[P0] should try next provider immediately on 429 rate limit', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount <= 1) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    const result = await callWithFallback(chain, modelFn)

    // Should NOT wait or sleep before trying fallback (immediate retry via next provider)
    expect(result.fallbackUsed).toBe(true)
    expect(modelFn).toHaveBeenCalledTimes(2)
  })

  // T61
  it('[P0] should re-throw when all providers return 429 (let Inngest retry)', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(rateLimitErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    // When all fallbacks are also rate-limited, re-throw the last error (retriable by Inngest)
    await expect(callWithFallback(chain, modelFn)).rejects.toEqual(rateLimitErr)
    expect(modelFn).toHaveBeenCalledTimes(2) // primary + 1 fallback
  })

  // T62
  it('[P0] should re-throw unknown errors immediately without trying fallbacks', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const unknownErr = makeUnknownError()
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(unknownErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    // Unknown errors should propagate immediately (let Inngest decide retry strategy)
    await expect(callWithFallback(chain, modelFn)).rejects.toEqual(unknownErr)
    // Should NOT attempt fallback for unknown errors
    expect(modelFn).toHaveBeenCalledTimes(1)
  })

  // T63
  it('[P0] should re-throw non-AI errors (DB/infra) without consuming fallback chain', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    // A DB/infra error is a plain Error with no status code
    const dbErr = new Error('connection refused to PostgreSQL')
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(dbErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }

    await expect(callWithFallback(chain, modelFn)).rejects.toEqual(dbErr)
    // Fallback chain must NOT be consumed for infra errors
    expect(modelFn).toHaveBeenCalledTimes(1)
  })

  // T72
  it('[P1] should not mutate the fallback chain array during iteration', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount === 1) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const originalFallbacks = ['gemini-2.0-flash', 'gpt-4o']
    const chain = { primary: 'gpt-4o-mini', fallbacks: [...originalFallbacks] }
    const chainCopy = { ...chain, fallbacks: [...chain.fallbacks] }

    await callWithFallback(chain, modelFn)

    // The original chain object must not be mutated
    expect(chain.fallbacks).toEqual(chainCopy.fallbacks)
    expect(chain.primary).toBe(chainCopy.primary)
  })

  // ── TA Gap R: 3-model chain ──
  it('[P1] should try all 3 models when primary and first fallback fail with rate_limit', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const rateLimitErr = makeRateLimitError()
    let callCount = 0
    const modelFn = vi.fn((..._args: unknown[]) => {
      callCount++
      if (callCount <= 2) return Promise.reject(rateLimitErr)
      return Promise.resolve({ findings: [], usage: { inputTokens: 50, outputTokens: 20 } })
    })
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash', 'gpt-4o'] }

    const result = await callWithFallback(chain, modelFn)

    expect(result.modelUsed).toBe('gpt-4o')
    expect(result.fallbackUsed).toBe(true)
    expect(modelFn).toHaveBeenCalledTimes(3)
    expect(modelFn).toHaveBeenNthCalledWith(1, 'gpt-4o-mini')
    expect(modelFn).toHaveBeenNthCalledWith(2, 'gemini-2.0-flash')
    expect(modelFn).toHaveBeenNthCalledWith(3, 'gpt-4o')
  })

  // ── TA Gap S: Cascade through 3 models — all fail ──
  it('[P2] should exhaust all 3 models and throw when all fail with auth error', async () => {
    const { callWithFallback } = await import('./fallbackRunner')

    const authErr = makeAuthError()
    const modelFn = vi.fn((..._args: unknown[]) => Promise.reject(authErr))
    const chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash', 'gpt-4o'] }

    await expect(callWithFallback(chain, modelFn)).rejects.toThrow(MockNonRetriableError)
    expect(modelFn).toHaveBeenCalledTimes(3)
  })
})
