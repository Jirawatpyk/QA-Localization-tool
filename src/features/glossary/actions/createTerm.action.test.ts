import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

// Test UUIDs
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const GLOSSARY_ID = '00000000-0000-4000-8000-000000000003'
const TERM_ID = '00000000-0000-4000-8000-000000000004'
const PROJECT_ID = '00000000-0000-4000-8000-000000000005'

// 2. Mock data
const mockCurrentUser = {
  id: USER_ID,
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: 'admin' as const,
}

const mockGlossary = {
  id: GLOSSARY_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  name: 'Test Glossary',
  sourceLang: 'en',
  targetLang: 'th',
  createdAt: new Date(),
}

const mockTerm = {
  id: TERM_ID,
  glossaryId: GLOSSARY_ID,
  sourceTerm: 'cloud computing',
  targetTerm: 'คลาวด์คอมพิวติ้ง',
  caseSensitive: false,
  createdAt: new Date(),
}

// 3. Mock DB
const mockReturning = vi.fn().mockResolvedValue([mockTerm])
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

const mockLimit = vi.fn()
const mockSelectWhere = vi.fn()
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
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

describe('createTerm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockReturning.mockResolvedValue([mockTerm])
    // Reset mock chain
    mockSelectWhere.mockReset()
    mockLimit.mockReset()
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    // First where() → glossary lookup (resolves directly)
    // Second where() → dedup check (returns { limit } chain)
    mockLimit.mockResolvedValue([]) // no duplicate
    mockSelectWhere
      .mockResolvedValueOnce([mockGlossary]) // glossary lookup
      .mockReturnValueOnce({ limit: mockLimit }) // dedup check
  })

  it('should create term successfully for admin', async () => {
    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'cloud computing',
      targetTerm: 'คลาวด์คอมพิวติ้ง',
      caseSensitive: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(TERM_ID)
      expect(result.data.sourceTerm).toBe('cloud computing')
      expect(result.data.targetTerm).toBe('คลาวด์คอมพิวติ้ง')
    }
  })

  it('should return DUPLICATE_ENTRY for duplicate source term', async () => {
    // Override: dedup query returns existing term
    mockSelectWhere.mockReset()
    mockLimit.mockReset()
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    const mockLimitDup = vi.fn().mockResolvedValue([{ id: 'existing-term-id' }])
    mockSelectWhere
      .mockResolvedValueOnce([mockGlossary]) // glossary lookup
      .mockReturnValueOnce({ limit: mockLimitDup }) // dedup check — found duplicate

    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'cloud computing',
      targetTerm: 'คลาวด์',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DUPLICATE_ENTRY')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'System',
      targetTerm: 'ระบบ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should write audit log', async () => {
    const { createTerm } = await import('./createTerm.action')
    await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'cloud computing',
      targetTerm: 'คลาวด์คอมพิวติ้ง',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'glossary_term',
        entityId: TERM_ID,
        action: 'glossary_term.created',
      }),
    )
  })
})
