import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Test UUIDs
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001'
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'
const NEW_USER_ID = '550e8400-e29b-41d4-a716-446655440003'

// Mock requireRole
const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: () => mockRequireRole(),
}))

// Mock admin client
const mockAuthCreateUser = vi.fn()
const mockAuthDeleteUser = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: (data: unknown) => mockAuthCreateUser(data),
        deleteUser: (id: string) => mockAuthDeleteUser(id),
      },
    },
  }),
}))

// Mock DB with transaction support
const mockTransactionCb = vi.fn()
const mockInsertValues = vi.fn().mockResolvedValue(undefined)
const insertCalls: InsertCall[] = []
vi.mock('@/db/client', () => ({
  db: {
    transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransactionCb(cb),
  },
}))

// Sentinels: give each schema mock a unique marker so the test can identify
// which table an insert call targeted without relying on call order (D6).
const { usersTable, userRolesTable, auditLogsTable } = vi.hoisted(() => ({
  usersTable: { __table: 'users' as const },
  userRolesTable: { __table: 'user_roles' as const },
  auditLogsTable: { __table: 'audit_logs' as const },
}))
vi.mock('@/db/schema/auditLogs', () => ({ auditLogs: auditLogsTable }))
vi.mock('@/db/schema/userRoles', () => ({ userRoles: userRolesTable }))
vi.mock('@/db/schema/users', () => ({ users: usersTable }))

type InsertCall = { table: unknown; values: unknown }
function findInsert(calls: InsertCall[], tableName: 'users' | 'user_roles' | 'audit_logs') {
  return calls.find(
    (c) =>
      typeof c.table === 'object' &&
      c.table !== null &&
      (c.table as { __table?: string }).__table === tableName,
  )
}

// Mock logger
const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

describe('createUser', () => {
  const adminUser = {
    id: ADMIN_ID,
    email: 'admin@test.com',
    tenantId: TENANT_ID,
    role: 'admin' as const,
  }

  // Mock transaction executor that simulates successful tx and records insert calls
  const successfulTx = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        insertCalls.push({ table, values })
        return mockInsertValues(values)
      },
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    insertCalls.length = 0
    // Default: transaction runs the callback with mock tx
    mockTransactionCb.mockImplementation(async (cb) => cb(successfulTx))
  })

  it('should create user successfully when auth + DB transaction succeeds', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
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
      expect(result.data.id).toBe(NEW_USER_ID)
      expect(result.data.email).toBe('new@test.com')
      expect(result.data.role).toBe('qa_reviewer')
    }
    // Verify app_metadata was passed with tenant_id and role
    expect(mockAuthCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@test.com',
        email_confirm: true,
        app_metadata: { user_role: 'qa_reviewer', tenant_id: TENANT_ID },
      }),
    )
    // Verify transaction was used
    expect(mockTransactionCb).toHaveBeenCalled()
    // Verify no compensation was attempted
    expect(mockAuthDeleteUser).not.toHaveBeenCalled()
  })

  it('should return INTERNAL_ERROR when auth creation fails (no compensation needed)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email already registered' },
    })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'exists@test.com',
      displayName: 'Exists',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
      expect(result.error).toBe('Email already registered')
    }
    // No DB transaction should have been attempted
    expect(mockTransactionCb).not.toHaveBeenCalled()
    // No compensation needed — auth user was never created
    expect(mockAuthDeleteUser).not.toHaveBeenCalled()
  })

  it('should return INTERNAL_ERROR and clean orphan when DB transaction fails and compensation succeeds on first attempt', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })
    // DB transaction fails
    mockTransactionCb.mockRejectedValue(new Error('DB insert failed'))
    // Compensation succeeds on first attempt
    mockAuthDeleteUser.mockResolvedValueOnce({ error: null })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'fail@test.com',
      displayName: 'Fail',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
      expect(result.error).toBe('Failed to create user records')
    }
    // Verify orphan was cleaned up
    expect(mockAuthDeleteUser).toHaveBeenCalledWith(NEW_USER_ID)
    expect(mockAuthDeleteUser).toHaveBeenCalledTimes(1)
    // No CRITICAL orphan warning
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('should return INTERNAL_ERROR and clean orphan after retry when compensation fails once then succeeds', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })
    // DB transaction fails
    mockTransactionCb.mockRejectedValue(new Error('DB insert failed'))
    // First compensation attempt fails, second succeeds
    mockAuthDeleteUser
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({ error: null })

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
    // Verify 2 compensation attempts
    expect(mockAuthDeleteUser).toHaveBeenCalledTimes(2)
    // First attempt logged a warning
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: NEW_USER_ID, attempt: 1 }),
      expect.stringContaining('compensation deleteUser failed'),
    )
    // No CRITICAL orphan warning (compensation eventually succeeded)
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('should return INTERNAL_ERROR and log CRITICAL orphan warning when compensation fails all retries', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })
    // DB transaction fails
    mockTransactionCb.mockRejectedValue(new Error('DB insert failed'))
    // All compensation attempts fail
    mockAuthDeleteUser
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockRejectedValueOnce(new Error('Service unavailable'))

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'orphan@test.com',
      displayName: 'Orphan',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
    }
    // Verify all compensation attempts were made (COMPENSATION_MAX_RETRIES = 2)
    expect(mockAuthDeleteUser).toHaveBeenCalledTimes(2)
    // Verify CRITICAL orphan warning was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: NEW_USER_ID, email: 'orphan@test.com' }),
      expect.stringContaining('ORPHANED AUTH USER'),
    )
    // Both retry warnings logged
    expect(mockLogger.warn).toHaveBeenCalledTimes(2)
  })

  it('should return VALIDATION_ERROR when input is invalid', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { createUser } = await import('./createUser.action')
    const result = await createUser({ email: 'not-an-email', displayName: '', role: 'invalid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
    // No auth or DB calls should have been made
    expect(mockAuthCreateUser).not.toHaveBeenCalled()
    expect(mockTransactionCb).not.toHaveBeenCalled()
  })

  it('should default nativeLanguages to empty array when omitted', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'new@test.com',
      displayName: 'New User',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(true)
    // Locate the users insert by table identity, not by call order (D6).
    const usersInsert = findInsert(insertCalls, 'users')
    expect(usersInsert).toBeDefined()
    expect(usersInsert!.values).toMatchObject({ nativeLanguages: [] })
  })

  it('should pass nativeLanguages through to users insert and audit log', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockAuthCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'new@test.com',
      displayName: 'New User',
      role: 'native_reviewer',
      // Non-canonical input: mixed case + unsorted
      nativeLanguages: ['th', 'ja-JP'],
    })

    expect(result.success).toBe(true)
    const usersInsert = findInsert(insertCalls, 'users')
    expect(usersInsert).toBeDefined()
    // R3-P1: canonicalized on write (lowercased + sorted)
    expect(usersInsert!.values).toMatchObject({
      email: 'new@test.com',
      nativeLanguages: ['ja-jp', 'th'],
    })
    // Locate audit insert by table identity (D6) — order-independent.
    const auditInsert = findInsert(insertCalls, 'audit_logs')
    expect(auditInsert).toBeDefined()
    expect(auditInsert!.values).toMatchObject({
      action: 'user.created',
      newValue: expect.objectContaining({ nativeLanguages: ['ja-jp', 'th'] }),
    })
  })

  it('should reject duplicate languages (Guardrail #24)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'new@test.com',
      displayName: 'New User',
      role: 'qa_reviewer',
      nativeLanguages: ['th', 'th'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
    expect(mockAuthCreateUser).not.toHaveBeenCalled()
  })

  it('should return FORBIDDEN when user is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'))

    const { createUser } = await import('./createUser.action')
    const result = await createUser({
      email: 'new@test.com',
      displayName: 'New',
      role: 'qa_reviewer',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
      expect(result.error).toBe('Admin access required')
    }
    // No auth or DB calls should have been made
    expect(mockAuthCreateUser).not.toHaveBeenCalled()
    expect(mockTransactionCb).not.toHaveBeenCalled()
  })
})
