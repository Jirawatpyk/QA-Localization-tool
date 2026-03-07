/** Story 3.4 ATDD — L2 fallback chain wiring */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { buildSegmentRow, BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'

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
  mockAiL2Limit,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  const { mocks, modules } = createAIMock({ layer: 'L2' })

  const mockCallWithFallback = vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      data: {
        output: { findings: [] as Record<string, unknown>[], summary: 'No issues' },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        text: '',
        finishReason: 'stop' as const,
      },
      modelUsed: 'gpt-4o-mini',
      fallbackUsed: false,
      attemptsLog: [],
    }),
  )

  const mockAiL2Limit = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 50, remaining: 49, reset: 0 }),
  )

  return { mocks, modules, dbState, dbMockModule, mockCallWithFallback, mockAiL2Limit }
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
  aiL2ProjectLimiter: { limit: (...args: unknown[]) => mockAiL2Limit(...args) },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
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

vi.mock('@/features/pipeline/prompts/build-l2-prompt', () => ({
  buildL2Prompt: vi.fn((..._args: unknown[]) => 'test L2 prompt'),
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
// DEFAULT_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a' (from buildSegmentRow default)

const mockFile = { id: VALID_FILE_ID, status: 'l1_completed' }
const mockProject = {
  name: 'Test Project',
  description: null,
  sourceLang: 'en',
  targetLangs: ['th'],
  processingMode: 'economy',
}

function buildFbResult(overrides?: Record<string, unknown>) {
  return {
    data: {
      output: { findings: [] as Record<string, unknown>[], summary: 'No issues' },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      text: '',
      finishReason: 'stop' as const,
    },
    modelUsed: 'gpt-4o-mini',
    fallbackUsed: false,
    attemptsLog: [],
    ...overrides,
  }
}

describe('runL2ForFile — fallback chain (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []

    mockGetModelForLayerWithFallback.mockResolvedValue({
      primary: 'gpt-4o-mini',
      fallbacks: ['gemini-2.0-flash'],
    })

    mockCheckProjectBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
    mockCallWithFallback.mockResolvedValue(buildFbResult())

    // DB call order: CAS(0), segments(1), L1findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), statusUpdate(7)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]
  })

  it('[P0] should use callWithFallback instead of direct generateText call', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCallWithFallback).toHaveBeenCalled()
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  it('[P0] should pass correct fallback chain from getModelForLayerWithFallback', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCallWithFallback).toHaveBeenCalledWith(
      { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] },
      expect.any(Function),
    )
  })

  it('[P0] should use fbResult.modelUsed for cost tracking (not primary model)', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    mockCallWithFallback.mockResolvedValue(
      buildFbResult({ modelUsed: 'gemini-2.0-flash', fallbackUsed: true }),
    )

    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.0-flash' }),
    )
  })

  it('[P1] should write audit log when fallback is activated', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    mockCallWithFallback.mockResolvedValue(
      buildFbResult({ modelUsed: 'gemini-2.0-flash', fallbackUsed: true }),
    )

    await runL2ForFile({
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
          originalModel: 'gpt-4o-mini',
          layer: 'L2',
        }),
      }),
    )
  })

  it('[P0] should store actual model in finding aiModel field', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    const segmentId = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a' // matches buildSegmentRow()

    mockCallWithFallback.mockResolvedValue(
      buildFbResult({
        data: {
          output: {
            findings: [
              {
                segmentId,
                category: 'accuracy',
                severity: 'major',
                confidence: 85,
                description: 'Mistranslation found',
                suggestion: null,
              },
            ],
            summary: '1 issue',
          },
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          text: '',
          finishReason: 'stop' as const,
        },
        modelUsed: 'gemini-2.0-flash',
        fallbackUsed: true,
      }),
    )

    // Extra slot for tx insert
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    await runL2ForFile({
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
    expect((findingWithModel as { aiModel: string }).aiModel).toBe('gemini-2.0-flash')
  })

  it('[P0] should include fallbackUsed in L2Result', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    mockCallWithFallback.mockResolvedValue(
      buildFbResult({ modelUsed: 'gemini-2.0-flash', fallbackUsed: true }),
    )

    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result).toHaveProperty('fallbackUsed', true)
  })

  it('[P1] should not contain stale "fallback chain available (not yet consumed)" log line', async () => {
    const { runL2ForFile } = await import('./runL2ForFile')

    const loggerModule = modules.logger as { logger: { info: ReturnType<typeof vi.fn> } }

    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const allInfoCalls = loggerModule.logger.info.mock.calls
    const staleLogCall = allInfoCalls.find((args: unknown[]) => {
      const msg = typeof args[1] === 'string' ? args[1] : ''
      return msg.includes('fallback chain available (not yet consumed)')
    })

    expect(staleLogCall).toBeUndefined()
  })
})
