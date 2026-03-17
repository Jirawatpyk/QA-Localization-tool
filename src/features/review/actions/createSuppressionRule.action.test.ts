/**
 * Story 4.6: createSuppressionRule Server Action
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
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    status: 'status',
    category: 'category',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    description: 'description',
    severity: 'severity',
    detectedByLayer: 'detected_by_layer',
    segmentId: 'segment_id',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
    updatedAt: 'updated_at',
  },
}))
vi.mock('@/db/schema/suppressionRules', () => ({
  suppressionRules: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    pattern: 'pattern',
    category: 'category',
    scope: 'scope',
    duration: 'duration',
    reason: 'reason',
    createdBy: 'created_by',
    isActive: 'is_active',
    matchCount: 'match_count',
    fileId: 'file_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
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
    isBulk: 'is_bulk',
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
    metadata: 'metadata',
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

import { createSuppressionRule } from '@/features/review/actions/createSuppressionRule.action'

const VALID_INPUT = {
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  fileId: 'f2000000-0000-4000-8000-000000000001',
  currentFileId: 'f2000000-0000-4000-8000-000000000001',
  category: 'Terminology',
  pattern: 'bank, terminology, financial, translation',
  scope: 'language_pair' as const,
  duration: 'until_improved' as const,
  sourceLang: 'en-US',
  targetLang: 'th-TH',
}

// Call order in implementation:
// 0: SELECT matching findings (outside tx)
// 1: INSERT suppression_rules (inside tx, .returning())
// 2: UPDATE findings (inside tx)
// 3: INSERT review_actions (inside tx)
// 4: SELECT segments (inside tx, for feedback_events lang)
// 5: INSERT feedback_events (inside tx)

const MATCHING_FINDING = {
  id: 'f1',
  status: 'pending',
  category: 'Terminology',
  description: 'incorrect bank terminology translation in financial context',
  severity: 'major',
  detectedByLayer: 'L2',
  segmentId: 's1',
  sourceTextExcerpt: 'bank',
  targetTextExcerpt: null,
}

describe('createSuppressionRule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    // Re-set mockRequireRole after clearAllMocks
    mockRequireRole.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'qa_reviewer',
    })
  })

  it('[P0] should create rule and batch auto-reject matching Pending findings', async () => {
    dbState.returnValues = [
      [MATCHING_FINDING], // 0: SELECT findings
      [{ id: 'r1000000-0000-4000-8000-000000000001' }], // 1: INSERT rule
      [], // 2: UPDATE findings
      [], // 3: INSERT review_actions
      [{ id: 's1', sourceLang: 'en-US', targetLang: 'th-TH' }], // 4: SELECT segments
      [], // 5: INSERT feedback_events
    ]
    const result = await createSuppressionRule(VALID_INPUT)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.autoRejectedCount).toBeGreaterThan(0)
    }
  })

  it('[P0] should write feedback_events with metadata.suppressed=true', async () => {
    dbState.returnValues = [
      [MATCHING_FINDING],
      [{ id: 'r1' }],
      [],
      [],
      [{ id: 's1', sourceLang: 'en-US', targetLang: 'th-TH' }],
      [],
    ]
    await createSuppressionRule(VALID_INPUT)
    // Verify feedback_events were inserted via valuesCaptures
    const captures = dbState.valuesCaptures as unknown[]
    const feedbackInserts = captures.filter((c) => {
      const item = c as Record<string, unknown>
      return item?.action === 'reject' && item?.metadata
    })
    for (const insert of feedbackInserts) {
      expect((insert as Record<string, unknown>).metadata).toMatchObject({ suppressed: true })
    }
  })

  it('[P1] should cap auto-reject at 100 findings', async () => {
    const manyFindings = Array.from({ length: 120 }, (_, i) => ({
      id: `f${i}`,
      status: 'pending',
      category: 'Terminology',
      description: 'incorrect bank terminology translation in financial context',
      severity: 'major',
      detectedByLayer: 'L2',
      segmentId: 's1',
      sourceTextExcerpt: 'bank',
      targetTextExcerpt: null,
    }))
    dbState.returnValues = [
      manyFindings, // 0: SELECT findings (120)
      [{ id: 'r1' }], // 1: INSERT rule
      [],
      [],
      [], // 2-4: UPDATE, INSERT review_actions, SELECT segments
      [], // 5: INSERT feedback_events
    ]
    const result = await createSuppressionRule(VALID_INPUT)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.autoRejectedCount).toBeLessThanOrEqual(100)
  })

  it('[P0] should return UNAUTHORIZED if not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('UNAUTHORIZED'))
    const result = await createSuppressionRule(VALID_INPUT)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toMatch(/UNAUTHORIZED/)
  })

  it('[P1] should send single Inngest event after batch (not per-finding)', async () => {
    dbState.returnValues = [
      [
        MATCHING_FINDING,
        {
          ...MATCHING_FINDING,
          id: 'f2',
          segmentId: 's2',
          description: 'bank terminology translation financial document',
        },
      ],
      [{ id: 'r1' }], // INSERT rule
      [],
      [],
      [], // UPDATE, INSERT review_actions, SELECT segments / padding
      [],
      [],
      [],
      [],
      [], // extra padding to prevent out-of-range
    ]
    const result = await createSuppressionRule(VALID_INPUT)
    expect(result.success).toBe(true)
    expect(mockInngestSend).toHaveBeenCalledTimes(1)
  })
})
