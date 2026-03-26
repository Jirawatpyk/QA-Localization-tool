/**
 * Story 4.2: Core Review Actions — rejectFinding Server Action
 * Tests: success path, feedback_events INSERT with ALL NOT NULL columns
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

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

vi.mock('@/db/schema/feedbackEvents', () => ({
  feedbackEvents: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    projectId: 'project_id',
    findingId: 'finding_id',
    reviewerId: 'reviewer_id',
    action: 'action',
    findingCategory: 'finding_category',
    originalSeverity: 'original_severity',
    isFalsePositive: 'is_false_positive',
    reviewerIsNative: 'reviewer_is_native',
    layer: 'layer',
    detectedByLayer: 'detected_by_layer',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    sourceText: 'source_text',
    originalTarget: 'original_target',
  },
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

import { rejectFinding } from '@/features/review/actions/rejectFinding.action'

function findCapturedValues(
  state: { valuesCaptures: unknown[] },
  key: string,
  value: string,
): Record<string, unknown> | undefined {
  return state.valuesCaptures.find(
    (capture: unknown) =>
      typeof capture === 'object' &&
      capture !== null &&
      key in (capture as Record<string, unknown>) &&
      (capture as Record<string, string>)[key] === value,
  ) as Record<string, unknown> | undefined
}

// ── Constants ──

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

// M3+M6 fix: shared mock shape with segmentId
function buildFindingMock(overrides?: Record<string, unknown>) {
  return {
    id: VALID_FINDING_ID,
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    segmentId: VALID_SEGMENT_ID,
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L2',
    sourceTextExcerpt: 'Hello world',
    targetTextExcerpt: 'สวัสดีชาวโลก',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ──

describe('rejectFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: VALID_USER_ID,
      tenantId: VALID_TENANT_ID,
      role: 'qa_reviewer',
      nativeLanguages: [] as string[],
    })
  })

  it('[P0] U-SA6: should update finding status, write audit + review_actions + feedback_events, and send Inngest event', async () => {
    const findingMock = buildFindingMock({ status: 'pending' })
    // Call order: 1) SELECT finding, 2) tx.update (transaction), 3) tx.insert review_actions (transaction),
    // 4) segment SELECT, 5) INSERT feedback_events
    dbState.returnValues = [[findingMock], [], [], [{ sourceLang: 'en', targetLang: 'th' }], []]

    const result = await rejectFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding',
        action: 'finding.reject',
        tenantId: VALID_TENANT_ID,
      }),
    )

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({
          findingId: VALID_FINDING_ID,
          previousState: 'pending',
          newState: 'rejected',
        }),
      }),
    )
  })

  it('[P0] U-SA7: should insert feedback_events with ALL NOT NULL columns including detectedByLayer', async () => {
    const findingMock = buildFindingMock({
      status: 'pending',
      severity: 'major',
      category: 'accuracy',
      detectedByLayer: 'L2',
    })
    dbState.returnValues = [[findingMock], [], [], [{ sourceLang: 'en', targetLang: 'th' }], []]

    await rejectFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)

    const feedbackValues = findCapturedValues(dbState, 'action', 'reject')

    expect(feedbackValues).toBeDefined()
    // M7 fix: assert ALL NOT NULL columns including detectedByLayer
    expect(feedbackValues).toMatchObject({
      tenantId: VALID_TENANT_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      findingId: VALID_FINDING_ID,
      reviewerId: VALID_USER_ID,
      action: 'reject',
      findingCategory: 'accuracy',
      originalSeverity: 'major',
      isFalsePositive: true,
      layer: 'L2',
      detectedByLayer: 'L2',
      sourceText: 'Hello world',
      originalTarget: 'สวัสดีชาวโลก',
    })

    // TQA-M3: assert values not just property existence
    expect(feedbackValues!.reviewerIsNative).toBe(false) // TODO(story-5.2): will change when wired from profile
    expect(feedbackValues!.sourceLang).toBe('en')
    expect(feedbackValues!.targetLang).toBe('th')
  })

  it('[P0] U-SA6b: should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [[]]

    const result = await rejectFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toMatch(/NOT_FOUND/)
    }
  })

  it('[P1] U-SA6c: should return success with no state change when already rejected (no-op)', async () => {
    const findingMock = buildFindingMock({ status: 'rejected' })
    dbState.returnValues = [[findingMock]]

    const result = await rejectFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
