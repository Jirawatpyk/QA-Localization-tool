/**
 * ATDD Story 5.1 — getBackTranslation Server Action unit tests
 *
 * Tests the main BT server action with proper mocking.
 * P0: model alias, structured output, cache hit/miss, budget check, usage logging
 * P1: fallback, dual logging, boundary values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbState, dbMockModule, mockRequireRole } = vi.hoisted(() => createActionTestMocks())

// Mock modules
vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
const mockWithTenant = vi.fn((_col: unknown, _id: unknown) => 'tenant-filter')
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (_col: unknown, _id: unknown) => mockWithTenant(_col, _id),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

// Mock AI/cache dependencies
const mockGenerateText = vi.fn()
const mockCheckProjectBudget = vi.fn()
const mockLogAIUsage = vi.fn()
const mockEstimateCost = vi.fn()
const mockGetCachedBT = vi.fn()
const mockCacheBT = vi.fn()
const mockComputeHash = vi.fn()

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  Output: { object: vi.fn(({ schema }: { schema: unknown }) => ({ type: 'object', schema })) },
}))
vi.mock('@/lib/ai/client', () => ({
  qaProvider: { languageModel: vi.fn((alias: string) => ({ modelId: alias })) },
}))
vi.mock('@/lib/ai/budget', () => ({
  checkProjectBudget: (...args: unknown[]) => mockCheckProjectBudget(...args),
}))
vi.mock('@/lib/ai/costs', () => ({
  logAIUsage: (...args: unknown[]) => mockLogAIUsage(...args),
  estimateCost: (...args: unknown[]) => mockEstimateCost(...args),
}))
vi.mock('@/features/bridge/helpers/btCache', () => ({
  getCachedBackTranslation: (...args: unknown[]) => mockGetCachedBT(...args),
  cacheBackTranslation: (...args: unknown[]) => mockCacheBT(...args),
  computeTargetTextHash: (...args: unknown[]) => mockComputeHash(...args),
}))
vi.mock('@/features/bridge/helpers/buildBTPrompt', () => ({
  buildBTPrompt: vi.fn(() => ({ system: 'system prompt', user: 'user prompt' })),
}))

const MOCK_BT_RESULT = {
  backTranslation: 'Hello',
  contextualExplanation: 'A greeting',
  confidence: 0.85,
  languageNotes: [],
  translationApproach: null,
}

const MOCK_USAGE = { inputTokens: 100, outputTokens: 50 }

function setupDefaultMocks() {
  dbState.returnValues = [
    // Segment query
    [
      {
        id: 'seg-1',
        sourceText: 'Hello',
        targetText: 'สวัสดี',
        sourceLang: 'en-US',
        targetLang: 'th-TH',
      },
    ],
    // Project query (btConfidenceThreshold)
    [{ btConfidenceThreshold: 0.6 }],
  ]
  mockComputeHash.mockResolvedValue('abc123')
  mockGetCachedBT.mockResolvedValue(null) // Cache miss by default
  mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })
  mockGenerateText.mockResolvedValue({ output: MOCK_BT_RESULT, usage: MOCK_USAGE })
  mockEstimateCost.mockReturnValue(0.0001)
  mockLogAIUsage.mockResolvedValue(undefined)
  mockCacheBT.mockResolvedValue(undefined)
}

describe('getBackTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    setupDefaultMocks()
  })

  // ── AC2 / Scenario 2.1 [P0]: Model alias + structured output ──────────
  it('should call generateText on cache miss (back-translation alias)', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockGenerateText).toHaveBeenCalledOnce()
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 4096 }),
    )
    // Verify withTenant called for both segment + project queries (Guardrail #1)
    expect(mockWithTenant).toHaveBeenCalledTimes(2)
  })

  // ── AC2 / Scenario 2.2 [P0]: Result shape ────────────────────────────
  it('should return BackTranslationOutput with all fields', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.backTranslation).toBe('Hello')
      expect(result.data.contextualExplanation).toBe('A greeting')
      expect(result.data.confidence).toBe(0.85)
      expect(result.data.languageNotes).toBeInstanceOf(Array)
      expect(result.data.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.data.cached).toBe(false)
    }
  })

  // ── AC2 / Scenario 2.3 [P0]: Cache hit → no AI call ──────────────────
  it('should return cached result without making AI call when cache hit', async () => {
    mockGetCachedBT.mockResolvedValue({
      ...MOCK_BT_RESULT,
      cached: true,
    })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cached).toBe(true)
    }
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  // ── AC2 / Scenario 2.4 [P0]: Cache miss → AI call → store ────────────
  it('should make AI call and cache result on cache miss', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cached).toBe(false)
    }
    expect(mockGenerateText).toHaveBeenCalledOnce()
    expect(mockCacheBT).toHaveBeenCalledOnce()
  })

  // ── AC2 / Scenario 2.13 [P2]: skipCache bypasses cache ───────────────
  it('should bypass cache when skipCache is true', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
      skipCache: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cached).toBe(false)
    }
    expect(mockGetCachedBT).not.toHaveBeenCalled()
    expect(mockGenerateText).toHaveBeenCalledOnce()
  })

  // ── AC6 / Scenario 6.1 [P0]: Budget exhausted → error ────────────────
  it('should return error when AI quota is exhausted', async () => {
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: false, remainingBudgetUsd: 0 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('quota')
    }
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  // ── AC6 / Scenario 6.1: Budget boundary — has quota ───────────────────
  it('should allow AI call when budget has quota', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockCheckProjectBudget).toHaveBeenCalled()
  })

  // ── AC6 / Scenario 6.2 [P0]: Log usage with layer 'BT' ──────────────
  it('should log AI usage with layer BT after generateText call', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({ layer: 'BT', inputTokens: 100, outputTokens: 50 }),
    )
  })

  // ── AC2 / Scenario 6.3 [P1]: Low-confidence fallback ─────────────────
  it('should fallback to claude-sonnet when confidence < threshold and budget allows', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.4 }, usage: MOCK_USAGE })
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.9 }, usage: MOCK_USAGE })
    // Two budget checks — both have quota
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    if (result.success) {
      expect(result.data.confidence).toBe(0.9)
    }
  })

  // ── AC4 / Confidence boundary: exactly at threshold → NO fallback ────
  it('should NOT fallback when confidence equals threshold (0.6)', async () => {
    mockGenerateText.mockResolvedValue({
      output: { ...MOCK_BT_RESULT, confidence: 0.6 },
      usage: MOCK_USAGE,
    })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockGenerateText).toHaveBeenCalledOnce() // No fallback
  })

  // ── Boundary: confidence 0.59 → fallback ─────────────────────────────
  it('should fallback when confidence is 0.59 (below threshold)', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.59 }, usage: MOCK_USAGE })
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.8 }, usage: MOCK_USAGE })
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockGenerateText).toHaveBeenCalledTimes(2) // Fallback triggered
  })

  // ── Fallback skipped when no budget ───────────────────────────────────
  it('should skip fallback when budget insufficient for claude-sonnet', async () => {
    mockGenerateText.mockResolvedValue({
      output: { ...MOCK_BT_RESULT, confidence: 0.4 },
      usage: MOCK_USAGE,
    })
    // First check has quota, second (for fallback) does not
    mockCheckProjectBudget
      .mockResolvedValueOnce({ hasQuota: true, remainingBudgetUsd: 100 })
      .mockResolvedValueOnce({ hasQuota: false, remainingBudgetUsd: 0 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    expect(mockGenerateText).toHaveBeenCalledOnce() // No fallback
  })

  // ── Dual logging ─────────────────────────────────────────────────────
  it('should log both primary and fallback AI calls separately', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.4 }, usage: MOCK_USAGE })
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.9 }, usage: MOCK_USAGE })
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(mockLogAIUsage).toHaveBeenCalledTimes(2)
  })

  // ── Auth check ───────────────────────────────────────────────────────
  it('should require qa_reviewer role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'))

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(false)
  })

  // ── Zod validation ───────────────────────────────────────────────────
  it('should reject invalid segmentId (not UUID)', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: 'not-a-uuid',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(false)
  })

  // ── H6: Segment NOT_FOUND error path ──────────────────────────────────
  it('should return NOT_FOUND when segment does not exist', async () => {
    dbState.returnValues = [
      [], // Segment query returns empty
      [{ btConfidenceThreshold: 0.6 }],
    ]

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.error).toContain('Segment not found')
    }
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  // ── H7: AI null output (AI_NO_OUTPUT) error path ─────────────────────
  it('should return AI_NO_OUTPUT when generateText returns null output', async () => {
    mockGenerateText.mockResolvedValue({ output: null, usage: MOCK_USAGE })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AI_NO_OUTPUT')
      expect(result.error).toContain('no structured output')
    }
  })

  // ── M5: Fallback returns LOWER confidence than primary → use primary ──
  it('should use primary result when fallback confidence is lower', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.4 }, usage: MOCK_USAGE })
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.3 }, usage: MOCK_USAGE })
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // Primary result used (0.4), not fallback (0.3)
      expect(result.data.confidence).toBe(0.4)
    }
    // Primary is cached (not fallback)
    expect(mockCacheBT).toHaveBeenCalledWith(
      expect.objectContaining({ modelVersion: 'gpt-4o-mini-bt-v1' }),
    )
  })

  // ── H3: Fallback generateText throws → primary result returned ─────────
  it('should return primary result when fallback generateText throws', async () => {
    const { logger } = await import('@/lib/logger')

    mockGenerateText
      .mockResolvedValueOnce({ output: { ...MOCK_BT_RESULT, confidence: 0.4 }, usage: MOCK_USAGE })
      .mockRejectedValueOnce(new Error('Fallback model unavailable'))
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })

    const { getBackTranslation } = await import('./getBackTranslation.action')
    const result = await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.confidence).toBe(0.4) // Primary result, not fallback
    }
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('fallback'),
    )
  })
})
