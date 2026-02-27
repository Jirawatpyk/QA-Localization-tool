import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first — prevents 'server-only' from throwing in node test environment
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

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

// ── Test constants ──

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_TENANT_ID = 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e'

describe('checkProjectBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  // ── P0: Core behavior ──

  it('should return hasQuota=true when monthly usage is below budget', async () => {
    // Arrange: project has $100 budget, usage is $50
    // callIndex=0: projects SELECT → [{ aiBudgetMonthlyUsd: '100.00' }]
    // callIndex=1: ai_usage_logs SUM → [{ total: '50.00' }]
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '50.00' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert
    expect(result.hasQuota).toBe(true)
    expect(result.remainingBudgetUsd).toBe(50)
    expect(result.monthlyBudgetUsd).toBe(100)
    expect(result.usedBudgetUsd).toBe(50)
    // RED: checkProjectBudget not yet implemented (currently returns token-based stub)
  })

  it('should return hasQuota=false when monthly usage equals budget exactly ($100.00/$100.00)', async () => {
    // Arrange: boundary value — at the limit exactly
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '100.00' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert: at-limit is NOT hasQuota (used >= budget blocks)
    expect(result.hasQuota).toBe(false)
    expect(result.remainingBudgetUsd).toBe(0)
    // RED: boundary value — at limit must block
  })

  it('should return hasQuota=false when monthly usage exceeds budget by $0.01 ($100.01 used)', async () => {
    // Arrange: boundary value — $0.01 over
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '100.01' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(false)
    expect(result.usedBudgetUsd).toBeCloseTo(100.01)
    expect(result.remainingBudgetUsd).toBe(0)
    // RED: boundary value — over budget must block
  })

  it('should return hasQuota=true when monthly usage is $0.01 below budget ($99.99 used)', async () => {
    // Arrange: boundary value — $0.01 under
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '99.99' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(true)
    expect(result.remainingBudgetUsd).toBeCloseTo(0.01)
    // RED: boundary value — under budget must allow
  })

  it('should return hasQuota=true with unlimited quota when ai_budget_monthly_usd is NULL', async () => {
    // Arrange: NULL budget = unlimited
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: null }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(true)
    expect(result.monthlyBudgetUsd).toBeNull()
    expect(result.remainingBudgetUsd).toBe(Infinity)
    // RED: NULL budget must not query ai_usage_logs (no second DB call needed)
  })

  it('should return usedBudgetUsd=0 and hasQuota=true when no usage records exist this month', async () => {
    // Arrange: $0 usage (COALESCE returns 0 when SUM is null)
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '0' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(true)
    expect(result.usedBudgetUsd).toBe(0)
    expect(result.remainingBudgetUsd).toBe(100)
    // RED: zero usage boundary — COALESCE(SUM, 0) must return 0 not null
  })

  it('should throw when project is not found', async () => {
    // Arrange: projects SELECT returns empty array
    dbState.returnValues = [[]]

    const { checkProjectBudget } = await import('./budget')

    await expect(checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)).rejects.toThrow(
      'Project not found',
    )
    // RED: must guard rows[0]! access (Guardrail #4)
  })

  it('should only count current calendar month usage (not previous months)', async () => {
    // Arrange: verify gte filter is applied with month boundary
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '25.00' }]]

    const { checkProjectBudget } = await import('./budget')
    await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert: gte was called with a UTC-based Date representing 1st of current month at 00:00:00 UTC
    const { gte } = await import('drizzle-orm')
    expect(gte).toHaveBeenCalledWith(expect.anything(), expect.any(Date))

    // Verify the Date is actually the 1st of the current month in UTC
    const calledDate = (gte as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Date
    expect(calledDate.getUTCDate()).toBe(1)
    expect(calledDate.getUTCHours()).toBe(0)
    expect(calledDate.getUTCMinutes()).toBe(0)
    expect(calledDate.getUTCSeconds()).toBe(0)
    expect(calledDate.getUTCMilliseconds()).toBe(0)
  })

  // ── P1: Additional coverage ──

  it('should return remainingBudgetUsd=0 (not negative) when over budget', async () => {
    // Arrange: usage exceeds budget
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '50.00' }], [{ total: '75.00' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.remainingBudgetUsd).toBe(0) // never negative — Math.max(0, ...)
    expect(result.usedBudgetUsd).toBe(75)
    // RED: Math.max(0, budget - used) prevents negative remaining
  })

  it('should return correct remainingBudgetUsd when partially used', async () => {
    // Arrange
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '37.50' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.remainingBudgetUsd).toBeCloseTo(62.5)
    // RED: arithmetic correctness
  })

  it('should use COALESCE so zero-usage SUM returns 0 not null', async () => {
    // Arrange: Postgres SUM returns null when no rows — COALESCE wraps it
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '100.00' }],
      [{ total: null }], // simulate NULL from Postgres SUM with no rows
    ]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.usedBudgetUsd).toBe(0) // null → 0 via `Number(usage?.total ?? 0)`
    // RED: null safety in usage calculation
  })

  it('should call withTenant on both projects and ai_usage_logs queries', async () => {
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '0' }]]

    const { checkProjectBudget } = await import('./budget')
    await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    const { withTenant } = await import('@/db/helpers/withTenant')
    // Both queries must include tenant filter
    expect(withTenant).toHaveBeenCalledTimes(2)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    // RED: withTenant guard on both DB calls
  })

  it('should query ai_usage_logs filtered to current month start (not all-time)', async () => {
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '0' }]]

    const { checkProjectBudget } = await import('./budget')
    await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // The SUM query should run (callIndex reaches 2 for non-NULL budget)
    expect(dbState.callIndex).toBe(2)
    // RED: month filter must be included in ai_usage_logs query
  })
})
