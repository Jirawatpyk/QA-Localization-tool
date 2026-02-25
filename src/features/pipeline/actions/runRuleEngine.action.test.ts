import { NonRetriableError } from 'inngest'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only (throws in jsdom)
vi.mock('server-only', () => ({}))
vi.mock('inngest', () => ({
  NonRetriableError: class NonRetriableError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'NonRetriableError'
    }
  },
}))

// ── Hoisted mocks ──
const { mockRequireRole, mockRunL1ForFile, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockRequireRole: vi.fn(),
    mockRunL1ForFile: vi.fn(),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/pipeline/helpers/runL1ForFile', () => ({
  runL1ForFile: (...args: unknown[]) => mockRunL1ForFile(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: { id: 'id', tenantId: 'tenant_id', projectId: 'project_id' },
}))

import { runRuleEngine } from './runRuleEngine.action'

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const mockFileRecord = { projectId: 'project-123' }
const mockUser = {
  id: 'user-123',
  tenantId: 'tenant-123',
  role: 'qa_reviewer',
  email: 'test@test.com',
}

describe('runRuleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    mockRequireRole.mockResolvedValue(mockUser)
    mockRunL1ForFile.mockResolvedValue({ findingCount: 0, duration: 50 })
  })

  it('should return INVALID_INPUT for invalid fileId', async () => {
    const result = await runRuleEngine({ fileId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('should return FORBIDDEN when user lacks permission', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should call requireRole with qa_reviewer and write', async () => {
    dbState.returnValues = [[]] // no file → early return
    await runRuleEngine({ fileId: VALID_UUID })
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  it('should return NOT_FOUND when file does not exist', async () => {
    dbState.returnValues = [[]] // select projectId returns empty
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  it('should call runL1ForFile with fileId, projectId, tenantId, userId', async () => {
    dbState.returnValues = [[mockFileRecord]]
    await runRuleEngine({ fileId: VALID_UUID })
    expect(mockRunL1ForFile).toHaveBeenCalledWith({
      fileId: VALID_UUID,
      projectId: 'project-123',
      tenantId: 'tenant-123',
      userId: 'user-123',
    })
  })

  it('should return CONFLICT when runL1ForFile throws NonRetriableError', async () => {
    dbState.returnValues = [[mockFileRecord]]
    mockRunL1ForFile.mockRejectedValue(new NonRetriableError('File not in parsed state'))
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('CONFLICT')
  })

  it('should return findingCount and duration in success result', async () => {
    dbState.returnValues = [[mockFileRecord]]
    mockRunL1ForFile.mockResolvedValue({ findingCount: 3, duration: 120 })
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.findingCount).toBe(3)
    expect(result.data.fileId).toBe(VALID_UUID)
    expect(result.data.duration).toBe(120)
  })

  it('should return findingCount=0 for clean file', async () => {
    dbState.returnValues = [[mockFileRecord]]
    mockRunL1ForFile.mockResolvedValue({ findingCount: 0, duration: 50 })
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.findingCount).toBe(0)
  })

  // ── L3: Tenant isolation on file SELECT ──

  it('should include withTenant on file SELECT query', async () => {
    dbState.returnValues = [[mockFileRecord]]
    const { withTenant } = await import('@/db/helpers/withTenant')
    await runRuleEngine({ fileId: VALID_UUID })
    expect(withTenant).toHaveBeenNthCalledWith(1, expect.anything(), mockUser.tenantId)
  })

  it('should return INTERNAL_ERROR when runL1ForFile throws a non-retriable error', async () => {
    dbState.returnValues = [[mockFileRecord]]
    mockRunL1ForFile.mockRejectedValue(new Error('engine crash'))
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
    expect(result.error).toBe('Rule engine processing failed')
  })
})
