/**
 * Story 4.3 ATDD: updateNoteText Server Action
 * Tests: U-NT1 (save noteText), U-NT2 (guard: must be noted state)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ACTION_TEST_IDS, resetDbState } from '@/test/action-test-mocks'

const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog } = vi.hoisted(() =>
  createActionTestMocks(),
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
  desc: vi.fn((..._args: unknown[]) => 'desc'),
}))
vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
  },
}))
vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    findingId: 'finding_id',
    tenantId: 'tenant_id',
    actionType: 'action_type',
    metadata: 'metadata',
    createdAt: 'created_at',
    userId: 'user_id',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { updateNoteText } from '@/features/review/actions/updateNoteText.action'

const VALID_IDS = {
  findingId: ACTION_TEST_IDS.findingId,
  fileId: ACTION_TEST_IDS.fileId,
  projectId: ACTION_TEST_IDS.projectId,
  tenantId: ACTION_TEST_IDS.tenantId,
  userId: ACTION_TEST_IDS.userId,
  actionId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
}

describe('updateNoteText.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState(dbState)
    mockRequireRole.mockResolvedValue({
      id: ACTION_TEST_IDS.userId,
      tenantId: ACTION_TEST_IDS.tenantId,
      role: 'qa_reviewer',
    })
  })

  it('[P1] U-NT1: should save noteText to review_actions metadata', async () => {
    // Call order: 1) SELECT finding, 2) SELECT review_actions, 3) UPDATE review_actions
    dbState.returnValues = [
      [{ id: VALID_IDS.findingId, status: 'noted' }],
      [{ id: VALID_IDS.actionId, metadata: { noteText: null } }],
      [],
    ]

    const result = await updateNoteText({
      ...VALID_IDS,
      noteText: 'This is a note',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        findingId: VALID_IDS.findingId,
        noteText: 'This is a note',
      })
    }

    // Verify metadata update was captured
    expect(dbState.setCaptures.length).toBeGreaterThan(0)
    const setCaptured = dbState.setCaptures[0] as Record<string, unknown>
    expect(setCaptured.metadata).toMatchObject({ noteText: 'This is a note' })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finding.note_text_update' }),
    )
  })

  it('[P1] TD-AUTH-001: should return FORBIDDEN when non-owner tries to edit note', async () => {
    // DB-level guard: WHERE includes eq(userId, currentUser) → returns empty for non-owner
    dbState.returnValues = [
      [{ id: VALID_IDS.findingId, status: 'noted' }],
      [], // no rows returned because userId doesn't match in WHERE
    ]

    const result = await updateNoteText({
      ...VALID_IDS,
      noteText: 'Tampered note',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
      expect(result.error).toContain('not found or not owned')
    }
  })

  it('[P1] U-NT2: should reject when finding is not in noted state', async () => {
    dbState.returnValues = [[{ id: VALID_IDS.findingId, status: 'pending' }]]

    const result = await updateNoteText({
      ...VALID_IDS,
      noteText: 'This should fail',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_STATE')
    }
  })
})
