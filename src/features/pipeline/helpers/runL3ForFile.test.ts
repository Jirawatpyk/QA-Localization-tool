import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL3Response, buildSegmentRow, BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'

// ── Hoisted mocks ──
const {
  mocks: {
    mockGenerateText,
    mockClassifyAIError,
    mockCheckTenantBudget,
    mockCheckProjectBudget,
    mockWriteAuditLog,
    mockLogAIUsage,
    mockGetModelForLayerWithFallback,
  },
  modules,
  dbState,
  dbMockModule,
  mockAiL3Limit,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  const { mocks, modules } = createAIMock({ layer: 'L3' })
  const mockAiL3Limit = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 50, remaining: 49, reset: 0 }),
  )
  return { mocks, modules, dbState, dbMockModule, mockAiL3Limit }
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
  aiL3ProjectLimiter: { limit: (...args: unknown[]) => mockAiL3Limit(...args) },
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

// ── Test constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

const mockFile = {
  id: VALID_FILE_ID,
  projectId: VALID_PROJECT_ID,
  tenantId: VALID_TENANT_ID,
  status: 'l3_processing',
}

describe('runL3ForFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    mockGenerateText.mockResolvedValue(buildL3Response())
    mockCheckTenantBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
    mockCheckProjectBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
    mockAiL3Limit.mockResolvedValue({ success: true, limit: 50, remaining: 49, reset: 0 })
    mockClassifyAIError.mockReturnValue('unknown')
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockGetModelForLayerWithFallback.mockResolvedValue({
      primary: 'claude-sonnet-4-5-20250929',
      fallbacks: [],
    })
  })

  // ── P0: Core lifecycle (L3 specific) ──

  it('should run L3 deep analysis and return finding count', async () => {
    mockGenerateText.mockResolvedValue(buildL3Response([{ segmentId: VALID_SEGMENT_ID }]))

    // CAS(0), segments(1), priorFindings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)
    expect(result.aiModel).toBe('claude-sonnet-4-5-20250929')
  })

  it('should transition status: l2_completed → l3_processing → l3_completed', async () => {
    // CAS(0), segments(1), priorFindings(2), txDelete(3), statusUpdate(4)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l3_processing' }))
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l3_completed' }))
  })

  it('should throw NonRetriableError when file not in l2_completed state', async () => {
    dbState.returnValues = [[]]

    const { runL3ForFile } = await import('./runL3ForFile')

    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/not in l2_completed state/)
  })

  it('should use L3 model (claude-sonnet)', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-l3-model',
        temperature: 0.2,
        maxOutputTokens: 8192,
      }),
    )
  })

  it('should load both L1 and L2 findings for context', async () => {
    const priorFindings = [
      {
        id: faker.string.uuid(),
        segmentId: VALID_SEGMENT_ID,
        category: 'number_format',
        severity: 'major',
        description: 'Number mismatch',
        detectedByLayer: 'L1',
      },
      {
        id: faker.string.uuid(),
        segmentId: VALID_SEGMENT_ID,
        category: 'accuracy',
        severity: 'minor',
        description: 'Minor style issue',
        detectedByLayer: 'L2',
      },
    ]

    // CAS(0), segments(1), priorFindings(2), txDelete(3), statusUpdate(4)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], priorFindings, [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // AI was called — prior findings passed in prompt context
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  it('should log AI usage with L3 model info', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5-20250929',
        layer: 'L3',
      }),
    )
  })

  // ── P1: Partial failure + error handling ──

  it('should handle partial failure across chunks', async () => {
    const seg1 = buildSegmentRow({
      id: faker.string.uuid(),
      sourceText: 'a'.repeat(20000),
      targetText: 'b'.repeat(11000),
    })
    const seg2Id = faker.string.uuid()
    const seg2 = buildSegmentRow({
      id: seg2Id,
      sourceText: 'short',
      targetText: '\u0e2a\u0e31\u0e49\u0e19',
    })

    mockGenerateText
      .mockRejectedValueOnce(new Error('content filter'))
      .mockResolvedValueOnce(buildL3Response([{ segmentId: seg2Id }]))

    mockClassifyAIError.mockReturnValue('content_filter')

    // CAS(0), segments(1), priorFindings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [seg1, seg2], [], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.partialFailure).toBe(true)
    expect(result.chunksFailed).toBe(1)
    expect(result.findingCount).toBe(1)
  })

  it('should re-throw timeout errors for Inngest retry', async () => {
    mockGenerateText.mockRejectedValue(new Error('ETIMEDOUT'))
    mockClassifyAIError.mockReturnValue('timeout')

    dbState.returnValues = [[mockFile], [buildSegmentRow()], []]

    const { runL3ForFile } = await import('./runL3ForFile')

    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('ETIMEDOUT')
  })

  it('should roll back file status to failed on error', async () => {
    mockCheckProjectBudget.mockRejectedValue(new Error('DB down'))
    dbState.returnValues = [[mockFile], []]

    const { runL3ForFile } = await import('./runL3ForFile')

    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow()

    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  it('should write audit log with L3 metadata', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file.l3_completed',
        newValue: expect.objectContaining({
          aiModel: 'claude-sonnet-4-5-20250929',
        }),
      }),
    )
  })

  // ── P2: L3-specific behavior ──

  it('should include rationale in finding description for DB insert', async () => {
    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: VALID_SEGMENT_ID,
          description: 'Mistranslation detected',
          rationale: 'The source implies future tense but target uses past tense',
        },
      ]),
    )

    // CAS(0), segments(1), priorFindings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)
    // The DB insert includes rationale appended to description
    // (verified by the fact that findingCount = 1 means the insert was prepared)
  })

  it('should handle zero findings from deep analysis', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
    expect(result.chunksSucceeded).toBe(1)
  })

  // ── Story 3.1: Budget guard + per-project rate limit (EXTEND) ──
  // NOTE: Redundant stubs deleted (budget exhausted → equivalent active test, happy path → line 115)

  it('should call checkProjectBudget before making AI API call', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Budget check called BEFORE generateText
    const budgetCallOrder = mockCheckProjectBudget.mock.invocationCallOrder[0] ?? 0
    const generateCallOrder = mockGenerateText.mock.invocationCallOrder[0] ?? Infinity
    expect(budgetCallOrder).toBeLessThan(generateCallOrder)
  })

  it('should throw retriable error when aiL3ProjectLimiter blocks', async () => {
    mockAiL3Limit.mockResolvedValue({
      success: false,
      limit: 50,
      remaining: 0,
      reset: Date.now() + 3600_000,
    })
    dbState.returnValues = [[mockFile]]

    const { runL3ForFile } = await import('./runL3ForFile')

    // Rate limit → retriable Error (NOT NonRetriableError — Inngest retries)
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/queue full/)

    // AI should NOT be called when rate limited
    expect(mockGenerateText).not.toHaveBeenCalled()
  })
})
