import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { L2Result } from '@/features/pipeline/helpers/runL2ForFile'
import type { ProcessingMode } from '@/types/pipeline'

// ── Hoisted mocks ──
const { mockRunL1ForFile, mockScoreFile, mockRunL2ForFile, dbState, dbMockModule } = vi.hoisted(
  () => {
    const { dbState, dbMockModule } = createDrizzleMock()
    return {
      mockRunL1ForFile: vi.fn((..._args: unknown[]) =>
        Promise.resolve({ findingCount: 5, duration: 120 }),
      ),
      mockScoreFile: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          scoreId: faker.string.uuid(),
          fileId: faker.string.uuid(),
          mqmScore: 85,
          npt: 15,
          totalWords: 1000,
          criticalCount: 0,
          majorCount: 3,
          minorCount: 0,
          status: 'calculated' as string,
          autoPassRationale: null as string | null,
        }),
      ),
      mockRunL2ForFile: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          findingCount: 3,
          duration: 200,
          aiModel: 'gpt-4o-mini',
          chunksTotal: 1,
          chunksSucceeded: 1,
          chunksFailed: 0,
          partialFailure: false,
          totalUsage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.001 },
        } as L2Result),
      ),
      dbState,
      dbMockModule,
    }
  },
)

vi.mock('@/features/pipeline/helpers/runL1ForFile', () => ({
  runL1ForFile: (...args: unknown[]) => mockRunL1ForFile(...args),
}))

vi.mock('@/features/pipeline/helpers/runL2ForFile', () => ({
  runL2ForFile: (...args: unknown[]) => mockRunL2ForFile(...args),
}))

vi.mock('@/features/pipeline/helpers/runL3ForFile', () => ({
  runL3ForFile: vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      findingCount: 2,
      duration: 500,
      aiModel: 'claude-sonnet-4-5-20250929',
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      partialFailure: false,
      totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.015 },
    }),
  ),
}))

vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: (...args: unknown[]) => mockScoreFile(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => dbMockModule)

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

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

// ── Test helpers ──

function buildPipelineFileEvent(
  overrides?: Partial<{
    fileId: string
    projectId: string
    tenantId: string
    userId: string
    mode: ProcessingMode
    uploadBatchId: string | null
  }>,
) {
  return {
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    mode: 'economy' as const,
    uploadBatchId: null as string | null,
    ...overrides,
  }
}

function createMockStep() {
  const stepIds: string[] = []
  return {
    run: vi.fn(async (id: string, fn: () => Promise<unknown>) => {
      stepIds.push(id)
      return fn()
    }),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
    stepIds,
  }
}

describe('processFile — step ID determinism (P1-04, R3-021)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('[P1] should produce step IDs containing fileId (deterministic)', async () => {
    const fileId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
    const mockStep = createMockStep()
    const eventData = buildPipelineFileEvent({ fileId })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // All step IDs should contain the fileId
    for (const stepId of mockStep.stepIds) {
      expect(stepId).toContain(fileId)
    }
  })

  it('[P1] should produce different step IDs for two different fileIds', async () => {
    const fileIdA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const fileIdB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

    const mockStepA = createMockStep()
    const mockStepB = createMockStep()

    const { processFilePipeline } = await import('./processFile')
    const handler = (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler

    await handler({ event: { data: buildPipelineFileEvent({ fileId: fileIdA }) }, step: mockStepA })

    vi.clearAllMocks()
    dbState.callIndex = 0

    await handler({ event: { data: buildPipelineFileEvent({ fileId: fileIdB }) }, step: mockStepB })

    // Step IDs from fileA should not appear in fileB's steps
    for (const stepIdA of mockStepA.stepIds) {
      expect(mockStepB.stepIds).not.toContain(stepIdA)
    }
  })

  it('[P1] should produce same step IDs on re-run of same fileId (idempotent)', async () => {
    const fileId = 'c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3'

    const mockStep1 = createMockStep()
    const mockStep2 = createMockStep()

    const { processFilePipeline } = await import('./processFile')
    const handler = (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler

    const eventData = buildPipelineFileEvent({ fileId })

    await handler({ event: { data: eventData }, step: mockStep1 })

    vi.clearAllMocks()
    dbState.callIndex = 0

    await handler({ event: { data: eventData }, step: mockStep2 })

    // Same fileId → same step IDs in same order
    expect(mockStep1.stepIds).toEqual(mockStep2.stepIds)
  })
})
