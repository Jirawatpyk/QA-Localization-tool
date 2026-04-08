/**
 * Story 4.3 ATDD: deleteFinding Server Action
 * Tests: U-D1..U-D4 (delete in FK order, guard Manual only, not found, Inngest)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ACTION_TEST_IDS, resetDbState } from '@/test/action-test-mocks'

const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog, mockInngestSend } = vi.hoisted(
  () => createActionTestMocks(),
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
vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    detectedByLayer: 'detected_by_layer',
    severity: 'severity',
    category: 'category',
  },
}))
vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: { findingId: 'finding_id', tenantId: 'tenant_id' },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

import { deleteFinding } from '@/features/review/actions/deleteFinding.action'

describe('deleteFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState(dbState)
    mockRequireRole.mockResolvedValue({
      id: ACTION_TEST_IDS.userId,
      tenantId: ACTION_TEST_IDS.tenantId,
      role: 'qa_reviewer',
    })
  })

  it('[P0] U-D1: should delete review_actions then finding in transaction', async () => {
    // SELECT finding, tx.delete review_actions, tx.delete finding
    dbState.returnValues = [
      [
        {
          id: ACTION_TEST_IDS.findingId,
          detectedByLayer: 'Manual',
          severity: 'minor',
          category: 'accuracy',
        },
      ],
      [],
      [], // tx deletes
    ]

    const result = await deleteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ findingId: ACTION_TEST_IDS.findingId, deleted: true })
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finding.delete' }),
    )
  })

  it('[P0] U-D2: should reject delete for non-Manual findings', async () => {
    dbState.returnValues = [
      [
        {
          id: ACTION_TEST_IDS.findingId,
          detectedByLayer: 'L1',
          severity: 'major',
          category: 'accuracy',
        },
      ],
    ]

    const result = await deleteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_MANUAL')
  })

  it('[P1] U-D3: should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [[]]
    const result = await deleteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('[P1] U-D4: should send Inngest event for score recalculation', async () => {
    dbState.returnValues = [
      [
        {
          id: ACTION_TEST_IDS.findingId,
          detectedByLayer: 'Manual',
          severity: 'minor',
          category: 'accuracy',
        },
      ],
      [],
      [],
    ]

    await deleteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({ previousState: 'manual', newState: 'manual' }),
      }),
    )
  })
})
