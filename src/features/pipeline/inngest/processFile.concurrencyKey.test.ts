import { describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──
const { createFunctionCalls } = vi.hoisted(() => {
  const createFunctionCalls: Array<{
    config: Record<string, unknown>
    trigger: Record<string, unknown>
  }> = []
  return { createFunctionCalls }
})

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((config: Record<string, unknown>, trigger: Record<string, unknown>) => {
      createFunctionCalls.push({ config, trigger })
      return { handler: vi.fn() }
    }),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => ({ db: {} }))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    projectId: 'project_id',
    batchId: 'batch_id',
  },
}))

vi.mock('@/db/schema/uploadBatches', () => ({
  uploadBatches: { id: 'id', tenantId: 'tenant_id', completedAt: 'completed_at' },
}))

vi.mock('@/features/pipeline/helpers/runL1ForFile', () => ({
  runL1ForFile: vi.fn(),
}))

vi.mock('@/features/pipeline/helpers/runL2ForFile', () => ({
  runL2ForFile: vi.fn(),
}))

vi.mock('@/features/pipeline/helpers/runL3ForFile', () => ({
  runL3ForFile: vi.fn(),
}))

vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: vi.fn(),
}))

vi.mock('inngest', () => ({
  NonRetriableError: class NonRetriableError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'NonRetriableError'
    }
  },
}))

vi.mock('zod', () => ({
  z: {
    object: vi.fn(() => ({
      safeParse: vi.fn(() => ({ success: true, data: {} })),
    })),
    string: vi.fn(() => ({
      uuid: vi.fn(() => ({})),
      datetime: vi.fn(() => ({})),
    })),
    enum: vi.fn(() => ({})),
  },
}))

vi.mock('@/types/finding', () => ({
  FINDING_STATUSES: ['pending', 'accepted', 'rejected', 'flagged'] as const,
}))

vi.mock('@/types/pipeline', () => ({
  L1_COMPLETED_STATUSES: new Set(['l1_completed', 'l2_processing', 'l2_completed']),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn(),
}))

describe('processFile + recalculateScore — concurrency keys (P1-12, R3-038)', () => {
  it('[P1] should have processFile concurrency key including projectId', async () => {
    // Reset and reimport to capture createFunction calls
    createFunctionCalls.length = 0
    vi.resetModules()
    await import('./processFile')

    const processFileConfig = createFunctionCalls.find(
      (c) => c.config.id === 'process-file-pipeline',
    )
    expect(processFileConfig).toBeDefined()

    const concurrency = processFileConfig!.config.concurrency as Array<{
      key: string
      limit: number
    }>
    expect(concurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining('projectId'),
          limit: 1,
        }),
      ]),
    )
  })

  it('[P1] should have recalculateScore concurrency key including projectId with limit 1', async () => {
    createFunctionCalls.length = 0
    vi.resetModules()
    await import('./recalculateScore')

    const recalcConfig = createFunctionCalls.find((c) => c.config.id === 'recalculate-score')
    expect(recalcConfig).toBeDefined()

    const concurrency = recalcConfig!.config.concurrency as Array<{
      key: string
      limit: number
    }>
    expect(concurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining('projectId'),
          limit: 1,
        }),
      ]),
    )
  })
})
