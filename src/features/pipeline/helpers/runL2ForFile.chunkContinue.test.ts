import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL2Response, buildSegmentRow, BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'

// ── Hoisted mocks ──
const {
  mocks: {
    mockGenerateText,
    mockClassifyAIError,
    mockCheckProjectBudget,
    mockWriteAuditLog,
    mockLogAIUsage,
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

describe('runL2ForFile — chunk N fails, N+1 continues (P1-10, Chaos #1)', () => {
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

  it('[P1] should continue processing chunks 1 and 3 when chunk 2 fails', async () => {
    // 3 chunks: seg1 (large, chunk 0), seg2 (large, chunk 1 — fails), seg3 (small, chunk 2)
    const seg1Id = faker.string.uuid()
    const seg2Id = faker.string.uuid()
    const seg3Id = faker.string.uuid()

    const seg1 = buildSegmentRow({
      id: seg1Id,
      sourceText: 'a'.repeat(20000),
      targetText: 'b'.repeat(11000),
      segmentNumber: 1,
    })
    const seg2 = buildSegmentRow({
      id: seg2Id,
      sourceText: 'c'.repeat(20000),
      targetText: 'd'.repeat(11000),
      segmentNumber: 2,
    })
    const seg3 = buildSegmentRow({
      id: seg3Id,
      sourceText: 'e'.repeat(100),
      targetText: 'f'.repeat(100),
      segmentNumber: 3,
    })

    // Chunk 0 succeeds, chunk 1 fails (schema_mismatch), chunk 2 succeeds
    mockGenerateText
      .mockResolvedValueOnce(buildL2Response([{ segmentId: seg1Id }]))
      .mockRejectedValueOnce(new Error('schema mismatch'))
      .mockResolvedValueOnce(buildL2Response([{ segmentId: seg3Id }]))

    mockClassifyAIError.mockReturnValue('schema_mismatch')

    // CAS(0), segments(1), l1(2), glossary(3), taxonomy(4), project(5), txDel(6), txIns(7), statusUp(8)
    dbState.returnValues = [[mockFile], [seg1, seg2, seg3], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Chunks 0 and 2 succeed, chunk 1 fails
    expect(result.chunksSucceeded).toBe(2)
    expect(result.chunksFailed).toBe(1)
    expect(result.findingCount).toBe(2) // 1 from chunk 0 + 1 from chunk 2
    expect(result.partialFailure).toBe(true)
  })

  it('[P1] should set partialFailure=true when any chunk fails', async () => {
    const seg1 = buildSegmentRow({
      id: faker.string.uuid(),
      sourceText: 'a'.repeat(20000),
      targetText: 'b'.repeat(11000),
    })
    const seg2Id = faker.string.uuid()
    const seg2 = buildSegmentRow({
      id: seg2Id,
      sourceText: 'c'.repeat(100),
      targetText: 'd'.repeat(100),
    })

    // First chunk fails, second succeeds
    mockGenerateText
      .mockRejectedValueOnce(new Error('content filter'))
      .mockResolvedValueOnce(buildL2Response([{ segmentId: seg2Id }]))

    mockClassifyAIError.mockReturnValue('content_filter')

    dbState.returnValues = [[mockFile], [seg1, seg2], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.partialFailure).toBe(true)
    expect(result.chunksFailed).toBeGreaterThan(0)
  })

  it('[P1] should log failed chunk with error details', async () => {
    const seg1 = buildSegmentRow({
      id: faker.string.uuid(),
      sourceText: 'a'.repeat(20000),
      targetText: 'b'.repeat(11000),
    })
    const seg2 = buildSegmentRow({
      id: faker.string.uuid(),
      sourceText: 'c'.repeat(100),
      targetText: 'd'.repeat(100),
    })

    const errorMsg = 'AI content filter triggered'
    mockGenerateText
      .mockRejectedValueOnce(new Error(errorMsg))
      .mockResolvedValueOnce(buildL2Response())

    mockClassifyAIError.mockReturnValue('content_filter')

    dbState.returnValues = [[mockFile], [seg1, seg2], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Failed chunk should be logged with status 'error'
    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        chunkIndex: 0,
        inputTokens: 0,
        outputTokens: 0,
      }),
    )

    // Logger should record the chunk error with details
    const { logger } = modules.logger as { logger: { error: ReturnType<typeof vi.fn> } }
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        fileId: VALID_FILE_ID,
        chunkIndex: 0,
      }),
      expect.stringContaining('chunk failed'),
    )
  })
})
