/**
 * P0-05 / R3-001 — Concurrent batch budget exhaustion scenario.
 *
 * checkProjectBudget() has NO lock — two concurrent calls can both see
 * hasQuota=true even when the combined spend would exceed the budget.
 * These tests demonstrate and verify that race window.
 */
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

describe('checkProjectBudget concurrent budget exhaustion (R3-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('[P0] should allow both concurrent callers to see hasQuota=true when budget nearly exhausted', async () => {
    // Arrange: Budget=$10, used=$9.50. Only $0.50 remaining.
    // Two sequential calls (simulating concurrent reads) both see the same
    // snapshot: used=$9.50, so both return hasQuota=true.
    // This demonstrates the race window — no lock protects the read.
    //
    // Call 1: callIndex 0 → project budget, callIndex 1 → usage total
    // Call 2: callIndex 2 → project budget, callIndex 3 → usage total
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '10.00' }], // Call 1 — project
      [{ total: '9.50' }], // Call 1 — usage
      [{ aiBudgetMonthlyUsd: '10.00' }], // Call 2 — project
      [{ total: '9.50' }], // Call 2 — usage (same snapshot — no lock)
    ]

    const { checkProjectBudget } = await import('./budget')

    // Act: Two calls see the same DB state (no lock, no atomic reserve)
    const result1 = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)
    const result2 = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert: Both see hasQuota=true — race window demonstrated
    expect(result1.hasQuota).toBe(true)
    expect(result1.remainingBudgetUsd).toBeCloseTo(0.5)

    expect(result2.hasQuota).toBe(true)
    expect(result2.remainingBudgetUsd).toBeCloseTo(0.5)

    // Both callers would proceed to make AI calls, potentially exceeding budget
    expect(dbState.callIndex).toBe(4)
  })

  it('[P0] should return hasQuota=false when budget exactly exhausted ($10.00/$10.00)', async () => {
    // Arrange: Budget=$10.00, used=$10.00 — exactly at limit
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '10.00' }], [{ total: '10.00' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert: strict comparison (usedBudgetUsd < budget), NOT <=
    // $10.00 < $10.00 → false
    expect(result.hasQuota).toBe(false)
    expect(result.remainingBudgetUsd).toBe(0)
    expect(result.usedBudgetUsd).toBe(10)
    expect(result.monthlyBudgetUsd).toBe(10)
  })

  it('[P0] should return hasQuota=true with $0.01 remaining under concurrent load', async () => {
    // Arrange: Budget=$10, used=$9.99 — $0.01 remaining
    // A concurrent caller sees this thin margin and proceeds.
    dbState.returnValues = [[{ aiBudgetMonthlyUsd: '10.00' }], [{ total: '9.99' }]]

    const { checkProjectBudget } = await import('./budget')
    const result = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert: $0.01 remaining → hasQuota=true (even though next AI call will exceed)
    expect(result.hasQuota).toBe(true)
    expect(result.remainingBudgetUsd).toBeCloseTo(0.01)
    expect(result.usedBudgetUsd).toBeCloseTo(9.99)
  })

  it('[P0] should reflect budget exhaustion mid-batch when usage is logged between calls', async () => {
    // Arrange: Simulates a batch where:
    //   - Call 1: $5.00 used out of $10.00 → hasQuota=true, remaining=$5.00
    //   - (AI calls happen, cost is logged)
    //   - Call 2: $10.00 used out of $10.00 → hasQuota=false, remaining=$0.00
    //
    // Different returnValues for each call pair to simulate cost being logged.
    dbState.returnValues = [
      [{ aiBudgetMonthlyUsd: '10.00' }], // Call 1 — project
      [{ total: '5.00' }], // Call 1 — usage (mid-batch)
      [{ aiBudgetMonthlyUsd: '10.00' }], // Call 2 — project
      [{ total: '10.00' }], // Call 2 — usage (after batch completed)
    ]

    const { checkProjectBudget } = await import('./budget')

    // Act: First check — budget available
    const result1 = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Act: Second check — budget exhausted after cost was logged
    const result2 = await checkProjectBudget(VALID_PROJECT_ID, VALID_TENANT_ID)

    // Assert: First call sees quota available
    expect(result1.hasQuota).toBe(true)
    expect(result1.remainingBudgetUsd).toBe(5)
    expect(result1.usedBudgetUsd).toBe(5)

    // Assert: Second call sees budget fully exhausted
    expect(result2.hasQuota).toBe(false)
    expect(result2.remainingBudgetUsd).toBe(0)
    expect(result2.usedBudgetUsd).toBe(10)
  })
})
