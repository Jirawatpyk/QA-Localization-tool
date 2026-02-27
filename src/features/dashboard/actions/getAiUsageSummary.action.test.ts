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

describe('getAiUsageSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(MOCK_ADMIN)
  })

  // ── P0: Core behavior ──

  it('should return zero data when no records exist this month', async () => {
    dbState.returnValues = [[{ totalCost: '0', fileCount: '0' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalCostUsd).toBe(0)
    expect(result.data.filesProcessed).toBe(0)
    expect(result.data.avgCostPerFileUsd).toBe(0)
  })

  it('should sum total cost from ai_usage_logs for current tenant', async () => {
    dbState.returnValues = [[{ totalCost: '15.50', fileCount: '3' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalCostUsd).toBeCloseTo(15.5)
  })

  it('should count distinct file IDs for filesProcessed', async () => {
    dbState.returnValues = [[{ totalCost: '10.00', fileCount: '5' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.filesProcessed).toBe(5)
  })

  it('should apply withTenant filter for tenant isolation', async () => {
    dbState.returnValues = [[{ totalCost: '0', fileCount: '0' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    await getAiUsageSummary()

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), MOCK_ADMIN.tenantId)
  })

  it('should filter to current calendar month only and not include previous months', async () => {
    dbState.returnValues = [[{ totalCost: '5.00', fileCount: '2' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    await getAiUsageSummary()

    // Verify gte() was called with a date set to the 1st of current month
    const { gte } = await import('drizzle-orm')
    expect(gte).toHaveBeenCalled()
    const [_, datePassed] = vi.mocked(gte).mock.calls[0] as [unknown, Date]
    expect(datePassed.getUTCDate()).toBe(1)
    expect(datePassed.getUTCHours()).toBe(0)
  })

  it('should return FORBIDDEN when user role is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  // ── P1: Derived values ──

  it('should compute avgCostPerFileUsd as 0 when filesProcessed is 0 to avoid division-by-zero', async () => {
    dbState.returnValues = [[{ totalCost: '0', fileCount: '0' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.avgCostPerFileUsd).toBe(0)
    expect(result.data.filesProcessed).toBe(0)
  })

  it('should return projectedMonthCostUsd=null when daysElapsed is less than 5 (exact boundary: day 5 → daysElapsed=4)', async () => {
    // BV: day 5 → daysElapsed = 5 - 1 = 4 → below threshold → null
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-05T12:00:00Z'))

    dbState.returnValues = [[{ totalCost: '1.50', fileCount: '1' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    vi.useRealTimers()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.projectedMonthCostUsd).toBeNull()
  })

  it('should return projectedMonthCostUsd as calculated value when daysElapsed is 5 or more (exact boundary: day 6 → daysElapsed=5)', async () => {
    // BV: day 6 → daysElapsed = 6 - 1 = 5 → at threshold → projected
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-06T12:00:00Z'))

    dbState.returnValues = [[{ totalCost: '10.00', fileCount: '5' }]]

    const { getAiUsageSummary } = await import('./getAiUsageSummary.action')
    const result = await getAiUsageSummary()

    vi.useRealTimers()

    expect(result.success).toBe(true)
    if (!result.success) return
    // BV: daysElapsed=5 is the first day projection should appear → non-null and > 0
    // Exact value is month-length-dependent; check it's a positive number
    expect(result.data.projectedMonthCostUsd).not.toBeNull()
    expect(result.data.projectedMonthCostUsd).toBeGreaterThan(0)
  })
})
