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
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  const { mocks, modules } = createAIMock({ layer: 'L2' })
  const mockAiL2Limit = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, limit: 100, remaining: 99, reset: 0 }),
  )
  return { mocks, modules, dbState, dbMockModule, mockAiL2Limit }
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

    // CAS(0), segments(1), l1Findings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

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
    // CAS(0), segments(1), l1Findings(2), txDelete(3), statusUpdate(4)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    // CAS + segments + l1Findings + findings delete + status update = 5
    expect(vi.mocked(withTenant).mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  // ── P1: AI + Chunking ──

  it('should call generateText with L2 model', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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

    // CAS(0), segments(1), l1Findings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [seg1, seg2], [], [], [], []]

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

    dbState.returnValues = [[mockFile], [buildSegmentRow()], []]

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

    // CAS(0), segments(1), l1Findings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

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

    // CAS(0), segments(1), l1Findings(2), txDelete(3), txInsert(4), statusUpdate(5)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)
    // Transaction: delete + insert consumed 2 slots
    expect(dbState.callIndex).toBe(6)
  })

  // ── P2: Edge cases ──

  it('should handle zero findings from AI', async () => {
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], []]

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

    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

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
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], []]

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
