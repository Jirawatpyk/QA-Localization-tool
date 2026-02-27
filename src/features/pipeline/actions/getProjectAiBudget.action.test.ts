import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockRequireRole: vi.fn(),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((..._args: unknown[]) => 'sql-expr'),
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    aiBudgetMonthlyUsd: 'ai_budget_monthly_usd',
    budgetAlertThresholdPct: 'budget_alert_threshold_pct',
  },
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {
    tenantId: 'tenant_id',
    projectId: 'project_id',
    estimatedCost: 'estimated_cost',
    createdAt: 'created_at',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Test constants ──

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const mockUser = {
  id: 'user-uuid-0001-0001-000000000001',
  tenantId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
  role: 'admin' as const,
  email: 'admin@test.com',
}

describe('getProjectAiBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
  })

  // ── P0: Core behavior ──

  it('should return usedBudgetUsd and monthlyBudgetUsd for project', async () => {
    // callIndex=0: projects SELECT → budget + alert threshold
    // callIndex=1: ai_usage_logs SUM → current month usage
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '50.00', budgetAlertThresholdPct: 80 }],
      [{ total: '12.40' }],
    ]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.monthlyBudgetUsd).toBe(50)
    expect(result.data.usedBudgetUsd).toBeCloseTo(12.4)
    expect(result.data.budgetAlertThresholdPct).toBe(80)
    // RED: getProjectAiBudget.action.ts not yet created
  })

  it('should return monthlyBudgetUsd=null when project has no budget set', async () => {
    // Arrange: NULL budget = unlimited
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: null, budgetAlertThresholdPct: 80 }]]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.monthlyBudgetUsd).toBeNull()
    // RED: unlimited budget = null monthlyBudgetUsd
  })

  it('should return FORBIDDEN when auth fails', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
    // RED: auth check required
  })

  // ── P1: Guards ──

  it('should use withTenant on ai_usage_logs query', async () => {
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '100.00', budgetAlertThresholdPct: 80 }],
      [{ total: '0' }],
    ]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
    // RED: withTenant guard (Guardrail #1)
  })

  it('should return usedBudgetUsd=0 when no usage records exist this month', async () => {
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '100.00', budgetAlertThresholdPct: 80 }],
      [{ total: '0' }],
    ]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.usedBudgetUsd).toBe(0)
    // RED: zero usage boundary — COALESCE handling
  })
})
