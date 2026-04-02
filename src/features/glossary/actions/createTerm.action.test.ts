import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST
vi.mock('server-only', () => ({}))

import { withTenant } from '@/db/helpers/withTenant'
import { asTenantId } from '@/types/tenant'

// Test UUIDs
const TENANT_ID = asTenantId(faker.string.uuid())
const USER_ID = faker.string.uuid()
const GLOSSARY_ID = faker.string.uuid()
const TERM_ID = faker.string.uuid()
const PROJECT_ID = faker.string.uuid()

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

// 6. Mock notification helpers
const mockCreateBulkNotification = vi.fn().mockResolvedValue(undefined)
const mockGetAdminRecipients = vi.fn().mockResolvedValue([{ userId: 'admin-other' }])
vi.mock('@/lib/notifications/createNotification', () => ({
  createBulkNotification: (...args: unknown[]) => mockCreateBulkNotification(...args),
  NOTIFICATION_TYPES: {
    GLOSSARY_UPDATED: 'glossary_updated',
  },
}))
vi.mock('@/lib/notifications/recipients', () => ({
  getAdminRecipients: (...args: unknown[]) => mockGetAdminRecipients(...args),
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
    expect(withTenant).toHaveBeenCalled()
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

  it('should propagate error when DB insert throws non-duplicate error', async () => {
    mockReturning.mockRejectedValue(new Error('DB error'))

    const { createTerm } = await import('./createTerm.action')
    await expect(
      createTerm({
        glossaryId: GLOSSARY_ID,
        sourceTerm: 'new term',
        targetTerm: 'คำใหม่',
        caseSensitive: false,
      }),
    ).rejects.toThrow('DB error')
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

  // ── Branch coverage: VALIDATION_ERROR ──

  it('should return VALIDATION_ERROR for invalid input (missing glossaryId)', async () => {
    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      sourceTerm: 'hello',
      targetTerm: 'สวัสดี',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  // ── Branch coverage: NOT_FOUND (glossary not in tenant) ──

  it('should return NOT_FOUND when glossary does not exist for current tenant', async () => {
    mockSelectWhere.mockReset()
    mockLimit.mockReset()
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockSelectWhere.mockResolvedValueOnce([]) // glossary lookup returns empty

    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'test',
      targetTerm: 'ทดสอบ',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  // ── Branch coverage: DB 23505 race condition (concurrent insert) ──

  it('should return DUPLICATE_ENTRY when DB insert throws 23505 (race condition)', async () => {
    const dbError = new Error('unique_violation') as Error & { code: string }
    dbError.code = '23505'
    mockReturning.mockRejectedValueOnce(dbError)

    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'unique term',
      targetTerm: 'คำเฉพาะ',
      caseSensitive: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DUPLICATE_ENTRY')
    }
  })

  // ── Branch coverage: CREATE_FAILED (insert returns empty) ──

  it('should return CREATE_FAILED when insert returns no rows', async () => {
    mockReturning.mockResolvedValueOnce([]) // empty returning

    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'another term',
      targetTerm: 'อีกคำ',
      caseSensitive: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CREATE_FAILED')
    }
  })

  // ── Story 6.2b: glossary_updated notification ──

  it('should send glossary_updated notification to admins on successful create', async () => {
    const { createTerm } = await import('./createTerm.action')
    const result = await createTerm({
      glossaryId: GLOSSARY_ID,
      sourceTerm: 'cloud computing',
      targetTerm: 'คลาวด์คอมพิวติ้ง',
      caseSensitive: false,
    })

    expect(result.success).toBe(true)
    // Wait for fire-and-forget promise chain
    await vi.waitFor(() => {
      expect(mockGetAdminRecipients).toHaveBeenCalledWith(TENANT_ID, USER_ID)
      expect(mockCreateBulkNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          type: 'glossary_updated',
          projectId: PROJECT_ID,
          metadata: expect.objectContaining({
            glossaryId: GLOSSARY_ID,
            action: 'term_created',
            sourceTerm: 'cloud computing',
            targetTerm: 'คลาวด์คอมพิวติ้ง',
          }),
        }),
      )
    })
  })
})
