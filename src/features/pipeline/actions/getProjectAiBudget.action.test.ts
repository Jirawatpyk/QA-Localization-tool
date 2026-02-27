import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockCheckProjectBudget, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockRequireRole: vi.fn(),
    mockCheckProjectBudget: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        hasQuota: true,
        remainingBudgetUsd: Infinity,
        monthlyBudgetUsd: null as number | null,
        usedBudgetUsd: 0,
      }),
    ),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/lib/ai/budget', () => ({
  checkProjectBudget: (...args: unknown[]) => mockCheckProjectBudget(...args),
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
    mockCheckProjectBudget.mockResolvedValue({
      hasQuota: true,
      remainingBudgetUsd: Infinity,
      monthlyBudgetUsd: null,
      usedBudgetUsd: 0,
    })
  })

  // ── P0: Core behavior ──

  it('should return usedBudgetUsd and monthlyBudgetUsd for project', async () => {
    // callIndex=0: projects SELECT → alert threshold only
    dbState.returnValues = [[{ budgetAlertThresholdPct: 80 }]]
    mockCheckProjectBudget.mockResolvedValue({
      hasQuota: true,
      remainingBudgetUsd: 37.6,
      monthlyBudgetUsd: 50,
      usedBudgetUsd: 12.4,
    })

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.monthlyBudgetUsd).toBe(50)
    expect(result.data.usedBudgetUsd).toBeCloseTo(12.4)
    expect(result.data.budgetAlertThresholdPct).toBe(80)
  })

  it('should return monthlyBudgetUsd=null when project has no budget set', async () => {
    dbState.returnValues = [[{ budgetAlertThresholdPct: 80 }]]
    mockCheckProjectBudget.mockResolvedValue({
      hasQuota: true,
      remainingBudgetUsd: Infinity,
      monthlyBudgetUsd: null,
      usedBudgetUsd: 0,
    })

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.monthlyBudgetUsd).toBeNull()
  })

  it('should return FORBIDDEN when auth fails', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should return NOT_FOUND when project does not exist', async () => {
    dbState.returnValues = [[]]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  // ── P1: Guards ──

  it('should delegate to checkProjectBudget with projectId and tenantId', async () => {
    dbState.returnValues = [[{ budgetAlertThresholdPct: 80 }]]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(mockCheckProjectBudget).toHaveBeenCalledWith(VALID_PROJECT_ID, mockUser.tenantId)
  })

  it('should use withTenant on projects query', async () => {
    dbState.returnValues = [[{ budgetAlertThresholdPct: 80 }]]

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })

  it('should return usedBudgetUsd=0 when no usage records exist this month', async () => {
    dbState.returnValues = [[{ budgetAlertThresholdPct: 80 }]]
    mockCheckProjectBudget.mockResolvedValue({
      hasQuota: true,
      remainingBudgetUsd: 100,
      monthlyBudgetUsd: 100,
      usedBudgetUsd: 0,
    })

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.usedBudgetUsd).toBe(0)
  })

  it('should return INTERNAL_ERROR when checkProjectBudget throws', async () => {
    dbState.returnValues = [[{ budgetAlertThresholdPct: 80 }]]
    mockCheckProjectBudget.mockRejectedValue(new Error('DB connection failed'))

    const { getProjectAiBudget } = await import('./getProjectAiBudget.action')
    const result = await getProjectAiBudget({ projectId: VALID_PROJECT_ID })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
  })
})
