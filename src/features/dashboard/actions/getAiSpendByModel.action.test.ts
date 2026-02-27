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
    provider: 'provider',
    model: 'model',
    estimatedCost: 'estimated_cost',
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
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

describe('getAiSpendByModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(MOCK_ADMIN)
  })

  // ── P0: Core behavior ──

  it('should return empty array when no AI usage exists for the period', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    const result = await getAiSpendByModel({ days: 30 })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual([])
  })

  it('should group spend by provider and model correctly', async () => {
    dbState.returnValues = [
      [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          totalCost: '5.00',
          inputTokens: '100000',
          outputTokens: '20000',
        },
        {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          totalCost: '12.50',
          inputTokens: '50000',
          outputTokens: '15000',
        },
      ],
    ]

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    const result = await getAiSpendByModel({ days: 30 })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(2)
    expect(result.data[0]?.provider).toBe('openai')
    expect(result.data[1]?.provider).toBe('anthropic')
  })

  it('should accept days=7 parameter and filter to last 7 days only', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    await getAiSpendByModel({ days: 7 })

    const { gte } = await import('drizzle-orm')
    expect(gte).toHaveBeenCalled()
    // Verify the date passed is approximately 7 days ago
    const [_, datePassed] = vi.mocked(gte).mock.calls[0] as [unknown, Date]
    // Action normalizes rangeStart to midnight UTC — match that in the comparison
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)
    sevenDaysAgo.setUTCHours(0, 0, 0, 0)
    expect(Math.abs(datePassed.getTime() - sevenDaysAgo.getTime())).toBeLessThan(60_000)
  })

  it('should accept days=30 parameter and filter to last 30 days only', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    await getAiSpendByModel({ days: 30 })

    const { gte } = await import('drizzle-orm')
    expect(gte).toHaveBeenCalled()
    // Verify the date passed is approximately 30 days ago
    const [_, datePassed] = vi.mocked(gte).mock.calls[0] as [unknown, Date]
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0)
    expect(Math.abs(datePassed.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(60_000)
  })

  it('should accept days=90 parameter and filter to last 90 days only', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    await getAiSpendByModel({ days: 90 })

    const { gte } = await import('drizzle-orm')
    expect(gte).toHaveBeenCalled()
    // Verify the date passed is approximately 90 days ago
    const [_, datePassed] = vi.mocked(gte).mock.calls[0] as [unknown, Date]
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90)
    ninetyDaysAgo.setUTCHours(0, 0, 0, 0)
    expect(Math.abs(datePassed.getTime() - ninetyDaysAgo.getTime())).toBeLessThan(60_000)
  })

  it('should return FORBIDDEN when user role is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    const result = await getAiSpendByModel({ days: 30 })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  // ── P1: Tenant isolation ──

  it('should apply withTenant on ai_usage_logs query', async () => {
    dbState.returnValues = [[]]

    const { getAiSpendByModel } = await import('./getAiSpendByModel.action')
    await getAiSpendByModel({ days: 30 })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), MOCK_ADMIN.tenantId)
  })
})
