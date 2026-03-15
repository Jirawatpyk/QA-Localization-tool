/**
 * Story 4.3 ATDD: addFinding Server Action
 * Tests: U-AF1..U-AF5 (create manual finding, validation, feedback_events, Inngest)
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

import { addFinding } from '@/features/review/actions/addFinding.action'

const IDS = {
  fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
  tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  userId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  newFindingId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
}

const VALID_INPUT = {
  fileId: IDS.fileId,
  projectId: IDS.projectId,
  segmentId: IDS.segmentId,
  category: 'accuracy',
  severity: 'minor' as const,
  description: 'Missing translation for key term',
  suggestion: null,
}

describe('addFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: IDS.userId,
      tenantId: IDS.tenantId,
      role: 'qa_reviewer',
    })
  })

  it('[P0] U-AF1: should create finding with status=manual, layer=Manual', async () => {
    // SELECT segment, tx.insert findings (returning), tx.insert review_actions, audit, inngest, feedback_events
    dbState.returnValues = [
      [
        {
          id: IDS.segmentId,
          sourceText: 'Hello world source',
          targetText: 'สวัสดีชาวโลก target',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
        },
      ],
      [{ id: IDS.newFindingId, status: 'manual', severity: 'minor', category: 'accuracy' }], // tx.insert returning
      [], // tx.insert review_actions
      [], // feedback_events
    ]

    const result = await addFinding(VALID_INPUT)

    expect(result.success).toBe(true)
    if (result.success) {
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
    if (!result.success) expect(result.code).toBe('VALIDATION')
  })

  it('[P1] U-AF4: should insert feedback_events row (FR80)', async () => {
    dbState.returnValues = [
      [
        {
          id: IDS.segmentId,
          sourceText: 'Hello',
          targetText: 'สวัสดี',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
        },
      ],
      [{ id: IDS.newFindingId }],
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
          id: IDS.segmentId,
          sourceText: 'Hello',
          targetText: 'สวัสดี',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
        },
      ],
      [{ id: IDS.newFindingId }],
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
