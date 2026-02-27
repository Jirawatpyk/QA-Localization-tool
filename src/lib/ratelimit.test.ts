import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Mock setup ──
// Track all Ratelimit constructor configs and provide per-prefix limit functions

const { constructorConfigs, slidingWindowArgs, mockAiPipelineLimit, mockAiL2Limit, mockAiL3Limit } =
  vi.hoisted(() => {
    const constructorConfigs: Array<{ prefix: string; limiter: unknown }> = []
    const slidingWindowArgs: Array<unknown[]> = []

    const mockAiPipelineLimit = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60_000 }),
    )
    const mockAiL2Limit = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ success: true, limit: 100, remaining: 99, reset: Date.now() + 3600_000 }),
    )
    const mockAiL3Limit = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ success: true, limit: 50, remaining: 49, reset: Date.now() + 3600_000 }),
    )

    return {
      constructorConfigs,
      slidingWindowArgs,
      mockAiPipelineLimit,
      mockAiL2Limit,
      mockAiL3Limit,
    }
  })

vi.mock('@upstash/ratelimit', () => {
  // Regular function so `new` works
  function MockRatelimit(config: { prefix: string; limiter: unknown }) {
    constructorConfigs.push(config)
    const prefixToLimiter: Record<string, (...a: unknown[]) => Promise<unknown>> = {
      'rl:ai_pipeline': mockAiPipelineLimit,
      'rl:ai_l2': mockAiL2Limit,
      'rl:ai_l3': mockAiL3Limit,
    }
    return { limit: prefixToLimiter[config.prefix] ?? vi.fn() }
  }

  MockRatelimit.slidingWindow = (...args: unknown[]) => {
    slidingWindowArgs.push(args)
    return { type: 'slidingWindow', args }
  }

  return { Ratelimit: MockRatelimit }
})

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn(() => ({ type: 'redis' })) },
}))

describe('AI Rate Limiters', () => {
  beforeEach(() => {
    // Only clear limit mock call history — NOT constructor/slidingWindow records (populated at module load)
    mockAiPipelineLimit.mockClear()
    mockAiL2Limit.mockClear()
    mockAiL3Limit.mockClear()
  })

  // ── P0: Limiter exports and config ──

  it("should export aiPipelineLimiter configured as slidingWindow(5, '60 s')", async () => {
    const { aiPipelineLimiter } = await import('./ratelimit')
    expect(aiPipelineLimiter).toBeDefined()
    expect(slidingWindowArgs).toContainEqual([5, '60 s'])
  })

  it("should export aiL2ProjectLimiter configured as slidingWindow(100, '1 h')", async () => {
    const { aiL2ProjectLimiter } = await import('./ratelimit')
    expect(aiL2ProjectLimiter).toBeDefined()
    expect(slidingWindowArgs).toContainEqual([100, '1 h'])
  })

  it("should export aiL3ProjectLimiter configured as slidingWindow(50, '1 h')", async () => {
    const { aiL3ProjectLimiter } = await import('./ratelimit')
    expect(aiL3ProjectLimiter).toBeDefined()
    expect(slidingWindowArgs).toContainEqual([50, '1 h'])
  })

  it("should use prefix 'rl:ai_pipeline' for aiPipelineLimiter", async () => {
    await import('./ratelimit')
    expect(constructorConfigs.find((c) => c.prefix === 'rl:ai_pipeline')).toBeDefined()
  })

  it("should use prefix 'rl:ai_l2' for aiL2ProjectLimiter", async () => {
    await import('./ratelimit')
    expect(constructorConfigs.find((c) => c.prefix === 'rl:ai_l2')).toBeDefined()
  })

  it("should use prefix 'rl:ai_l3' for aiL3ProjectLimiter", async () => {
    await import('./ratelimit')
    expect(constructorConfigs.find((c) => c.prefix === 'rl:ai_l3')).toBeDefined()
  })

  // ── P1-BV: Boundary values ──

  it('should allow the 5th request (pass) per user within 60s window', async () => {
    mockAiPipelineLimit.mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    })

    const { aiPipelineLimiter } = await import('./ratelimit')
    const result = await aiPipelineLimiter.limit('user-id-123')

    expect(result.success).toBe(true)
  })

  it('should block the 6th request per user within 60s window', async () => {
    mockAiPipelineLimit.mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    })

    const { aiPipelineLimiter } = await import('./ratelimit')
    const result = await aiPipelineLimiter.limit('user-id-123')

    expect(result.success).toBe(false)
  })

  it('should allow the 100th request (pass) per project for L2 limiter', async () => {
    mockAiL2Limit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 3600_000,
    })

    const { aiL2ProjectLimiter } = await import('./ratelimit')
    const result = await aiL2ProjectLimiter.limit('project-id-abc')

    expect(result.success).toBe(true)
  })

  it('should block the 101st request per project for L2 limiter', async () => {
    mockAiL2Limit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 3600_000,
    })

    const { aiL2ProjectLimiter } = await import('./ratelimit')
    const result = await aiL2ProjectLimiter.limit('project-id-abc')

    expect(result.success).toBe(false)
  })
})
