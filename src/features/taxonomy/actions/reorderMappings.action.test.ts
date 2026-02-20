import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const UUID_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
const UUID_B = 'b4cc290f-9ca0-4999-aa23-bdf5f7654113'

const mockCurrentUser = {
  id: USER_ID,
  email: 'admin@test.com',
  tenantId: TENANT_ID,
  role: 'admin' as const,
}

const mockUpdateWhere = vi.fn().mockResolvedValue([])
const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })

vi.mock('@/db/client', () => ({
  db: { update: (...args: unknown[]) => mockUpdate(...args) },
}))

vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: { id: 'id' },
}))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockRevalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}))

describe('reorderMappings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
  })

  it('should reorder mappings and return updated count', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updated).toBe(2)
    }
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([{ id: UUID_A, displayOrder: 0 }])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for empty array', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return VALIDATION_ERROR for invalid UUID in array', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([{ id: 'not-a-uuid', displayOrder: 0 }])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should call revalidateTag("taxonomy")', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    await reorderMappings([{ id: UUID_A, displayOrder: 0 }])

    expect(mockRevalidateTag).toHaveBeenCalledWith('taxonomy', 'minutes')
  })
})
