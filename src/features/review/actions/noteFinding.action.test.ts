/**
 * Story 4.3 ATDD: noteFinding Server Action
 * Tests: U-NA1 (happy path), U-NA2 (not found), U-NA3 (no-op noted), U-NA4 (no-op manual)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { noteFinding } from '@/features/review/actions/noteFinding.action'
import { ACTION_TEST_IDS, findCapturedValues, resetDbState } from '@/test/action-test-mocks'

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
    segmentId: 'segment_id',
    status: 'status',
    severity: 'severity',
    category: 'category',
    detectedByLayer: 'detected_by_layer',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
    updatedAt: 'updated_at',
  },
}))
vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    actionType: 'action_type',
    previousState: 'previous_state',
    newState: 'new_state',
    userId: 'user_id',
    batchId: 'batch_id',
    metadata: 'metadata',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function buildFindingMock(overrides?: Record<string, unknown>) {
  return {
    id: ACTION_TEST_IDS.findingId,
    fileId: ACTION_TEST_IDS.fileId,
    projectId: ACTION_TEST_IDS.projectId,
    tenantId: ACTION_TEST_IDS.tenantId,
    segmentId: ACTION_TEST_IDS.segmentId,
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L1',
    sourceTextExcerpt: 'Hello world',
    targetTextExcerpt: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01',
    ...overrides,
  }
}

describe('noteFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState(dbState)
    mockRequireRole.mockResolvedValue({
      id: ACTION_TEST_IDS.userId,
      tenantId: ACTION_TEST_IDS.tenantId,
      role: 'qa_reviewer',
    })
  })

  it('[P0] U-NA1: should transition pending \u2192 noted with review_actions', async () => {
    dbState.returnValues = [[buildFindingMock({ status: 'pending' })], [], []]

    const result = await noteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ previousState: 'pending', newState: 'noted' })
    }

    const reviewActionValues = findCapturedValues(dbState, 'actionType', 'note')
    expect(reviewActionValues).toBeDefined()
    expect(reviewActionValues).toMatchObject({
      actionType: 'note',
      previousState: 'pending',
      newState: 'noted',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finding.note' }),
    )
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({ previousState: 'pending', newState: 'noted' }),
      }),
    )
  })

  it('[P1] U-NA2: should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [[]]

    const result = await noteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
    expect(withTenant).toHaveBeenCalledWith('tenant_id', ACTION_TEST_IDS.tenantId)
  })

  it('[P1] U-NA3: should return no-op when finding is already noted', async () => {
    dbState.returnValues = [[buildFindingMock({ status: 'noted' })]]

    const result = await noteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(result.success).toBe(true)
    if (result.success && 'noOp' in result.data) {
      expect(result.data.noOp).toBe(true)
    }
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('[P1] U-NA4: should return no-op when finding is manual', async () => {
    dbState.returnValues = [[buildFindingMock({ status: 'manual', detectedByLayer: 'Manual' })]]

    const result = await noteFinding({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
    })

    expect(result.success).toBe(true)
    if (result.success && 'noOp' in result.data) {
      expect(result.data.noOp).toBe(true)
    }
  })
})
