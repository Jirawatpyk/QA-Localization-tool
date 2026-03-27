/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC4: getFileReviewData computes hasNonNativeAction for each finding
 *
 * TDD RED PHASE — all tests skipped until implementation complete.
 */
import { describe, it, vi, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { buildDbFinding, buildScoreRecord, buildFile } from '@/test/factories'

// ── Hoisted mocks ──
const { dbState, dbMockModule, mockRequireRole, mockWithTenant } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { dbState, dbMockModule } = (createDrizzleMock as any)()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn(),
    mockWithTenant: vi.fn((..._args: unknown[]) => 'mocked-tenant-filter'),
  }
})

vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}))

const mockTenantId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const mockUserId = 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e'
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((...args: unknown[]) => args),
  count: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    fileName: 'file_name',
    status: 'status',
    projectId: 'project_id',
    tenantId: 'tenant_id',
  },
}))
vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    segmentId: 'segment_id',
    severity: 'severity',
    originalSeverity: 'original_severity',
    category: 'category',
    description: 'description',
    status: 'status',
    detectedByLayer: 'detected_by_layer',
    aiConfidence: 'ai_confidence',
    aiModel: 'ai_model',
    suggestedFix: 'suggested_fix',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    segmentCount: 'segment_count',
    scope: 'scope',
  },
}))
vi.mock('@/db/schema/scores', () => ({
  scores: {
    mqmScore: 'mqm_score',
    status: 'status',
    layerCompleted: 'layer_completed',
    criticalCount: 'critical_count',
    majorCount: 'major_count',
    minorCount: 'minor_count',
    autoPassRationale: 'auto_pass_rationale',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
  },
}))
vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    processingMode: 'processing_mode',
    sourceLang: 'source_lang',
    tenantId: 'tenant_id',
    btConfidenceThreshold: 'bt_confidence_threshold',
  },
}))
vi.mock('@/db/schema/languagePairConfigs', () => ({
  languagePairConfigs: {
    l2ConfidenceMin: 'l2_confidence_min',
    l3ConfidenceMin: 'l3_confidence_min',
    targetLang: 'target_lang',
    sourceLang: 'source_lang',
    tenantId: 'tenant_id',
  },
}))
vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    segmentNumber: 'segment_number',
    sourceText: 'source_text',
    fileId: 'file_id',
    tenantId: 'tenant_id',
  },
}))
vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {
    category: 'category',
    parentCategory: 'parent_category',
    isActive: 'is_active',
    displayOrder: 'display_order',
  },
}))
vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
}))
vi.mock('@/lib/auth/determineNonNative', () => ({
  determineNonNative: vi.fn((..._args: unknown[]) => true),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const FILE_ID = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
const PROJECT_ID = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'
const FINDING_1_ID = 'e5f6a1b2-c3d4-4e1f-8a2b-7c8d9e0f1a2b'
const FINDING_2_ID = 'f6a1b2c3-d4e5-4f1a-9b2c-8d9e0f1a2b3c'

describe('getFileReviewData — hasNonNativeAction (Story 5.2a)', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockWithTenant.mockClear()
    mockRequireRole.mockResolvedValue({
      id: mockUserId,
      tenantId: mockTenantId,
      role: 'qa_reviewer',
      nativeLanguages: ['en'],
    })
  })

  // ── AC4: Finding with non-native review_action → hasNonNativeAction = true ──

  it('[P1][AC4] should set hasNonNativeAction = true for findings with non-native review_actions', async () => {
    const file = buildFile({ fileId: FILE_ID })
    const finding1 = buildDbFinding({ id: FINDING_1_ID, fileId: FILE_ID })
    const finding2 = buildDbFinding({ id: FINDING_2_ID, fileId: FILE_ID })
    const score = buildScoreRecord({ fileId: FILE_ID, projectId: PROJECT_ID })

    dbState.returnValues = [
      [file], // Q1: file SELECT
      [finding1, finding2], // Q2: findings SELECT
      [score], // Q3: score SELECT
      [
        {
          processingMode: 'economy',
          sourceLang: 'en',
          l2ConfidenceMin: null,
          l3ConfidenceMin: null,
          targetLang: 'th',
          btConfidenceThreshold: 0.6,
        },
      ], // Q4: config
      [], // Q5: segments for AddFinding
      [], // Q6: taxonomy categories
      [], // Q7: overrideCounts
      [{ findingId: FINDING_1_ID }], // Q8: non-native review_actions query
      [], // Q9: sibling files
    ]

    const result = await getFileReviewData({ fileId: FILE_ID, projectId: PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return

    // Finding 1 has non-native action → true
    const f1 = result.data.findings.find((f) => f.id === FINDING_1_ID)
    expect(f1?.hasNonNativeAction).toBe(true)

    // Finding 2 has NO non-native action → false
    const f2 = result.data.findings.find((f) => f.id === FINDING_2_ID)
    expect(f2?.hasNonNativeAction).toBe(false)
  })

  // ── AC4: No non-native actions at all → all false ──

  it('[P1][AC4] should set hasNonNativeAction = false when no non-native actions exist', async () => {
    const file = buildFile({ fileId: FILE_ID })
    const finding1 = buildDbFinding({ id: FINDING_1_ID, fileId: FILE_ID })
    const score = buildScoreRecord({ fileId: FILE_ID, projectId: PROJECT_ID })

    dbState.returnValues = [
      [file],
      [finding1],
      [score],
      [
        {
          processingMode: 'economy',
          sourceLang: 'en',
          l2ConfidenceMin: null,
          l3ConfidenceMin: null,
          targetLang: 'th',
          btConfidenceThreshold: 0.6,
        },
      ],
      [], // Q5: segments
      [], // Q6: categories
      [], // Q7: overrideCounts — empty
      [], // Q8: non-native query — empty
      [], // Q9: sibling files
    ]

    const result = await getFileReviewData({ fileId: FILE_ID, projectId: PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return

    const f1 = result.data.findings.find((f) => f.id === FINDING_1_ID)
    expect(f1?.hasNonNativeAction).toBe(false)
  })

  // ── Boundary: Mixed native + non-native actions → badge shows (any non-native exists) ──

  it('[P1][Boundary] finding with mixed native and non-native actions → hasNonNativeAction = true', async () => {
    // Scenario: finding 1 has accept(non-native) then reject(native)
    // The non-native query returns finding 1 because at least one non-native action exists
    const file = buildFile({ fileId: FILE_ID })
    const finding1 = buildDbFinding({ id: FINDING_1_ID, fileId: FILE_ID })
    const score = buildScoreRecord({ fileId: FILE_ID, projectId: PROJECT_ID })

    dbState.returnValues = [
      [file],
      [finding1],
      [score],
      [
        {
          processingMode: 'economy',
          sourceLang: 'en',
          l2ConfidenceMin: null,
          l3ConfidenceMin: null,
          targetLang: 'th',
          btConfidenceThreshold: 0.6,
        },
      ],
      [], // Q5: segments
      [], // Q6: categories
      [], // Q7: overrideCounts
      [{ findingId: FINDING_1_ID }], // Q8: non-native query
      [], // Q9: sibling files
    ]

    const result = await getFileReviewData({ fileId: FILE_ID, projectId: PROJECT_ID })

    expect(result.success).toBe(true)
    if (!result.success) return

    const f1 = result.data.findings.find((f) => f.id === FINDING_1_ID)
    // Conservative: ANY non-native action = badge shows (Story 5.2c will refine)
    expect(f1?.hasNonNativeAction).toBe(true)
  })
})
