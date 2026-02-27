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
  inArray: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((..._args: unknown[]) => 'sql-expr'),
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    fileId: 'file_id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    wordCount: 'word_count',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Test constants ──

const VALID_FILE_ID_1 = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_FILE_ID_2 = 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_PROJECT_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f'

const mockUser = {
  id: 'user-uuid-0001-0001-000000000001',
  tenantId: 'd4e5f6a7-b8c9-4d1e-9f2a-3b4c5d6e7f8a',
  role: 'qa_reviewer' as const,
  email: 'reviewer@test.com',
}

describe('getFilesWordCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
  })

  // ── P0: Core behavior ──

  it('should return total word count summed across all selected files', async () => {
    // Arrange: SUM query returns 50,000 words across 2 files
    dbState.returnValues = [[{ total: '50000' }]]

    const { getFilesWordCount } = await import('./getFilesWordCount.action')
    const result = await getFilesWordCount({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalWords).toBe(50_000)
    // RED: getFilesWordCount.action.ts not yet created
  })

  it('should return 0 when no segments exist for the given files', async () => {
    // Arrange: COALESCE(SUM, 0) returns '0' when no rows
    dbState.returnValues = [[{ total: '0' }]]

    const { getFilesWordCount } = await import('./getFilesWordCount.action')
    const result = await getFilesWordCount({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalWords).toBe(0)
    // RED: zero-case boundary
  })

  it('should return FORBIDDEN when auth fails', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getFilesWordCount } = await import('./getFilesWordCount.action')
    const result = await getFilesWordCount({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
    // RED: auth guard must be checked
  })

  // ── P1: Guards and isolation ──

  it('should use withTenant on segments query', async () => {
    dbState.returnValues = [[{ total: '1000' }]]

    const { getFilesWordCount } = await import('./getFilesWordCount.action')
    await getFilesWordCount({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
    // RED: withTenant guard (Guardrail #1)
  })

  it('should return 0 words for empty fileIds array (guard inArray([]) before query)', async () => {
    // Arrange: empty fileIds — should NOT call inArray with empty array (invalid SQL)
    const { getFilesWordCount } = await import('./getFilesWordCount.action')
    const result = await getFilesWordCount({
      fileIds: [],
      projectId: VALID_PROJECT_ID,
    })

    // Should early-return 0 without hitting DB
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.totalWords).toBe(0)

    // DB should NOT have been called (inArray guard)
    expect(dbState.callIndex).toBe(0)
    // RED: Guardrail #5 — inArray(col, []) = invalid SQL
  })
})
