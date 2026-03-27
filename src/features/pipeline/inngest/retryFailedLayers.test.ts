/** Story 3.4 ATDD — retryFailedLayers Inngest function — GREEN PHASE */
import { faker } from '@faker-js/faker'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { L2Result } from '@/features/pipeline/helpers/runL2ForFile'
import type { L3Result } from '@/features/pipeline/helpers/runL3ForFile'
import type { ScoreStatus } from '@/types/finding'
import type { PipelineLayer } from '@/types/pipeline'
import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks ──
const {
  mockRunL2ForFile,
  mockRunL3ForFile,
  mockScoreFile,
  mockWriteAuditLog,
  dbState,
  dbMockModule,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockRunL2ForFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        findingCount: 2,
        duration: 200,
        aiModel: 'gpt-4o-mini',
        chunksTotal: 1,
        chunksSucceeded: 1,
        chunksFailed: 0,
        partialFailure: false,
        fallbackUsed: false,
        totalUsage: { inputTokens: 800, outputTokens: 400, estimatedCostUsd: 0.001 },
      } as L2Result),
    ),
    mockRunL3ForFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        findingCount: 1,
        duration: 500,
        aiModel: 'claude-sonnet-4-5-20250929',
        chunksTotal: 1,
        chunksSucceeded: 1,
        chunksFailed: 0,
        partialFailure: false,
        fallbackUsed: false,
        totalUsage: { inputTokens: 1500, outputTokens: 600, estimatedCostUsd: 0.01 },
      } as L3Result),
    ),
    mockScoreFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        scoreId: faker.string.uuid(),
        fileId: faker.string.uuid(),
        mqmScore: 88,
        npt: 12,
        totalWords: 800,
        criticalCount: 0,
        majorCount: 1,
        minorCount: 1,
        status: 'calculated' as ScoreStatus,
        autoPassRationale: null as string | null,
      }),
    ),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/features/pipeline/helpers/runL2ForFile', () => ({
  runL2ForFile: (...args: unknown[]) => mockRunL2ForFile(...args),
}))

vi.mock('@/features/pipeline/helpers/runL3ForFile', () => ({
  runL3ForFile: (...args: unknown[]) => mockRunL3ForFile(...args),
}))

vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: (...args: unknown[]) => mockScoreFile(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
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
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    projectId: 'project_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    processingMode: 'processing_mode',
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

vi.mock('@/lib/ai/budget', () => ({
  checkProjectBudget: vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      hasQuota: true,
      remainingBudgetUsd: Infinity,
      monthlyBudgetUsd: null,
      usedBudgetUsd: 0,
    }),
  ),
}))

// ── Constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

function buildRetryEvent(overrides?: Record<string, unknown>) {
  return {
    data: {
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      layersToRetry: ['L2'] as PipelineLayer[],
      mode: 'economy' as 'economy' | 'thorough',
      ...overrides,
    },
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

// ── Suite ──

describe('retryFailedLayers Inngest function (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    // Default: project validation query returns valid project row
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
  })

  describe('layer retry logic', () => {
    it('[P0] should reset file status to l1_completed before L2 retry', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L2'] })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // Before running L2, file status must be reset to l1_completed
      const statusReset = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'l1_completed',
      )
      expect(statusReset).toBeDefined()
    })

    it('[P0] should reset file status to l2_completed before L3 retry', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L3'], mode: 'thorough' })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // Before running L3, file status must be reset to l2_completed
      const statusReset = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'l2_completed',
      )
      expect(statusReset).toBeDefined()
    })

    it('[P0] should run L2 then L3 sequentially when retrying both', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      const callOrder: string[] = []
      mockRunL2ForFile.mockImplementation(async (..._args: unknown[]) => {
        callOrder.push('L2')
        return {
          findingCount: 2,
          duration: 200,
          aiModel: 'gpt-4o-mini',
          chunksTotal: 1,
          chunksSucceeded: 1,
          chunksFailed: 0,
          partialFailure: false,
          fallbackUsed: false,
          totalUsage: { inputTokens: 800, outputTokens: 400, estimatedCostUsd: 0.001 },
        } as L2Result
      })
      mockRunL3ForFile.mockImplementation(async (..._args: unknown[]) => {
        callOrder.push('L3')
        return {
          findingCount: 1,
          duration: 500,
          aiModel: 'claude-sonnet-4-5-20250929',
          chunksTotal: 1,
          chunksSucceeded: 1,
          chunksFailed: 0,
          partialFailure: false,
          fallbackUsed: false,
          totalUsage: { inputTokens: 1500, outputTokens: 600, estimatedCostUsd: 0.01 },
        } as L3Result
      })

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L2', 'L3'], mode: 'thorough' })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      expect(callOrder).toEqual(['L2', 'L3'])
    })

    it('[P0] should recalculate score after each layer completes', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L2', 'L3'], mode: 'thorough' })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // scoreFile must be called at least twice: after L2 and after L3
      expect(mockScoreFile.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('partial retry results', () => {
    // T74
    it('[P0] should set ai_partial with L1L2 when L2 retry OK but L3 retry fails', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      // L2 retry succeeds
      mockRunL2ForFile.mockResolvedValue({
        findingCount: 2,
        duration: 200,
        aiModel: 'gpt-4o-mini',
        chunksTotal: 1,
        chunksSucceeded: 1,
        chunksFailed: 0,
        partialFailure: false,
        fallbackUsed: false,
        totalUsage: { inputTokens: 800, outputTokens: 400, estimatedCostUsd: 0.001 },
      } as L2Result)

      // L3 retry fails again
      mockRunL3ForFile.mockRejectedValue(new Error('L3 still failing'))

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L2', 'L3'], mode: 'thorough' })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // Result: ai_partial with L1L2 (L3 still failed)
      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()

      expect(mockScoreFile).toHaveBeenCalledWith(
        expect.objectContaining({
          layerCompleted: 'L1L2',
          scoreStatus: 'partial',
        }),
      )
    })

    // T75
    it('[P0] should set ai_partial (not failed) in onFailure when L1+ completed', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      // Simulate file in l2_processing (L1 was completed before retry failed)
      dbState.returnValues = [[{ id: VALID_FILE_ID, status: 'l2_processing' }]]

      const onFailureEvent = {
        data: {
          event: buildRetryEvent(),
          error: { message: 'Retry function failed' },
        },
      }

      await (
        retryFailedLayers as { onFailure: (...args: unknown[]) => Promise<unknown> }
      ).onFailure({ event: onFailureEvent, step: createMockStep() })

      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()
    })

    it('[P1] should preserve existing findings from successful layers during retry', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      // Only retry L3 — L1+L2 findings must not be wiped
      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L3'], mode: 'thorough' })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // runL2ForFile must NOT be called (L2 is not being retried)
      expect(mockRunL2ForFile).not.toHaveBeenCalled()
      // runL3ForFile is called
      expect(mockRunL3ForFile).toHaveBeenCalled()
    })

    // T11
    it('[P1] should keep ai_partial status when retry also fails', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      mockRunL2ForFile.mockRejectedValue(new Error('L2 retry also failed'))

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L2'] })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // Status must remain ai_partial (not become 'failed')
      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeDefined()

      const failedUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'failed',
      )
      expect(failedUpdate).toBeUndefined()
    })
  })

  describe('concurrent retry race condition', () => {
    // L4
    it('[P1] should have concurrency key on projectId to prevent parallel retries', async () => {
      const { retryFailedLayersConfig } = await import('./retryFailedLayers')

      // Concurrent retries on the same project would race on file status.
      // The concurrency config ensures only 1 retry runs per project at a time.
      expect(retryFailedLayersConfig.concurrency.key).toContain('projectId')
      expect(retryFailedLayersConfig.concurrency.limit).toBe(1)
    })
  })

  describe('configuration', () => {
    it('[P0] should have retries=3 in function config', async () => {
      const { retryFailedLayersConfig } = await import('./retryFailedLayers')

      expect(retryFailedLayersConfig).toEqual(
        expect.objectContaining({
          retries: 3,
        }),
      )
    })

    it('[P0] should have concurrency limit=1 per projectId', async () => {
      const { retryFailedLayersConfig } = await import('./retryFailedLayers')

      expect(retryFailedLayersConfig).toEqual(
        expect.objectContaining({
          concurrency: expect.objectContaining({
            limit: 1,
            key: expect.stringContaining('projectId'),
          }),
        }),
      )
    })

    it('[P0] should expose handler + onFailure via Object.assign for testing', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      expect(typeof retryFailedLayers.handler).toBe('function')
      expect(typeof retryFailedLayers.onFailure).toBe('function')
    })

    it('[P0] should be registered with correct event in createFunction', async () => {
      const { inngest } = await import('@/lib/inngest/client')
      const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

      vi.resetModules()
      await import('./retryFailedLayers')

      expect(createFunctionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'retry-failed-layers',
          retries: 3,
        }),
        expect.objectContaining({
          event: 'pipeline.retry-failed-layers',
        }),
        expect.any(Function),
      )
    })
  })

  describe('guards', () => {
    // T76
    it('[P1] should validate project still exists before retrying', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      // Project query returns empty — project deleted between retry enqueue and execution
      dbState.returnValues = [
        [], // project not found
      ]

      const step = createMockStep()
      const event = buildRetryEvent()

      // Should throw NonRetriableError (project gone — no point retrying)
      await expect(
        (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
          event,
          step,
        }),
      ).rejects.toThrow(/project not found|nonretriable/i)

      // Must NOT have called runL2 or runL3
      expect(mockRunL2ForFile).not.toHaveBeenCalled()
      expect(mockRunL3ForFile).not.toHaveBeenCalled()
    })

    // B4 [P1]: empty layersToRetry boundary
    it('[P1] should skip L2+L3 and return aiPartial=false when layersToRetry is empty', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: [] as PipelineLayer[] })

      const result = await (
        retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }
      ).handler({ event, step })

      expect(mockRunL2ForFile).not.toHaveBeenCalled()
      expect(mockRunL3ForFile).not.toHaveBeenCalled()
      expect(mockScoreFile).not.toHaveBeenCalled()
      expect(result).toEqual(expect.objectContaining({ aiPartial: false }))
    })

    it('[P0] should re-check budget before making AI calls', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      const { checkProjectBudget } = await import('@/lib/ai/budget')
      const mockBudget = vi.mocked(checkProjectBudget)
      mockBudget.mockResolvedValue({
        hasQuota: false,
        remainingBudgetUsd: 0,
        monthlyBudgetUsd: 10,
        usedBudgetUsd: 10,
      })

      const step = createMockStep()
      const event = buildRetryEvent()

      await expect(
        (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
          event,
          step,
        }),
      ).rejects.toThrow(/quota|budget/i)

      expect(mockRunL2ForFile).not.toHaveBeenCalled()

      // Audit log must record budget exhaustion (Guardrail #2: error path, non-fatal)
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: VALID_TENANT_ID,
          userId: VALID_USER_ID,
          entityType: 'file',
          entityId: VALID_FILE_ID,
          action: 'retry.budget_exhausted',
          newValue: expect.objectContaining({
            projectId: VALID_PROJECT_ID,
            remainingBudgetUsd: 0,
          }),
        }),
      )
    })
  })

  // ── TA: FMA + BVA Coverage Gaps ──

  describe('lastCompletedLayer tracking', () => {
    // Q [P1]: BUG — lastCompletedLayer init='L1' wrong when retrying L3 only
    it('[P1] should score with layerCompleted=L1L2 (not L1) when retrying only L3 and it fails', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      // Ensure budget check passes
      const { checkProjectBudget } = await import('@/lib/ai/budget')
      vi.mocked(checkProjectBudget).mockResolvedValue({
        hasQuota: true,
        remainingBudgetUsd: Infinity,
        monthlyBudgetUsd: null,
        usedBudgetUsd: 0,
      })

      // Only L3 retry requested (L2 was already done successfully)
      mockRunL3ForFile.mockRejectedValue(new Error('L3 retry also failed'))

      const step = createMockStep()
      const event = buildRetryEvent({ layersToRetry: ['L3'] as PipelineLayer[], mode: 'thorough' })

      await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
        event,
        step,
      })

      // BUG: lastCompletedLayer starts at 'L1' but L2 was already done.
      // When L3 fails, scoreFile should use 'L1L2' (not 'L1').
      expect(mockScoreFile).toHaveBeenCalledWith(
        expect.objectContaining({
          layerCompleted: 'L1L2',
          scoreStatus: 'partial',
        }),
      )
    })
  })

  describe('onFailure edge cases', () => {
    // F14 [P1]: file status NOT in L1_COMPLETED_STATUSES
    it('[P1] should NOT set ai_partial when file status is pre-L1 (e.g. parsing)', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      // File is in pre-L1 state — no partial results exist
      dbState.returnValues = [[{ id: VALID_FILE_ID, status: 'parsing' }]]
      dbState.setCaptures = []

      const onFailureEvent = {
        data: {
          event: buildRetryEvent(),
          error: { message: 'Retry function failed' },
        },
      }

      await (
        retryFailedLayers as { onFailure: (...args: unknown[]) => Promise<unknown> }
      ).onFailure({ event: onFailureEvent, step: createMockStep() })

      // ai_partial must NOT be set — no partial results to preserve
      const aiPartialUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status === 'ai_partial',
      )
      expect(aiPartialUpdate).toBeUndefined()
    })

    // F16 [P1]: file not found in onFailure
    it('[P1] should log warning and return when file not found in onFailure', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')
      const { logger } = await import('@/lib/logger')

      // File query returns empty — file was deleted
      dbState.returnValues = [[]]
      dbState.setCaptures = []

      const onFailureEvent = {
        data: {
          event: buildRetryEvent(),
          error: { message: 'Retry function failed' },
        },
      }

      await (
        retryFailedLayers as { onFailure: (...args: unknown[]) => Promise<unknown> }
      ).onFailure({ event: onFailureEvent, step: createMockStep() })

      // Should warn about missing file and not crash
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: VALID_FILE_ID }),
        expect.stringContaining('not found'),
      )

      // No status update should occur
      const anyUpdate = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status !== undefined,
      )
      expect(anyUpdate).toBeUndefined()
    })

    // F15 [P2]: onFailure DB error caught silently
    it('[P2] should not throw when onFailure DB query fails', async () => {
      const { retryFailedLayers } = await import('./retryFailedLayers')

      dbState.throwAtCallIndex = 0 // DB query throws

      const onFailureEvent = {
        data: {
          event: buildRetryEvent(),
          error: { message: 'Original failure' },
        },
      }

      // onFailure must not throw — silent catch
      await expect(
        (retryFailedLayers as { onFailure: (...args: unknown[]) => Promise<unknown> }).onFailure({
          event: onFailureEvent,
          step: createMockStep(),
        }),
      ).resolves.not.toThrow()
    })
  })
})
