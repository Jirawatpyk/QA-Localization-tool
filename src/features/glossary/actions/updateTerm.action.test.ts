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

const mockUpdatedTerm = {
  id: TERM_ID,
  glossaryId: GLOSSARY_ID,
  sourceTerm: 'cloud computing',
  targetTerm: 'การประมวลผลแบบคลาวด์',
  caseSensitive: false,
  createdAt: new Date(),
}

// 3. Mock DB
// Select chain (innerJoin for term + glossary lookup)
const mockInnerJoinWhere = vi.fn().mockResolvedValue([mockExistingTerm])
const mockInnerJoin = vi.fn().mockReturnValue({ where: mockInnerJoinWhere })
const mockSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

// Update chain
const mockUpdateReturning = vi.fn().mockResolvedValue([mockUpdatedTerm])
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn(),
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: { id: 'id', glossaryId: 'glossary_id', sourceTerm: 'source_term' },
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

describe('updateTerm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockInnerJoinWhere.mockResolvedValue([mockExistingTerm])
    mockUpdateReturning.mockResolvedValue([mockUpdatedTerm])
  })

  it('should update term successfully', async () => {
    const { updateTerm } = await import('./updateTerm.action')
    const result = await updateTerm(TERM_ID, {
      targetTerm: 'การประมวลผลแบบคลาวด์',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.targetTerm).toBe('การประมวลผลแบบคลาวด์')
    }
  })

  it('should return VALIDATION_ERROR for invalid termId', async () => {
    const { updateTerm } = await import('./updateTerm.action')
    const result = await updateTerm('not-a-uuid', {
      targetTerm: 'ระบบ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return NOT_FOUND for non-existent term', async () => {
    mockInnerJoinWhere.mockResolvedValue([])

    const { updateTerm } = await import('./updateTerm.action')
    const result = await updateTerm('00000000-0000-4000-8000-000000000099', {
      targetTerm: 'ระบบ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return NOT_FOUND for cross-tenant access', async () => {
    mockInnerJoinWhere.mockResolvedValue([])

    const { updateTerm } = await import('./updateTerm.action')
    const result = await updateTerm('00000000-0000-4000-8000-000000000088', {
      targetTerm: 'ระบบ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return DUPLICATE_ENTRY when updating sourceTerm to existing term', async () => {
    // First select: term lookup (innerJoin chain) — default from beforeEach
    // Second select: dedup check (where → limit chain)
    const mockDedupLimit = vi.fn().mockResolvedValue([{ id: 'other-term-id' }])
    const mockDedupWhere = vi.fn().mockReturnValue({ limit: mockDedupLimit })
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin }) // term lookup
      .mockReturnValueOnce({ where: mockDedupWhere }) // dedup check

    const { updateTerm } = await import('./updateTerm.action')
    const result = await updateTerm(TERM_ID, {
      sourceTerm: 'existing term',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DUPLICATE_ENTRY')
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('should allow updating sourceTerm when no duplicate exists', async () => {
    // First select: term lookup (innerJoin chain)
    // Second select: dedup check returns empty (no dup)
    const mockDedupLimit = vi.fn().mockResolvedValue([])
    const mockDedupWhere = vi.fn().mockReturnValue({ limit: mockDedupLimit })
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin }) // term lookup
      .mockReturnValueOnce({ where: mockDedupWhere }) // dedup check — no dup

    const { updateTerm } = await import('./updateTerm.action')
    const result = await updateTerm(TERM_ID, {
      sourceTerm: 'unique new term',
    })

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('should capture old and new values in audit log', async () => {
    const { updateTerm } = await import('./updateTerm.action')
    await updateTerm(TERM_ID, {
      targetTerm: 'การประมวลผลแบบคลาวด์',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'glossary_term',
        entityId: TERM_ID,
        action: 'glossary_term.updated',
        oldValue: expect.objectContaining({
          targetTerm: 'คลาวด์คอมพิวติ้ง',
        }),
      }),
    )
  })
})
