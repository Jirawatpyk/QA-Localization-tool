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
  lte: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((..._args: unknown[]) => 'sql-fragment'),
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {
    tenantId: 'tenant_id',
    createdAt: 'created_at',
    layer: 'layer',
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

describe('getAiSpendTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(MOCK_ADMIN)
  })

  // ── P0: Core behavior ──

  it('should return 7 data points for days=7 (one per day)', async () => {
    // DB returns sparse data — action must scaffold all 7 days
    dbState.returnValues = [
      [{ day: '2026-02-20', totalCost: '1.00', l2Cost: '0.50', l3Cost: '0.50' }],
    ]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    const result = await getAiSpendTrend({ days: 7 })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(7)
  })

  it('should return 30 data points for days=30 with zero-filled gaps for days with no spend', async () => {
    // DB returns only 1 record — action must scaffold remaining 29 days as $0
    dbState.returnValues = [
      [{ day: '2026-02-15', totalCost: '2.00', l2Cost: '1.00', l3Cost: '1.00' }],
    ]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    const result = await getAiSpendTrend({ days: 30 })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(30)
    // Days with no data should show $0
    const zeroDay = result.data.find((d) => d.date !== '2026-02-15')
    expect(zeroDay?.totalCostUsd).toBe(0)
  })

  it('should return all points at $0.00 when no usage exists (not empty array)', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    const result = await getAiSpendTrend({ days: 7 })

    expect(result.success).toBe(true)
    if (!result.success) return
    // Must return 7 points (not empty array!)
    expect(result.data).toHaveLength(7)
    // All points at $0.00
    result.data.forEach((point) => {
      expect(point.totalCostUsd).toBe(0)
      expect(point.l2CostUsd).toBe(0)
      expect(point.l3CostUsd).toBe(0)
    })
  })

  it('should return FORBIDDEN when user role is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    const result = await getAiSpendTrend({ days: 30 })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should apply withTenant on ai_usage_logs query', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    await getAiSpendTrend({ days: 30 })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), MOCK_ADMIN.tenantId)
  })

  // ── P1: L2/L3 separation + boundary values ──

  it('should track l2CostUsd and l3CostUsd separately per day', async () => {
    // Fix system time so '2026-02-20' falls within days=7 window (Feb 19–25)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-25T12:00:00Z'))

    dbState.returnValues = [
      [{ day: '2026-02-20', totalCost: '3.00', l2Cost: '1.00', l3Cost: '2.00' }],
    ]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    const result = await getAiSpendTrend({ days: 7 })

    vi.useRealTimers()

    expect(result.success).toBe(true)
    if (!result.success) return
    const dayWithData = result.data.find((d) => d.date === '2026-02-20')
    expect(dayWithData?.l2CostUsd).toBeCloseTo(1.0)
    expect(dayWithData?.l3CostUsd).toBeCloseTo(2.0)
  })

  // ── P1-BV: Boundary values ──

  it('should return exactly 90 data points for days=90 (boundary — exact max)', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    const result = await getAiSpendTrend({ days: 90 })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(90)
  })

  it('should cap at 90 days when requested days exceeds 90 (MAX_DAYS enforcement)', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendTrend } = await import('./getAiSpendTrend.action')
    // @ts-expect-error — testing invalid input that server should cap
    const result = await getAiSpendTrend({ days: 365 })

    expect(result.success).toBe(true)
    if (!result.success) return
    // Must be capped to 90, not 365
    expect(result.data).toHaveLength(90)
  })
})
