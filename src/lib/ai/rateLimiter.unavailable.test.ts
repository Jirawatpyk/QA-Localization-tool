import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockAiL2Limit } = vi.hoisted(() => ({
  mockAiL2Limit: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 100, remaining: 99, reset: 0 }),
  ),
}))

vi.mock('@upstash/ratelimit', () => {
  function MockRatelimit(_config: Record<string, unknown>) {
    return { limit: (...args: unknown[]) => mockAiL2Limit(...args) }
  }
  MockRatelimit.slidingWindow = (..._args: unknown[]) => ({ type: 'slidingWindow' })
  return { Ratelimit: MockRatelimit }
})

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn(() => ({ type: 'redis' })) },
}))

describe('Rate limiter — Upstash unavailable behavior (P1-06, R3-032)', () => {
  beforeEach(() => {
    mockAiL2Limit.mockClear()
  })

  it('[P1] should fail-closed when Upstash returns error (block request)', async () => {
    // Simulate Upstash throwing a connection error
    mockAiL2Limit.mockRejectedValueOnce(new Error('Upstash connection refused'))

    const { aiL2ProjectLimiter } = await import('@/lib/ratelimit')

    // Fail-closed: the error propagates — caller must handle (no silent allow)
    await expect(aiL2ProjectLimiter.limit('project-id')).rejects.toThrow(
      'Upstash connection refused',
    )
  })

  it('[P1] should fail-closed when Upstash times out (same behavior as error)', async () => {
    // Simulate timeout
    mockAiL2Limit.mockRejectedValueOnce(new Error('ETIMEDOUT'))

    const { aiL2ProjectLimiter } = await import('@/lib/ratelimit')

    // Timeout should also propagate — no silent bypass
    await expect(aiL2ProjectLimiter.limit('project-id')).rejects.toThrow('ETIMEDOUT')
  })

  it('[P1] should allow within limit and block above during normal operation', async () => {
    // Allow: within limit
    mockAiL2Limit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 50,
      reset: Date.now() + 3600_000,
    })

    const { aiL2ProjectLimiter } = await import('@/lib/ratelimit')
    const allowResult = await aiL2ProjectLimiter.limit('project-id')
    expect(allowResult.success).toBe(true)

    // Block: over limit
    mockAiL2Limit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 3600_000,
    })

    const blockResult = await aiL2ProjectLimiter.limit('project-id')
    expect(blockResult.success).toBe(false)
  })
})
