/**
 * Story 4.3 ATDD: overrideSeverity Server Action
 * Tests: U-O1..U-O6 (override, double override, reset, guards, feedback_events)
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
    status: 'status',
    severity: 'severity',
    originalSeverity: 'original_severity',
    category: 'category',
    detectedByLayer: 'detected_by_layer',
    segmentId: 'segment_id',
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
vi.mock('@/db/schema/feedbackEvents', () => ({
  feedbackEvents: { id: 'id', tenantId: 'tenant_id' },
}))
vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { overrideSeverity } from '@/features/review/actions/overrideSeverity.action'

function buildFinding(overrides?: Record<string, unknown>) {
  return {
    id: ACTION_TEST_IDS.findingId,
    status: 'pending',
    severity: 'critical',
    originalSeverity: null,
    category: 'accuracy',
    detectedByLayer: 'L1',
    segmentId: ACTION_TEST_IDS.segmentId,
    sourceTextExcerpt: 'Hello',
    targetTextExcerpt: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35',
    ...overrides,
  }
}

describe('overrideSeverity.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState(dbState)
    mockRequireRole.mockResolvedValue({
      id: ACTION_TEST_IDS.userId,
      tenantId: ACTION_TEST_IDS.tenantId,
      role: 'qa_reviewer',
    })
  })

  it('[P0] U-O1: should override critical \u2192 minor and set original_severity', async () => {
    // SELECT finding, tx.update, tx.insert review_actions, audit, inngest, segment lookup, feedback_events
    dbState.returnValues = [
      [buildFinding({ severity: 'critical', originalSeverity: null })],
      [],
      [], // tx: update + insert
      [{ sourceLang: 'en-US', targetLang: 'th-TH' }], // segment lookup
      [], // feedback_events insert
    ]

    const result = await overrideSeverity({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
      newSeverity: 'minor',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ originalSeverity: 'critical', newSeverity: 'minor' })
    }

    // Verify UPDATE set originalSeverity
    expect(dbState.setCaptures.length).toBeGreaterThan(0)
    const updateCaptured = dbState.setCaptures[0] as Record<string, unknown>
    expect(updateCaptured.severity).toBe('minor')
    expect(updateCaptured.originalSeverity).toBe('critical')

    expect(mockInngestSend).toHaveBeenCalled()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finding.override' }),
    )
  })

  it('[P0] U-O2: should preserve first original_severity on double override', async () => {
    // Already overridden: original was 'critical', currently 'major', override to 'minor'
    dbState.returnValues = [
      [buildFinding({ severity: 'major', originalSeverity: 'critical' })],
      [],
      [], // tx
      [{ sourceLang: 'en-US', targetLang: 'th-TH' }],
      [],
    ]

    const result = await overrideSeverity({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
      newSeverity: 'minor',
    })

    expect(result.success).toBe(true)
    // Should preserve 'critical' as original, NOT set to 'major'
    const updateCaptured = dbState.setCaptures[0] as Record<string, unknown>
    expect(updateCaptured.originalSeverity).toBe('critical')
    expect(updateCaptured.severity).toBe('minor')
  })

  it('[P1] U-O3: should reset to original severity and clear original_severity', async () => {
    // Was critical, overridden to minor, now resetting back to critical
    dbState.returnValues = [
      [buildFinding({ severity: 'minor', originalSeverity: 'critical' })],
      [],
      [], // tx
      [{ sourceLang: 'en-US', targetLang: 'th-TH' }],
      [],
    ]

    const result = await overrideSeverity({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
      newSeverity: 'critical',
    })

    expect(result.success).toBe(true)
    const updateCaptured = dbState.setCaptures[0] as Record<string, unknown>
    expect(updateCaptured.severity).toBe('critical')
    expect(updateCaptured.originalSeverity).toBeNull()
  })

  it('[P1] U-O4: should reject override to same severity', async () => {
    dbState.returnValues = [[buildFinding({ severity: 'critical' })]]

    const result = await overrideSeverity({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
      newSeverity: 'critical',
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('SAME_SEVERITY')
  })

  it('[P1] U-O5: should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [[]]
    const result = await overrideSeverity({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
      newSeverity: 'minor',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('[P1] U-O6: should insert feedback_events row for AI training (FR79)', async () => {
    dbState.returnValues = [
      [buildFinding({ severity: 'critical', originalSeverity: null })],
      [],
      [],
      [{ sourceLang: 'en-US', targetLang: 'th-TH' }],
      [],
    ]

    await overrideSeverity({
      findingId: ACTION_TEST_IDS.findingId,
      fileId: ACTION_TEST_IDS.fileId,
      projectId: ACTION_TEST_IDS.projectId,
      newSeverity: 'minor',
    })

    // feedback_events INSERT should have been captured
    const feedbackInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' &&
        c !== null &&
        (c as Record<string, unknown>).action === 'change_severity',
    ) as Record<string, unknown> | undefined

    expect(feedbackInsert).toBeDefined()
    expect(feedbackInsert).toMatchObject({
      action: 'change_severity',
      originalSeverity: 'critical',
      newSeverity: 'minor',
      isFalsePositive: false,
    })
  })
})
