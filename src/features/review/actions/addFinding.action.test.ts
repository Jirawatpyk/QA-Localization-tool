/**
 * Story 4.3 ATDD: addFinding Server Action
 * Tests: U-AF1..U-AF5 (create manual finding, validation, feedback_events, Inngest)
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
    segmentId: 'segment_id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
    severity: 'severity',
    category: 'category',
    description: 'description',
    detectedByLayer: 'detected_by_layer',
    aiConfidence: 'ai_confidence',
    aiModel: 'ai_model',
    suggestedFix: 'suggested_fix',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
    segmentCount: 'segment_count',
    scope: 'scope',
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
vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    fileId: 'file_id',
    tenantId: 'tenant_id',
    sourceText: 'source_text',
    targetText: 'target_text',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))
vi.mock('@/db/schema/feedbackEvents', () => ({
  feedbackEvents: { id: 'id', tenantId: 'tenant_id' },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

import { addFinding } from '@/features/review/actions/addFinding.action'

const NEW_FINDING_ID = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b'

const VALID_INPUT = {
  fileId: ACTION_TEST_IDS.fileId,
  projectId: ACTION_TEST_IDS.projectId,
  segmentId: ACTION_TEST_IDS.segmentId,
  category: 'accuracy',
  severity: 'minor' as const,
  description: 'Missing translation for key term',
  suggestion: null,
}

describe('addFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState(dbState)
    mockRequireRole.mockResolvedValue({
      id: ACTION_TEST_IDS.userId,
      tenantId: ACTION_TEST_IDS.tenantId,
      role: 'qa_reviewer',
      nativeLanguages: [] as string[],
    })
  })

  it('[P0] U-AF1: should create finding with status=manual, layer=Manual', async () => {
    // SELECT segment, SELECT taxonomy (CR-R1-H5), tx.insert findings (returning), tx.insert review_actions, audit, inngest, feedback_events
    dbState.returnValues = [
      [
        {
          id: ACTION_TEST_IDS.segmentId,
          sourceText: 'Hello world source',
          targetText:
            '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01 target',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
        },
      ],
      [{ isActive: true }], // taxonomy category validation
      [{ id: NEW_FINDING_ID, status: 'manual', severity: 'minor', category: 'accuracy' }], // tx.insert returning
      [], // tx.insert review_actions
      [], // feedback_events
    ]

    const result = await addFinding(VALID_INPUT)

    expect(result.success).toBe(true)
    if (result.success) {
      // CR-R1-M6: verify findingId propagates from INSERT returning
      expect(result.data.findingId).toBe(NEW_FINDING_ID)
      expect(result.data).toMatchObject({
        status: 'manual',
        detectedByLayer: 'Manual',
        severity: 'minor',
        category: 'accuracy',
      })
    }

    // Verify finding INSERT
    const findingInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && (c as Record<string, unknown>).status === 'manual',
    ) as Record<string, unknown> | undefined
    expect(findingInsert).toBeDefined()
    expect(findingInsert).toMatchObject({
      status: 'manual',
      detectedByLayer: 'Manual',
      severity: 'minor',
    })
  })

  it('[P1] U-AF2: should reject when segment not found', async () => {
    dbState.returnValues = [[]]

    const result = await addFinding(VALID_INPUT)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('[P1] U-AF3: should reject description < 10 chars', async () => {
    const result = await addFinding({ ...VALID_INPUT, description: 'Short' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('[P1] U-AF4: should insert feedback_events row (FR80)', async () => {
    dbState.returnValues = [
      [
        {
          id: ACTION_TEST_IDS.segmentId,
          sourceText: 'Hello',
          targetText: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
        },
      ],
      [{ isActive: true }], // taxonomy category validation (CR-R1-H5)
      [{ id: NEW_FINDING_ID }],
      [],
      [],
    ]

    await addFinding(VALID_INPUT)

    const feedbackInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' &&
        c !== null &&
        (c as Record<string, unknown>).action === 'manual_add',
    ) as Record<string, unknown> | undefined

    expect(feedbackInsert).toBeDefined()
    expect(feedbackInsert).toMatchObject({
      action: 'manual_add',
      findingCategory: 'accuracy',
      originalSeverity: 'minor',
      layer: 'Manual',
      detectedByLayer: 'Manual',
    })
  })

  it('[P1] U-AF5: should send Inngest event for score recalculation', async () => {
    dbState.returnValues = [
      [
        {
          id: ACTION_TEST_IDS.segmentId,
          sourceText: 'Hello',
          targetText: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
        },
      ],
      [{ isActive: true }], // taxonomy category validation (CR-R1-H5)
      [{ id: NEW_FINDING_ID }],
      [],
      [],
    ]

    await addFinding(VALID_INPUT)

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({ previousState: 'pending', newState: 'manual' }),
      }),
    )
  })
})
