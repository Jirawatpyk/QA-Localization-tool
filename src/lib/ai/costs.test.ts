import type { LanguageModelUsage } from 'ai'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    layer: 'layer',
    model: 'model',
    provider: 'provider',
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
    estimatedCost: 'estimated_cost',
    latencyMs: 'latency_ms',
    status: 'status',
    chunkIndex: 'chunk_index',
    languagePair: 'language_pair',
  },
}))

// ── Test constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f'

const baseRecord = {
  tenantId: VALID_TENANT_ID,
  projectId: VALID_PROJECT_ID,
  fileId: VALID_FILE_ID,
  model: 'gpt-4o-mini' as const,
  layer: 'L2' as const,
  inputTokens: 250,
  outputTokens: 80,
  estimatedCostUsd: 0.000085,
  chunkIndex: null,
  durationMs: 1200,
  languagePair: 'en-US→th' as string | null,
  status: 'success' as const,
}

function usage(input: number, output: number): LanguageModelUsage {
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  } as unknown as LanguageModelUsage
}

describe('estimateCost', () => {
  it('should calculate cost for known model (gpt-4o-mini)', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('gpt-4o-mini', 'L2', usage(1000, 500))
    // input: (1000/1000) * 0.00015 = 0.00015
    // output: (500/1000) * 0.0006 = 0.0003
    // total = 0.00045
    expect(cost).toBeCloseTo(0.00045, 6)
  })

  it('should calculate cost for known model (claude-sonnet)', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('claude-sonnet-4-5-20250929', 'L3', usage(2000, 1000))
    // input: (2000/1000) * 0.003 = 0.006
    // output: (1000/1000) * 0.015 = 0.015
    // total = 0.021
    expect(cost).toBeCloseTo(0.021, 6)
  })

  it('should fall back to layer default for unknown model ID', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('gpt-4o-mini-2024-07-18', 'L2', usage(1000, 500))
    // Falls back to gpt-4o-mini config (same rates)
    expect(cost).toBeCloseTo(0.00045, 6)
  })

  it('should handle zero tokens gracefully', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('gpt-4o-mini', 'L2', usage(0, 0))
    expect(cost).toBe(0)
  })

  it('should handle undefined tokens as zero', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('gpt-4o-mini', 'L2', {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: 0,
      inputTokenDetails: undefined,
      outputTokenDetails: undefined,
    } as unknown as LanguageModelUsage)
    expect(cost).toBe(0)
  })
})

describe('aggregateUsage', () => {
  it('should sum tokens and cost across multiple records', async () => {
    const { aggregateUsage } = await import('./costs')
    const result = aggregateUsage([
      { ...baseRecord, inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
      { ...baseRecord, inputTokens: 200, outputTokens: 100, estimatedCostUsd: 0.002 },
      { ...baseRecord, inputTokens: 300, outputTokens: 150, estimatedCostUsd: 0.003 },
    ])
    expect(result.inputTokens).toBe(600)
    expect(result.outputTokens).toBe(300)
    expect(result.estimatedCostUsd).toBeCloseTo(0.006, 6)
  })

  it('should return zeros for empty array', async () => {
    const { aggregateUsage } = await import('./costs')
    const result = aggregateUsage([])
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
    expect(result.estimatedCostUsd).toBe(0)
  })

  it('should handle single record', async () => {
    const { aggregateUsage } = await import('./costs')
    const result = aggregateUsage([
      { ...baseRecord, inputTokens: 500, outputTokens: 200, estimatedCostUsd: 0.005 },
    ])
    expect(result.inputTokens).toBe(500)
    expect(result.outputTokens).toBe(200)
    expect(result.estimatedCostUsd).toBeCloseTo(0.005, 6)
  })
})

describe('logAIUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  // ── P0: DB persistence ──

  it('should INSERT into ai_usage_logs with all required fields on success', async () => {
    // Arrange: INSERT returns successfully
    dbState.returnValues = [[{ id: 'new-log-id' }]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage(baseRecord)

    // Assert: INSERT was called once
    expect(dbState.callIndex).toBe(1)

    // Assert: all required fields present in INSERT values
    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues).toMatchObject({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      layer: 'L2',
      model: 'gpt-4o-mini',
      inputTokens: 250,
      outputTokens: 80,
      estimatedCost: 0.000085,
      latencyMs: 1200,
      status: 'success',
      languagePair: 'en-US→th',
    })
  })

  it("should derive provider='openai' from gpt-4o-mini model ID", async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, model: 'gpt-4o-mini' })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('openai')
  })

  it("should derive provider='anthropic' from claude-* model ID", async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({
      ...baseRecord,
      model: 'claude-sonnet-4-5-20250929' as typeof baseRecord.model,
      layer: 'L3',
    })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('anthropic')
  })

  it("should derive provider='google' from gemini-* model ID", async () => {
    dbState.returnValues = [[]]

    // Note: gemini-2.0-flash is not yet in ModelId union — use cast once added
    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, model: 'gemini-2.0-flash' as typeof baseRecord.model })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('google')
  })

  it("should derive provider='unknown' for unrecognized model ID", async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, model: 'some-unknown-model' as typeof baseRecord.model })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('unknown')
  })

  it('should include tenantId in INSERT values (tenant isolation)', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage(baseRecord)

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.tenantId).toBe(VALID_TENANT_ID)
  })

  // ── P1: Secondary behavior ──

  it('should keep pino log alongside DB insert', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage(baseRecord)

    const { logger } = await import('@/lib/logger')
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: VALID_TENANT_ID,
        model: 'gpt-4o-mini',
      }),
      'AI usage recorded',
    )
  })

  it('should not throw when DB insert fails (log error, swallow)', async () => {
    // Arrange: DB INSERT throws
    dbState.throwAtCallIndex = 0

    const { logAIUsage } = await import('./costs')

    // logAIUsage should NOT propagate the DB error — it is non-fatal
    await expect(logAIUsage(baseRecord)).resolves.not.toThrow()

    const { logger } = await import('@/lib/logger')
    expect(logger.error).toHaveBeenCalled()
  })

  it('should include chunkIndex when provided (not null)', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, chunkIndex: 3 })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.chunkIndex).toBe(3)
  })

  // ── TA: Coverage Gap Tests ──

  // Gap #12 [P2]: status='error' for failed chunk records
  it('[P2] should persist status=error for failed chunk records', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, status: 'error', inputTokens: 0, outputTokens: 0 })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.status).toBe('error')
    expect(insertedValues.inputTokens).toBe(0)
    expect(insertedValues.outputTokens).toBe(0)
  })

  // Gap #13 [P2]: null languagePair when language info unavailable
  it('[P2] should persist null languagePair when language info unavailable', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, languagePair: null })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.languagePair).toBeNull()
  })
})
