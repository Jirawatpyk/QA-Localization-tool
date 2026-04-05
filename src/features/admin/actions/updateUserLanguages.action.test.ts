import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001'
const TARGET_USER_ID = '550e8400-e29b-41d4-a716-446655440002'
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'

const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: () => mockRequireRole(),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (entry: unknown) => mockWriteAuditLog(entry),
}))

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => mockRevalidatePath(path),
}))

const mockSelectLimit = vi.fn()
// R2-P3: the action now uses `.update().set().where().returning()`. The
// returning mock default returns a single row to represent a successful
// conditional UPDATE; tests can override with `[]` to simulate a lost race.
const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'updated' }])
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
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
      set: (args: unknown) => mockSet(args),
    }),
  },
}))

vi.mock('@/db/schema/users', () => ({ users: {} }))
vi.mock('@/db/helpers/withTenant', () => ({ withTenant: vi.fn() }))

describe('updateUserLanguages', () => {
  const adminUser = {
    id: ADMIN_ID,
    email: 'admin@test.com',
    tenantId: TENANT_ID,
    role: 'admin' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: conditional UPDATE succeeds (row was written).
    mockUpdateReturning.mockResolvedValue([{ id: 'updated' }])
  })

  it('should return FORBIDDEN when requireRole throws', async () => {
    mockRequireRole.mockRejectedValue(new Error('forbidden'))

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('FORBIDDEN')
  })

  it('should return VALIDATION_ERROR for invalid UUID', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: 'not-a-uuid',
      nativeLanguages: ['th'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('should return VALIDATION_ERROR for invalid BCP-47 tag', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['NOT_A_LANG_CODE!'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('should return VALIDATION_ERROR for duplicate languages (Guardrail #24)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ja', 'th'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('should return NOT_FOUND when user does not exist', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('should update languages (canonicalized), write audit log with oldValue, and revalidate', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['ja'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ja-JP'],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // R3-P1: stored + returned value is canonical (lowercased + sorted).
      expect(result.data.nativeLanguages).toEqual(['ja-jp', 'th'])
    }
    expect(mockSet).toHaveBeenCalledWith({ nativeLanguages: ['ja-jp', 'th'] })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.languages.updated',
        oldValue: { nativeLanguages: ['ja'] },
        newValue: { nativeLanguages: ['ja-jp', 'th'] },
      }),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('should treat null previous nativeLanguages as empty array in audit oldValue', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: null }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
    })

    expect(result.success).toBe(true)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: { nativeLanguages: [] },
      }),
    )
  })

  it('should allow self-update (admin updating own languages)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: [] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: ADMIN_ID,
      nativeLanguages: ['en'],
    })

    expect(result.success).toBe(true)
  })

  it('should accept empty array (clearing all languages)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['th'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: [],
    })

    expect(result.success).toBe(true)
    expect(mockSet).toHaveBeenCalledWith({ nativeLanguages: [] })
  })

  // ---- D1: Optimistic-lock concurrency control ----

  it('should return CONFLICT when previousLanguages mismatches current DB state', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    // DB already has ['th','ja'] — another admin wrote after this client loaded.
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['th', 'ja'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ko'],
      previousLanguages: ['th'], // stale snapshot
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
    expect(mockSet).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('should succeed when previousLanguages matches current DB state', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['th'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ja'],
      previousLanguages: ['th'],
    })

    expect(result.success).toBe(true)
    // R3-P1: stored value is canonical (sorted)
    expect(mockSet).toHaveBeenCalledWith({ nativeLanguages: ['ja', 'th'] })
  })

  it('should skip optimistic-lock check when previousLanguages is omitted', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['existing'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
    })

    // No previousLanguages provided — lock check is skipped, write proceeds.
    expect(result.success).toBe(true)
  })

  it('should treat previousLanguages=[] vs DB=null as matching (both empty)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: null }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
      previousLanguages: [],
    })

    expect(result.success).toBe(true)
  })

  // ---- R2-P1: Lock compare must be normalized set equality ----

  it('R2-P1: should accept previousLanguages with different order than DB', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    // DB has ['ja','th'], client snapshot is ['th','ja'] — same set, different order.
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['ja', 'th'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ko'],
      previousLanguages: ['th', 'ja'],
    })

    expect(result.success).toBe(true)
    expect(mockSet).toHaveBeenCalled()
  })

  it('R2-P1: should accept previousLanguages with different case than DB (th-TH vs th-th)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['th-TH', 'ja-JP'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th-TH'],
      previousLanguages: ['th-th', 'ja-jp'],
    })

    expect(result.success).toBe(true)
  })

  it('R2-P1: should still CONFLICT when previous set differs from DB set', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['ko', 'en'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
      previousLanguages: ['th', 'ja'], // completely different set
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
  })

  // ---- R2-P3: Atomic conditional UPDATE catches TOCTOU races ----

  it('R2-P3: should return CONFLICT when conditional UPDATE affects zero rows (TOCTOU lost race)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['th'] }])
    // Another writer landed between our SELECT and UPDATE — rowCount = 0.
    mockUpdateReturning.mockResolvedValueOnce([])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ja'],
      previousLanguages: ['th'],
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
    // Audit must NOT fire when the write never landed.
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  // ---- R2-P6: CONFLICT branch must call revalidatePath ----

  it('R2-P6: should revalidatePath on snapshot-mismatch CONFLICT so client can recover', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['en'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
      previousLanguages: ['ja'], // mismatch
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('R2-P6: should revalidatePath on TOCTOU CONFLICT so client can recover', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['th'] }])
    mockUpdateReturning.mockResolvedValueOnce([])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th', 'ja'],
      previousLanguages: ['th'],
    })

    expect(result.success).toBe(false)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin')
  })

  // ---- R3-P1: Canonicalization on write ----

  it('R3-P1: should canonicalize nativeLanguages on write (lowercase + sort)', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: [] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      // Intentionally non-canonical input: mixed case + unsorted
      nativeLanguages: ['TH-TH', 'EN-US', 'ja-JP'],
    })

    expect(result.success).toBe(true)
    // Stored form: all lowercased, lexicographically sorted
    expect(mockSet).toHaveBeenCalledWith({
      nativeLanguages: ['en-us', 'ja-jp', 'th-th'],
    })
    if (result.success) {
      expect(result.data.nativeLanguages).toEqual(['en-us', 'ja-jp', 'th-th'])
    }
  })

  it('R3-P1: should canonicalize client previousLanguages before lock compare', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    // DB stores canonical form (written by a prior canonicalized call).
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['ja-jp', 'th-th'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['ko'],
      // Client sends NON-canonical snapshot: uppercase + reversed order.
      previousLanguages: ['TH-TH', 'JA-JP'],
    })

    // Must succeed — R3-P1 canonicalizes both sides before lock compare.
    expect(result.success).toBe(true)
    expect(mockSet).toHaveBeenCalledWith({ nativeLanguages: ['ko'] })
  })

  it('R3-P1: should still CONFLICT on a truly different set even after canonicalization', async () => {
    mockRequireRole.mockResolvedValue(adminUser)
    mockSelectLimit.mockResolvedValue([{ nativeLanguages: ['ko'] }])

    const { updateUserLanguages } = await import('./updateUserLanguages.action')
    const result = await updateUserLanguages({
      userId: TARGET_USER_ID,
      nativeLanguages: ['th'],
      previousLanguages: ['TH-TH', 'JA-JP'], // canonicalizes to ['ja-jp','th-th'] ≠ ['ko']
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CONFLICT')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin')
  })
})
