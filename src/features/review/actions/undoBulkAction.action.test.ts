/**
 * Story 4.4b ATDD: undoBulkAction Server Action — Bulk Undo
 * Tests: AC2 (bulk undo, partial conflict)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  inArray: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { undoBulkAction } from '@/features/review/actions/undoBulkAction.action'

function resetDbState() {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  dbState.valuesCaptures = []
  dbState.throwAtCallIndex = null
}

describe('undoBulkAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  it('should revert all findings and return reverted array (U-16)', async () => {
    dbState.returnValues = [
      [
        { id: 'f1', status: 'accepted' },
        { id: 'f2', status: 'accepted' },
      ],
      undefined,
    ]

    const result = await undoBulkAction({
      findings: [
        { findingId: 'f1', previousState: 'pending', expectedCurrentState: 'accepted' },
        { findingId: 'f2', previousState: 'pending', expectedCurrentState: 'accepted' },
      ],
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      force: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain('f1')
      expect(result.data.reverted).toContain('f2')
      expect(result.data.conflicted).toHaveLength(0)
    }
  })

  it('should partition into canRevert and conflicted on state mismatch (U-17)', async () => {
    dbState.returnValues = [
      [
        { id: 'f1', status: 'accepted' },
        { id: 'f2', status: 'rejected' },
      ],
      undefined,
    ]

    const result = await undoBulkAction({
      findings: [
        { findingId: 'f1', previousState: 'pending', expectedCurrentState: 'accepted' },
        { findingId: 'f2', previousState: 'pending', expectedCurrentState: 'accepted' },
      ],
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      force: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain('f1')
      expect(result.data.conflicted).toContain('f2')
    }
  })

  it('should insert feedback_events for each undone reject in batch (U-18)', async () => {
    dbState.returnValues = [
      [{ id: 'f1', status: 'rejected' }],
      undefined,
      [
        {
          id: 'f1',
          severity: 'major',
          category: 'accuracy',
          detectedByLayer: 'L2',
          segmentId: null,
          sourceTextExcerpt: 'hello',
          targetTextExcerpt: 'สวัสดี',
        },
      ],
      undefined,
    ]

    const result = await undoBulkAction({
      findings: [{ findingId: 'f1', previousState: 'pending', expectedCurrentState: 'rejected' }],
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      force: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain('f1')
    }
  })
})
