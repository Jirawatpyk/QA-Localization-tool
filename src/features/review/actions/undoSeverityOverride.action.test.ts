/**
 * Story 4.4b ATDD: undoSeverityOverride Server Action
 * Tests: AC3 (severity override undo) — U-19
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
          nativeLanguages: [] as string[],
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

import { undoSeverityOverride } from '@/features/review/actions/undoSeverityOverride.action'

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

describe('undoSeverityOverride', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── P0: AC3 — Restore severity (U-19) ──

  it('should restore previousSeverity and previousOriginalSeverity', async () => {
    // Setup: finding currently has severity='minor' (the overridden value)
    dbState.returnValues = [
      [{ id: FINDING_ID, severity: 'minor', status: 'pending' }], // SELECT finding
      undefined, // transaction (update + insert review_actions)
    ]

    const result = await undoSeverityOverride({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      previousSeverity: 'major',
      previousOriginalSeverity: null,
      expectedCurrentSeverity: 'minor',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // previousSeverity in response = what was current before undo (i.e., 'minor')
      expect(result.data.previousSeverity).toBe('minor')
      // newSeverity in response = what severity was restored to (i.e., 'major')
      expect(result.data.newSeverity).toBe('major')
      expect(result.data.findingId).toBe(FINDING_ID)
      expect(result.data.serverUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  // ── P0: AC3 — Conflict on severity mismatch ──

  it('should return CONFLICT when severity does not match expectedCurrentSeverity', async () => {
    // Finding has already been changed to 'critical' — not 'minor' as expected
    dbState.returnValues = [[{ id: FINDING_ID, severity: 'critical', status: 'pending' }]]

    const result = await undoSeverityOverride({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      previousSeverity: 'major',
      previousOriginalSeverity: null,
      expectedCurrentSeverity: 'minor',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CONFLICT')
      expect(result.error).toBe('Severity mismatch')
    }
  })

  // ── P1: AC3 — Not found ──

  it('should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [
      [], // empty SELECT result
    ]

    const result = await undoSeverityOverride({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      previousSeverity: 'major',
      previousOriginalSeverity: null,
      expectedCurrentSeverity: 'minor',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })
})
