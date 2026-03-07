/** Story 3.4 ATDD — L3 fallback chain wiring */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { buildSegmentRow, BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'

// Default segment ID from buildSegmentRow()
const DEFAULT_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

// ── Hoisted mocks ──
const {
  mocks: {
    mockGenerateText,
    mockCheckProjectBudget,
    mockWriteAuditLog,
    mockLogAIUsage,
    mockGetModelForLayerWithFallback,
  },
  modules,
  dbState,
  dbMockModule,
  mockCallWithFallback,
  mockAiL3Limit,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  const { mocks, modules } = createAIMock({ layer: 'L3' })

  const mockCallWithFallback = vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      data: {
        output: {
          findings: [] as Record<string, unknown>[],
          reasoning: 'No issues found',
          summary: 'Clean',
        },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        text: '',
        finishReason: 'stop' as const,
      },
      modelUsed: 'claude-sonnet-4-5-20250929',
      fallbackUsed: false,
      attemptsLog: [],
    }),
  )

  const mockAiL3Limit = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 50, remaining: 49, reset: 0 }),
  )

  return { mocks, modules, dbState, dbMockModule, mockCallWithFallback, mockAiL3Limit }
})

// ── Module mocks ──

vi.mock('ai', () => modules.ai)
vi.mock('@/lib/ai/client', () => modules.aiClient)
vi.mock('@/lib/ai/costs', () => modules.aiCosts)
vi.mock('@/lib/ai/errors', () => modules.aiErrors)
vi.mock('@/lib/ai/budget', () => modules.aiBudget)
vi.mock('@/lib/ai/types', () => modules.aiTypes)
vi.mock('@/lib/ai/providers', () => modules.aiProviders)
vi.mock('@/features/audit/actions/writeAuditLog', () => modules.audit)
vi.mock('@/lib/logger', () => modules.logger)
vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/lib/ai/fallbackRunner', () => ({
  callWithFallback: (...args: unknown[]) => mockCallWithFallback(...args),
}))

vi.mock('@/lib/ratelimit', () => ({
  aiL3ProjectLimiter: { limit: (...args: unknown[]) => mockAiL3Limit(...args) },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  max: vi.fn((...args: unknown[]) => args),
  count: vi.fn(() => 'count'),
}))

vi.mock('@/db/schema/files', () => ({
  files: { id: 'id', tenantId: 'tenant_id', status: 'status', projectId: 'project_id' },
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    fileId: 'file_id',
    segmentId: 'segment_id',
    detectedByLayer: 'detected_by_layer',
    aiModel: 'ai_model',
    severity: 'severity',
    category: 'category',
    description: 'description',
    status: 'status',
    aiConfidence: 'ai_confidence',
  },
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    projectId: 'project_id',
    sourceText: 'source_text',
    targetText: 'target_text',
    segmentNumber: 'segment_number',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { id: 'id', tenantId: 'tenant_id', projectId: 'project_id' },
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: {
    id: 'id',
    glossaryId: 'glossary_id',
    sourceTerm: 'source_term',
    targetTerm: 'target_term',
    caseSensitive: 'case_sensitive',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    name: 'name',
    description: 'description',
    sourceLang: 'source_lang',
    targetLangs: 'target_langs',
    processingMode: 'processing_mode',
  },
}))

vi.mock('@/db/schema/languagePairConfigs', () => ({
  languagePairConfigs: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    l3ConfidenceMin: 'l3_confidence_min',
  },
}))

vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {
    id: 'id',
    category: 'category',
    parentCategory: 'parent_category',
    severity: 'severity',
    description: 'description',
    isActive: 'is_active',
  },
}))

vi.mock('@/features/pipeline/prompts/build-l3-prompt', () => ({
  buildL3Prompt: vi.fn((..._args: unknown[]) => 'test L3 prompt'),
}))

vi.mock('@/features/pipeline/helpers/chunkSegments', () => ({
  chunkSegments: vi.fn((segs: unknown[]) => {
    if (!segs || (segs as unknown[]).length === 0) return []
    return [{ chunkIndex: 0, segments: segs, totalChars: 20 }]
  }),
}))

// ── Constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

const mockFile = { id: VALID_FILE_ID, status: 'l2_completed' }
const mockProject = {
  name: 'Test Project',
  description: null,
  sourceLang: 'en',
  targetLangs: ['th'],
  processingMode: 'thorough',
}

function buildL3FbResult(overrides?: Record<string, unknown>) {
  return {
    data: {
      output: {
        findings: [] as Record<string, unknown>[],
        reasoning: 'No issues found',
        summary: 'Clean',
      },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      text: '',
      finishReason: 'stop' as const,
    },
    modelUsed: 'claude-sonnet-4-5-20250929',
    fallbackUsed: false,
    attemptsLog: [],
    ...overrides,
  }
}

/**
 * L3 DB call order:
 *   0: CAS guard (update files → l3_processing)
 *   1: segments query
 *   2: prior findings (all layers)
 *   3: l2SegmentStats (grouped by segment)
 *   4: languagePairConfigs query
 *   5: glossary terms (with join)
 *   6: taxonomy definitions
 *   7: project query
 *   8: tx delete L3 findings
 *   9: status update (l3_completed)
 */
function buildL3DbState() {
  return [
    [mockFile], // 0: CAS guard
    [buildSegmentRow()], // 1: segments
    [], // 2: prior findings
    [{ segmentId: DEFAULT_SEGMENT_ID, maxConfidence: 60, findingCount: 1 }], // 3: l2Stats — flag our segment
    [], // 4: languagePairConfigs
    [], // 5: glossary
    [], // 6: taxonomy
    [mockProject], // 7: project
    [], // 8: tx delete
    [], // 9: status update
  ]
}

describe('runL3ForFile — fallback chain (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []

    mockGetModelForLayerWithFallback.mockResolvedValue({
      primary: 'claude-sonnet-4-5-20250929',
      fallbacks: ['gpt-4o'],
    })

    mockCheckProjectBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
    mockCallWithFallback.mockResolvedValue(buildL3FbResult())

    dbState.returnValues = buildL3DbState()
  })

  it('[P0] should use callWithFallback for L3 chunk processing', async () => {
    const { runL3ForFile } = await import('./runL3ForFile')

    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCallWithFallback).toHaveBeenCalled()
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('[P0] should pass L3 fallback chain (claude-sonnet -> gpt-4o)', async () => {
    const { runL3ForFile } = await import('./runL3ForFile')

    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCallWithFallback).toHaveBeenCalledWith(
      { primary: 'claude-sonnet-4-5-20250929', fallbacks: ['gpt-4o'] },
      expect.any(Function),
    )
  })

  it('[P0] should store actual fallback model in finding aiModel field', async () => {
    const { runL3ForFile } = await import('./runL3ForFile')

    mockCallWithFallback.mockResolvedValue(
      buildL3FbResult({
        data: {
          output: {
            findings: [
              {
                segmentId: DEFAULT_SEGMENT_ID,
                category: 'fluency',
                severity: 'minor',
                confidence: 75,
                description: 'Awkward phrasing detected',
                suggestedFix: 'Consider rephrasing',
                rationale: 'The phrase structure is unnatural',
              },
            ],
            reasoning: 'Found fluency issue',
            summary: '1 issue',
          },
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          text: '',
          finishReason: 'stop' as const,
        },
        modelUsed: 'gpt-4o',
        fallbackUsed: true,
      }),
    )

    // Extra slot for tx insert
    const state = buildL3DbState()
    state.splice(9, 0, []) // insert slot for tx insert before status update
    dbState.returnValues = state

    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const insertedFindings = dbState.valuesCaptures?.flat() ?? []
    const findingWithModel = insertedFindings.find(
      (f: unknown) => (f as { aiModel?: string }).aiModel !== undefined,
    )
    expect(findingWithModel).toBeDefined()
    expect((findingWithModel as { aiModel: string }).aiModel).toBe('gpt-4o')
  })

  it('[P1] should write audit log on L3 fallback activation', async () => {
    const { runL3ForFile } = await import('./runL3ForFile')

    mockCallWithFallback.mockResolvedValue(
      buildL3FbResult({ modelUsed: 'gpt-4o', fallbackUsed: true }),
    )

    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ai_fallback_activated',
        entityType: 'file',
        entityId: VALID_FILE_ID,
        newValue: expect.objectContaining({
          originalModel: 'claude-sonnet-4-5-20250929',
          layer: 'L3',
        }),
      }),
    )
  })

  it('[P0] should include fallbackUsed in L3Result', async () => {
    const { runL3ForFile } = await import('./runL3ForFile')

    mockCallWithFallback.mockResolvedValue(
      buildL3FbResult({ modelUsed: 'gpt-4o', fallbackUsed: true }),
    )

    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result).toHaveProperty('fallbackUsed', true)
  })
})
