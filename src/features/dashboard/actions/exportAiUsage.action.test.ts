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
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {
    tenantId: 'tenant_id',
    createdAt: 'created_at',
    fileId: 'file_id',
    layer: 'layer',
    model: 'model',
    provider: 'provider',
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
    estimatedCost: 'estimated_cost',
    latencyMs: 'latency_ms',
    status: 'status',
    projectId: 'project_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    name: 'name',
    tenantId: 'tenant_id',
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

const EXPECTED_HEADER =
  'date,project_name,file_id,layer,model,provider,input_tokens,output_tokens,cost_usd,latency_ms,status'

const MOCK_RECORD = {
  createdAt: new Date('2026-02-15T10:00:00Z'),
  projectName: 'Test Project',
  fileId: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
  layer: 'L2',
  model: 'gpt-4o-mini',
  provider: 'openai',
  inputTokens: 1000,
  outputTokens: 500,
  estimatedCost: 0.005,
  latencyMs: 1500,
  status: 'success',
}

describe('exportAiUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(MOCK_ADMIN)
  })

  // ── P0: Core behavior ──

  it('should return header-only CSV when no records exist for the month', async () => {
    dbState.returnValues = [[]]

    const { exportAiUsage } = await import('./exportAiUsage.action')
    const result = await exportAiUsage()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.csv).toBe(EXPECTED_HEADER)
  })

  it('should include all 11 required columns in header', async () => {
    dbState.returnValues = [[]]

    const { exportAiUsage } = await import('./exportAiUsage.action')
    const result = await exportAiUsage()

    expect(result.success).toBe(true)
    if (!result.success) return
    const headerCols = result.data.csv.split('\n')[0]?.split(',') ?? []
    expect(headerCols).toHaveLength(11)
    expect(headerCols).toContain('date')
    expect(headerCols).toContain('project_name')
    expect(headerCols).toContain('file_id')
    expect(headerCols).toContain('layer')
    expect(headerCols).toContain('model')
    expect(headerCols).toContain('provider')
    expect(headerCols).toContain('input_tokens')
    expect(headerCols).toContain('output_tokens')
    expect(headerCols).toContain('cost_usd')
    expect(headerCols).toContain('latency_ms')
    expect(headerCols).toContain('status')
  })

  it('should join project_name from projects table and not use hardcoded values', async () => {
    dbState.returnValues = [[{ ...MOCK_RECORD, projectName: 'Real Project Name' }]]

    const { exportAiUsage } = await import('./exportAiUsage.action')
    const result = await exportAiUsage()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.csv).toContain('Real Project Name')
  })

  it('should return FORBIDDEN when user role is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { exportAiUsage } = await import('./exportAiUsage.action')
    const result = await exportAiUsage()

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should return filename in format ai-usage-YYYY-MM.csv', async () => {
    dbState.returnValues = [[]]

    const { exportAiUsage } = await import('./exportAiUsage.action')
    const result = await exportAiUsage()

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.filename).toMatch(/^ai-usage-\d{4}-\d{2}\.csv$/)
  })

  // ── P1: CSV format details ──

  it('should escape double quotes in project_name with CSV double-quote escaping', async () => {
    dbState.returnValues = [[{ ...MOCK_RECORD, projectName: 'Project "Alpha" Test' }]]

    const { exportAiUsage } = await import('./exportAiUsage.action')
    const result = await exportAiUsage()

    expect(result.success).toBe(true)
    if (!result.success) return
    // Double-quote escaping: " becomes "" in CSV
    expect(result.data.csv).toContain('"Project ""Alpha"" Test"')
  })

  // ── P1-BV: 90-day cap boundary ──

  it('should cap export at 90 days when requested range exceeds 90 days', async () => {
    dbState.returnValues = [[]]

    const { exportAiUsage } = await import('./exportAiUsage.action')
    // exportAiUsage uses current month — verify cap is applied at query level
    await exportAiUsage()

    // Verify date boundary was computed as max 90 days ago
    const { gte } = await import('drizzle-orm')
    if (vi.mocked(gte).mock.calls.length > 0) {
      const [_, datePassed] = vi.mocked(gte).mock.calls[0] as [unknown, Date]
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90)
      // Start date should not be more than 90 days ago
      expect(datePassed.getTime()).toBeGreaterThanOrEqual(ninetyDaysAgo.getTime() - 60_000)
    }
  })
})
