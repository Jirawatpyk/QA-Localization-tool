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

const mockExisting = {
  id: MAPPING_ID,
  category: 'Accuracy',
  parentCategory: 'Omission',
  internalName: 'Missing text',
  severity: 'critical',
  description: 'Text absent.',
  isCustom: false,
  isActive: true,
  displayOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockLimit = vi.fn().mockResolvedValue([mockExisting])
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockLimit })
const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

const mockUpdateWhere = vi.fn().mockResolvedValue([])
const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: { id: 'id' },
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

vi.mock('@/lib/validation/uuid', () => ({
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}))

describe('deleteMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockLimit.mockResolvedValue([mockExisting])
  })

  it('should soft delete (is_active=false) for admin', async () => {
    const { deleteMapping } = await import('./deleteMapping.action')
    const result = await deleteMapping(MAPPING_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(MAPPING_ID)
    }
    // Verify update was called with isActive: false
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
  })

  it('should return VALIDATION_ERROR for invalid UUID', async () => {
    const { deleteMapping } = await import('./deleteMapping.action')
    const result = await deleteMapping('not-a-uuid')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { deleteMapping } = await import('./deleteMapping.action')
    const result = await deleteMapping(MAPPING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return NOT_FOUND when mapping does not exist', async () => {
    mockLimit.mockResolvedValue([])

    const { deleteMapping } = await import('./deleteMapping.action')
    const result = await deleteMapping(MAPPING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return ALREADY_DELETED when mapping is already inactive', async () => {
    mockLimit.mockResolvedValue([{ ...mockExisting, isActive: false }])

    const { deleteMapping } = await import('./deleteMapping.action')
    const result = await deleteMapping(MAPPING_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_DELETED')
    }
  })

  it('should write audit log with taxonomy_definition.deleted action', async () => {
    const { deleteMapping } = await import('./deleteMapping.action')
    await deleteMapping(MAPPING_ID)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'taxonomy_definition',
        entityId: MAPPING_ID,
        action: 'taxonomy_definition.deleted',
        newValue: { isActive: false },
      }),
    )
  })

  it('should call revalidateTag("taxonomy")', async () => {
    const { deleteMapping } = await import('./deleteMapping.action')
    await deleteMapping(MAPPING_ID)

    expect(mockRevalidateTag).toHaveBeenCalledWith('taxonomy', 'minutes')
  })
})
