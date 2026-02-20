import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock server-only FIRST
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

const mockMapping = {
  id: MAPPING_ID,
  category: 'Accuracy',
  parentCategory: 'Omission',
  internalName: 'Missing text',
  severity: 'critical',
  description: 'Text absent from translation.',
  isCustom: false,
  isActive: true,
  displayOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// Mock DB: select().from().where().orderBy()
const mockOrderBy = vi.fn().mockResolvedValue([mockMapping])
const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

vi.mock('@/db/client', () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}))

vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {
    isActive: 'is_active',
    displayOrder: 'display_order',
  },
}))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

describe('getTaxonomyMappings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockOrderBy.mockResolvedValue([mockMapping])
  })

  it('should return active mappings for admin', async () => {
    const { getTaxonomyMappings } = await import('./getTaxonomyMappings.action')
    const result = await getTaxonomyMappings()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]?.id).toBe(MAPPING_ID)
      expect(result.data[0]?.category).toBe('Accuracy')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { getTaxonomyMappings } = await import('./getTaxonomyMappings.action')
    const result = await getTaxonomyMappings()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return empty array when no mappings exist', async () => {
    mockOrderBy.mockResolvedValue([])

    const { getTaxonomyMappings } = await import('./getTaxonomyMappings.action')
    const result = await getTaxonomyMappings()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(0)
    }
  })
})
