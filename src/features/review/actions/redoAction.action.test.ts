/**
 * Story 4.4b ATDD: redoAction Server Action
 * Tests: AC5 (redo after undo) — U-24, U-25
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

import { redoAction } from '@/features/review/actions/redoAction.action'

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

describe('redoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── P0: AC5 — Happy path (U-24) ──

  it('should re-apply action (target state) after undo', async () => {
    // Setup: finding is currently 'pending' (after a prior undo from 'accepted')
    // Redo should set it back to 'accepted'
    dbState.returnValues = [
      [{ id: FINDING_ID, status: 'pending' }], // SELECT finding
      undefined, // transaction (update + insert review_actions)
    ]

    const result = await redoAction({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      targetState: 'accepted',
      expectedCurrentState: 'pending',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findingId).toBe(FINDING_ID)
      // newState = targetState that was re-applied
      expect(result.data.newState).toBe('accepted')
      // previousState = what the state was before redo (the current state at redo time)
      expect(result.data.previousState).toBe('pending')
      expect(result.data.serverUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  // ── P0: AC5 — Conflict detection (U-25) ──

  it('should return CONFLICT when state does not match expectedCurrentState', async () => {
    // Finding was changed by another operation — state is 'rejected', not 'pending'
    dbState.returnValues = [[{ id: FINDING_ID, status: 'rejected' }]]

    const result = await redoAction({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      targetState: 'accepted',
      expectedCurrentState: 'pending',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CONFLICT')
      expect(result.error).toBe('State mismatch')
    }
  })

  // ── P1: AC5 — Not found ──

  it('should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [
      [], // empty SELECT
    ]

    const result = await redoAction({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      targetState: 'accepted',
      expectedCurrentState: 'pending',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  // ── P1: AC5 — updatedAt for Realtime merge guard ──

  it('should set updatedAt on finding to prevent Realtime merge guard from dropping change', async () => {
    dbState.returnValues = [[{ id: FINDING_ID, status: 'pending' }], undefined]

    const result = await redoAction({
      findingId: FINDING_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      targetState: 'accepted',
      expectedCurrentState: 'pending',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.serverUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(dbState.setCaptures.length).toBeGreaterThan(0)
      const setArg = dbState.setCaptures[0] as Record<string, unknown>
      expect(setArg.updatedAt).toBeDefined()
    }
  })
})
