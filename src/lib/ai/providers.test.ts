import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

const mockGenerateText = vi.fn()

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    l2PinnedModel: 'l2_pinned_model',
    l3PinnedModel: 'l3_pinned_model',
  },
}))

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  customProvider: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  getModelById: vi.fn(() => 'mocked-model-instance'),
  qaProvider: { languageModel: vi.fn() },
  getModelForLayer: vi.fn(),
}))

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}
vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

// ── Test constants ──

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_TENANT_ID = 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e'

describe('buildFallbackChain', () => {
  // ── P0: Core logic ──

  it('should use system default when pinnedModel is null for L2', async () => {
    const { buildFallbackChain } = await import('./providers')
    const chain = buildFallbackChain('L2', null)

    expect(chain.primary).toBe('gpt-4o-mini')
    expect(chain.fallbacks).not.toContain('gpt-4o-mini') // no self-fallback
    // RED: providers.ts not yet created
  })

  it('should use system default when pinnedModel is null for L3', async () => {
    const { buildFallbackChain } = await import('./providers')
    const chain = buildFallbackChain('L3', null)

    expect(chain.primary).toBe('claude-sonnet-4-5-20250929')
    expect(chain.fallbacks).not.toContain('claude-sonnet-4-5-20250929')
    // RED: providers.ts not yet created
  })

  it('should use pinned model as primary when set for L2', async () => {
    const { buildFallbackChain } = await import('./providers')
    const chain = buildFallbackChain('L2', 'gpt-4o-mini-2024-07-18')

    expect(chain.primary).toBe('gpt-4o-mini-2024-07-18')
    // RED: pinned model must become primary
  })

  it('should use pinned model as primary when set for L3', async () => {
    const { buildFallbackChain } = await import('./providers')
    // Use a non-default model to verify pinning actually changes the primary
    const chain = buildFallbackChain('L3', 'gpt-4o')

    expect(chain.primary).toBe('gpt-4o')
    // When pinned to non-default, system default should be in fallbacks
    expect(chain.fallbacks).toContain('claude-sonnet-4-5-20250929')
  })

  it('should include system default in fallbacks when pinned model overrides it', async () => {
    const { buildFallbackChain } = await import('./providers')
    const chain = buildFallbackChain('L2', 'gpt-4o-mini-2024-07-18')

    // When pinned, system default moves to fallback position
    expect(chain.fallbacks).toContain('gpt-4o-mini')
    // RED: system default must be in fallback chain when overridden
  })

  it('should not duplicate pinned model in fallbacks array', async () => {
    const { buildFallbackChain } = await import('./providers')
    // Pinned model is same as system default
    const chain = buildFallbackChain('L2', 'gpt-4o-mini')

    // 'gpt-4o-mini' should appear as primary only, not also in fallbacks
    expect(chain.fallbacks.filter((m) => m === 'gpt-4o-mini').length).toBe(0)
    // RED: filter(m => m !== primary) prevents duplication
  })

  // ── P1: Fallback chain completeness ──

  it('should return L2 fallback chain: gpt-4o-mini → gemini-2.0-flash', async () => {
    const { buildFallbackChain, LAYER_DEFAULTS } = await import('./providers')
    const chain = buildFallbackChain('L2', null)

    expect(chain.primary).toBe('gpt-4o-mini')
    expect(chain.fallbacks).toContain('gemini-2.0-flash')
    expect(LAYER_DEFAULTS.L2.fallbacks).toContain('gemini-2.0-flash')
    // RED: LAYER_DEFAULTS must include gemini fallback for L2
  })

  it('should return L3 fallback chain: claude-sonnet-4-5-20250929 → gpt-4o', async () => {
    const { buildFallbackChain, LAYER_DEFAULTS } = await import('./providers')
    const chain = buildFallbackChain('L3', null)

    expect(chain.primary).toBe('claude-sonnet-4-5-20250929')
    expect(chain.fallbacks).toContain('gpt-4o')
    expect(LAYER_DEFAULTS.L3.fallbacks).toContain('gpt-4o')
    // RED: LAYER_DEFAULTS must include gpt-4o fallback for L3
  })

  it('should filter out primary from fallbacks (no self-fallback)', async () => {
    const { buildFallbackChain } = await import('./providers')

    const l2Chain = buildFallbackChain('L2', null)
    expect(l2Chain.fallbacks).not.toContain(l2Chain.primary)

    const l3Chain = buildFallbackChain('L3', null)
    expect(l3Chain.fallbacks).not.toContain(l3Chain.primary)
    // RED: filter ensures no self-reference in fallbacks
  })
})

describe('getModelForLayerWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('should read pinned model from projects table via getModelForLayerWithFallback', async () => {
    // Arrange: project has l2_pinned_model set
    dbState.returnValues = [[{ l2PinnedModel: 'gpt-4o-mini-2024-07-18', l3PinnedModel: null }]]

    const { getModelForLayerWithFallback } = await import('./providers')
    const chain = await getModelForLayerWithFallback('L2', VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(chain.primary).toBe('gpt-4o-mini-2024-07-18')
    // RED: getModelForLayerWithFallback queries projects table for pinned model
  })
})

// ── Story 3.2a AC1: Provider Health Check ──

describe('checkProviderHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P0] should return available=true and latencyMs > 0 for healthy provider', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const { checkProviderHealth } = await import('./providers')
    const result = await checkProviderHealth('openai')

    expect(result.available).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.latencyMs).toBe('number')
  })

  it('[P0] should return available=false when provider probe fails', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('Connection refused'))

    const { checkProviderHealth } = await import('./providers')
    const result = await checkProviderHealth('openai')

    expect(result.available).toBe(false)
  })

  it('[P1] should never throw — always return result even for unknown provider', async () => {
    const { checkProviderHealth } = await import('./providers')
    const result = await checkProviderHealth('nonexistent-provider')

    expect(result).toBeDefined()
    expect(typeof result.available).toBe('boolean')
    expect(typeof result.latencyMs).toBe('number')
  })

  it('[P1] should complete within reasonable timeout (not blocking)', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const { checkProviderHealth } = await import('./providers')
    const start = performance.now()
    await checkProviderHealth('openai')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5000)
  })

  it('[P1] should log health check result via pino', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const { checkProviderHealth } = await import('./providers')
    await checkProviderHealth('openai')

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai' }),
      expect.any(String),
    )
  })
})

// ── Story 3.2a AC1: Fallback chain + health check integration ──

describe('fallback chain with health check integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('[P1] should skip unhealthy primary and use first available fallback', async () => {
    // Primary (openai) health check fails, fallback (google) succeeds
    mockGenerateText
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ output: null, usage: { inputTokens: 0, outputTokens: 0 } })

    const { buildFallbackChain, resolveHealthyModel } = await import('./providers')
    const chain = buildFallbackChain('L2', null)
    const resolved = await resolveHealthyModel(chain)

    expect(resolved.primary).toBeDefined()
    expect(resolved.primary).toBe('gemini-2.0-flash')
  })

  it('[P1] should log when fallback is activated due to health check failure', async () => {
    // Primary fails, fallback succeeds
    mockGenerateText
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ output: null, usage: { inputTokens: 0, outputTokens: 0 } })

    const { buildFallbackChain, resolveHealthyModel } = await import('./providers')
    const chain = buildFallbackChain('L2', null)
    await resolveHealthyModel(chain)

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackModel: 'gemini-2.0-flash' }),
      expect.any(String),
    )
  })
})
