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

// Transaction mock chain — action now uses db.transaction()
const mockTxUpdateWhere = vi.fn().mockResolvedValue([])
const mockTxSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere })
const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxSet })

const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
  await cb({ update: (...args: unknown[]) => mockTxUpdate(...args) })
})

// Direct db.update mock (should NOT be called — action uses transaction)
const mockUpdateWhere = vi.fn().mockResolvedValue([])
const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })

// Pre-validation SELECT mock chain: db.select().from().where()
// Returns matching IDs by default (all exist); override mockSelectWhere per test for NOT_FOUND
const mockSelectWhere = vi.fn().mockResolvedValue([{ id: UUID_A }, { id: UUID_B }])
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

vi.mock('@/db/client', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: (...args: unknown[]) =>
      mockTransaction(...(args as [(tx: unknown) => Promise<unknown>])),
  },
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

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

// CR R2 M3 fix: mock logger for audit error path (Guardrail #2)
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: vi.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
    debug: vi.fn(),
  },
}))

describe('reorderMappings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    // Default: all requested IDs exist and are active
    mockSelectWhere.mockResolvedValue([{ id: UUID_A }, { id: UUID_B }])
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
    // Updates happen inside transaction, not via direct db.update
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTxUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).not.toHaveBeenCalled()
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

  // [P1] revalidateTag called with correct Next.js 16 signature (Story 3.2b7)
  it('[P1] should call revalidateTag("taxonomy", "minutes") with two arguments', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    await reorderMappings([{ id: UUID_A, displayOrder: 0 }])

    expect(mockRevalidateTag).toHaveBeenCalledWith('taxonomy', 'minutes')
    expect(mockRevalidateTag).toHaveBeenCalledTimes(1)
  })

  it('should write audit log with taxonomy_definition.reordered action', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        entityType: 'taxonomy_definition',
        entityId: UUID_A,
        action: 'taxonomy_definition.reordered',
        newValue: {
          order: [
            { id: UUID_A, displayOrder: 0 },
            { id: UUID_B, displayOrder: 1 },
          ],
        },
      }),
    )
  })

  // [P0] Transaction wrapping for atomic reorder (Story 3.2b7 — Guardrail #6)
  it('[P0] should wrap all updates in a database transaction', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    // db.transaction should have been called exactly once
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    // tx.update called for each item inside the transaction
    expect(mockTxUpdate).toHaveBeenCalledTimes(2)
    // Direct db.update should NOT have been called
    expect(mockUpdate).not.toHaveBeenCalled()
    // CR R1 L3 fix: verify payload passed to tx.update().set()
    expect(mockTxSet).toHaveBeenCalledWith(expect.objectContaining({ displayOrder: 0 }))
    expect(mockTxSet).toHaveBeenCalledWith(expect.objectContaining({ displayOrder: 1 }))
  })

  // [P1] Duplicate ID validation (Story 3.2b7 — Guardrail #7)
  it('[P1] should return VALIDATION_ERROR for duplicate IDs', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_A, displayOrder: 1 }, // Duplicate ID
    ])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toContain('Duplicate')
    }
    // db operations should NOT have been called (validation fails before DB access)
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // [H1 fix] Transaction failure returns UPDATE_FAILED ActionResult
  it('should return UPDATE_FAILED when transaction throws', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('Connection lost'))

    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UPDATE_FAILED')
      expect(result.error).toBe('Connection lost')
    }
    // Audit log should NOT be called on failure
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  // CR R1 H2 fix: audit log failure is non-fatal after successful DB update (Guardrail #2)
  it('should return success even when audit log throws', async () => {
    mockWriteAuditLog.mockRejectedValueOnce(new Error('Audit DB timeout'))

    const { reorderMappings } = await import('./reorderMappings.action')
    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    // DB transaction succeeded — action should still return success
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updated).toBe(2)
    }
    // Audit was attempted
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    // CR R2 M3 fix: logger.error called when audit fails (Guardrail #2, pino arg order)
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Audit log failed after taxonomy reorder',
    )
    // revalidateTag still called
    expect(mockRevalidateTag).toHaveBeenCalledWith('taxonomy', 'minutes')
  })

  // TA expansion — U4 strict .set() payload match
  it('[P1] should call .set() with exactly { displayOrder, updatedAt } and no extra fields', async () => {
    // Given — 2 items to reorder
    const { reorderMappings } = await import('./reorderMappings.action')

    // When — action executes the transaction
    await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    // Then — each .set() call has EXACTLY 2 fields, nothing else
    expect(mockTxSet).toHaveBeenCalledTimes(2)
    const firstSetArg = mockTxSet.mock.calls[0]![0] as Record<string, unknown>
    const secondSetArg = mockTxSet.mock.calls[1]![0] as Record<string, unknown>

    expect(firstSetArg).toEqual({ displayOrder: 0, updatedAt: expect.any(Date) })
    expect(secondSetArg).toEqual({ displayOrder: 1, updatedAt: expect.any(Date) })

    // Strict: verify no extra keys beyond displayOrder + updatedAt
    expect(Object.keys(firstSetArg)).toHaveLength(2)
    expect(Object.keys(secondSetArg)).toHaveLength(2)
  })

  // Finding 5 fix: pre-validation SELECT catches non-existent/inactive IDs
  it('[P1] should return NOT_FOUND when some IDs do not exist or are inactive', async () => {
    // Given — only UUID_A exists, UUID_B is missing/inactive
    mockSelectWhere.mockResolvedValueOnce([{ id: UUID_A }])

    const { reorderMappings } = await import('./reorderMappings.action')

    // When — reorder with one valid + one invalid ID
    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    // Then — fails with NOT_FOUND before reaching transaction
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.error).toContain('not found or inactive')
    }
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  // U9 updated: with pre-validation, updated count matches input length (all verified to exist)
  it('[P1] should return updated count matching input length when all IDs exist', async () => {
    const { reorderMappings } = await import('./reorderMappings.action')

    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updated).toBe(2)
    }
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  // TA expansion — U5 non-Error rejection fallback message
  it('[P2] should return fallback error message when transaction rejects with non-Error value', async () => {
    // Given — transaction rejects with a string (not an Error instance)
    mockTransaction.mockRejectedValueOnce('Connection reset')

    const { reorderMappings } = await import('./reorderMappings.action')

    // When — action catches the non-Error rejection
    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    // Then — fallback message used because `err instanceof Error` is false
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UPDATE_FAILED')
      expect(result.error).toBe('Failed to reorder mappings')
    }
    // Audit log should NOT be called on transaction failure
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  // TA expansion — U8 revalidateTag throws after successful commit (FIXED: non-fatal)
  it('[P2] should return success and log warning when revalidateTag fails after commit', async () => {
    // U8 fix: revalidateTag failure is now non-fatal (wrapped in try-catch)
    mockRevalidateTag.mockImplementationOnce(() => {
      throw new Error('Cache service unavailable')
    })

    const { reorderMappings } = await import('./reorderMappings.action')

    const result = await reorderMappings([
      { id: UUID_A, displayOrder: 0 },
      { id: UUID_B, displayOrder: 1 },
    ])

    // Action returns success despite cache failure
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updated).toBe(2)
    }
    // DB transaction succeeded
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    // Audit log was written
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1)
    // logger.warn called with cache error (pino arg order)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'revalidateTag failed after taxonomy reorder',
    )
  })
})
