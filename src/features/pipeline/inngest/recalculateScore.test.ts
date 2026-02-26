/**
 * ATDD Tests — Story 3.0: Score & Review Infrastructure
 * AC3: Inngest `recalculate-score` Function
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockScoreFile, mockWriteAuditLog, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockScoreFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        scoreId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        fileId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
        mqmScore: 85,
        npt: 15,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 3,
        minorCount: 0,
        status: 'calculated' as const,
        autoPassRationale: null,
      }),
    ),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: (...args: unknown[]) => mockScoreFile(...args),
}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('server-only', () => ({}))

import { recalculateScore } from '@/features/pipeline/inngest/recalculateScore'
import { buildFindingChangedEvent } from '@/test/factories'

// Step mock type matching handler expectation
type StepMock = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
function createMockStep(): StepMock {
  return { run: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()) as StepMock['run'] }
}

describe('recalculateScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  // ── P0: Happy Path ──

  it('should call scoreFile with correct params and deterministic step ID', async () => {
    const event = buildFindingChangedEvent({
      fileId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      projectId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
      tenantId: 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a',
      triggeredBy: 'e5f6a1b2-c3d4-4e5f-a6a7-b8c9d0e1f2a3',
    })

    const mockStep = createMockStep()
    await recalculateScore.handler({ event: { data: event }, step: mockStep })

    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
        projectId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
        tenantId: 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a',
        userId: 'e5f6a1b2-c3d4-4e5f-a6a7-b8c9d0e1f2a3',
      }),
    )
    // Verify deterministic step ID includes fileId (prevents Inngest memoization collision)
    const runMock = mockStep.run as ReturnType<typeof vi.fn>
    expect(runMock).toHaveBeenCalledWith(
      `recalculate-score-b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e`,
      expect.any(Function),
    )
  })

  it('should use triggeredBy as userId parameter', async () => {
    const triggeredBy = 'e5f6a1b2-c3d4-4e5f-a6a7-b8c9d0e1f2a3'
    const event = buildFindingChangedEvent({ triggeredBy })
    const mockStep = createMockStep()

    await recalculateScore.handler({ event: { data: event }, step: mockStep })

    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: triggeredBy,
      }),
    )
  })

  it('should return new score result', async () => {
    const event = buildFindingChangedEvent()
    const mockStep = createMockStep()

    const result = await recalculateScore.handler({ event: { data: event }, step: mockStep })

    expect(result).toEqual(
      expect.objectContaining({
        mqmScore: 85,
        status: 'calculated',
      }),
    )
  })

  it('should throw NonRetriableError for malformed event data', async () => {
    const { NonRetriableError: InngestNonRetriableError } = await import('inngest')
    const mockStep = createMockStep()
    const malformedEvent = { fileId: 'not-a-uuid', projectId: '', tenantId: '', triggeredBy: '' }

    await expect(
      recalculateScore.handler({ event: { data: malformedEvent as never }, step: mockStep }),
    ).rejects.toThrow(InngestNonRetriableError)
  })

  // ── P0: Inngest Config ──

  it('should have concurrency key set to event.data.projectId', () => {
    expect(recalculateScore.fnConfig.concurrency).toEqual([
      { key: 'event.data.projectId', limit: 1 },
    ])
  })

  it('should expose handler and onFailure via Object.assign', () => {
    expect(recalculateScore.handler).toBeDefined()
    expect(typeof recalculateScore.handler).toBe('function')
    expect(recalculateScore.onFailure).toBeDefined()
    expect(typeof recalculateScore.onFailure).toBe('function')
  })

  // ── P1: Failure Handler ──

  it('should log and write audit log in onFailure handler', async () => {
    const eventData = buildFindingChangedEvent()
    const failureEvent = {
      data: {
        event: { data: eventData },
      },
    }

    await recalculateScore.onFailure({
      event: failureEvent,
      error: new Error('scoreFile failed'),
    })

    const { logger } = await import('@/lib/logger')
    expect(logger.error).toHaveBeenCalled()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'score.recalculation_failed',
        tenantId: eventData.tenantId,
        newValue: expect.objectContaining({
          error: 'scoreFile failed',
        }),
      }),
    )
  })

  it('should complete onFailure without throwing when audit log write fails', async () => {
    mockWriteAuditLog.mockRejectedValue(new Error('audit DB down'))
    const eventData = buildFindingChangedEvent()
    const failureEvent = { data: { event: { data: eventData } } }

    // Should not throw even if audit write fails
    await expect(
      recalculateScore.onFailure({ event: failureEvent, error: new Error('score failed') }),
    ).resolves.toBeUndefined()
  })

  it('should have retries set to 3', () => {
    expect(recalculateScore.fnConfig.retries).toBe(3)
  })

  it('should be triggered by finding.changed event', () => {
    expect(recalculateScore.triggerEvent).toBe('finding.changed')
  })
})
