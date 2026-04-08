import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { dbState, dbMockModule } = vi.hoisted(() =>
  (
    globalThis as unknown as {
      createDrizzleMock: () => import('@/test/drizzleMock').DrizzleMockResult
    }
  ).createDrizzleMock(),
)
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/db/schema/fileAssignments', () => ({ fileAssignments: {} }))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((_config, _trigger, handler) => handler),
  },
}))

vi.mock('@/types/tenant', () => ({
  validateTenantId: (id: string) => id,
}))

import { releaseStaleAssignments } from './releaseStaleAssignments'

/**
 * M7: id-tracking step.run mock so tests can assert deterministic step IDs
 * (Guardrail #13: Inngest step IDs must be unique per execution).
 * Returns { mockStep, stepIds } — assert `new Set(stepIds).size === stepIds.length`.
 */
function createStepMock() {
  const stepIds: string[] = []
  return {
    stepIds,
    mockStep: {
      run: async <T>(id: string, fn: () => Promise<T>) => {
        stepIds.push(id)
        return fn()
      },
    },
  }
}

describe('releaseStaleAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should expose handler and onFailure for testability (Guardrail #9)', () => {
    expect(releaseStaleAssignments.handler).toBeDefined()
    expect(releaseStaleAssignments.onFailure).toBeDefined()
    expect(releaseStaleAssignments.fnConfig).toBeDefined()
    expect(releaseStaleAssignments.fnConfig.retries).toBe(3)
    expect(releaseStaleAssignments.fnConfig.cron).toBe('*/5 * * * *')
  })

  it('should release only stale (>30min) assignments', async () => {
    const staleAssignment = {
      id: 'stale-1',
      fileId: 'file-1',
      projectId: 'proj-1',
      assignedTo: 'user-1',
      tenantId: 'tenant-1',
      lastActiveAt: new Date(Date.now() - 31 * 60 * 1000), // 31 min ago
    }

    // Single UPDATE: in_progress + stale lastActiveAt
    // (S-FIX-7 AC4 strict scope — 'assigned' row lifecycle deferred to S-FIX-7b)
    dbState.returnValues = [
      [staleAssignment], // in_progress stale
    ]

    const { mockStep, stepIds } = createStepMock()

    const result = await releaseStaleAssignments.handler({ step: mockStep })

    // Guardrail #13: step IDs must be deterministic + unique
    expect(new Set(stepIds).size).toBe(stepIds.length)

    expect(result).toEqual({ releasedCount: 1, auditFailures: 0 })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auto_release',
        entityId: 'stale-1',
        entityType: 'file_assignment',
      }),
    )
  })

  it('should not release active (<30min) assignments', async () => {
    // Single UPDATE — no stale rows
    dbState.returnValues = [[]]

    const { mockStep, stepIds } = createStepMock()

    const result = await releaseStaleAssignments.handler({ step: mockStep })

    // Guardrail #13: step IDs must be deterministic + unique
    expect(new Set(stepIds).size).toBe(stepIds.length)

    expect(result).toEqual({ releasedCount: 0, auditFailures: 0 })
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('should continue if audit log fails for one assignment (Guardrail #2)', async () => {
    const row1 = {
      id: 'row-1',
      fileId: 'f-1',
      projectId: 'p-1',
      assignedTo: 'u-1',
      tenantId: 't-1',
      lastActiveAt: new Date(),
    }
    const row2 = {
      id: 'row-2',
      fileId: 'f-2',
      projectId: 'p-2',
      assignedTo: 'u-2',
      tenantId: 't-2',
      lastActiveAt: new Date(),
    }

    dbState.returnValues = [[row1, row2]]

    // First audit log fails, second succeeds
    mockWriteAuditLog
      .mockRejectedValueOnce(new Error('audit failed'))
      .mockResolvedValueOnce(undefined)

    const { mockStep, stepIds } = createStepMock()

    const result = await releaseStaleAssignments.handler({ step: mockStep })

    // Guardrail #13: step IDs must be deterministic + unique
    expect(new Set(stepIds).size).toBe(stepIds.length)

    // Should still complete and report both as released
    // L5 fix: audit log loop is now Promise.allSettled — caught failures don't propagate
    // (the inner try/catch in the audit lambda swallows errors and returns undefined,
    // so allSettled sees them as fulfilled). auditFailures only counts true rejections.
    expect(result.releasedCount).toBe(2)
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2)
  })
})
