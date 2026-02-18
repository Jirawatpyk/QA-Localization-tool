import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// Mock Supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// Mock DB
const mockSelectLimit = vi.fn()
const mockTransactionCb = vi.fn()
vi.mock('@/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelectLimit(),
        }),
      }),
    }),
    transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransactionCb(cb),
  },
}))

// Mock schema tables
vi.mock('@/db/schema/auditLogs', () => ({ auditLogs: {} }))
vi.mock('@/db/schema/languagePairConfigs', () => ({ languagePairConfigs: {} }))
vi.mock('@/db/schema/tenants', () => ({ tenants: {} }))
vi.mock('@/db/schema/userRoles', () => ({ userRoles: {} }))
vi.mock('@/db/schema/users', () => ({ users: {} }))

describe('setupNewUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return UNAUTHORIZED when no user authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } })

    const { setupNewUser } = await import('./setupNewUser.action')
    const result = await setupNewUser()

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('should return existing user data when user already exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@test.com', user_metadata: {} } },
      error: null,
    })
    // First call: existingUser found
    mockSelectLimit.mockResolvedValueOnce([{ id: 'user-1' }])
    // Second call: role lookup
    mockSelectLimit.mockResolvedValueOnce([{ role: 'admin', tenantId: 'tenant-1' }])

    const { setupNewUser } = await import('./setupNewUser.action')
    const result = await setupNewUser()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tenantId).toBe('tenant-1')
      expect(result.data.role).toBe('admin')
    }
  })

  it('should create tenant, user, role in transaction for new user', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-new',
          email: 'new@test.com',
          user_metadata: { display_name: 'New User' },
        },
      },
      error: null,
    })
    // No existing user
    mockSelectLimit.mockResolvedValueOnce([])

    // Mock transaction to simulate successful execution
    mockTransactionCb.mockImplementation(async (cb) => {
      const mockTx = {
        insert: () => ({
          values: () => ({
            returning: () => [{ id: 'tenant-new' }],
          }),
        }),
      }
      return cb(mockTx)
    })

    const { setupNewUser } = await import('./setupNewUser.action')
    const result = await setupNewUser()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tenantId).toBe('tenant-new')
      expect(result.data.role).toBe('admin')
    }
    expect(mockTransactionCb).toHaveBeenCalled()
  })

  it('should handle unique constraint race condition gracefully', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-race', email: 'race@test.com', user_metadata: {} } },
      error: null,
    })
    // No existing user
    mockSelectLimit.mockResolvedValueOnce([])

    // Transaction throws unique constraint
    mockTransactionCb.mockRejectedValue(new Error('unique constraint violation'))

    // Race condition recovery: lookup returns the role
    mockSelectLimit.mockResolvedValueOnce([{ role: 'admin', tenantId: 'tenant-race' }])

    const { setupNewUser } = await import('./setupNewUser.action')
    const result = await setupNewUser()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tenantId).toBe('tenant-race')
    }
  })

  it('should return generic error for non-unique-constraint failures', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-err', email: 'err@test.com', user_metadata: {} } },
      error: null,
    })
    mockSelectLimit.mockResolvedValueOnce([])
    mockTransactionCb.mockRejectedValue(new Error('connection refused'))

    const { setupNewUser } = await import('./setupNewUser.action')
    const result = await setupNewUser()

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'INTERNAL_ERROR' })
    // Should NOT leak real error message
    if (!result.success) {
      expect(result.error).toBe('Failed to setup user account')
    }
  })
})
