import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Test UUIDs
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001'
const TARGET_USER_ID = '550e8400-e29b-41d4-a716-446655440002'
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'

// Mock requireRole
const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: () => mockRequireRole(),
}))

// Mock writeAuditLog
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (entry: unknown) => mockWriteAuditLog(entry),
}))

// Mock admin client
const mockUpdateUserById = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: (id: string, data: unknown) => mockUpdateUserById(id, data),
      },
    },
  }),
}))

// Mock DB
const mockSelectLimit = vi.fn()
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
vi.mock('@/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelectLimit(),
        }),
      }),
    }),
    update: () => ({
      set: () => mockUpdateSet(),
    }),
  },
}))

vi.mock('@/db/schema/userRoles', () => ({ userRoles: {} }))

describe('updateUserRole', () => {
  const adminUser = {
    id: ADMIN_ID,
    email: 'admin@test.com',
    tenantId: TENANT_ID,
    role: 'admin' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return FORBIDDEN when requireRole throws', async () => {
    mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })

    const { updateUserRole } = await import('./updateUserRole.action')
    const result = await updateUserRole({ userId: TARGET_USER_ID, newRole: 'qa_reviewer' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { updateUserRole } = await import('./updateUserRole.action')
    const result = await updateUserRole({ userId: 'not-a-uuid', newRole: 'invalid_role' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should prevent self-demotion', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { updateUserRole } = await import('./updateUserRole.action')
    const result = await updateUserRole({ userId: ADMIN_ID, newRole: 'qa_reviewer' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Cannot change your own role')
    }
  })

  it('should return NOT_FOUND when user role does not exist', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([])

    const { updateUserRole } = await import('./updateUserRole.action')
    const result = await updateUserRole({ userId: TARGET_USER_ID, newRole: 'qa_reviewer' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should update role and write audit log on success', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ role: 'native_reviewer' }])
    mockUpdateUserById.mockResolvedValue({ error: null })

    const { updateUserRole } = await import('./updateUserRole.action')
    const result = await updateUserRole({ userId: TARGET_USER_ID, newRole: 'qa_reviewer' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newRole).toBe('qa_reviewer')
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'role.updated',
        oldValue: { role: 'native_reviewer' },
        newValue: { role: 'qa_reviewer' },
      }),
    )
  })

  it('should rollback DB when Supabase API fails', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ role: 'native_reviewer' }])
    mockUpdateUserById.mockResolvedValue({ error: { message: 'API error' } })

    const { updateUserRole } = await import('./updateUserRole.action')
    const result = await updateUserRole({ userId: TARGET_USER_ID, newRole: 'qa_reviewer' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
    }
    // Verify DB rollback was called (update().set() called twice — once for update, once for rollback)
    expect(mockUpdateSet).toHaveBeenCalledTimes(2)
  })
})
