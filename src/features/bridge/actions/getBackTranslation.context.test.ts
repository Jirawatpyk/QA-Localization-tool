/**
 * ATDD Story 5.3 — AC2: BT Context Segments (TD-BT-001)
 *
 * Tests that getBackTranslation queries adjacent segments (+/- 2)
 * and passes them as contextSegments to buildBTPrompt.
 *
 * Tests implemented and active (GREEN phase).
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
  between: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
}))

// Mock AI/cache dependencies
const mockGenerateText = vi.fn()
const mockCheckProjectBudget = vi.fn()
const mockLogAIUsage = vi.fn()
const mockEstimateCost = vi.fn()
const mockGetCachedBT = vi.fn()
const mockCacheBT = vi.fn()
const mockComputeHash = vi.fn()
const mockBuildBTPrompt = vi.fn((_input?: unknown) => ({
  system: 'system prompt',
  user: 'user prompt',
}))

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
  buildBTPrompt: (input: unknown) => mockBuildBTPrompt(input),
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
  // DB call order: 1) segment query, 2) project query (btConfidenceThreshold), 3) adjacent segments
  dbState.returnValues = [
    // Call 0: Segment query (self)
    [
      {
        id: 'seg-3',
        sourceText: 'Hello',
        targetText: 'สวัสดี',
        sourceLang: 'en-US',
        targetLang: 'th-TH',
        fileId: 'file-1',
        segmentNumber: 3,
      },
    ],
    // Call 1: Project query (btConfidenceThreshold)
    [{ btConfidenceThreshold: 0.6 }],
    // Call 2: Adjacent segments query (+/- 2)
    [
      { sourceText: 'Good morning', targetText: 'สวัสดีตอนเช้า', segmentNumber: 1 },
      { sourceText: 'How are you', targetText: 'สบายดีไหม', segmentNumber: 2 },
      { sourceText: 'Goodbye', targetText: 'ลาก่อน', segmentNumber: 4 },
      { sourceText: 'See you', targetText: 'แล้วเจอกัน', segmentNumber: 5 },
    ],
  ]
  mockComputeHash.mockResolvedValue('abc123')
  mockGetCachedBT.mockResolvedValue(null)
  mockCheckProjectBudget.mockResolvedValue({ hasQuota: true, remainingBudgetUsd: 100 })
  mockGenerateText.mockResolvedValue({ output: MOCK_BT_RESULT, usage: MOCK_USAGE })
  mockEstimateCost.mockReturnValue(0.0001)
  mockLogAIUsage.mockResolvedValue(undefined)
  mockCacheBT.mockResolvedValue(undefined)
}

describe('getBackTranslation — AC2: Context Segments (TD-BT-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    setupDefaultMocks()
  })

  // ── AC2 / Scenario 2.1 [P1]: Middle segment → 4 context segments ──────
  it('should query adjacent segments (segmentNumber +/- 2) and pass to buildBTPrompt', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    // Verify buildBTPrompt received 4 context segments
    expect(mockBuildBTPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        contextSegments: expect.arrayContaining([
          expect.objectContaining({ segmentNumber: 1 }),
          expect.objectContaining({ segmentNumber: 2 }),
          expect.objectContaining({ segmentNumber: 4 }),
          expect.objectContaining({ segmentNumber: 5 }),
        ]),
      }),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockBuildBTPrompt.mock.calls[0] as any)[0].contextSegments).toHaveLength(4)
  })

  // ── AC2 / Scenario 2.2 [P1]: withTenant on adjacent query ─────────────
  it('should use withTenant on adjacent segments query (Guardrail #1)', async () => {
    const { getBackTranslation } = await import('./getBackTranslation.action')
    await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    // withTenant called for: segment query, adjacent query, project query = 3 times
    expect(mockWithTenant).toHaveBeenCalledTimes(3)
  })

  // ── AC2 / Boundary [P1]: First segment → only following segments ──────
  it('should return only 2 following segments when current is segment #1 (first)', async () => {
    dbState.returnValues = [
      [
        {
          id: 'seg-1',
          sourceText: 'Hello',
          targetText: 'สวัสดี',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          fileId: 'file-1',
          segmentNumber: 1,
        },
      ],
      [{ btConfidenceThreshold: 0.6 }],
      // Adjacent: only segments 2 and 3 (no negative segment numbers)
      [
        { sourceText: 'How are you', targetText: 'สบายดีไหม', segmentNumber: 2 },
        { sourceText: 'Goodbye', targetText: 'ลาก่อน', segmentNumber: 3 },
      ],
    ]

    const { getBackTranslation } = await import('./getBackTranslation.action')
    await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(mockBuildBTPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        contextSegments: expect.arrayContaining([
          expect.objectContaining({ segmentNumber: 2 }),
          expect.objectContaining({ segmentNumber: 3 }),
        ]),
      }),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockBuildBTPrompt.mock.calls[0] as any)[0].contextSegments).toHaveLength(2)
  })

  // ── AC2 / Boundary [P1]: Single-segment file → empty context ──────────
  it('should pass empty contextSegments for single-segment file', async () => {
    dbState.returnValues = [
      [
        {
          id: 'seg-only',
          sourceText: 'Only segment',
          targetText: 'เซ็กเมนต์เดียว',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          fileId: 'file-1',
          segmentNumber: 1,
        },
      ],
      [{ btConfidenceThreshold: 0.6 }],
      // No adjacent segments
      [],
    ]

    const { getBackTranslation } = await import('./getBackTranslation.action')
    await getBackTranslation({
      segmentId: '11111111-1111-4111-a111-111111111111',
      projectId: '22222222-2222-4222-a222-222222222222',
    })

    expect(mockBuildBTPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        contextSegments: [],
      }),
    )
  })
})
