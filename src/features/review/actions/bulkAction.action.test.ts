/**
 * Story 4.4a ATDD: bulkAction Server Action — Bulk Operations & Decision Override
 * Tests: AC2 (bulk accept/reject), AC3 (no-op skip), AC6 (batch_id + audit)
 *
 * TDD RED phase — all tests use it() pending implementation.
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

// ── Constants ──

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

// Generate valid UUIDs for finding IDs
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
    targetTextExcerpt: 'สวัสดีชาวโลก',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ──

describe('bulkAction.action', () => {
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

  // ── AC2: Bulk Accept ──

  it('[P0] should bulk accept 3 findings atomically', async () => {
    const ids = [makeFindingId(1), makeFindingId(2), makeFindingId(3)]
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    // SELECT findings, then transaction (N updates + N review_actions inserts)
    dbState.returnValues = [findingRows, ...ids.flatMap(() => [[], []])]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(3)
      expect(result.data.skippedCount).toBe(0)
    }
  })

  // ── AC2: Bulk Reject ──

  it('[P0] should bulk reject 8 findings with batch_id', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => makeFindingId(i + 10))
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    dbState.returnValues = [findingRows, ...ids.flatMap(() => [[], [], [], []])]

    const result = await bulkAction({
      findingIds: ids,
      action: 'reject',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(8)
      // All review_actions should share the same batchId
      expect(result.data.batchId).toBeDefined()
      expect(typeof result.data.batchId).toBe('string')
    }
  })

  // ── AC3: No-op Skip ──

  it('[P0] should skip no-op findings (already accepted, manual)', async () => {
    const ids = [makeFindingId(20), makeFindingId(21), makeFindingId(22)]
    const findingRows = [
      buildFindingRow(ids[0]!, { status: 'accepted' }), // already accepted → no-op for accept
      buildFindingRow(ids[1]!, { status: 'manual' }), // manual → no-op for any action
      buildFindingRow(ids[2]!, { status: 'pending' }), // actionable
    ]

    dbState.returnValues = [findingRows, [], []]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(1)
      expect(result.data.skippedCount).toBe(2)
    }
  })

  it('[P0] should return processedCount and skippedCount', async () => {
    const ids = [makeFindingId(30), makeFindingId(31)]
    const findingRows = [
      buildFindingRow(ids[0]!, { status: 'pending' }),
      buildFindingRow(ids[1]!, { status: 'accepted' }), // no-op for accept
    ]

    dbState.returnValues = [findingRows, [], []]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveProperty('processedCount')
      expect(result.data).toHaveProperty('skippedCount')
      expect(result.data.processedCount).toBe(1)
      expect(result.data.skippedCount).toBe(1)
    }
  })

  // ── Boundary: exactly 5 (within limit) ──

  it('[P0] boundary: should accept exactly 5 findings without error', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => makeFindingId(i + 40))
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    dbState.returnValues = [findingRows, ...ids.flatMap(() => [[], []])]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(5)
    }
  })

  // ── Boundary: 200 findings (max valid) ──

  it('[P0] boundary: should accept 200 findings (max valid)', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => makeFindingId(i + 100))
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    dbState.returnValues = [findingRows, ...ids.flatMap(() => [[], []])]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(200)
    }
  })

  // ── Boundary: 201 findings (exceeds max) ──

  it('[P0] boundary: should reject 201 findings via Zod validation', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => makeFindingId(i + 400))

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  // ── P1: Transaction rollback ──

  it('[P1] should rollback all on transaction failure', async () => {
    const ids = [makeFindingId(50), makeFindingId(51)]
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    dbState.returnValues = [findingRows]
    // Inject error during transaction
    dbState.throwAtCallIndex = 1

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
    }
    // No Inngest event should be sent on failure
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  // ── P1: Single Inngest event per bulk action ──

  it('[P1] should send single Inngest event with first finding data', async () => {
    const ids = [makeFindingId(60), makeFindingId(61), makeFindingId(62)]
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    dbState.returnValues = [findingRows, ...ids.flatMap(() => [[], []])]

    await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Should send exactly ONE Inngest event (not N events)
    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({
          fileId: VALID_FILE_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
        }),
      }),
    )
  })

  // ── P1: feedback_events for bulk reject ──

  it('[P1] should insert feedback_events for bulk reject', async () => {
    const ids = [makeFindingId(70), makeFindingId(71)]
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    // SELECT findings, tx updates/inserts, segment lookups, feedback_events batch insert
    dbState.returnValues = [
      findingRows,
      ...ids.flatMap(() => [[], []]),
      [
        { id: ids[0], sourceLang: 'en', targetLang: 'th' },
        { id: ids[1], sourceLang: 'en', targetLang: 'th' },
      ],
      [],
    ]

    await bulkAction({
      findingIds: ids,
      action: 'reject',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // CR-H4: batch INSERT — find the array capture containing feedback_events rows
    const feedbackBatch = dbState.valuesCaptures.find(
      (c: unknown) =>
        Array.isArray(c) &&
        c.length > 0 &&
        typeof c[0] === 'object' &&
        c[0] !== null &&
        (c[0] as Record<string, unknown>).action === 'reject',
    ) as Array<Record<string, unknown>> | undefined

    expect(feedbackBatch).toBeDefined()
    expect(feedbackBatch!.length).toBe(2)
    expect(feedbackBatch![0]!.action).toBe('reject')
    expect(feedbackBatch![1]!.action).toBe('reject')
  })

  // ── P1: is_bulk flag and shared batchId ──

  it('[P1] should set is_bulk=true and shared batchId on all review_actions', async () => {
    const ids = [makeFindingId(80), makeFindingId(81), makeFindingId(82)]
    const findingRows = ids.map((id) => buildFindingRow(id, { status: 'pending' }))

    dbState.returnValues = [findingRows, ...ids.flatMap(() => [[], []])]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)

    // Find review_actions batch insert (single .values() call with array)
    const batchInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        Array.isArray(c) &&
        c.length > 0 &&
        (c[0] as Record<string, unknown>).actionType === 'accept',
    ) as Array<Record<string, unknown>> | undefined

    // Fallback: individual inserts (for backward compatibility)
    const reviewActionInserts = batchInsert
      ? batchInsert
      : dbState.valuesCaptures.filter(
          (c: unknown) =>
            typeof c === 'object' &&
            c !== null &&
            !Array.isArray(c) &&
            (c as Record<string, unknown>).actionType === 'accept',
        )

    expect(reviewActionInserts.length).toBe(3)

    // All should have is_bulk=true
    for (const insert of reviewActionInserts) {
      expect((insert as Record<string, unknown>).isBulk).toBe(true)
    }

    // All should share the same batchId (non-null UUID)
    const batchIds = reviewActionInserts.map((i) => (i as Record<string, unknown>).batchId)
    expect(batchIds[0]).toBeDefined()
    expect(batchIds[0]).not.toBeNull()
    expect(new Set(batchIds).size).toBe(1) // all same batchId
  })

  // ── P2: All no-ops ──

  it('[P2] should return empty processedFindings when all are no-ops', async () => {
    const ids = [makeFindingId(90), makeFindingId(91)]
    const findingRows = [
      buildFindingRow(ids[0]!, { status: 'accepted' }),
      buildFindingRow(ids[1]!, { status: 'manual' }),
    ]

    dbState.returnValues = [findingRows]

    const result = await bulkAction({
      findingIds: ids,
      action: 'accept',
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processedCount).toBe(0)
      expect(result.data.skippedCount).toBe(2)
    }
    // No Inngest event when nothing was processed
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
