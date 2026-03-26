/**
 * P3-03: Budget config change during active pipeline
 * New budget applies to next file, not in-flight.
 *
 * checkProjectBudget reads fresh budget on every call.
 * If budget is reduced mid-pipeline, the next call will pick up the new limit.
 * An in-flight AI call (already past budget check) is NOT affected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// Must be first
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

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_TENANT_ID = asTenantId('b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e')

describe('checkProjectBudget — mid-pipeline config change (P3-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('[P3] should reflect updated budget on next call (not retroactive to in-flight)', async () => {
    // First call: budget = $100, usage = $50 → hasQuota = true
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '100.00' }], [{ total: '50.00' }]]

    const { checkProjectBudget } = await import('./budget')
    const result1 = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)
    expect(result1.hasQuota).toBe(true)
    expect(result1.remainingBudgetUsd).toBe(50)

    // Budget admin reduces budget to $40 while pipeline is running
    // Second call: budget = $40, usage = $50 (already over!) → hasQuota = false
    dbState.callIndex = 0
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '40.00' }], [{ total: '50.00' }]]

    const result2 = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)
    expect(result2.hasQuota).toBe(false)
    expect(result2.remainingBudgetUsd).toBe(0)
    expect(result2.monthlyBudgetUsd).toBe(40)

    // The first file (already past budget check) continues unaffected.
    // The next file will see hasQuota=false and stop.
  })
})
