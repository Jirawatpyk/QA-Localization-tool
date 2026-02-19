import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

// Test UUIDs
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const GLOSSARY_ID = '00000000-0000-4000-8000-000000000003'
const PROJECT_ID = '00000000-0000-4000-8000-000000000004'

// 2. Mock data
const mockCurrentUser = {
  id: USER_ID,
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: 'admin' as const,
}

const mockExistingGlossary = {
  id: GLOSSARY_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  name: 'Test Glossary',
  sourceLang: 'en',
  targetLang: 'th',
  createdAt: new Date(),
}

// 3. Mock DB
const mockSelectWhere = vi.fn().mockResolvedValue([mockExistingGlossary])
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

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

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { id: 'id', tenantId: 'tenant_id', projectId: 'project_id' },
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

describe('deleteGlossary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockSelectWhere.mockResolvedValue([mockExistingGlossary])
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  it('should delete glossary successfully for admin', async () => {
    const { deleteGlossary } = await import('./deleteGlossary.action')
    const result = await deleteGlossary(GLOSSARY_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(GLOSSARY_ID)
    }
    expect(mockDelete).toHaveBeenCalled()
  })

  it('should return VALIDATION_ERROR for invalid glossaryId', async () => {
    const { deleteGlossary } = await import('./deleteGlossary.action')
    const result = await deleteGlossary('not-a-uuid')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('should return NOT_FOUND for non-existent glossary', async () => {
    mockSelectWhere.mockResolvedValue([])

    const { deleteGlossary } = await import('./deleteGlossary.action')
    const result = await deleteGlossary('00000000-0000-4000-8000-000000000099')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('should return NOT_FOUND for cross-tenant access', async () => {
    mockSelectWhere.mockResolvedValue([])

    const { deleteGlossary } = await import('./deleteGlossary.action')
    const result = await deleteGlossary(GLOSSARY_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { deleteGlossary } = await import('./deleteGlossary.action')
    const result = await deleteGlossary(GLOSSARY_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should write audit log with glossary data', async () => {
    const { deleteGlossary } = await import('./deleteGlossary.action')
    await deleteGlossary(GLOSSARY_ID)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'glossary',
        entityId: GLOSSARY_ID,
        action: 'glossary.deleted',
        oldValue: expect.objectContaining({
          name: 'Test Glossary',
          sourceLang: 'en',
          targetLang: 'th',
        }),
      }),
    )
  })

  it('should call revalidateTag with glossary-{projectId}', async () => {
    const { deleteGlossary } = await import('./deleteGlossary.action')
    await deleteGlossary(GLOSSARY_ID)

    expect(mockRevalidateTag).toHaveBeenCalledWith(`glossary-${PROJECT_ID}`, 'minutes')
  })
})
