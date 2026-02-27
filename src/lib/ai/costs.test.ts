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
}

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
      latencyMs: 1200,
      status: 'success',
    })
    // RED: logAIUsage currently pino-only, no DB INSERT
  })

  it("should derive provider='openai' from gpt-4o-mini model ID", async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, model: 'gpt-4o-mini' })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('openai')
    // RED: deriveProvider not yet implemented
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
    // RED: deriveProvider not yet implemented
  })

  it("should derive provider='google' from gemini-* model ID", async () => {
    dbState.returnValues = [[]]

    // Note: gemini-2.0-flash is not yet in ModelId union — use cast once added
    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, model: 'gemini-2.0-flash' as typeof baseRecord.model })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('google')
    // RED: deriveProvider not yet implemented for google
  })

  it("should derive provider='unknown' for unrecognized model ID", async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, model: 'some-unknown-model' as typeof baseRecord.model })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.provider).toBe('unknown')
    // RED: deriveProvider fallback to 'unknown'
  })

  it('should include tenantId in INSERT values (tenant isolation)', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage(baseRecord)

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.tenantId).toBe(VALID_TENANT_ID)
    // RED: tenant isolation check for ai_usage_logs INSERT
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
    // RED: pino log must coexist with DB insert
  })

  it('should not throw when DB insert fails (log error, swallow)', async () => {
    // Arrange: DB INSERT throws
    dbState.throwAtCallIndex = 0

    const { logAIUsage } = await import('./costs')

    // logAIUsage should NOT propagate the DB error — it is non-fatal
    await expect(logAIUsage(baseRecord)).resolves.not.toThrow()

    const { logger } = await import('@/lib/logger')
    expect(logger.error).toHaveBeenCalled()
    // RED: DB failure in logAIUsage must be swallowed (audit log non-fatal pattern)
  })

  it('should include chunkIndex when provided (not null)', async () => {
    dbState.returnValues = [[]]

    const { logAIUsage } = await import('./costs')
    await logAIUsage({ ...baseRecord, chunkIndex: 3 })

    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.chunkIndex).toBe(3)
    // RED: chunkIndex column added in Task 1.3 migration
  })
})
