import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockWriteAuditLog, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockRequireRole: vi.fn(),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    budgetAlertThresholdPct: 'budget_alert_threshold_pct',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Test constants ──

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const adminUser = {
  id: 'admin-uuid-0001-0001-000000000001',
  tenantId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
  role: 'admin' as const,
  email: 'admin@test.com',
}

describe('updateBudgetAlertThreshold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(adminUser)
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  // ── P0: Core behavior ──

  it('should update budget_alert_threshold_pct for valid percentage (80)', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID, budgetAlertThresholdPct: 80 }]]

    const { updateBudgetAlertThreshold } = await import('./updateBudgetAlertThreshold.action')
    const result = await updateBudgetAlertThreshold({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 80,
    })

    expect(result.success).toBe(true)
    expect(dbState.setCaptures[0]).toMatchObject({ budgetAlertThresholdPct: 80 })
    // RED: updateBudgetAlertThreshold.action.ts not yet created
  })

  it('should return FORBIDDEN when user role is qa_reviewer', async () => {
    // QA Reviewer cannot edit alert threshold (RBAC table: Alert threshold Admin/PM only)
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { updateBudgetAlertThreshold } = await import('./updateBudgetAlertThreshold.action')
    const result = await updateBudgetAlertThreshold({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 80,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
    // RED: role-based access control
  })

  it('should return INVALID_INPUT when threshold is outside 1-100 range', async () => {
    const { updateBudgetAlertThreshold } = await import('./updateBudgetAlertThreshold.action')

    // Test: 0 is invalid
    const resultZero = await updateBudgetAlertThreshold({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 0,
    })
    expect(resultZero.success).toBe(false)
    if (resultZero.success) return
    expect(resultZero.code).toBe('INVALID_INPUT')

    // Test: 101 is invalid
    const resultOver = await updateBudgetAlertThreshold({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 101,
    })
    expect(resultOver.success).toBe(false)
    if (resultOver.success) return
    expect(resultOver.code).toBe('INVALID_INPUT')
    // RED: range validation 1-100
  })

  // ── P1: Audit + isolation ──

  it('should write audit log on threshold change', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]

    const { updateBudgetAlertThreshold } = await import('./updateBudgetAlertThreshold.action')
    await updateBudgetAlertThreshold({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 75,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: adminUser.tenantId,
        newValue: expect.objectContaining({ budgetAlertThresholdPct: 75 }),
      }),
    )
    // RED: audit log required
  })

  it('should use withTenant on projects UPDATE query', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]

    const { updateBudgetAlertThreshold } = await import('./updateBudgetAlertThreshold.action')
    await updateBudgetAlertThreshold({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 80,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), adminUser.tenantId)
    // RED: withTenant guard
  })
})
