/** Story 3.4 ATDD — processFilePipeline partial results handling */
import { faker } from '@faker-js/faker'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { L2Result } from '@/features/pipeline/helpers/runL2ForFile'
import type { L3Result } from '@/features/pipeline/helpers/runL3ForFile'
import type { ScoreStatus } from '@/types/finding'
import type {
  DbFileStatus,
  PipelineFileEventData,
  ProcessingMode,
  UploadBatchId,
} from '@/types/pipeline'
import { asTenantId } from '@/types/tenant'
import type { TenantId } from '@/types/tenant'

// ── Hoisted mocks ──
const {
  mockRunL1ForFile,
  mockScoreFile,
  mockRunL2ForFile,
  mockRunL3ForFile,
  dbState,
  dbMockModule,
} = vi.hoisted(() => {
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
        status: 'calculated' as ScoreStatus,
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
        fallbackUsed: false,
        totalUsage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.001 },
      } as L2Result),
    ),
    mockRunL3ForFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        findingCount: 2,
        duration: 500,
        aiModel: 'claude-sonnet-4-5-20250929',
        chunksTotal: 1,
        chunksSucceeded: 1,
        chunksFailed: 0,
        partialFailure: false,
        fallbackUsed: false,
        totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.015 },
      } as L3Result),
    ),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/features/pipeline/helpers/runL1ForFile', () => ({
  runL1ForFile: (...args: unknown[]) => mockRunL1ForFile(...args),
}))

vi.mock('@/features/pipeline/helpers/runL2ForFile', () => ({
  runL2ForFile: (...args: unknown[]) => mockRunL2ForFile(...args),
}))

vi.mock('@/features/pipeline/helpers/runL3ForFile', () => ({
  runL3ForFile: (...args: unknown[]) => mockRunL3ForFile(...args),
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
  sql: vi.fn((...args: unknown[]) => args),
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
  uploadBatches: {
    id: 'id',
    tenantId: 'tenant_id',
    completedAt: 'completed_at',
  },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    status: 'status',
    layerCompleted: 'layer_completed',
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

// ── Test helpers ──

function buildPipelineEvent(
  overrides?: Partial<{
    fileId: string
    projectId: string
    tenantId: TenantId
    userId: string
    mode: ProcessingMode
    uploadBatchId: string
  }>,
) {
  return {
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: asTenantId(faker.string.uuid()),
    userId: faker.string.uuid(),
    mode: 'economy' as ProcessingMode,
    uploadBatchId: '' as UploadBatchId,
    ...overrides,
  }
}

type MockStep = {
  run: ReturnType<typeof vi.fn>
  sendEvent: ReturnType<typeof vi.fn>
}

function createMockStep(): MockStep {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
}

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

describe('processFilePipeline — partial results (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRunL1ForFile.mockResolvedValue({ findingCount: 5, duration: 120 })
    mockRunL2ForFile.mockResolvedValue({
      findingCount: 3,
      duration: 200,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      partialFailure: false,
      fallbackUsed: false,
      totalUsage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.001 },
    } as L2Result)
    mockRunL3ForFile.mockResolvedValue({
      findingCount: 2,
      duration: 500,
      aiModel: 'claude-sonnet-4-5-20250929',
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      partialFailure: false,
      fallbackUsed: false,
      totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.015 },
    } as L3Result)
    mockScoreFile.mockResolvedValue({
      scoreId: faker.string.uuid(),
      fileId: VALID_FILE_ID,
      mqmScore: 85,
      npt: 15,
      totalWords: 1000,
      criticalCount: 0,
      majorCount: 3,
      minorCount: 0,
      status: 'calculated',
      autoPassRationale: null,
    })
  })

  describe('L2 failure handling', () => {
    // T20
    it('[P0] should set file status to ai_partial when L2 fails after retries', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 failed after all retries'))

      // DB calls: set-partial(0), score-partial goes through mock
      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const statusUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(statusUpdate).toBeDefined()
    })

    // T21
    it('[P0] should preserve L1 findings intact when L2 fails', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // L1 must have run
      expect(mockRunL1ForFile).toHaveBeenCalled()
      // L1 score must have been calculated
      expect(mockScoreFile).toHaveBeenCalledWith(expect.objectContaining({ layerFilter: 'L1' }))
    })

    // T22
    it('[P0] should calculate L1-only score with score_status=partial', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(mockScoreFile).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreStatus: 'partial',
          layerCompleted: 'L1',
        }),
      )
    })

    // T24
    it('[P0] should set score=100 and ai_partial when 0 L1 findings and L2 fails', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL1ForFile.mockResolvedValue({ findingCount: 0, duration: 80 })
      mockRunL2ForFile.mockRejectedValue(new Error('L2 failed'))
      mockScoreFile.mockResolvedValue({
        scoreId: faker.string.uuid(),
        fileId: VALID_FILE_ID,
        mqmScore: 100,
        npt: 0,
        totalWords: 500,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      })

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const statusUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(statusUpdate).toBeDefined()
    })

    // T25
    it('[P0] should use ai_partial as valid DbFileStatus value', async () => {
      // Compile-time check: assignment fails if 'ai_partial' removed from canonical DbFileStatus
      const status: DbFileStatus = 'ai_partial'
      expect(status).toBe('ai_partial')
    })

    // T45
    it('[P0] should wrap L2 step in try-catch at handler level (not inside step.run)', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 threw'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      // Handler must NOT throw
      await expect(
        (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
          event,
          step,
        }),
      ).resolves.not.toThrow()
    })

    // T46
    it('[P0] should set ai_partial + L1-only score when L2 throws', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 threw unexpectedly'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()
      expect(mockScoreFile).toHaveBeenCalledWith(
        expect.objectContaining({ scoreStatus: 'partial' }),
      )
    })
  })

  describe('L3 failure handling (Thorough mode)', () => {
    // T27
    it('[P0] should preserve L1+L2 findings when L3 fails', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL3ForFile.mockRejectedValue(new Error('L3 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          mode: 'thorough',
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(mockRunL1ForFile).toHaveBeenCalled()
      expect(mockRunL2ForFile).toHaveBeenCalled()
    })

    // T28
    it('[P0] should set layer_completed=L1L2 and score_status=partial when L3 fails', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL3ForFile.mockRejectedValue(new Error('L3 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          mode: 'thorough',
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(mockScoreFile).toHaveBeenCalledWith(
        expect.objectContaining({
          layerCompleted: 'L1L2',
          scoreStatus: 'partial',
        }),
      )
    })

    // T29
    it('[P0] should set file status to ai_partial (not failed) when L3 fails', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL3ForFile.mockRejectedValue(new Error('L3 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          mode: 'thorough',
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()

      const failedUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'failed',
      )
      expect(failedUpdate).toBeUndefined()
    })

    // T47
    it('[P0] should set ai_partial + L1L2 score when L3 throws in Thorough mode', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL3ForFile.mockRejectedValue(new Error('L3 threw'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          mode: 'thorough',
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()
      expect(mockScoreFile).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreStatus: 'partial',
          layerCompleted: 'L1L2',
        }),
      )
    })

    // T53
    it('[P1] should handle L2 partial chunk failure + L3 failure correctly', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockResolvedValue({
        findingCount: 2,
        duration: 300,
        aiModel: 'gpt-4o-mini',
        chunksTotal: 3,
        chunksSucceeded: 2,
        chunksFailed: 1,
        partialFailure: true,
        fallbackUsed: false,
        totalUsage: { inputTokens: 800, outputTokens: 400, estimatedCostUsd: 0.0008 },
      } as L2Result)

      mockRunL3ForFile.mockRejectedValue(new Error('L3 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          mode: 'thorough',
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()
    })
  })

  describe('onFailureFn — partial detection', () => {
    // T48
    it('[P0] should set ai_partial (not failed) when L1 was completed', async () => {
      const { processFilePipeline } = await import('./processFile')

      // DB: select current status(0) + update status(1)
      dbState.returnValues = [[{ id: VALID_FILE_ID, status: 'l2_processing' }], []]

      const onFailureEvent = {
        data: {
          event: {
            data: buildPipelineEvent({
              fileId: VALID_FILE_ID,
              projectId: VALID_PROJECT_ID,
              tenantId: VALID_TENANT_ID,
              userId: VALID_USER_ID,
            }),
          },
          error: { message: 'Inngest function failed after retries' },
        },
      }

      await (
        processFilePipeline as { onFailure: (...args: unknown[]) => Promise<unknown> }
      ).onFailure({ event: onFailureEvent, error: new Error('failed') })

      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()
    })

    // T49
    it('[P0] should set failed when failure occurs before L1 completion', async () => {
      const { processFilePipeline } = await import('./processFile')

      dbState.returnValues = [[{ id: VALID_FILE_ID, status: 'parsing' }], []]

      const onFailureEvent = {
        data: {
          event: {
            data: buildPipelineEvent({
              fileId: VALID_FILE_ID,
              projectId: VALID_PROJECT_ID,
              tenantId: VALID_TENANT_ID,
              userId: VALID_USER_ID,
            }),
          },
          error: { message: 'Failed before L1' },
        },
      }

      await (
        processFilePipeline as { onFailure: (...args: unknown[]) => Promise<unknown> }
      ).onFailure({ event: onFailureEvent, error: new Error('failed') })

      const failedUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'failed',
      )
      expect(failedUpdate).toBeDefined()
    })

    // T50
    it('[P0] should query DB for current file status (not rely on event data)', async () => {
      const { processFilePipeline } = await import('./processFile')

      dbState.returnValues = [[{ id: VALID_FILE_ID, status: 'l2_processing' }], []]

      const onFailureEvent = {
        data: {
          event: {
            data: buildPipelineEvent({
              fileId: VALID_FILE_ID,
              projectId: VALID_PROJECT_ID,
              tenantId: VALID_TENANT_ID,
              userId: VALID_USER_ID,
            }),
          },
          error: { message: 'Failed' },
        },
      }

      await (
        processFilePipeline as { onFailure: (...args: unknown[]) => Promise<unknown> }
      ).onFailure({ event: onFailureEvent, error: new Error('failed') })

      // DB must have been queried for current file status
      expect(dbState.callIndex).toBeGreaterThan(0)
    })

    // T51
    it('[P0] should handle double failure (partial-set step also throws)', async () => {
      const { processFilePipeline } = await import('./processFile')

      dbState.throwAtCallIndex = 0

      const onFailureEvent = {
        data: {
          event: {
            data: buildPipelineEvent({
              fileId: VALID_FILE_ID,
              projectId: VALID_PROJECT_ID,
              tenantId: VALID_TENANT_ID,
              userId: VALID_USER_ID,
            }) as PipelineFileEventData,
          },
          error: { message: 'Original failure' },
        },
      }

      await expect(
        processFilePipeline.onFailure({ event: onFailureEvent, error: new Error('failed') }),
      ).resolves.not.toThrow()
    })
  })

  describe('handler return type', () => {
    // T52
    it('[P1] should return discriminated union with aiPartial=true and failedLayers', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 failed'))

      dbState.returnValues = [[], []]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      const result = await (
        processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
      ).handler({ event, step })

      expect(result).toEqual(
        expect.objectContaining({
          aiPartial: true,
          failedLayers: expect.arrayContaining(['L2']),
        }),
      )
    })
  })

  describe('scoring failure (FM-7)', () => {
    // T73
    it('[P1] should NOT set ai_partial when L2 succeeds but scoring throws', async () => {
      const { processFilePipeline } = await import('./processFile')

      // L2 succeeds, but scoring after L2 throws (DB failure, not AI failure)
      mockScoreFile
        .mockResolvedValueOnce({
          scoreId: faker.string.uuid(),
          fileId: VALID_FILE_ID,
          mqmScore: 85,
          npt: 15,
          totalWords: 1000,
          criticalCount: 0,
          majorCount: 3,
          minorCount: 0,
          status: 'calculated',
          autoPassRationale: null,
        })
        .mockRejectedValueOnce(new Error('Scoring DB connection failed'))

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
        }),
      }

      // Scoring failure should propagate (NOT be caught as ai_partial)
      // because this is a scoring bug, not an AI layer failure
      await expect(
        (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
          event,
          step,
        }),
      ).rejects.toThrow('Scoring DB connection failed')

      // ai_partial should NOT be set — scoring failure is NOT an AI failure
      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeUndefined()
    })
  })

  describe('batch completion', () => {
    const VALID_BATCH_ID = 'e1f2a3b4-c5d6-4e1f-9a2b-3c4d5e6f7a8b'

    // T54
    it('[P0] should count ai_partial as terminal status for batch completion', async () => {
      const { processFilePipeline } = await import('./processFile')

      // batch check: files query(0) + batch update(1)
      dbState.returnValues = [
        [
          { id: VALID_FILE_ID, status: 'l2_completed' },
          { id: faker.string.uuid(), status: 'ai_partial' },
        ],
        [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
      ]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          uploadBatchId: VALID_BATCH_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(step.sendEvent).toHaveBeenCalledWith(
        expect.stringContaining('batch'),
        expect.anything(),
      )
    })

    // T55
    it('[P0] should complete batch when all files are ai_partial', async () => {
      const { processFilePipeline } = await import('./processFile')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 failed for all files'))

      // DB: set-partial(0), score-partial(already mocked), batch files(1), batch update(2)
      dbState.returnValues = [
        [],
        [{ id: VALID_FILE_ID, status: 'ai_partial' }],
        [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
      ]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          uploadBatchId: VALID_BATCH_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(step.sendEvent).toHaveBeenCalled()
    })

    // T56
    it('[P1] should complete batch with mixed statuses (done, partial, failed)', async () => {
      const { processFilePipeline } = await import('./processFile')

      dbState.returnValues = [
        [
          { id: VALID_FILE_ID, status: 'l2_completed' },
          { id: faker.string.uuid(), status: 'ai_partial' },
          { id: faker.string.uuid(), status: 'failed' },
        ],
        [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
      ]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          uploadBatchId: VALID_BATCH_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(step.sendEvent).toHaveBeenCalled()
    })

    // T57
    it('[P0] should NOT complete batch when 1 file still processing', async () => {
      const { processFilePipeline } = await import('./processFile')

      dbState.returnValues = [
        [
          { id: VALID_FILE_ID, status: 'l2_completed' },
          { id: faker.string.uuid(), status: 'l2_processing' },
        ],
      ]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          uploadBatchId: VALID_BATCH_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(step.sendEvent).not.toHaveBeenCalled()
    })

    // T58
    it('[P0] should prevent double batch completion via completed_at IS NULL sentinel', async () => {
      const { processFilePipeline } = await import('./processFile')

      // Files are all terminal, but batch UPDATE returns empty (already completed)
      dbState.returnValues = [
        [{ id: VALID_FILE_ID, status: 'l2_completed' }],
        [], // UPDATE...WHERE completed_at IS NULL returns 0 rows
      ]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          uploadBatchId: VALID_BATCH_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(step.sendEvent).not.toHaveBeenCalled()
    })

    // T59
    it('[P0] should use atomic UPDATE...WHERE completed_at IS NULL pattern', async () => {
      const { processFilePipeline } = await import('./processFile')

      dbState.returnValues = [
        [{ id: VALID_FILE_ID, status: 'l2_completed' }],
        [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
      ]

      const step = createMockStep()
      const event = {
        data: buildPipelineEvent({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          uploadBatchId: VALID_BATCH_ID,
        }),
      }

      await (processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      const { isNull } = await import('drizzle-orm')
      expect(isNull).toHaveBeenCalled()
    })
  })
})
