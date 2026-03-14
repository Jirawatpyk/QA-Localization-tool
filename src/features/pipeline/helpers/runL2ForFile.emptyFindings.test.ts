import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL2Response, buildSegmentRow, BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'

// ── Hoisted mocks ──
const {
  mocks: {
    mockGenerateText,
    mockClassifyAIError,
    mockCheckProjectBudget,
    mockWriteAuditLog,
    mockAggregateUsage,
    mockGetModelForLayerWithFallback,
  },
  modules,
  dbState,
  dbMockModule,
  mockAiL2Limit,
  mockBuildL2Prompt,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  const { mocks, modules } = createAIMock({ layer: 'L2' })
  const mockAiL2Limit = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 100, remaining: 99, reset: 0 }),
  )
  const mockBuildL2Prompt = vi.fn((..._args: unknown[]) => 'mocked L2 prompt')
  return { mocks, modules, dbState, dbMockModule, mockAiL2Limit, mockBuildL2Prompt }
})

// ── Module mocks ──

vi.mock('ai', () => modules.ai)
vi.mock('@/lib/ai/client', () => modules.aiClient)
vi.mock('@/lib/ai/costs', () => modules.aiCosts)
vi.mock('@/lib/ai/errors', () => modules.aiErrors)
vi.mock('@/lib/ai/fallbackRunner', () => modules.aiFallbackRunner)
vi.mock('@/lib/ai/budget', () => modules.aiBudget)
vi.mock('@/lib/ai/types', () => modules.aiTypes)
vi.mock('@/lib/ai/providers', () => modules.aiProviders)
vi.mock('@/features/audit/actions/writeAuditLog', () => modules.audit)
vi.mock('@/lib/logger', () => modules.logger)
vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/lib/ratelimit', () => ({
  aiL2ProjectLimiter: { limit: (...args: unknown[]) => mockAiL2Limit(...args) },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: { id: 'id', tenantId: 'tenant_id', status: 'status', projectId: 'project_id' },
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
vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    segmentId: 'segment_id',
    projectId: 'project_id',
    detectedByLayer: 'detected_by_layer',
    category: 'category',
    severity: 'severity',
    description: 'description',
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
vi.mock('@/features/pipeline/prompts/build-l2-prompt', () => ({
  buildL2Prompt: (...args: unknown[]) => mockBuildL2Prompt(...args),
}))

// ── Test constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

const mockFile = {
  id: VALID_FILE_ID,
  projectId: VALID_PROJECT_ID,
  tenantId: VALID_TENANT_ID,
  status: 'l2_processing',
}

const mockProject = {
  name: 'Test Project',
  description: null,
  sourceLang: 'en',
  targetLangs: ['th'],
  processingMode: 'economy',
}

describe('runL2ForFile — suspicious zero findings (P1-14, R3-034)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    mockGenerateText.mockResolvedValue(buildL2Response())
    mockCheckProjectBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
    mockAiL2Limit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 })
    mockClassifyAIError.mockReturnValue('unknown')
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockBuildL2Prompt.mockReturnValue('mocked L2 prompt')
    mockAggregateUsage.mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.001,
    })
    mockGetModelForLayerWithFallback.mockResolvedValue({
      primary: 'gpt-4o-mini',
      fallbacks: [],
    })
  })

  it('[P1] should return findingCount=0 when AI returns zero findings', async () => {
    // AI returns empty findings array
    mockGenerateText.mockResolvedValue(buildL2Response([]))

    // CAS(0), segments(1), l1(2), glossary(3), taxonomy(4), project(5), txDel(6), statusUp(7)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
    expect(result.partialFailure).toBe(false)
    // Zero findings is logged in audit with findingCount: 0
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file.l2_completed',
        newValue: expect.objectContaining({
          findingCount: 0,
        }),
      }),
    )
  })

  it('[P1] should not emit suspicious-zero warning when AI returns 1+ findings', async () => {
    // AI returns findings
    mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: VALID_SEGMENT_ID }]))

    // CAS(0), segments(1), l1(2), glossary(3), taxonomy(4), project(5), txDel(6), txIns(7), statusUp(8)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)

    // Verify no 'suspicious-zero' log — logger.warn should not be called with that context
    const { logger } = modules.logger as { logger: { warn: ReturnType<typeof vi.fn> } }
    const warnCalls = logger.warn.mock.calls as Array<[Record<string, unknown>, string]>
    const suspiciousZeroCalls = warnCalls.filter(
      (call) => typeof call[1] === 'string' && call[1].toLowerCase().includes('suspicious'),
    )
    expect(suspiciousZeroCalls).toHaveLength(0)
  })
})
