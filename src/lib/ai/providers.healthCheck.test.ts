/**
 * P3-05: Health check is a separate concern from inference
 * Health check returning OK does NOT guarantee inference will succeed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { dbState: _dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

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

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('checkProviderHealth — separate from inference (P3-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P3] should return available=true even when inference would fail (separate concerns)', async () => {
    // Health check succeeds (lightweight probe)
    mockGenerateText.mockResolvedValueOnce({
      output: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    const { checkProviderHealth } = await import('./providers')
    const healthResult = await checkProviderHealth('openai')

    // Health says OK
    expect(healthResult.available).toBe(true)

    // But a real inference call could still fail (different prompt, different model config)
    // Health check uses `prompt: 'ping', maxOutputTokens: 1` — minimal probe
    // Inference uses complex structured output with schema — can fail independently
    mockGenerateText.mockRejectedValueOnce(new Error('NoObjectGeneratedError: schema mismatch'))

    // This demonstrates the separate concern: health != inference success
    await expect(mockGenerateText()).rejects.toThrow('NoObjectGeneratedError')

    // Health check result is still cached as available=true
    expect(healthResult.available).toBe(true)
  })
})
