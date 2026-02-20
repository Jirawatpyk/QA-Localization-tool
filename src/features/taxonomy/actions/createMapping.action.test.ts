import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const MAPPING_ID = '00000000-0000-4000-8000-000000000003'

const mockCurrentUser = {
  id: USER_ID,
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: 'admin' as const,
}

const mockCreated = {
  id: MAPPING_ID,
  category: 'Accuracy',
  parentCategory: 'Omission',
  internalName: 'Missing text',
  severity: 'critical',
  description: 'Text absent from translation.',
  isCustom: false,
  isActive: true,
  displayOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const validInput = {
  category: 'Accuracy',
  parentCategory: 'Omission',
  internalName: 'Missing text',
  severity: 'critical' as const,
  description: 'Text absent from translation.',
}

const mockReturning = vi.fn().mockResolvedValue([mockCreated])
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

vi.mock('@/db/client', () => ({
  db: { insert: (...args: unknown[]) => mockInsert(...args) },
}))

vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {},
}))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockRevalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}))

describe('createMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockReturning.mockResolvedValue([mockCreated])
  })

  it('should create mapping successfully', async () => {
    const { createMapping } = await import('./createMapping.action')
    const result = await createMapping(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(MAPPING_ID)
      expect(result.data.category).toBe('Accuracy')
      expect(result.data.internalName).toBe('Missing text')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { createMapping } = await import('./createMapping.action')
    const result = await createMapping(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const { createMapping } = await import('./createMapping.action')
    const result = await createMapping({ category: '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return INSERT_FAILED when DB returns empty', async () => {
    mockReturning.mockResolvedValue([])

    const { createMapping } = await import('./createMapping.action')
    const result = await createMapping(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INSERT_FAILED')
    }
  })

  it('should write audit log with correct entityType', async () => {
    const { createMapping } = await import('./createMapping.action')
    await createMapping(validInput)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'taxonomy_definition',
        entityId: MAPPING_ID,
        action: 'taxonomy_definition.created',
      }),
    )
  })

  it('should call revalidateTag("taxonomy")', async () => {
    const { createMapping } = await import('./createMapping.action')
    await createMapping(validInput)

    expect(mockRevalidateTag).toHaveBeenCalledWith('taxonomy', 'minutes')
  })

  it('should accept null parentCategory', async () => {
    const { createMapping } = await import('./createMapping.action')
    const result = await createMapping({ ...validInput, parentCategory: null })

    expect(result.success).toBe(true)
  })

  it('should set isCustom: true for admin-created mappings', async () => {
    const { createMapping } = await import('./createMapping.action')
    await createMapping(validInput)

    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ isCustom: true }))
  })
})
