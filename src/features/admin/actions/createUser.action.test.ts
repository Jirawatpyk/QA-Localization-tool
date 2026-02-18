import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock requireRole
const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: () => mockRequireRole(),
}))

// Mock admin client
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: (data: unknown) => mockCreateUser(data),
        deleteUser: (id: string) => mockDeleteUser(id),
      },
    },
  }),
}))

// Mock DB with transaction support
const mockTransactionCb = vi.fn()
vi.mock('@/db/client', () => ({
  db: {
    transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransactionCb(cb),
  },
}))

vi.mock('@/db/schema/auditLogs', () => ({ auditLogs: {} }))
vi.mock('@/db/schema/userRoles', () => ({ userRoles: {} }))
vi.mock('@/db/schema/users', () => ({ users: {} }))

describe('createUser', () => {
  const adminUser = {
    id: 'admin-1',
    email: 'admin@test.com',
    tenantId: 'tenant-1',
    role: 'admin' as const,
  }

  // Mock transaction executor that simulates successful tx
  const successfulTx = {
    insert: () => ({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: transaction runs the callback with mock tx
    mockTransactionCb.mockImplementation(async (cb) => cb(successfulTx))
  })

  it('should return FORBIDDEN when requireRole throws', async () => {
    mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'new@test.com',
      displayName: 'New',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { createUser } = await import('./createUser.action')
    const result = await createUser({ email: 'not-an-email', displayName: '', role: 'invalid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return error when Supabase auth createUser fails', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockCreateUser.mockResolvedValue({ data: { user: null }, error: { message: 'Email exists' } })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'exists@test.com',
      displayName: 'Exists',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Email exists')
    }
  })

  it('should create user with app_metadata and transaction', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockCreateUser.mockResolvedValue({
      data: { user: { id: 'new-user-1' } },
      error: null,
    })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'new@test.com',
      displayName: 'New User',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('new-user-1')
      expect(result.data.role).toBe('qa_reviewer')
    }
    // Verify app_metadata was passed
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        app_metadata: { user_role: 'qa_reviewer', tenant_id: 'tenant-1' },
      }),
    )
    // Verify transaction was used
    expect(mockTransactionCb).toHaveBeenCalled()
  })

  it('should rollback auth user when transaction fails', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockCreateUser.mockResolvedValue({
      data: { user: { id: 'orphan-user' } },
      error: null,
    })
    // Transaction throws (simulates DB failure — entire tx is rolled back)
    mockTransactionCb.mockRejectedValue(new Error('DB insert failed'))

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'fail@test.com',
      displayName: 'Fail',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
    }
    // Verify orphan cleanup (Auth user deleted since DB tx rolled back)
    expect(mockDeleteUser).toHaveBeenCalledWith('orphan-user')
  })
})
