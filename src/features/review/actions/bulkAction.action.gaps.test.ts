/**
 * Story 4.4a TA: bulkAction Server Action — Coverage Gap Tests
 * Tests: Auth failure, Zod edge cases, non-fatal error paths, mixed statuses
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
  inArray: vi.fn((...args: unknown[]) => args),
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

import { bulkAction } from '@/features/review/actions/bulkAction.action'

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function makeFindingId(n: number): string {
  const hex = n.toString(16).padStart(8, '0')
  return `${hex}-0000-4000-8000-000000000000`
}

function buildFindingRow(id: string, overrides?: Record<string, unknown>) {
  return {
    id,
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L1',
    sourceTextExcerpt: 'Hello world',
    targetTextExcerpt: '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('bulkAction.action — coverage gaps', () => {
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

  // P0: Auth failure
  it('[P0] should return UNAUTHORIZED when requireRole throws', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Not authenticated'))

    const result = await bulkAction({
      findingIds: [makeFindingId(1)],
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
      expect(result.error).toBe('Unauthorized')
    }
  })

  // P0: Zod validation — malformed UUID
  it('[P0] should reject malformed UUID in findingIds', async () => {
    const result = await bulkAction({
      findingIds: ['not-a-valid-uuid'],
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  // P0: Zod validation — missing required field
  it('[P0] should reject missing action field', async () => {
    const result = await bulkAction({
      findingIds: [makeFindingId(1)],
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    } as never)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  // P0: Empty findingIds guard — Zod .min(1) rejects before the code guard
  it('[P0] should return VALIDATION_ERROR for empty findingIds (Zod .min(1))', async () => {
    const result = await bulkAction({
      findingIds: [],
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
    // No DB calls should be made
    expect(mockRequireRole).not.toHaveBeenCalled()
  })

  // P0: Mixed statuses — pending, accepted, rejected, manual
  it('[P0] should correctly split mixed statuses [pending, accepted, rejected, manual]', async () => {
    const ids = [makeFindingId(100), makeFindingId(101), makeFindingId(102), makeFindingId(103)]
    const findingRows = [
      buildFindingRow(ids[0]!, { status: 'pending' }), // accept on pending -> accepted (processed)
      buildFindingRow(ids[1]!, { status: 'accepted' }), // accept on accepted -> null (skipped)
      buildFindingRow(ids[2]!, { status: 'rejected' }), // accept on rejected -> re_accepted (processed)
      buildFindingRow(ids[3]!, { status: 'manual' }), // accept on manual -> null (skipped)
    ]

    dbState.returnValues = [findingRows, ...Array(6).fill([])]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(2)
      expect(result.data.skippedCount).toBe(2)
      expect(result.data.skippedIds).toContain(ids[1])
      expect(result.data.skippedIds).toContain(ids[3])
    }
  })

  // P1: writeAuditLog failure is non-fatal
  it('[P1] should succeed even when writeAuditLog throws', async () => {
    const ids = [makeFindingId(110)]
    const findingRows = [buildFindingRow(ids[0]!, { status: 'pending' })]

    dbState.returnValues = [findingRows, [], []]
    mockWriteAuditLog.mockRejectedValueOnce(new Error('Audit service down'))

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(1)
    }
  })

  // P1: inngest.send failure is non-fatal
  it('[P1] should succeed even when inngest.send throws', async () => {
    const ids = [makeFindingId(120)]
    const findingRows = [buildFindingRow(ids[0]!, { status: 'pending' })]

    dbState.returnValues = [findingRows, [], []]
    mockInngestSend.mockRejectedValueOnce(new Error('Inngest unreachable'))

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(1)
    }
  })

  // P1: Segment language null fallback
  it('[P1] should use "unknown" lang when segment not found for reject', async () => {
    const ids = [makeFindingId(130)]
    const findingRows = [buildFindingRow(ids[0]!, { status: 'pending', segmentId: null })]

    // SELECT findings, tx (update + review_actions insert), segment lookup skipped (null segmentId),
    // feedback_events batch insert
    dbState.returnValues = [findingRows, [], [], []]

    const result = await bulkAction({
      findingIds: ids,
      action: 'reject',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)

    // feedback_events should use 'unknown' for lang when segmentId is null
    const feedbackBatch = dbState.valuesCaptures.find(
      (c: unknown) =>
        Array.isArray(c) &&
        c.length > 0 &&
        typeof c[0] === 'object' &&
        c[0] !== null &&
        (c[0] as Record<string, unknown>).action === 'reject',
    ) as Array<Record<string, unknown>> | undefined

    expect(feedbackBatch).toBeDefined()
    expect(feedbackBatch![0]!.sourceLang).toBe('unknown')
    expect(feedbackBatch![0]!.targetLang).toBe('unknown')
  })

  // P1: Finding IDs not in DB are counted as skipped
  it('[P1] should count findings not in DB as skipped', async () => {
    const existingId = makeFindingId(140)
    const missingId = makeFindingId(141)
    const findingRows = [buildFindingRow(existingId, { status: 'pending' })]

    dbState.returnValues = [findingRows, [], []]

    const result = await bulkAction({
      findingIds: [existingId, missingId],
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(1)
      expect(result.data.skippedCount).toBe(1)
      expect(result.data.skippedIds).toContain(missingId)
    }
  })

  // P2: Duplicate findingIds in input
  it('[P2] should reject duplicate findingIds via Zod refine', async () => {
    const dupeId = makeFindingId(150)
    const result = await bulkAction({
      findingIds: [dupeId, dupeId],
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
