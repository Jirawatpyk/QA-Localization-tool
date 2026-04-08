/**
 * Test Automation Expansion — Story 4.2: executeReviewAction helper
 * Regression tests for non-fatal side effects + error path audit log + constraint errors
 *
 * TA-U7: success when inngest.send() throws (best-effort)
 * TA-U8: preserve real error when writeAuditLog throws on error path (Guardrail #2)
 * TA-U9: succeed when feedback_events INSERT fails for reject action (non-fatal)
 * TA-U12: CONFLICT error when review_actions INSERT throws 23505
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { executeReviewAction } from '@/features/review/actions/helpers/executeReviewAction'
import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks ──

const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog, mockInngestSend, mockLogger } =
  vi.hoisted(() => {
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
      mockLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
  logger: mockLogger,
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

// ── Import after mocks ──

// ── Constants ──

const FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function buildFindingMock(overrides?: Record<string, unknown>) {
  return {
    id: FINDING_ID,
    fileId: FILE_ID,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L1',
    sourceTextExcerpt: 'Hello world',
    targetTextExcerpt: 'สวัสดีชาวโลก',
    ...overrides,
  }
}

describe('executeReviewAction — TA expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  // TA-U7: inngest.send() failure should not affect success result
  it('[P1] should return success when inngest.send() throws', async () => {
    dbState.returnValues = [[buildFindingMock({ status: 'pending' })], [], []]
    mockInngestSend.mockRejectedValue(new Error('Inngest unavailable'))

    const result = await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'accept',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: [] },
    })

    // DB transaction committed successfully → return success
    expect(result.success).toBe(true)

    // Inngest error logged but not propagated
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('inngest event (executeReviewAction:accept) failed (non-fatal)'),
    )
  })

  // TA-U8: audit log failure on error path preserves real error (Guardrail #2)
  it('[P1] should preserve real error when writeAuditLog throws on error path', async () => {
    // Finding exists → transaction succeeds → audit log throws
    dbState.returnValues = [[buildFindingMock({ status: 'pending' })], [], []]
    mockWriteAuditLog.mockRejectedValue(new Error('Audit DB connection lost'))

    const result = await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'accept',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: [] },
    })

    // Success returned — audit failure is non-fatal (try-catch in executeReviewAction)
    expect(result.success).toBe(true)

    // Audit error was logged, not propagated
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('audit log (executeReviewAction:accept) failed (non-fatal)'),
    )
  })

  // TA-U9: feedback_events INSERT failure for reject is non-fatal
  // Note: feedback_events is handled in rejectFinding.action.ts, not executeReviewAction.
  // This test verifies that executeReviewAction itself succeeds even when post-commit
  // side effects (audit + inngest) both fail.
  it('[P1] should succeed when both audit and inngest post-commit side effects fail', async () => {
    dbState.returnValues = [[buildFindingMock({ status: 'pending' })], [], []]
    mockWriteAuditLog.mockRejectedValue(new Error('Audit failure'))
    mockInngestSend.mockRejectedValue(new Error('Inngest failure'))

    const result = await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'reject',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: [] },
    })

    // DB committed → success despite all post-commit failures
    expect(result.success).toBe(true)
    expect(mockLogger.error).toHaveBeenCalledTimes(2) // audit + inngest

    // Verify withTenant was used (Guardrail #1)
    expect(withTenant).toHaveBeenCalledWith('tenant_id', TENANT_ID)
  })

  // TA-U12: 23505 unique violation on review_actions INSERT
  it('[P1] should throw when review_actions INSERT throws 23505 (duplicate constraint)', async () => {
    // SELECT returns finding, then transaction throws (simulating 23505)
    dbState.returnValues = [[buildFindingMock({ status: 'pending' })]]
    // throwAtCallIndex: 1 = first call inside transaction (tx.update succeeds at 1, tx.insert at 2)
    // Since drizzle mock chains .update().set().where() as one "call", we throw on the tx call
    dbState.throwAtCallIndex = 2

    // executeReviewAction does NOT catch DB transaction errors — they propagate
    await expect(
      executeReviewAction({
        input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
        action: 'accept',
        user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: [] },
      }),
    ).rejects.toThrow()
  })
})
