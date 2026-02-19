import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

// Test UUIDs
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const TERM_ID = '00000000-0000-4000-8000-000000000003'
const GLOSSARY_ID = '00000000-0000-4000-8000-000000000004'
const PROJECT_ID = '00000000-0000-4000-8000-000000000005'

// 2. Mock data
const mockCurrentUser = {
  id: USER_ID,
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: 'admin' as const,
}

const mockExistingTerm = {
  id: TERM_ID,
  glossaryId: GLOSSARY_ID,
  sourceTerm: 'cloud computing',
  targetTerm: 'คลาวด์คอมพิวติ้ง',
  caseSensitive: false,
  projectId: PROJECT_ID,
}

// 3. Mock DB
// Select chain (innerJoin for term + glossary lookup)
const mockInnerJoinWhere = vi.fn().mockResolvedValue([mockExistingTerm])
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockInnerJoinWhere })
const mockSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

// Delete chain
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere })

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn(),
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: { id: 'id', glossaryId: 'glossary_id' },
}))

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { id: 'id', tenantId: 'tenant_id' },
}))

// 4. Mock requireRole
const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

// 5. Mock audit + cache
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockRevalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}))

describe('deleteTerm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockInnerJoinWhere.mockResolvedValue([mockExistingTerm])
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  it('should delete term successfully', async () => {
    const { deleteTerm } = await import('./deleteTerm.action')
    const result = await deleteTerm(TERM_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(TERM_ID)
    }
    expect(mockDelete).toHaveBeenCalled()
  })

  it('should return VALIDATION_ERROR for invalid termId', async () => {
    const { deleteTerm } = await import('./deleteTerm.action')
    const result = await deleteTerm('not-a-uuid')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('should return NOT_FOUND for non-existent term', async () => {
    mockInnerJoinWhere.mockResolvedValue([])

    const { deleteTerm } = await import('./deleteTerm.action')
    const result = await deleteTerm('00000000-0000-4000-8000-000000000099')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('should write audit log with deleted term data', async () => {
    const { deleteTerm } = await import('./deleteTerm.action')
    await deleteTerm(TERM_ID)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'glossary_term',
        entityId: TERM_ID,
        action: 'glossary_term.deleted',
        oldValue: expect.objectContaining({
          sourceTerm: 'cloud computing',
          targetTerm: 'คลาวด์คอมพิวติ้ง',
        }),
      }),
    )
  })
})
