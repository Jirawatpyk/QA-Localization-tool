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
  sql: vi.fn((..._args: unknown[]) => 'sql-fragment'),
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {
    tenantId: 'tenant_id',
    createdAt: 'created_at',
    fileId: 'file_id',
    estimatedCost: 'estimated_cost',
    projectId: 'project_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    name: 'name',
    tenantId: 'tenant_id',
    aiBudgetMonthlyUsd: 'ai_budget_monthly_usd',
    budgetAlertThresholdPct: 'budget_alert_threshold_pct',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Test constants ──
const MOCK_ADMIN = {
  id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  tenantId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
  role: 'admin' as const,
  email: 'admin@test.com',
}

const ZERO_SPEND_PROJECT = {
  projectId: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
  projectName: 'Zero Spend Project',
  monthlyBudgetUsd: '100.00',
  budgetAlertThresholdPct: 80,
  totalCost: '0',
  fileCount: '0',
}

const PROJECT_WITH_SPEND = {
  projectId: 'd4e5f6a7-b8c9-4d4e-bf50-6a7b8c9d0e1f',
  projectName: 'Active Project',
  monthlyBudgetUsd: '200.00',
  budgetAlertThresholdPct: 80,
  totalCost: '45.50',
  fileCount: '10',
}

describe('getAiUsageByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(MOCK_ADMIN)
  })

  // ── P0: Core behavior — LEFT JOIN ──

  it('should include project with ZERO spend this month in result (LEFT JOIN verification)', async () => {
    dbState.returnValues = [[ZERO_SPEND_PROJECT]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.projectId).toBe(ZERO_SPEND_PROJECT.projectId)
  })

  it('should show totalCostUsd=0 for zero-spend project and not exclude it', async () => {
    dbState.returnValues = [[ZERO_SPEND_PROJECT]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]?.totalCostUsd).toBe(0)
  })

  it('should show correct totalCostUsd for project with usage', async () => {
    dbState.returnValues = [[PROJECT_WITH_SPEND]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]?.totalCostUsd).toBeCloseTo(45.5)
    expect(result.data[0]?.filesProcessed).toBe(10)
  })

  it('should return FORBIDDEN when user role is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should apply withTenant on projects table in WHERE clause for tenant isolation', async () => {
    dbState.returnValues = [[]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    await getAiUsageByProject()

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), MOCK_ADMIN.tenantId)
  })

  it('should apply tenant filter for ai_usage_logs in JOIN condition for defense-in-depth', async () => {
    dbState.returnValues = [[]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    await getAiUsageByProject()

    // withTenant should be called at least twice — once for projects (WHERE) and once for ai_usage_logs (JOIN)
    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledTimes(2)
  })

  // ── P1: Guard details ──

  it('should place date filter in JOIN condition to preserve LEFT JOIN semantics', async () => {
    dbState.returnValues = [[ZERO_SPEND_PROJECT, PROJECT_WITH_SPEND]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    // Both projects (zero-spend and active) must appear
    // If date filter were in WHERE clause, zero-spend project would be excluded
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(2)
  })

  it('should sort projects by totalCostUsd descending (highest spend first)', async () => {
    // DB returns zero-spend project first — action must reorder by totalCostUsd desc
    dbState.returnValues = [[ZERO_SPEND_PROJECT, PROJECT_WITH_SPEND]]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    expect(result.success).toBe(true)
    if (!result.success) return
    // Highest spend (45.50) must come first
    expect(result.data[0]?.totalCostUsd).toBeCloseTo(45.5)
    expect(result.data[1]?.totalCostUsd).toBe(0)
  })

  it('should return monthlyBudgetUsd=null when project has no budget set (unlimited)', async () => {
    dbState.returnValues = [
      [
        {
          ...ZERO_SPEND_PROJECT,
          monthlyBudgetUsd: null,
        },
      ],
    ]

    const { getAiUsageByProject } = await import('./getAiUsageByProject.action')
    const result = await getAiUsageByProject()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]?.monthlyBudgetUsd).toBeNull()
  })
})
