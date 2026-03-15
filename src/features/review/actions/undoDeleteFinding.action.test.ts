/**
 * Story 4.4b ATDD: undoDeleteFinding Server Action
 * Tests: AC4 (undo manual delete = re-insert finding from snapshot) — U-22, U-23
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

import { undoDeleteFinding } from '@/features/review/actions/undoDeleteFinding.action'

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
const TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const SEGMENT_ID = '00000000-0000-4000-8000-000000000004'
const SESSION_ID = '00000000-0000-4000-8000-000000000005'

const FULL_SNAPSHOT = {
  id: FINDING_ID,
  segmentId: SEGMENT_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  tenantId: TENANT_ID,
  reviewSessionId: SESSION_ID,
  status: 'pending' as const,
  severity: 'major' as const,
  originalSeverity: null,
  category: 'accuracy',
  description: 'Mistranslation in segment',
  detectedByLayer: 'L2',
  aiModel: 'gpt-4o-mini',
  aiConfidence: 0.87,
  suggestedFix: null,
  sourceTextExcerpt: 'Hello world',
  targetTextExcerpt: 'สวัสดีโลก',
  scope: 'segment',
  relatedFileIds: null,
  segmentCount: 1,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
}

describe('undoDeleteFinding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── P0: AC4 — Happy path: re-insert from snapshot (U-22) ──

  it('should re-insert finding with original ID from snapshot', async () => {
    // Setup: segment exists + file exists → transaction can proceed
    dbState.returnValues = [
      [{ id: SEGMENT_ID }], // SELECT segments (FK guard for segmentId)
      [{ id: FILE_ID }], // SELECT files (FK guard for fileId)
      undefined, // transaction (INSERT finding + INSERT review_actions)
    ]

    const result = await undoDeleteFinding({
      snapshot: FULL_SNAPSHOT,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findingId).toBe(FINDING_ID)
      expect(result.data.restored).toBe(true)
    }
    // INSERT should have been called with explicit id from snapshot
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertedValues.id).toBe(FINDING_ID)
  })

  // ── P0: AC4 — FK violation: parent segment deleted (U-23) ──

  it('should return FK_VIOLATION if parent segment was deleted', async () => {
    // Setup: segment lookup returns empty — segment no longer exists
    dbState.returnValues = [
      [], // segments SELECT returns empty
    ]

    const result = await undoDeleteFinding({
      snapshot: FULL_SNAPSHOT,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FK_VIOLATION')
      expect(result.error).toContain('segment')
    }
  })

  // ── P1: AC4 — FK violation: parent file deleted ──

  it('should return FK_VIOLATION if parent file was deleted', async () => {
    // Setup: segment exists but file does not
    dbState.returnValues = [
      [{ id: SEGMENT_ID }], // segments SELECT — segment exists
      [], // files SELECT — file not found
    ]

    const result = await undoDeleteFinding({
      snapshot: FULL_SNAPSHOT,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FK_VIOLATION')
      expect(result.error).toContain('file')
    }
  })

  // ── P1: AC4 — Snapshot with null segmentId skips segment FK guard ──

  it('should skip segment FK guard when snapshot.segmentId is null', async () => {
    const snapshotNoSegment = { ...FULL_SNAPSHOT, segmentId: null }

    // Setup: only file check needed (no segment check)
    dbState.returnValues = [
      [{ id: FILE_ID }], // files SELECT — file exists
      undefined, // transaction
    ]

    const result = await undoDeleteFinding({
      snapshot: snapshotNoSegment,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.restored).toBe(true)
    }
  })
})
