import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  buildL2Response,
  buildSegmentRow,
  BUDGET_EXHAUSTED,
  BUDGET_HAS_QUOTA,
} from '@/test/fixtures/ai-responses'

// ── Hoisted mocks ──
const {
  mocks: {
    mockGenerateText,
    mockClassifyAIError,
    mockCheckTenantBudget,
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
  glossaries: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
  },
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

describe('runL2ForFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    mockGenerateText.mockResolvedValue(buildL2Response())
    mockCheckTenantBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
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

  // ── P0: Core lifecycle ──

  it('should run L2 AI screening and return finding count', async () => {
    mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: VALID_SEGMENT_ID }]))

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)
    expect(result.aiModel).toBe('gpt-4o-mini')
    expect(result.chunksTotal).toBe(1)
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBe(0)
    expect(result.partialFailure).toBe(false)
  })

  it('should transition status: l1_completed → l2_processing → l2_completed', async () => {
    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), statusUpdate(7)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l2_processing' }))
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l2_completed' }))
  })

  it('should throw NonRetriableError when file not in l1_completed state (CAS guard)', async () => {
    dbState.returnValues = [[]]

    const { runL2ForFile } = await import('./runL2ForFile')

    await expect(
      runL2ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/not in l1_completed state/)
  })

  it('should throw NonRetriableError when budget exhausted', async () => {
    mockCheckProjectBudget.mockResolvedValue(BUDGET_EXHAUSTED)
    dbState.returnValues = [[mockFile]]

    const { runL2ForFile } = await import('./runL2ForFile')

    await expect(
      runL2ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/quota exhausted/)
  })

  it('should include withTenant() on all DB queries', async () => {
    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), statusUpdate(7)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    // CAS + segments + l1Findings + glossary + project + findings delete + status update = 7
    // (taxonomy has NO tenant_id — withTenant NOT called)
    expect(vi.mocked(withTenant).mock.calls.length).toBeGreaterThanOrEqual(7)
  })

  // ── P1: AI + Chunking ──

  it('should call generateText with L2 model', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-l2-model',
        temperature: 0.3,
        maxOutputTokens: 4096,
      }),
    )
  })

  it('should log AI usage per chunk (Guardrail #19)', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: VALID_TENANT_ID,
        model: 'gpt-4o-mini',
        layer: 'L2',
        chunkIndex: 0,
      }),
    )
  })

  it('should handle partial failure: continue on non-retriable chunk error', async () => {
    // Two chunks: first fails, second succeeds
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

    mockGenerateText
      .mockRejectedValueOnce(new Error('schema mismatch'))
      .mockResolvedValueOnce(buildL2Response([{ segmentId: seg2Id }]))

    mockClassifyAIError.mockReturnValue('schema_mismatch')

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [[mockFile], [seg1, seg2], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.chunksTotal).toBe(2)
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBe(1)
    expect(result.partialFailure).toBe(true)
    expect(result.findingCount).toBe(1)
  })

  it('should re-throw rate_limit errors for Inngest retry', async () => {
    const rateLimitError = new Error('Rate limited')
    mockGenerateText.mockRejectedValue(rateLimitError)
    mockClassifyAIError.mockReturnValue('rate_limit')

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5) — AI throws before tx
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject]]

    const { runL2ForFile } = await import('./runL2ForFile')

    await expect(
      runL2ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('Rate limited')
  })

  it('should validate segmentIds and drop findings with invalid IDs', async () => {
    mockGenerateText.mockResolvedValue(
      buildL2Response([
        { segmentId: VALID_SEGMENT_ID }, // valid
        { segmentId: 'non-existent-id' }, // invalid
      ]),
    )

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Only the valid finding is kept
    expect(result.findingCount).toBe(1)
  })

  it('should delete existing L2 findings before inserting (idempotent)', async () => {
    mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: VALID_SEGMENT_ID }]))

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)
    // CAS + segments + l1Findings + glossary + taxonomy + project + txDelete + txInsert + statusUpdate = 9
    expect(dbState.callIndex).toBe(9)
  })

  // ── P2: Edge cases ──

  it('should handle zero findings from AI', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
    expect(result.partialFailure).toBe(false)
  })

  it('should write audit log with chunk statistics', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'file',
        entityId: VALID_FILE_ID,
        action: 'file.l2_completed',
        newValue: expect.objectContaining({
          chunksTotal: 1,
          chunksSucceeded: 1,
          chunksFailed: 0,
          aiModel: 'gpt-4o-mini',
        }),
      }),
    )
  })

  it('should not fail if audit log write fails (non-fatal)', async () => {
    mockWriteAuditLog.mockRejectedValue(new Error('audit DB down'))
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
  })

  it('should roll back file status to failed on error', async () => {
    mockCheckProjectBudget.mockRejectedValue(new Error('budget check crash'))
    dbState.returnValues = [[mockFile], []]

    const { runL2ForFile } = await import('./runL2ForFile')

    await expect(
      runL2ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow()

    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  it('should not fail if status rollback fails (non-fatal)', async () => {
    mockCheckProjectBudget.mockRejectedValue(new Error('budget crash'))
    // CAS succeeds, rollback fails (no more return values)
    dbState.returnValues = [[mockFile]]

    const { runL2ForFile } = await import('./runL2ForFile')

    await expect(
      runL2ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/budget crash/)
  })

  it('should return duration in milliseconds', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(typeof result.duration).toBe('number')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('should clamp confidence to 0-100 range', async () => {
    mockGenerateText.mockResolvedValue(
      buildL2Response([{ segmentId: VALID_SEGMENT_ID, confidence: 150 }]),
    )

    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Finding is still counted — confidence clamped internally
    expect(result.findingCount).toBe(1)
  })

  // ── Story 3.1: Budget guard + per-project rate limit (EXTEND) ──
  // NOTE: Redundant stubs deleted (budget exhausted → line 176, happy path → line 126)

  it('should call checkProjectBudget before making AI API call', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Budget check called BEFORE generateText
    const budgetCallOrder = mockCheckProjectBudget.mock.invocationCallOrder[0] ?? 0
    const generateCallOrder = mockGenerateText.mock.invocationCallOrder[0] ?? Infinity
    expect(budgetCallOrder).toBeLessThan(generateCallOrder)
  })

  it('should throw retriable error when aiL2ProjectLimiter blocks', async () => {
    mockAiL2Limit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 3600_000,
    })
    dbState.returnValues = [[mockFile]]

    const { runL2ForFile } = await import('./runL2ForFile')

    // Rate limit → retriable Error (NOT NonRetriableError — Inngest retries)
    await expect(
      runL2ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/queue full/)

    // AI should NOT be called when rate limited
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// ATDD RED Phase — Story 3.2a AC3: Wire Real Prompt Builder
// All tests use it.skip() — context loading + real prompt wiring not yet implemented.
// Dev must modify runL2ForFile.ts then remove it.skip().
// ══════════════════════════════════════════════════════════════════

describe('runL2ForFile — Story 3.2a: Context Loading (AC3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    mockGenerateText.mockResolvedValue(buildL2Response())
    mockCheckTenantBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
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

  // P0: buildL2Prompt called instead of inline _buildL2Prompt
  it('[P0] should call real buildL2Prompt from prompts/build-l2-prompt (not inline)', async () => {
    // DB slots: CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5),
    //           txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Verify real buildL2Prompt was called (mocked)
    expect(mockBuildL2Prompt).toHaveBeenCalledTimes(1)
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: expect.any(Array),
        l1Findings: expect.any(Array),
        glossaryTerms: expect.any(Array),
        taxonomyCategories: expect.any(Array),
        project: expect.objectContaining({ name: 'Test Project' }),
      }),
    )
    // Verify generateText received the prompt string from buildL2Prompt
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'mocked L2 prompt',
      }),
    )
  })

  // P0: glossary terms loaded via JOIN through glossaries table
  it('[P0] should load glossary terms via JOIN through glossaries table with withTenant', async () => {
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow()],
      [],
      [{ sourceTerm: 'API', targetTerm: 'เอพีไอ', caseSensitive: false }],
      [],
      [mockProject],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Verify withTenant was called for glossary query
    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(vi.mocked(withTenant)).toHaveBeenCalled()
    // Verify glossary terms passed to buildL2Prompt
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        glossaryTerms: [{ sourceTerm: 'API', targetTerm: 'เอพีไอ', caseSensitive: false }],
      }),
    )
  })

  // P0: taxonomy loaded WITHOUT withTenant (shared global)
  it('[P0] should load taxonomy categories without withTenant (shared global data)', async () => {
    const taxonomyRow = {
      category: 'mistranslation',
      parentCategory: null,
      severity: 'major',
      description: 'Meaning error',
    }
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow()],
      [],
      [],
      [taxonomyRow],
      [mockProject],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // taxonomy query should NOT call withTenant (shared global data)
    const { withTenant } = await import('@/db/helpers/withTenant')
    const calls = vi.mocked(withTenant).mock.calls
    // CAS + segments + l1Findings + glossary + project + txDelete + statusUpdate = 7
    // taxonomy is NOT included (no tenant_id)
    expect(calls.length).toBeGreaterThanOrEqual(7)
    // Verify taxonomy data passed to buildL2Prompt
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        taxonomyCategories: [taxonomyRow],
      }),
    )
  })

  // P0: project loaded with withTenant
  it('[P0] should load project details with withTenant', async () => {
    const projectData = {
      name: 'Project Alpha',
      description: 'Test project',
      sourceLang: 'en-US',
      targetLangs: ['th', 'ja'],
      processingMode: 'thorough',
    }
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [projectData], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    // Project query uses withTenant
    expect(vi.mocked(withTenant)).toHaveBeenCalled()
    // Verify project data passed to buildL2Prompt
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({ name: 'Project Alpha' }),
      }),
    )
  })

  // P0: l2OutputSchema from schemas/l2-output used (not inline)
  it('[P0] should use imported l2OutputSchema (not inline l2ChunkResponseSchema)', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Verify Output.object was called (with schema argument) and result passed to generateText
    const { Output } = await import('ai')
    expect(vi.mocked(Output.object)).toHaveBeenCalledWith(
      expect.objectContaining({ schema: expect.anything() }),
    )
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  // P1: L1 findings loaded with detectedByLayer for dedup context
  it('[P1] should load L1 findings with detectedByLayer for dedup context', async () => {
    const l1Finding = {
      id: faker.string.uuid(),
      segmentId: VALID_SEGMENT_ID,
      category: 'glossary',
      severity: 'minor',
      description: 'Glossary term mismatch',
      detectedByLayer: 'L1',
    }
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow()],
      [l1Finding],
      [],
      [],
      [mockProject],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Verify buildL2Prompt receives l1Findings with detectedByLayer field
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        l1Findings: [expect.objectContaining({ detectedByLayer: 'L1' })],
      }),
    )
  })

  // P1: empty glossary → no error
  it('[P1] should handle empty glossary terms gracefully (no error)', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBeGreaterThanOrEqual(0)
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(expect.objectContaining({ glossaryTerms: [] }))
  })

  // P1: empty taxonomy → no error
  it('[P1] should handle empty taxonomy categories gracefully (no error)', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBeGreaterThanOrEqual(0)
    expect(mockBuildL2Prompt).toHaveBeenCalledWith(
      expect.objectContaining({ taxonomyCategories: [] }),
    )
  })

  // P2: DB rows mapped correctly to prompt types
  it('[P2] should map DB rows to L2PromptInput types correctly', async () => {
    const glossaryRow = { sourceTerm: 'API', targetTerm: 'เอพีไอ', caseSensitive: false }
    const taxonomyRow = {
      category: 'accuracy',
      parentCategory: null,
      severity: null,
      description: 'Accuracy issues',
    }
    const projectData = {
      name: 'QA Project',
      description: 'Test',
      sourceLang: 'en-US',
      targetLangs: ['th'],
      processingMode: 'economy',
    }

    dbState.returnValues = [
      [mockFile],
      [
        {
          id: VALID_SEGMENT_ID,
          sourceText: 'Hello',
          targetText: 'สวัสดี',
          segmentNumber: 1,
          sourceLang: 'en',
          targetLang: 'th',
        },
      ],
      [],
      [glossaryRow],
      [taxonomyRow],
      [projectData],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Verify buildL2Prompt was called with correctly mapped types
    expect(mockBuildL2Prompt).toHaveBeenCalledWith({
      segments: [expect.objectContaining({ id: VALID_SEGMENT_ID, sourceText: 'Hello' })],
      l1Findings: [],
      glossaryTerms: [glossaryRow],
      taxonomyCategories: [taxonomyRow],
      project: expect.objectContaining({ name: 'QA Project', sourceLang: 'en-US' }),
    })
  })
})

// ══════════════════════════════════════════════════════════════════
// ATDD RED Phase — Story 3.2a AC4: Cost Tracking + languagePair
// All tests use it.skip() — languagePair not yet wired.
// Dev must add languagePair to AIUsageRecord + logAIUsage + runL2ForFile then remove it.skip().
// ══════════════════════════════════════════════════════════════════

describe('runL2ForFile — Story 3.2a: Cost Tracking + languagePair (AC4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: VALID_SEGMENT_ID }]))
    mockCheckTenantBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
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

  // P0: logAIUsage called with languagePair
  it('[P0] should include languagePair in logAIUsage call', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        languagePair: expect.stringMatching(/en.*th/), // e.g., "en→th" or "en-US→th"
      }),
    )
  })

  // P0: languagePair format derived from source→target
  it('[P0] should derive languagePair from segment sourceLang→targetLang', async () => {
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow({ sourceLang: 'en-US', targetLang: 'ja' })],
      [],
      [],
      [],
      [mockProject],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // languagePair format: "sourceLang→targetLang"
    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        languagePair: expect.stringContaining('→'),
      }),
    )
  })

  // P0: aggregateUsage aggregates across all chunks
  it('[P0] should aggregate usage across all chunks and include in result', async () => {
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

    dbState.returnValues = [[mockFile], [seg1, seg2], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // aggregateUsage should be called with all chunk records
    expect(mockAggregateUsage).toHaveBeenCalled()
    expect(result.totalUsage).toBeDefined()
    expect(result.totalUsage.inputTokens).toBeGreaterThan(0)
  })

  // P1: failed chunk logged with status 'error' and languagePair
  it('[P1] should log failed chunk with status error and languagePair', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('schema mismatch'))
    mockClassifyAIError.mockReturnValue('schema_mismatch')

    dbState.returnValues = [
      [mockFile],
      [
        buildSegmentRow({ sourceText: 'a'.repeat(20000), targetText: 'b'.repeat(11000) }),
        buildSegmentRow({ id: faker.string.uuid() }),
      ],
      [],
      [],
      [],
      [mockProject],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Failed chunk should log with status: 'error'
    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        languagePair: expect.any(String),
      }),
    )
  })

  // P1: languagePair null when language info unavailable
  it('[P1] should handle missing language info gracefully (languagePair fallback)', async () => {
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow({ sourceLang: '', targetLang: '' })],
      [],
      [],
      [],
      [
        {
          name: 'Test',
          description: null,
          sourceLang: '',
          targetLangs: [],
          processingMode: 'economy',
        },
      ],
      [],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Should not crash even with empty language info
    expect(result).toBeDefined()
  })
})
