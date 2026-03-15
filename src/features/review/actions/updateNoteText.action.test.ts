/**
 * Story 4.3 ATDD: updateNoteText Server Action
 * Tests: U-NT1 (save noteText), U-NT2 (guard: must be noted state)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog } = vi.hoisted(() => {
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
  }
})

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
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { updateNoteText } from '@/features/review/actions/updateNoteText.action'

const VALID_IDS = {
  findingId: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  userId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  actionId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
}

describe('updateNoteText.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: VALID_IDS.userId,
      tenantId: VALID_IDS.tenantId,
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
