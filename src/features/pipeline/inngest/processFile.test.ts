import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { L2Result } from '@/features/pipeline/helpers/runL2ForFile'
import type { L3Result } from '@/features/pipeline/helpers/runL3ForFile'
import type { ProcessingMode } from '@/types/pipeline'
import { asTenantId } from '@/types/tenant'

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
    mockRunL3ForFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        findingCount: 2,
        duration: 500,
        aiModel: 'claude-sonnet-4-5-20250929',
        chunksTotal: 1,
        chunksSucceeded: 1,
        chunksFailed: 0,
        partialFailure: false,
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

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

// Test helper: build pipeline event data
function buildPipelineEvent(
  overrides?: Partial<{
    fileId: string
    projectId: string
    tenantId: string
    userId: string
    mode: ProcessingMode
    uploadBatchId: string
  }>,
) {
  return {
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    mode: 'economy' as ProcessingMode,
    uploadBatchId: '',
    ...overrides,
  }
}

// Mock step object simulating Inngest step API
function createMockStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
}

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

describe('processFilePipeline', () => {
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

  // ── P0: Core pipeline steps ──

  it('should run L1 → score-l1 → L2 → score-l1l2 in economy mode', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Economy: 4 step.run calls (no L3, no batch check with empty uploadBatchId)
    expect(mockStep.run).toHaveBeenCalledTimes(4)

    // Verify exact step IDs by call index — changing IDs breaks Inngest in-flight resumes
    expect(mockStep.run.mock.calls[0]?.[0]).toBe(`l1-rules-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[1]?.[0]).toBe(`score-l1-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[2]?.[0]).toBe(`l2-screening-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[3]?.[0]).toBe(`score-l1l2-${VALID_FILE_ID}`)
  })

  it('should use deterministic step IDs containing fileId', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ fileId: VALID_FILE_ID })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Step IDs should contain fileId for determinism
    for (const call of mockStep.run.mock.calls) {
      const stepId = call[0] as string
      expect(stepId).toContain(VALID_FILE_ID)
    }
  })

  it('should call runL1ForFile with correct args from event data', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL1ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  it('should call scoreFile with correct args from event data', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  it('should return new shape with l1/l2/l3 finding counts and layerCompleted L1L2', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    expect(result).toMatchObject({
      fileId: VALID_FILE_ID,
      l1FindingCount: expect.any(Number),
      l2FindingCount: expect.any(Number),
      l3FindingCount: null,
      mqmScore: expect.any(Number),
      layerCompleted: 'L1L2',
      l2PartialFailure: expect.any(Boolean),
    })
  })

  // ── P1: Mode handling ──

  it('should NOT trigger L3 in economy mode and run only 4 steps', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ mode: 'economy' })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Economy: L1 + score-l1 + L2 + score-l1l2 = 4 steps (no L3)
    expect(mockStep.run).toHaveBeenCalledTimes(4)
    expect(mockRunL3ForFile).not.toHaveBeenCalled()
  })

  it('should run 6 steps in thorough mode: L1 → L2 → L3 with scores', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ mode: 'thorough' })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Thorough: L1 + score-l1 + L2 + score-l1l2 + L3 + score-all = 6 steps
    expect(mockStep.run).toHaveBeenCalledTimes(6)
    expect(mockRunL3ForFile).toHaveBeenCalled()
  })

  it('should pass tenantId from event data to helpers', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ tenantId: VALID_TENANT_ID })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL1ForFile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: VALID_TENANT_ID }),
    )
    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: VALID_TENANT_ID }),
    )
  })

  it('should pass userId from event data to scoreFile', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ userId: VALID_USER_ID })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockScoreFile).toHaveBeenCalledWith(expect.objectContaining({ userId: VALID_USER_ID }))
  })

  // ── P0: onFailure handler ──

  it('onFailure should set file status to failed', async () => {
    // SELECT current status (returns no file → defaults to 'failed') + UPDATE
    dbState.returnValues = [[], []]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure
    expect(onFailure).toBeDefined()

    if (onFailure) {
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
              },
            },
          },
        },
        error: new Error('step failed'),
      })
    }

    // 2 DB calls: SELECT current status + UPDATE to 'failed'
    expect(dbState.callIndex).toBe(2)
    // withTenant must be called with the correct tenantId (tenant isolation in failure path)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    // Verify .set() was called with status: 'failed' (not some other status)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  it('onFailure should log error with fileId context', async () => {
    const { logger } = await import('@/lib/logger')
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure

    const testError = new Error('step failed')
    if (onFailure) {
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
              },
            },
          },
        },
        error: testError,
      })
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: testError, fileId: VALID_FILE_ID }),
      expect.any(String),
    )
  })

  // ── H2: onFailureFn try-catch path ──

  it('onFailure should log DB error when status update throws (non-fatal)', async () => {
    const { logger } = await import('@/lib/logger')
    // DB update in onFailure throws at callIndex 0
    dbState.throwAtCallIndex = 0

    const { processFilePipeline } = await import('./processFile')
    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure

    const testError = new Error('step failed')
    if (onFailure) {
      // Should not throw — try-catch wraps the DB update
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
              },
            },
          },
        },
        error: testError,
      })
    }

    // First logger.error: original failure (always logged before try-catch)
    // Second logger.error: DB update failure (inside catch block)
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fileId: VALID_FILE_ID }),
      expect.any(String),
    )
  })

  it('onFailure should access original event data via v3 nested structure', async () => {
    dbState.returnValues = [[], []]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')
    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure

    // Inngest v3 onFailure event structure: event.data.event.data
    const nestedEvent = {
      event: {
        data: {
          event: {
            data: {
              fileId: VALID_FILE_ID,
              tenantId: VALID_TENANT_ID,
              projectId: VALID_PROJECT_ID,
            },
          },
        },
      },
      error: new Error('step failed'),
    }

    if (onFailure) {
      await onFailure(nestedEvent)
    }

    // withTenant must be called with the correct tenantId — verifies tenant-scoped WHERE clause
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(dbState.callIndex).toBe(2)
  })

  // ── L4: mode must NOT be forwarded to runL1ForFile ──

  it('should NOT forward mode to runL1ForFile (L1 is mode-agnostic)', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ fileId: VALID_FILE_ID, mode: 'thorough' })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    const callArg = mockRunL1ForFile.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArg).not.toHaveProperty('mode')
  })

  // ── P2: Function configuration ──

  it('should have function id process-file-pipeline', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    // Re-import to trigger createFunction call
    vi.resetModules()
    await import('./processFile')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      id: 'process-file-pipeline',
    })
  })

  it('should have retries: 3', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    vi.resetModules()
    await import('./processFile')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      retries: 3,
    })
  })

  it('should have concurrency key on projectId with limit 1', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    vi.resetModules()
    await import('./processFile')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      concurrency: expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining('projectId'),
          limit: 1,
        }),
      ]),
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Story 3.2b: L2 Batch Processing & Pipeline Extension — ATDD tests
  // ══════════════════════════════════════════════════════════════════════════

  // ── P0: runL2ForFile receives correct args (#2) ──

  it('[P0] should call runL2ForFile with fileId, projectId, tenantId, userId', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL2ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  // ── P0: scoreFile called with layerCompleted L1L2 after L2 (#4) ──

  it('[P0] should call scoreFile with layerCompleted L1L2 after L2 step', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // scoreFile is called twice in economy: once after L1 (score-l1), once after L2 (score-l1l2)
    expect(mockScoreFile).toHaveBeenCalledTimes(2)

    // Second call (score-l1l2) must include layerCompleted: 'L1L2'
    const secondCallArg = mockScoreFile.mock.calls[1]?.[0] as Record<string, unknown>
    expect(secondCallArg).toMatchObject({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      layerCompleted: 'L1L2',
    })
  })

  // ── P0: Thorough full step order (#10+#12) ──

  it('[P0] should run 6 steps in thorough mode: l1-rules → score-l1 → l2-screening → score-l1l2 → l3-analysis → score-all', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Thorough: 6 step.run calls
    expect(mockStep.run).toHaveBeenCalledTimes(6)

    // Verify exact step IDs in order
    expect(mockStep.run.mock.calls[0]?.[0]).toBe(`l1-rules-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[1]?.[0]).toBe(`score-l1-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[2]?.[0]).toBe(`l2-screening-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[3]?.[0]).toBe(`score-l1l2-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[4]?.[0]).toBe(`l3-analysis-${VALID_FILE_ID}`)
    expect(mockStep.run.mock.calls[5]?.[0]).toBe(`score-all-${VALID_FILE_ID}`)
  })

  // ── P0: Thorough final score layerCompleted L1L2L3 (#11) ──

  it('[P0] should call scoreFile with layerCompleted L1L2L3 after L3 step in thorough mode', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // scoreFile called 3 times in thorough: L1 score, L2 score, L3 score
    expect(mockScoreFile).toHaveBeenCalledTimes(3)

    // Third call (score-all) must include layerCompleted: 'L1L2L3'
    const thirdCallArg = mockScoreFile.mock.calls[2]?.[0] as Record<string, unknown>
    expect(thirdCallArg).toMatchObject({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      layerCompleted: 'L1L2L3',
    })
  })

  // ── P0: L2 failure preserves L1 findings (#13) ──

  it('[P0] should preserve L1 findings when L2 step fails (no DELETE in onFailure)', async () => {
    // SELECT: file not found (no status context) → defaults to 'failed' + UPDATE
    dbState.returnValues = [[], []]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure
    expect(onFailure).toBeDefined()

    if (onFailure) {
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
                projectId: VALID_PROJECT_ID,
                mode: 'economy',
              },
            },
          },
        },
        error: new Error('L2 screening failed: AI quota exhausted'),
      })
    }

    // 2 DB calls: SELECT current status + UPDATE status
    // NO DELETE of L1 findings — they must remain intact
    expect(dbState.callIndex).toBe(2)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  // ── P0: L3 failure preserves L1+L2 findings (#23) ──

  it('[P0] should preserve L1 and L2 findings when L3 step fails in thorough mode', async () => {
    // SELECT: file not found → defaults to 'failed' + UPDATE
    dbState.returnValues = [[], []]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure
    expect(onFailure).toBeDefined()

    if (onFailure) {
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
                projectId: VALID_PROJECT_ID,
                mode: 'thorough',
              },
            },
          },
        },
        error: new Error('L3 deep analysis failed: content filter'),
      })
    }

    // 2 DB calls: SELECT current status + UPDATE status
    // NO DELETE of L1 or L2 findings — both layers must remain intact
    expect(dbState.callIndex).toBe(2)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  // ── P0: runL3ForFile receives correct args (#24) ──

  it('[P0] should call runL3ForFile with fileId, projectId, tenantId, userId in thorough mode', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL3ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  // ── P1: Batch event exact payload (#14) ──

  it('[P1] should emit batch-completed event with exact payload via sendEvent batch form', async () => {
    // race condition: see TD-PIPE-001
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
      uploadBatchId: VALID_BATCH_ID,
    })

    // Mock batch query: all files completed → triggers batch event
    // Two DB calls inside check-batch step: SELECT files + UPDATE uploadBatches
    dbState.returnValues = [
      [{ id: VALID_FILE_ID, status: 'l2_completed' }],
      [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Guardrail #10: sendEvent uses batch form — first arg is string step ID
    expect(mockStep.sendEvent).toHaveBeenCalled()
    const sendEventArgs = mockStep.sendEvent.mock.calls[0]
    expect(typeof sendEventArgs?.[0]).toBe('string')

    // Second arg is the event object with name + data
    const eventPayload = sendEventArgs?.[1] as Record<string, unknown>
    expect(eventPayload).toMatchObject({
      name: 'pipeline.batch-completed',
      data: expect.objectContaining({
        batchId: VALID_BATCH_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        mode: 'economy',
        userId: VALID_USER_ID,
      }),
    })
  })

  // ── P1: Non-batch skips batch check (#15) ──

  it('[P1] should skip batch check when uploadBatchId is empty string', async () => {
    // race condition: see TD-PIPE-001
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
      uploadBatchId: '',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // sendEvent should NOT be called when uploadBatchId is empty
    expect(mockStep.sendEvent).not.toHaveBeenCalled()
  })

  // ── P1: L2 partial failure → proceeds (#16) ──

  it('[P1] should proceed with score and batch check when L2 has partial failure', async () => {
    mockRunL2ForFile.mockResolvedValue({
      findingCount: 1,
      duration: 300,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 3,
      chunksSucceeded: 2,
      chunksFailed: 1,
      partialFailure: true,
      totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.002 },
    } as L2Result)

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // scoreFile must still be called after L2 (even with partial failure)
    expect(mockScoreFile).toHaveBeenCalledTimes(2)
    // Pipeline must not throw — partial failure is tolerated (4 steps for economy)
    expect(mockStep.run).toHaveBeenCalledTimes(4)
  })

  // ── P1: Return shape (#17) ──

  it('[P1] should return l1FindingCount, l2FindingCount, l3FindingCount, layerCompleted, l2PartialFailure', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    expect(result).toMatchObject({
      fileId: VALID_FILE_ID,
      l1FindingCount: expect.any(Number),
      l2FindingCount: expect.any(Number),
      l3FindingCount: null,
      layerCompleted: 'L1L2',
      l2PartialFailure: expect.any(Boolean),
      mqmScore: expect.any(Number),
    })
  })

  // ── P0: Thorough return shape — l3FindingCount is number, layerCompleted L1L2L3 ──

  it('[P0] should return l3FindingCount as number and layerCompleted L1L2L3 in thorough mode', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    expect(result).toMatchObject({
      fileId: VALID_FILE_ID,
      l1FindingCount: expect.any(Number),
      l2FindingCount: expect.any(Number),
      l3FindingCount: expect.any(Number),
      mqmScore: expect.any(Number),
      layerCompleted: 'L1L2L3',
      l2PartialFailure: expect.any(Boolean),
    })
    // l3FindingCount must be a number (not null) in thorough mode
    expect(result.l3FindingCount).not.toBeNull()
  })

  // ── P1: l3FindingCount strict null (#18) ──

  it('[P1] should return l3FindingCount as strictly null in economy mode', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // Strict null check — not undefined, not 0, not false
    expect(result.l3FindingCount).toBe(null)
  })

  // ── P1: scoreFile backward compat — no layerCompleted in L1 score call (#19) ──

  it('[P1] should pass layerFilter L1 but NOT layerCompleted to scoreFile in first call', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // First scoreFile call (L1 score) should NOT have layerCompleted property
    const firstCallArg = mockScoreFile.mock.calls[0]?.[0] as Record<string, unknown>
    expect(firstCallArg).not.toHaveProperty('layerCompleted')
    // Verify it's the L1 score call with correct layerFilter
    expect(firstCallArg).toMatchObject({
      fileId: VALID_FILE_ID,
      layerFilter: 'L1',
    })
  })

  // ── P2: auto_passed propagation (#20) ──
  // TODO(TD-TEST-005): handler return shape doesn't include status — test needs
  // Story 3.2c to add auto_passed awareness to pipeline return or batch logic

  it.skip('[P2] should propagate auto_passed mqmScore from scoreFile in return value', async () => {
    mockScoreFile.mockResolvedValue({
      scoreId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
      fileId: VALID_FILE_ID,
      mqmScore: 100,
      npt: 0,
      totalWords: 500,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      status: 'auto_passed',
      autoPassRationale: 'Score 100.00 >= 99 threshold; 0 critical findings',
    })

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // Handler return doesn't expose score.status (only mqmScore) — auto_passed
    // propagation to batch/UI deferred to Story 3.2c
    expect(result).toHaveProperty('mqmScore', 100)
    expect(result).toHaveProperty('layerCompleted', 'L1L2')
  })

  // ── P2: Performance sanity (#21) ──

  it('[P2] should complete pipeline handler within reasonable time (mock-based sanity)', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')

    const start = performance.now()
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })
    const elapsed = performance.now() - start

    // Mock-based: should resolve nearly instantly (<1s)
    expect(elapsed).toBeLessThan(1000)
  })

  // ── P2: Mode undefined defaults to economy (#22) ──

  it('[P2] should default to economy behavior when mode is undefined', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })
    const eventDataNoMode = { ...eventData, mode: undefined as unknown as ProcessingMode }

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventDataNoMode },
      step: mockStep,
    })

    // Should behave as economy — L3 not triggered
    expect(mockRunL3ForFile).not.toHaveBeenCalled()
    expect(mockStep.run).toHaveBeenCalledTimes(4)
  })

  // ── Boundary: single file in batch → fires completion immediately ──

  it('[P1] should fire batch-completed immediately when single file in batch completes', async () => {
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
      uploadBatchId: VALID_BATCH_ID,
    })

    // Single file in batch, already at terminal status
    // Two DB calls inside check-batch step: SELECT files + UPDATE uploadBatches
    dbState.returnValues = [
      [{ id: VALID_FILE_ID, status: 'l2_completed' }],
      [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockStep.sendEvent).toHaveBeenCalled()
  })

  // ── Boundary: thorough batch terminal states ──

  it('[P0] should use l3_completed|failed as terminal states in thorough batch', async () => {
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
      uploadBatchId: VALID_BATCH_ID,
    })

    // Mix of terminal states
    // Two DB calls inside check-batch step: SELECT files + UPDATE uploadBatches
    dbState.returnValues = [
      [
        { id: VALID_FILE_ID, status: 'l3_completed' },
        { id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b', status: 'failed' },
      ],
      [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Batch should fire — both files are terminal for thorough mode
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      expect.stringContaining('batch-completed'),
      expect.objectContaining({
        name: 'pipeline.batch-completed',
        data: expect.objectContaining({
          batchId: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          mode: 'thorough',
          userId: VALID_USER_ID,
        }),
      }),
    )
  })

  // ── H1: Negative test — thorough mode must NOT fire when siblings only at l2_completed ──

  it('[P0] should NOT fire batch in thorough mode when siblings are only l2_completed', async () => {
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
      uploadBatchId: VALID_BATCH_ID,
    })

    // Siblings at l2_completed — NOT terminal for thorough mode (must be l3_completed)
    dbState.returnValues = [
      [
        { id: VALID_FILE_ID, status: 'l2_completed' },
        { id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b', status: 'l2_completed' },
      ],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // l2_completed is NOT terminal for thorough mode — batch must NOT fire
    expect(mockStep.sendEvent).not.toHaveBeenCalled()
  })

  // ── Boundary: thorough + batch combined = 7 steps ──

  it('[P1] should run 7 steps in thorough mode with batch (L1+scoreL1+L2+scoreL1L2+L3+scoreAll+checkBatch)', async () => {
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
      uploadBatchId: VALID_BATCH_ID,
    })

    // Batch check: single file at terminal
    // Two DB calls inside check-batch step: SELECT files + UPDATE uploadBatches
    dbState.returnValues = [
      [{ id: VALID_FILE_ID, status: 'l3_completed' }],
      [{ id: VALID_BATCH_ID, completedAt: new Date().toISOString() }],
    ]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // 6 step.run calls + 1 step.sendEvent (batch complete)
    expect(mockStep.run).toHaveBeenCalledTimes(7)
    expect(mockStep.sendEvent).toHaveBeenCalledTimes(1)

    // Verify all 7 step IDs in order
    const stepIds = mockStep.run.mock.calls.map((c: unknown[]) => c[0])
    expect(stepIds).toEqual([
      `l1-rules-${VALID_FILE_ID}`,
      `score-l1-${VALID_FILE_ID}`,
      `l2-screening-${VALID_FILE_ID}`,
      `score-l1l2-${VALID_FILE_ID}`,
      `l3-analysis-${VALID_FILE_ID}`,
      `score-all-${VALID_FILE_ID}`,
      `check-batch-${VALID_FILE_ID}`,
    ])
  })

  // ══════════════════════════════════════════════════════════════════════════
  // TA: Coverage Gap Tests (Story 3.2b — Test Automation expansion)
  // ══════════════════════════════════════════════════════════════════════════

  // Gap #1 [P1]: economy mqmScore uses L2 score result, not L1 score result
  it('[P1] should return mqmScore from L2 score call, not L1 score call (economy)', async () => {
    // Different scores per call to distinguish which one is used
    mockScoreFile
      .mockResolvedValueOnce({
        scoreId: faker.string.uuid(),
        fileId: VALID_FILE_ID,
        mqmScore: 70,
        npt: 30,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 5,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      })
      .mockResolvedValueOnce({
        scoreId: faker.string.uuid(),
        fileId: VALID_FILE_ID,
        mqmScore: 92,
        npt: 8,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 1,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      })

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // mqmScore must come from L2 score call (92), not L1 score call (70)
    expect(result.mqmScore).toBe(92)
    // Finding counts from correct helpers
    expect(result.l1FindingCount).toBe(5)
    expect(result.l2FindingCount).toBe(3)
    expect(result.l3FindingCount).toBe(null)
  })

  // Gap #2 [P1]: thorough mqmScore uses L3 score result
  it('[P1] should return mqmScore from L3 score call, not L1 or L2 score calls (thorough)', async () => {
    mockScoreFile
      .mockResolvedValueOnce({
        scoreId: faker.string.uuid(),
        fileId: VALID_FILE_ID,
        mqmScore: 70,
        npt: 30,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 5,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      })
      .mockResolvedValueOnce({
        scoreId: faker.string.uuid(),
        fileId: VALID_FILE_ID,
        mqmScore: 85,
        npt: 15,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 2,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      })
      .mockResolvedValueOnce({
        scoreId: faker.string.uuid(),
        fileId: VALID_FILE_ID,
        mqmScore: 92,
        npt: 8,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 1,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      })

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // mqmScore must come from L3 score call (92), not L1 (70) or L2 (85)
    expect(result.mqmScore).toBe(92)
    expect(result.l1FindingCount).toBe(5)
    expect(result.l2FindingCount).toBe(3)
    expect(result.l3FindingCount).toBe(2)
  })

  // Gap #3 [P2]: l2PartialFailure=true explicitly in return value
  it('[P2] should return l2PartialFailure=true when L2 reports partial failure', async () => {
    mockRunL2ForFile.mockResolvedValue({
      findingCount: 1,
      duration: 300,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 3,
      chunksSucceeded: 2,
      chunksFailed: 1,
      partialFailure: true,
      totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.002 },
    } as L2Result)

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processFilePipeline } = await import('./processFile')
    const result = (await (
      processFilePipeline as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })) as Record<string, unknown>

    // Strict true check — not just any Boolean
    expect(result.l2PartialFailure).toBe(true)
  })

  // Gap #4 [P2]: Empty batch files → guard prevents false completion
  it('[P2] should NOT fire batch-completed when batch query returns empty array', async () => {
    const mockStep = createMockStep()
    const VALID_BATCH_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
      uploadBatchId: VALID_BATCH_ID,
    })

    // Empty batch query result — guard prevents [].every() = true quirk
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // batch-completed must NOT fire for empty batch
    expect(mockStep.sendEvent).not.toHaveBeenCalled()
  })

  // Gap #5 [P2]: Thorough + L2 partial failure → L3 still runs
  it('[P2] should proceed to L3 in thorough mode even when L2 has partial failure', async () => {
    mockRunL2ForFile.mockResolvedValue({
      findingCount: 1,
      duration: 300,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 3,
      chunksSucceeded: 2,
      chunksFailed: 1,
      partialFailure: true,
      totalUsage: { inputTokens: 2000, outputTokens: 800, estimatedCostUsd: 0.002 },
    } as L2Result)

    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'thorough',
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // L3 must still run despite L2 partial failure
    expect(mockRunL3ForFile).toHaveBeenCalled()
    // 6 steps: L1 + score-l1 + L2 + score-l1l2 + L3 + score-all
    expect(mockStep.run).toHaveBeenCalledTimes(6)
  })
})
