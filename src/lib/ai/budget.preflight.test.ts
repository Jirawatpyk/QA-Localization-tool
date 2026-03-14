import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('checkProjectBudget — pre-flight batch estimation (P1-03, R3-020)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('[P1] should return sufficient when batch estimated total $2 is within budget $10', async () => {
    // Simulate: project budget=$10, current usage=$2 (batch of 5 files * ~$0.40/file)
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '10.00' }], // project budget
      [{ total: '2.00' }], // current month usage
    ]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(true)
    expect(result.remainingBudgetUsd).toBe(8)
    expect(result.monthlyBudgetUsd).toBe(10)
    expect(result.usedBudgetUsd).toBe(2)
  })

  it('[P1] should return insufficient when batch estimated total $15 exceeds budget $10', async () => {
    // Simulate: project budget=$10, current usage=$15 (already over budget from previous runs)
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '10.00' }], // project budget
      [{ total: '15.00' }], // already exceeded
    ]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(false)
    expect(result.remainingBudgetUsd).toBe(0) // Math.max(0, ...) prevents negative
    expect(result.usedBudgetUsd).toBe(15)
  })

  it('[P1] should always return sufficient when budget is unlimited (NULL)', async () => {
    // NULL budget = unlimited — no usage query needed
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: null }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    expect(result.hasQuota).toBe(true)
    expect(result.remainingBudgetUsd).toBe(Infinity)
    expect(result.monthlyBudgetUsd).toBeNull()
    // Only 1 DB call (project lookup) — no usage query for unlimited
    expect(dbState.callIndex).toBe(1)
  })
})
