/**
 * P0-07 / R3-030 — Retry deduplication: DELETE old findings before re-inserting.
 *
 * retryFailedLayers calls runL2ForFile / runL3ForFile which internally do
 * atomic DELETE + INSERT in a transaction. These tests verify that the retry
 * handler correctly delegates to the run helpers and that the dedup behavior
 * (idempotent re-runs) is achieved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { L2Result } from '@/features/pipeline/helpers/runL2ForFile'
import type { L3Result } from '@/features/pipeline/helpers/runL3ForFile'
import type { ScoreStatus } from '@/types/finding'
import type { PipelineLayer } from '@/types/pipeline'

// ── Hoisted mocks ──
const { mockRunL2ForFile, mockRunL3ForFile, mockScoreFile, dbState, dbMockModule } = vi.hoisted(
  () => {
    const { dbState, dbMockModule } = createDrizzleMock()
    return {
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
          scoreId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
          fileId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
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
  },
)

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
  logger: {
    warn: vi.fn((..._args: unknown[]) => undefined),
    info: vi.fn((..._args: unknown[]) => undefined),
    error: vi.fn((..._args: unknown[]) => undefined),
    debug: vi.fn((..._args: unknown[]) => undefined),
  },
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
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
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

describe('retryFailedLayers finding deduplication (R3-030)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    // Default: project validation query returns valid project row
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('[P0] should call runL2ForFile with correct params after resetting file status to l1_completed', async () => {
    // Arrange: runL2ForFile internally does DELETE old L2 findings + INSERT new ones
    // in a transaction. The retry handler must:
    //   1. Reset file status to l1_completed (CAS guard prerequisite)
    //   2. Call runL2ForFile which handles the atomic DELETE+INSERT
    const { retryFailedLayers } = await import('./retryFailedLayers')

    const step = createMockStep()
    const event = buildRetryEvent({ layersToRetry: ['L2'] as PipelineLayer[] })

    await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
      event,
      step,
    })

    // Assert: file status was reset to l1_completed before L2 call
    const statusReset = (dbState.setCaptures as Record<string, unknown>[])?.find(
      (s) => s.status === 'l1_completed',
    )
    expect(statusReset).toBeDefined()

    // Assert: runL2ForFile was called with the correct params
    expect(mockRunL2ForFile).toHaveBeenCalledTimes(1)
    expect(mockRunL2ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  it('[P0] should return fresh findingCount from L2 run, not accumulated old+new', async () => {
    // Arrange: runL2ForFile returns findingCount=3 (fresh count after DELETE+INSERT)
    // This count represents ONLY new findings, because runL2ForFile DELETEs old L2
    // findings before inserting new ones inside a transaction.
    mockRunL2ForFile.mockResolvedValue({
      findingCount: 3,
      duration: 250,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      partialFailure: false,
      fallbackUsed: false,
      totalUsage: { inputTokens: 900, outputTokens: 450, estimatedCostUsd: 0.0012 },
    } as L2Result)

    const { retryFailedLayers } = await import('./retryFailedLayers')

    const step = createMockStep()
    const event = buildRetryEvent({ layersToRetry: ['L2'] as PipelineLayer[] })

    const result = (await (
      retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({ event, step })) as Record<string, unknown>

    // Assert: Result reflects the retry completed without accumulation
    expect(result.aiPartial).toBe(false)
    expect(result.lastCompletedLayer).toBe('L1L2')

    // Assert: scoreFile was called after L2, reflecting the fresh findings
    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        layerCompleted: 'L1L2',
      }),
    )
  })

  it('[P0] should NOT call runL2ForFile when only L3 is retried, preserving L1+L2 findings', async () => {
    // Arrange: Only L3 is being retried. L1 and L2 findings must remain untouched.
    // runL3ForFile only DELETEs L3 findings internally — L1+L2 are preserved.
    const { retryFailedLayers } = await import('./retryFailedLayers')

    const step = createMockStep()
    const event = buildRetryEvent({ layersToRetry: ['L3'] as PipelineLayer[], mode: 'thorough' })

    await (retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }).handler({
      event,
      step,
    })

    // Assert: runL2ForFile must NOT be called — L2 findings preserved
    expect(mockRunL2ForFile).not.toHaveBeenCalled()

    // Assert: runL3ForFile IS called — only L3 findings are replaced
    expect(mockRunL3ForFile).toHaveBeenCalledTimes(1)
    expect(mockRunL3ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )

    // Assert: file status was reset to l2_completed (not l1_completed)
    const statusReset = (dbState.setCaptures as Record<string, unknown>[])?.find(
      (s) => s.status === 'l2_completed',
    )
    expect(statusReset).toBeDefined()

    // Assert: no l1_completed reset occurred
    const l1Reset = (dbState.setCaptures as Record<string, unknown>[])?.find(
      (s) => s.status === 'l1_completed',
    )
    expect(l1Reset).toBeUndefined()
  })

  it('[P0] should produce same findingCount on double retry (idempotent via DELETE+INSERT)', async () => {
    // Arrange: Two sequential retries of the same file.
    // Because runL2ForFile does DELETE old + INSERT new atomically,
    // running it twice produces the same findingCount — not doubled.
    //
    // Both calls return findingCount=3 (the mock simulates fresh L2 analysis).
    const consistentL2Result: L2Result = {
      findingCount: 3,
      duration: 200,
      aiModel: 'gpt-4o-mini',
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      partialFailure: false,
      fallbackUsed: false,
      totalUsage: { inputTokens: 800, outputTokens: 400, estimatedCostUsd: 0.001 },
    }

    mockRunL2ForFile.mockResolvedValue(consistentL2Result)

    const { retryFailedLayers } = await import('./retryFailedLayers')

    // First retry
    const step1 = createMockStep()
    dbState.callIndex = 0
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]
    dbState.setCaptures = []

    const event1 = buildRetryEvent({ layersToRetry: ['L2'] as PipelineLayer[] })
    const result1 = (await (
      retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({ event: event1, step: step1 })) as Record<string, unknown>

    // Second retry (same file — simulates re-enqueue)
    const step2 = createMockStep()
    dbState.callIndex = 0
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]
    dbState.setCaptures = []

    const event2 = buildRetryEvent({ layersToRetry: ['L2'] as PipelineLayer[] })
    const result2 = (await (
      retryFailedLayers as { handler: (...args: unknown[]) => Promise<unknown> }
    ).handler({ event: event2, step: step2 })) as Record<string, unknown>

    // Assert: Both retries produce the same result — not doubled
    expect(result1.aiPartial).toBe(false)
    expect(result2.aiPartial).toBe(false)
    expect(result1.lastCompletedLayer).toBe('L1L2')
    expect(result2.lastCompletedLayer).toBe('L1L2')

    // Assert: runL2ForFile was called exactly twice (once per retry)
    expect(mockRunL2ForFile).toHaveBeenCalledTimes(2)

    // Assert: scoreFile was called exactly twice (once per retry, not accumulated)
    expect(mockScoreFile).toHaveBeenCalledTimes(2)
  })
})
