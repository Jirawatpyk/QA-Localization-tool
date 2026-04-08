/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC1b: addFinding metadata merge — { isManual: true, non_native: true }
 *
 * TDD RED PHASE — all tests skipped until implementation complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
        nativeLanguages: ['en'],
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
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))
vi.mock('@/lib/auth/determineNonNative', () => ({
  determineNonNative: (...args: unknown[]) => mockDetermineNonNative(...args),
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
    description: 'description',
    suggestedFix: 'suggested_fix',
    aiConfidence: 'ai_confidence',
    aiModel: 'ai_model',
    originalSeverity: 'original_severity',
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
vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {
    category: 'category',
    isActive: 'is_active',
    parentCategory: 'parent_category',
    displayOrder: 'display_order',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

import { addFinding } from '@/features/review/actions/addFinding.action'

const VALID_INPUT = {
  fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
  severity: 'major' as const,
  category: 'accuracy',
  description: 'Manual finding for test',
  suggestion: null,
}

describe('addFinding — Non-Native Metadata Merge (Story 5.2a)', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockDetermineNonNative.mockClear()
  })

  // ── AC1b: Metadata merge preserves isManual alongside non_native ──

  it('[P1][AC1b] should merge non_native into metadata alongside isManual: true', async () => {
    mockDetermineNonNative.mockReturnValue(true)
    dbState.returnValues = [
      [
        {
          id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
          sourceText: 'src',
          targetText: 'tgt',
          sourceLang: 'en',
          targetLang: 'th-TH',
        },
      ], // segment SELECT
      [{ isActive: true }], // taxonomy SELECT
      [
        {
          id: 'new-finding-id',
          severity: 'major',
          category: 'accuracy',
          description: 'Manual finding for test',
          status: 'manual',
          detectedByLayer: 'Manual',
        },
      ], // finding INSERT returning
      undefined, // review_actions INSERT
      undefined, // feedback_events INSERT (best-effort)
    ]

    const result = await addFinding({ ...VALID_INPUT })

    expect(result.success).toBe(true)

    // Find the review_actions INSERT capture — should have BOTH keys
    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && 'actionType' in (c as Record<string, unknown>),
    ) as Record<string, unknown> | undefined

    expect(reviewActionInsert).toBeDefined()
    // CRITICAL: metadata must MERGE, not replace
    expect(reviewActionInsert?.metadata).toEqual({
      isManual: true,
      non_native: true,
    })
  })

  // ── AC1b: Native reviewer — isManual + non_native: false ──

  it('[P1][AC1b] should set non_native: false when reviewer is native (merge preserved)', async () => {
    mockDetermineNonNative.mockReturnValue(false)
    mockRequireRole.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'qa_reviewer',
      nativeLanguages: ['th'],
    })
    dbState.returnValues = [
      [
        {
          id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
          sourceText: 'src',
          targetText: 'tgt',
          sourceLang: 'en',
          targetLang: 'th-TH',
        },
      ],
      [{ isActive: true }],
      [
        {
          id: 'new-finding-id',
          severity: 'major',
          category: 'accuracy',
          description: 'Manual finding for test',
          status: 'manual',
          detectedByLayer: 'Manual',
        },
      ],
      undefined,
      undefined,
    ]

    const result = await addFinding({ ...VALID_INPUT })

    expect(result.success).toBe(true)

    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && 'actionType' in (c as Record<string, unknown>),
    ) as Record<string, unknown> | undefined

    expect(reviewActionInsert?.metadata).toEqual({
      isManual: true,
      non_native: false,
    })
  })
})
