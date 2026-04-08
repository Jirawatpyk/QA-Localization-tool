/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC2: Auto-tag on bulk actions — all rows get non_native metadata
 *
 * TDD RED PHASE — all tests skipped until implementation complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks ──
const {
  dbState,
  dbMockModule,
  mockRequireRole,
  mockWriteAuditLog,
  mockInngestSend,
  mockDetermineNonNative,
} = vi.hoisted(() => {
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
    mockDetermineNonNative: vi.fn((..._args: unknown[]) => true),
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
  inArray: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((..._args: unknown[]) => 'sql-expr'),
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))
vi.mock('@/lib/auth/determineNonNative', () => ({
  determineNonNative: (...args: unknown[]) => mockDetermineNonNative(...args),
}))
vi.mock('@/features/review/utils/state-transitions', () => ({
  getNewState: vi.fn((..._args: unknown[]) => 'accepted'),
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
vi.mock('@/db/schema/segments', () => ({
  segments: { id: 'id', tenantId: 'tenant_id', targetLang: 'target_lang' },
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
    findingId: 'finding_id',
    tenantId: 'tenant_id',
    eventType: 'event_type',
    userId: 'user_id',
    reviewerIsNative: 'reviewer_is_native',
    targetLang: 'target_lang',
    severity: 'severity',
    category: 'category',
    subcategory: 'subcategory',
    description: 'description',
    isAiGenerated: 'is_ai_generated',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

import { bulkAction } from '@/features/review/actions/bulkAction.action'

const FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const FINDING_IDS = [
  'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  'f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c',
  'f3a4b5c6-d7e8-4f9a-ab1c-2d3e4f5a6b7c',
]

describe('bulkAction — Non-Native Auto-Tag (Story 5.2a)', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockDetermineNonNative.mockClear()
  })

  // ── AC2: All review_action rows in bulk get non_native metadata ──

  it('[P0][AC2] should set metadata.non_native on ALL review_action rows in bulk', async () => {
    mockDetermineNonNative.mockReturnValue(true)

    // Mock: 3 findings with pending status, all with segments
    const findingRows = FINDING_IDS.map((id) => ({
      id,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
      segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
      status: 'pending',
      severity: 'major',
      category: 'accuracy',
      detectedByLayer: 'L2',
      sourceTextExcerpt: 'src',
      targetTextExcerpt: 'tgt',
    }))

    dbState.returnValues = [
      findingRows, // SELECT findings
      [{ targetLang: 'th-TH' }], // segment targetLang (queried ONCE for non-native)
      undefined, // transaction: batch UPDATE
      undefined, // transaction: batch INSERT review_actions
    ]

    const result = await bulkAction({
      findingIds: FINDING_IDS,
      action: 'accept',
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    // determineNonNative called ONCE (not per finding)
    expect(mockDetermineNonNative).toHaveBeenCalledTimes(1)

    // Every review_actions INSERT row should have metadata with non_native
    // bulkAction uses batch INSERT: .values(reviewActionRows) — captured as single array entry
    const batchCapture = dbState.valuesCaptures.find(
      (c: unknown) =>
        Array.isArray(c) &&
        (c as Record<string, unknown>[]).length > 0 &&
        'actionType' in (c as Record<string, unknown>[])[0]!,
    ) as Record<string, unknown>[] | undefined

    expect(batchCapture).toBeDefined()
    expect(batchCapture!.length).toBe(3)
    for (const row of batchCapture!) {
      expect(row.metadata).toEqual(expect.objectContaining({ non_native: true }))
    }
  })

  // ── AC2: Boundary — nativeLanguages = [] → non-native for all ──

  it('[P1][AC2] should treat empty nativeLanguages as non-native for all languages', async () => {
    mockDetermineNonNative.mockReturnValue(true)
    mockRequireRole.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'qa_reviewer',
      nativeLanguages: [], // empty = non-native for ALL
    })

    dbState.returnValues = [
      [
        {
          id: FINDING_IDS[0],
          fileId: FILE_ID,
          projectId: PROJECT_ID,
          tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
          segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
          status: 'pending',
          severity: 'major',
          category: 'accuracy',
          detectedByLayer: 'L2',
          sourceTextExcerpt: 's',
          targetTextExcerpt: 't',
        },
      ],
      [{ targetLang: 'ja-JP' }],
      undefined,
    ]

    const result = await bulkAction({
      findingIds: [FINDING_IDS[0]!],
      action: 'accept',
      fileId: FILE_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    expect(mockDetermineNonNative).toHaveBeenCalledWith([], 'ja-JP')
  })
})
