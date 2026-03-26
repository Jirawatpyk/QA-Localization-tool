/**
 * Story 4.4b ATDD: redoBulkAction Server Action — Bulk Redo
 * Tests: AC5 (bulk redo, partial conflict) — mirrors undoBulkAction pattern
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
  inArray: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { redoBulkAction } from '@/features/review/actions/redoBulkAction.action'

function resetDbState() {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  dbState.valuesCaptures = []
  dbState.throwAtCallIndex = null
}

const FILE_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_ID = '00000000-0000-4000-8000-000000000002'
const FINDING_ID_1 = '00000000-0000-4000-8000-000000000003'
const FINDING_ID_2 = '00000000-0000-4000-8000-000000000004'

describe('redoBulkAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── P0: AC5 — Happy path: re-apply targetState for all findings ──

  it('should re-apply targetState for all findings and return reverted array', async () => {
    // Both findings are currently 'pending' (previously undone from 'accepted')
    dbState.returnValues = [
      [
        { id: FINDING_ID_1, status: 'pending' },
        { id: FINDING_ID_2, status: 'pending' },
      ], // SELECT batch fetch
      undefined, // transaction
    ]

    const result = await redoBulkAction({
      findings: [
        { findingId: FINDING_ID_1, targetState: 'accepted', expectedCurrentState: 'pending' },
        { findingId: FINDING_ID_2, targetState: 'accepted', expectedCurrentState: 'pending' },
      ],
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain(FINDING_ID_1)
      expect(result.data.reverted).toContain(FINDING_ID_2)
      expect(result.data.conflicted).toHaveLength(0)
      expect(result.data.serverUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  // ── P0: AC5 — Partial conflict: one finding in wrong state ──

  it('should partition into reverted and conflicted on state mismatch', async () => {
    // FINDING_ID_1 is in 'pending' (expected) — can redo
    // FINDING_ID_2 is in 'rejected' (unexpected) — conflict
    dbState.returnValues = [
      [
        { id: FINDING_ID_1, status: 'pending' },
        { id: FINDING_ID_2, status: 'rejected' },
      ], // SELECT batch fetch
      undefined, // transaction (only FINDING_ID_1)
    ]

    const result = await redoBulkAction({
      findings: [
        { findingId: FINDING_ID_1, targetState: 'accepted', expectedCurrentState: 'pending' },
        { findingId: FINDING_ID_2, targetState: 'accepted', expectedCurrentState: 'pending' },
      ],
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain(FINDING_ID_1)
      expect(result.data.conflicted).toContain(FINDING_ID_2)
    }
  })

  // ── P1: AC5 — Finding not returned from DB is treated as conflict ──

  it('should treat missing finding (not in DB result) as conflicted', async () => {
    // Only FINDING_ID_1 is returned — FINDING_ID_2 is not in DB (deleted or tenant isolation)
    dbState.returnValues = [
      [{ id: FINDING_ID_1, status: 'pending' }], // SELECT — FINDING_ID_2 absent
      undefined,
    ]

    const result = await redoBulkAction({
      findings: [
        { findingId: FINDING_ID_1, targetState: 'accepted', expectedCurrentState: 'pending' },
        { findingId: FINDING_ID_2, targetState: 'accepted', expectedCurrentState: 'pending' },
      ],
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain(FINDING_ID_1)
      expect(result.data.conflicted).toContain(FINDING_ID_2)
    }
  })

  // ── P1: AC5 — Inngest events sent for each reverted finding ──

  it('should send Inngest finding.changed event for each reverted finding', async () => {
    dbState.returnValues = [[{ id: FINDING_ID_1, status: 'pending' }], undefined]

    const result = await redoBulkAction({
      findings: [
        { findingId: FINDING_ID_1, targetState: 'accepted', expectedCurrentState: 'pending' },
      ],
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    expect(mockInngestSend).toHaveBeenCalledOnce()
    const sentEvent = mockInngestSend.mock.calls[0]?.[0] as {
      name: string
      data: Record<string, unknown>
    }
    expect(sentEvent.name).toBe('finding.changed')
    expect(sentEvent.data.findingId).toBe(FINDING_ID_1)
    expect(sentEvent.data.newState).toBe('accepted')
    expect(sentEvent.data.previousState).toBe('pending')
  })
})
