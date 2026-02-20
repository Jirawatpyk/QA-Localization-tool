import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const MAPPING_ID = '00000000-0000-4000-8000-000000000003'
const INVALID_ID = 'not-a-uuid'

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

const mockUpdated = { ...mockExisting, category: 'Fluency' }

// Mock DB: select chain + update chain
const mockLimit = vi.fn().mockResolvedValue([mockExisting])
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockLimit })
const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

const mockUpdateReturning = vi.fn().mockResolvedValue([mockUpdated])
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
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

describe('updateMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockLimit.mockResolvedValue([mockExisting])
    mockUpdateReturning.mockResolvedValue([mockUpdated])
  })

  it('should update mapping successfully', async () => {
    const { updateMapping } = await import('./updateMapping.action')
    const result = await updateMapping(MAPPING_ID, { category: 'Fluency' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.category).toBe('Fluency')
    }
  })

  it('should return VALIDATION_ERROR for invalid UUID', async () => {
    const { updateMapping } = await import('./updateMapping.action')
    const result = await updateMapping(INVALID_ID, { category: 'Fluency' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { updateMapping } = await import('./updateMapping.action')
    const result = await updateMapping(MAPPING_ID, { category: 'Fluency' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return NOT_FOUND when mapping does not exist', async () => {
    mockLimit.mockResolvedValue([])

    const { updateMapping } = await import('./updateMapping.action')
    const result = await updateMapping(MAPPING_ID, { category: 'Fluency' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should write audit log on update', async () => {
    const { updateMapping } = await import('./updateMapping.action')
    await updateMapping(MAPPING_ID, { category: 'Fluency' })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'taxonomy_definition',
        entityId: MAPPING_ID,
        action: 'taxonomy_definition.updated',
      }),
    )
  })

  it('should call revalidateTag("taxonomy")', async () => {
    const { updateMapping } = await import('./updateMapping.action')
    await updateMapping(MAPPING_ID, { category: 'Fluency' })

    expect(mockRevalidateTag).toHaveBeenCalledWith('taxonomy', 'minutes')
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const { updateMapping } = await import('./updateMapping.action')
    const result = await updateMapping(MAPPING_ID, { category: '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
