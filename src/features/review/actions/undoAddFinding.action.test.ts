/**
 * Story 4.4b ATDD: undoAddFinding Server Action
 * Tests: AC4 (undo manual add = delete finding) — U-20, U-21
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks — MUST be first ──
const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog, mockInngestSend } = vi.hoisted(
  () => {
    const { dbState, dbMockModule } = createDrizzleMock()
    return {
      dbState,
      dbMockModule,
      mockRequireRole: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
          tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
          role: 'qa_reviewer',
        }),
      ),
      mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
      mockInngestSend: vi.fn((..._args: unknown[]) => Promise.resolve()),
    }
  },
)

vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

import { undoAddFinding } from '@/features/review/actions/undoAddFinding.action'

function resetDbState() {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  dbState.valuesCaptures = []
  dbState.throwAtCallIndex = null
}

const FINDING_ID = '00000000-0000-4000-8000-000000000001'
const FILE_ID = '00000000-0000-4000-8000-000000000002'
const PROJECT_ID = '00000000-0000-4000-8000-000000000003'

describe('undoAddFinding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── P0: AC4 — Happy path (U-20) ──

  it('should delete manually added finding and its review_actions', async () => {
    // Setup: finding exists in DB
    dbState.returnValues = [
      [{ id: FINDING_ID }], // SELECT verify finding exists
      undefined, // transaction (DELETE review_actions + DELETE finding)
    ]

    const result = await undoAddFinding({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findingId).toBe(FINDING_ID)
      expect(result.data.deleted).toBe(true)
    }
  })

  // ── P0: AC4 — Already deleted (U-21) ──

  it('should return error if finding already deleted', async () => {
    // Setup: SELECT returns empty — finding not found (already deleted)
    dbState.returnValues = [
      [], // empty SELECT result
    ]

    const result = await undoAddFinding({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.error).toContain('not found')
    }
  })
})
