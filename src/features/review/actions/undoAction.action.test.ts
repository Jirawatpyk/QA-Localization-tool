/**
 * Story 4.4b ATDD: undoAction Server Action — Single Undo (Status Revert)
 * Tests: AC1 (single undo), AC7 (conflict detection)
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

import { undoAction } from '@/features/review/actions/undoAction.action'

function resetDbState() {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  dbState.valuesCaptures = []
  dbState.throwAtCallIndex = null
}

describe('undoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── P0: AC1 — Happy path (U-11) ──

  it('should revert finding to previousState when status matches expectedCurrentState', async () => {
    // Setup: finding with status='accepted'
    dbState.returnValues = [
      [{ id: '00000000-0000-4000-8000-000000000003', status: 'accepted' }], // SELECT finding
      undefined, // transaction (update + insert)
    ]

    const result = await undoAction({
      findingId: '00000000-0000-4000-8000-000000000003',
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      previousState: 'pending',
      expectedCurrentState: 'accepted',
      force: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findingId).toBe('00000000-0000-4000-8000-000000000003')
      expect(result.data.newState).toBe('pending')
      expect(result.data.previousState).toBe('accepted')
      expect(result.data.serverUpdatedAt).toBeDefined()
    }
  })

  // ── P0: AC1 — Conflict detection (U-12) ──

  it('should return CONFLICT when finding status does not match expectedCurrentState', async () => {
    // Finding was changed by another user to 'rejected'
    dbState.returnValues = [[{ id: '00000000-0000-4000-8000-000000000003', status: 'rejected' }]]

    const result = await undoAction({
      findingId: '00000000-0000-4000-8000-000000000003',
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      previousState: 'pending',
      expectedCurrentState: 'accepted',
      force: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('CONFLICT')
      expect(result.error).toBe('State mismatch')
    }
  })

  // ── P1: AC1 — Force bypass (U-13) ──

  it('should bypass state check and revert when force=true', async () => {
    dbState.returnValues = [
      [{ id: '00000000-0000-4000-8000-000000000003', status: 'rejected' }], // different from expected
      undefined, // transaction
    ]

    const result = await undoAction({
      findingId: '00000000-0000-4000-8000-000000000003',
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      previousState: 'pending',
      expectedCurrentState: 'accepted',
      force: true,
    })

    expect(result.success).toBe(true)
  })

  // ── P0: AC1 — feedback_events on undo-reject (U-14) ──

  it('should insert feedback_events with action undo_reject when undoing a reject', async () => {
    dbState.returnValues = [
      [{ id: '00000000-0000-4000-8000-000000000003', status: 'rejected' }], // SELECT finding (executeUndoRedo)
      undefined, // transaction
      // undoAction post-processing: fetch finding meta
      [
        {
          severity: 'major',
          category: 'accuracy',
          detectedByLayer: 'L2',
          segmentId: 'seg-1',
          sourceTextExcerpt: 'hello',
          targetTextExcerpt: 'สวัสดี',
        },
      ],
      // segment lookup
      [{ sourceLang: 'en-US', targetLang: 'th-TH' }],
      // feedback_events insert
      undefined,
    ]

    const result = await undoAction({
      findingId: '00000000-0000-4000-8000-000000000003',
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      previousState: 'pending',
      expectedCurrentState: 'rejected',
      force: false,
    })

    expect(result.success).toBe(true)
    // Verify feedback_events was called (via dbState.callIndex advancing)
    expect(dbState.callIndex).toBeGreaterThanOrEqual(4)
  })

  // ── P0: AC1 — updatedAt for Realtime merge guard (U-15) ──

  it('should set updatedAt on finding to prevent Realtime merge guard from dropping change', async () => {
    dbState.returnValues = [
      [{ id: '00000000-0000-4000-8000-000000000003', status: 'accepted' }],
      undefined,
    ]

    const result = await undoAction({
      findingId: '00000000-0000-4000-8000-000000000003',
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      previousState: 'pending',
      expectedCurrentState: 'accepted',
      force: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // serverUpdatedAt should be an ISO string
      expect(result.data.serverUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      // setCaptures should have updatedAt set
      expect(dbState.setCaptures.length).toBeGreaterThan(0)
      const setArg = dbState.setCaptures[0] as Record<string, unknown>
      expect(setArg.updatedAt).toBeDefined()
    }
  })
})
