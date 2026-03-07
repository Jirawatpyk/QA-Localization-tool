/** Story 3.3 ATDD — AC1 Selective Filtering, AC2 Surrounding Context, AC4 Confirm/Contradict, AC7 Language Pair — GREEN PHASE */
import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL3Response, buildSegmentRow, BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'

// ── Hoisted mocks ──
const mockBuildL3Prompt = vi.fn((_input: unknown) => 'mock-l3-prompt')

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
vi.mock('@/lib/ai/fallbackRunner', () => modules.aiFallbackRunner)
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
  max: vi.fn((...args: unknown[]) => args),
  count: vi.fn(() => 'count'),
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
    aiConfidence: 'ai_confidence',
  },
}))
vi.mock('@/db/schema/languagePairConfigs', () => ({
  languagePairConfigs: {
    tenantId: 'tenant_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    l3ConfidenceMin: 'l3_confidence_min',
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
    glossaryId: 'glossary_id',
    sourceTerm: 'source_term',
    targetTerm: 'target_term',
    caseSensitive: 'case_sensitive',
  },
}))
vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: {
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
vi.mock('@/features/pipeline/prompts/build-l3-prompt', () => ({
  buildL3Prompt: (input: unknown) => mockBuildL3Prompt(input),
}))

// ── Test constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

const mockFile = {
  id: VALID_FILE_ID,
  projectId: VALID_PROJECT_ID,
  tenantId: VALID_TENANT_ID,
  status: 'l3_processing',
}

const defaultProject = {
  name: 'Test',
  description: null,
  sourceLang: 'en',
  targetLangs: ['th'],
  processingMode: 'thorough',
}

// DB call sequence (matches runL3ForFile.ts execution order):
// [0] CAS update (Step 1), [1] segments (Step 3), [2] priorFindings (Step 4),
// [3] l2Stats (Step 3b), [4] langConfig (Step 3c), [5] glossary (Step 4c),
// [6] taxonomy (Step 4d), [7] project (Step 4e), ...rest (tx + status updates)
function buildDbReturns(
  overrides: {
    file?: unknown[]
    segments?: unknown[]
    priorFindings?: unknown[]
    l2Stats?: unknown[]
    langConfig?: unknown[]
    glossary?: unknown[]
    taxonomy?: unknown[]
    project?: unknown[]
    rest?: unknown[][]
  } = {},
) {
  const defaultSegId = overrides.segments
    ? ((overrides.segments[0] as { id: string } | undefined)?.id ?? faker.string.uuid())
    : faker.string.uuid()
  return [
    overrides.file ?? [mockFile],
    overrides.segments ?? [buildSegmentRow({ id: defaultSegId })],
    overrides.priorFindings ?? [],
    overrides.l2Stats ?? [{ segmentId: defaultSegId, maxConfidence: 80, findingCount: 1 }],
    overrides.langConfig ?? [{ l3ConfidenceMin: 50 }],
    overrides.glossary ?? [],
    overrides.taxonomy ?? [],
    overrides.project ?? [defaultProject],
    ...(overrides.rest ?? [[], []]),
  ]
}

describe('runL3ForFile — Story 3.3: Selective Filtering & Context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
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
    mockBuildL3Prompt.mockReturnValue('mock-l3-prompt')
  })

  // ── AC1: Selective segment filtering ──

  it('[P0] U01: should include only segments with L2 findings in filtered set', async () => {
    const seg1Id = faker.string.uuid()
    const seg2Id = faker.string.uuid()
    const seg1 = buildSegmentRow({ id: seg1Id, segmentNumber: 1, sourceText: 'Hello world' })
    const seg2 = buildSegmentRow({ id: seg2Id, segmentNumber: 2, sourceText: 'Goodbye' })

    dbState.returnValues = buildDbReturns({
      segments: [seg1, seg2],
      l2Stats: [{ segmentId: seg1Id, maxConfidence: 80, findingCount: 1 }],
      rest: [[], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Shared prompt builder should receive only seg1 (the flagged segment)
    expect(mockBuildL3Prompt).toHaveBeenCalledTimes(1)
    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as { segments: { id: string }[] }
    const segmentIds = promptInput.segments.map((s) => s.id)
    expect(segmentIds).toContain(seg1Id)
    expect(segmentIds).not.toContain(seg2Id)
  })

  it('[P0] U02: should exclude segments without L2 findings from L3 processing', async () => {
    const seg1Id = faker.string.uuid()
    const seg2Id = faker.string.uuid()
    const seg3Id = faker.string.uuid()
    const seg1 = buildSegmentRow({ id: seg1Id, segmentNumber: 1, sourceText: 'Segment one' })
    const seg2 = buildSegmentRow({
      id: seg2Id,
      segmentNumber: 2,
      sourceText: 'Segment two (no finding)',
    })
    const seg3 = buildSegmentRow({ id: seg3Id, segmentNumber: 3, sourceText: 'Segment three' })

    dbState.returnValues = buildDbReturns({
      segments: [seg1, seg2, seg3],
      l2Stats: [
        { segmentId: seg1Id, maxConfidence: 70, findingCount: 1 },
        { segmentId: seg3Id, maxConfidence: 60, findingCount: 1 },
      ],
      rest: [[], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as { segments: { id: string }[] }
    const segmentIds = promptInput.segments.map((s) => s.id)
    expect(segmentIds).toContain(seg1Id)
    expect(segmentIds).toContain(seg3Id)
    expect(segmentIds).not.toContain(seg2Id)
  })

  it('[P0] U03: should skip L3 and return { findingCount: 0 } when zero flagged segments', async () => {
    const seg1 = buildSegmentRow({ id: faker.string.uuid(), segmentNumber: 1 })
    const seg2 = buildSegmentRow({ id: faker.string.uuid(), segmentNumber: 2 })

    // No L2 findings — empty l2Stats
    dbState.returnValues = buildDbReturns({
      segments: [seg1, seg2],
      l2Stats: [],
      rest: [[]],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockGenerateText).not.toHaveBeenCalled()
    expect(result.findingCount).toBe(0)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l3_completed' }))
  })

  it('[P1] U04: should send all segments to L3 when all have L2 findings', async () => {
    const seg1Id = faker.string.uuid()
    const seg2Id = faker.string.uuid()
    const seg1 = buildSegmentRow({ id: seg1Id, segmentNumber: 1, sourceText: 'First segment' })
    const seg2 = buildSegmentRow({ id: seg2Id, segmentNumber: 2, sourceText: 'Second segment' })

    dbState.returnValues = buildDbReturns({
      segments: [seg1, seg2],
      l2Stats: [
        { segmentId: seg1Id, maxConfidence: 70, findingCount: 1 },
        { segmentId: seg2Id, maxConfidence: 60, findingCount: 1 },
      ],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as { segments: { id: string }[] }
    const segmentIds = promptInput.segments.map((s) => s.id)
    expect(segmentIds).toContain(seg1Id)
    expect(segmentIds).toContain(seg2Id)
  })

  // U05 & U06: l3ConfidenceMin threshold tests
  // Per AC1: "the first condition already captures all segments with any L2 findings"
  // So l3ConfidenceMin is a secondary filter, not primary — all segments with L2 findings are included
  // These tests verify the threshold is queried but doesn't change the filtering behavior (by design)

  it('[P1] U05: should include segment at exact threshold (first OR condition: findingCount > 0 passes regardless)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      langConfig: [{ l3ConfidenceMin: 80 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // AI should still be called — segment has L2 findings (first OR condition passes)
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  it('[P1] U06: should include segment below l3ConfidenceMin (both OR conditions pass)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({
      id: segId,
      segmentNumber: 1,
      sourceText: 'Low confidence segment',
    })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 79, findingCount: 1 }],
      langConfig: [{ l3ConfidenceMin: 80 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  // ── AC2: Surrounding context ±2 ──

  it('[P0] U07: should provide ±2 surrounding context for middle segment', async () => {
    const segIds = Array.from({ length: 5 }, () => faker.string.uuid())
    const segs = segIds.map((id, i) =>
      buildSegmentRow({
        id,
        segmentNumber: i + 1,
        sourceText: `Segment ${i + 1} text`,
        targetText: `Target ${i + 1}`,
      }),
    )

    // Only segment 3 (index 2) has L2 finding
    dbState.returnValues = buildDbReturns({
      segments: segs,
      l2Stats: [{ segmentId: segIds[2]!, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      surroundingContext: {
        previous: { id: string }[]
        current: { id: string }
        next: { id: string }[]
      }[]
    }
    const ctx = promptInput.surroundingContext[0]!
    expect(ctx.previous.map((s) => s.id)).toEqual([segIds[0]!, segIds[1]!])
    expect(ctx.current.id).toBe(segIds[2]!)
    expect(ctx.next.map((s) => s.id)).toEqual([segIds[3]!, segIds[4]!])
  })

  it('[P1] U08: should provide 0 previous + 2 next for first segment (position 0)', async () => {
    const segIds = Array.from({ length: 5 }, () => faker.string.uuid())
    const segs = segIds.map((id, i) =>
      buildSegmentRow({ id, segmentNumber: i + 1, sourceText: `Seg ${i + 1} content` }),
    )

    dbState.returnValues = buildDbReturns({
      segments: segs,
      l2Stats: [{ segmentId: segIds[0]!, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      surroundingContext: {
        previous: { id: string }[]
        current: { id: string }
        next: { id: string }[]
      }[]
    }
    const ctx = promptInput.surroundingContext[0]!
    expect(ctx.previous).toHaveLength(0)
    expect(ctx.current.id).toBe(segIds[0]!)
    expect(ctx.next).toHaveLength(2)
    expect(ctx.next.map((s) => s.id)).toEqual([segIds[1]!, segIds[2]!])
  })

  it('[P1] U09: should provide 2 previous + 0 next for last segment (position N)', async () => {
    const segIds = Array.from({ length: 5 }, () => faker.string.uuid())
    const segs = segIds.map((id, i) =>
      buildSegmentRow({ id, segmentNumber: i + 1, sourceText: `Row ${i + 1}` }),
    )

    dbState.returnValues = buildDbReturns({
      segments: segs,
      l2Stats: [{ segmentId: segIds[4]!, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      surroundingContext: {
        previous: { id: string }[]
        current: { id: string }
        next: { id: string }[]
      }[]
    }
    const ctx = promptInput.surroundingContext[0]!
    expect(ctx.previous).toHaveLength(2)
    expect(ctx.previous.map((s) => s.id)).toEqual([segIds[2]!, segIds[3]!])
    expect(ctx.current.id).toBe(segIds[4]!)
    expect(ctx.next).toHaveLength(0)
  })

  it('[P1] U10: should provide 1 previous + 2 next for second segment (position 1)', async () => {
    const segIds = Array.from({ length: 5 }, () => faker.string.uuid())
    const segs = segIds.map((id, i) =>
      buildSegmentRow({ id, segmentNumber: i + 1, sourceText: `Item ${i + 1}` }),
    )

    dbState.returnValues = buildDbReturns({
      segments: segs,
      l2Stats: [{ segmentId: segIds[1]!, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      surroundingContext: {
        previous: { id: string }[]
        current: { id: string }
        next: { id: string }[]
      }[]
    }
    const ctx = promptInput.surroundingContext[0]!
    expect(ctx.previous).toHaveLength(1)
    expect(ctx.previous[0]!.id).toBe(segIds[0]!)
    expect(ctx.current.id).toBe(segIds[1]!)
    expect(ctx.next).toHaveLength(2)
    expect(ctx.next.map((s) => s.id)).toEqual([segIds[2]!, segIds[3]!])
  })

  // ── AC4: L3 confirm/contradict post-processing ──

  it('[P0] U14: should boost L2 finding confidence by 10% when L3 confirms', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    const l2FindingId = faker.string.uuid()

    const l2Finding = {
      id: l2FindingId,
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Mistranslation detected',
      aiConfidence: 80,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Confirmed: mistranslation',
          rationale: 'The semantic meaning is clearly different',
          confidence: 92,
        },
      ]),
    )

    // CAS, segments, priorFindings, l2Stats, langConfig, glossary, taxonomy, project,
    // txDelete L3, txInsert L3, txUpdate confirm, statusUpdate
    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // L2 finding confidence boosted: 80 * 1.1 = 88
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 88 }))
  })

  it('[P0] U15: should append [L3 Disagrees] marker when L3 contradicts', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    const l2FindingId = faker.string.uuid()

    const l2Finding = {
      id: l2FindingId,
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Mistranslation detected',
      aiConfidence: 85,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'false_positive_review',
          description: 'Translation is acceptable in context',
          rationale: 'The meaning is preserved in colloquial Thai',
          confidence: 90,
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 85, findingCount: 1 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(dbState.setCaptures).toContainEqual(
      expect.objectContaining({
        description: expect.stringContaining('[L3 Disagrees]'),
      }),
    )
  })

  it('[P1] U16: should leave L2 finding unchanged when no L3 match exists', async () => {
    const seg1Id = faker.string.uuid()
    const seg2Id = faker.string.uuid()
    const seg1 = buildSegmentRow({ id: seg1Id, segmentNumber: 1 })
    const seg2 = buildSegmentRow({ id: seg2Id, segmentNumber: 2 })

    const l2Finding = {
      id: faker.string.uuid(),
      segmentId: seg1Id,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Original L2 description',
      aiConfidence: 75,
    }

    // L3 finds issue in seg2 (different segment) — no match for the L2 finding on seg1
    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: seg2Id,
          category: 'fluency',
          description: 'New issue in segment 2',
          rationale: 'Found new problem',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg1, seg2],
      priorFindings: [l2Finding],
      l2Stats: [
        { segmentId: seg1Id, maxConfidence: 75, findingCount: 1 },
        { segmentId: seg2Id, maxConfidence: 60, findingCount: 1 },
      ],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // L2 finding should NOT have confidence or description changes from confirm/contradict
    const confirmContradictUpdates = dbState.setCaptures.filter((c: unknown) => {
      const obj = c as Record<string, unknown>
      return (
        'aiConfidence' in obj ||
        (typeof obj.description === 'string' &&
          (obj.description.includes('[L3 Confirmed]') ||
            obj.description.includes('[L3 Disagrees]')))
      )
    })
    expect(confirmContradictUpdates).toHaveLength(0)
  })

  it('[P1] U17: should cap confidence boost at 100 (95% * 1.1 = 104.5 -> 100)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    const l2Finding = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'High confidence issue',
      aiConfidence: 95,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Confirmed issue',
          rationale: 'Clearly wrong translation',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 95, findingCount: 1 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 100 }))
    expect(dbState.setCaptures).toContainEqual(
      expect.objectContaining({ description: expect.stringContaining('[L3 Confirmed]') }),
    )
  })

  it('[P1] U18: should NOT duplicate markers or double-boost confidence on idempotent re-run', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    // L2 finding already has [L3 Confirmed] marker from previous run
    const l2Finding = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Mistranslation detected\n\n[L3 Confirmed]',
      aiConfidence: 88,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Still confirmed',
          rationale: 'Same issue',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 88, findingCount: 1 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Idempotent: no confirm/contradict updates should be emitted on re-run
    // (production code skips entirely when [L3 Confirmed] already present)
    const confirmContradictUpdates = dbState.setCaptures.filter((c: unknown) => {
      const obj = c as Record<string, unknown>
      return (
        'aiConfidence' in obj ||
        (typeof obj.description === 'string' &&
          (obj.description.includes('[L3 Confirmed]') ||
            obj.description.includes('[L3 Disagrees]')))
      )
    })
    expect(confirmContradictUpdates).toHaveLength(0)
  })

  it('[P1] U19: should match multiple L3 findings to same L2 segment independently', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    const l2Finding1 = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Meaning shift',
      aiConfidence: 70,
    }
    const l2Finding2 = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'fluency',
      severity: 'minor',
      description: 'Awkward phrasing',
      aiConfidence: 65,
    }

    // L3 confirms both accuracy and fluency independently (no false_positive_review conflict)
    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Confirmed meaning shift',
          rationale: 'Source and target diverge',
        },
        {
          segmentId: segId,
          category: 'fluency',
          description: 'Confirmed awkward phrasing',
          rationale: 'Unnatural sentence structure',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding1, l2Finding2],
      l2Stats: [{ segmentId: segId, maxConfidence: 70, findingCount: 2 }],
      rest: [[], [], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // accuracy finding should be boosted: min(100, round(70 * 1.1)) = 77
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 77 }))
    // fluency finding should be boosted: min(100, round(65 * 1.1)) = 72
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 72 }))
  })

  // ── AC7: languagePair wiring ──

  it('[P1] U28: should derive languagePair from segments in AIUsageRecord', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({
      id: segId,
      segmentNumber: 1,
      sourceLang: 'en',
      targetLang: 'th',
    })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        languagePair: 'en\u2192th',
        layer: 'L3',
      }),
    )
  })

  // ── AC: Error handling & validation ──

  it('[P1] should drop L3 findings with invalid segmentId (not in file segments)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    // L3 returns a finding with a segmentId that doesn't exist in the file
    const bogusSegId = faker.string.uuid()
    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: bogusSegId,
          category: 'accuracy',
          description: 'Finding for non-existent segment',
          rationale: 'Should be dropped',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Finding with bogus segmentId should be dropped — zero findings saved
    expect(result.findingCount).toBe(0)
  })

  it('[P1] should use fallback project context when project row not found', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1, sourceLang: 'ja', targetLang: 'en' })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      project: [], // No project found — triggers fallback
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Should still call buildL3Prompt with fallback project
    expect(mockBuildL3Prompt).toHaveBeenCalledTimes(1)
    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      project: { name: string; processingMode: string }
    }
    expect(promptInput.project.name).toBe('Unknown')
    expect(promptInput.project.processingMode).toBe('thorough')
  })

  it('[P1] should throw and set file status to failed on unexpected error', async () => {
    // CAS update succeeds, then segments query throws
    dbState.returnValues = [[mockFile]]
    dbState.throwAtCallIndex = 1

    const { runL3ForFile } = await import('./runL3ForFile')
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow()

    // File status should be set to 'failed'
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  it('[P2] U29: should set languagePair to null when segments have no language info', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({
      id: segId,
      segmentNumber: 1,
      sourceLang: '',
      targetLang: '',
    })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      langConfig: [], // no config found for empty langs
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockLogAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        languagePair: null,
        layer: 'L3',
      }),
    )
  })

  // ── TA: Coverage Gap Tests (FMA + Pre-mortem + Red/Blue + Boundary) ──

  // Gap A: CAS guard rejection
  it('[P1] TA-A: should throw NonRetriableError when CAS guard fails (file not l2_completed)', async () => {
    dbState.returnValues = [[]] // CAS update returns empty array

    const { runL3ForFile } = await import('./runL3ForFile')
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('File not in l2_completed state')
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  // Gap B: Rate limit rejection
  it('[P1] TA-B: should throw retriable error and rollback to failed when rate limit rejects', async () => {
    dbState.returnValues = [[mockFile], []] // CAS + rollback
    mockAiL3Limit.mockResolvedValue({ success: false, limit: 50, remaining: 0, reset: 0 })

    const { runL3ForFile } = await import('./runL3ForFile')
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('queue full')
    expect(mockGenerateText).not.toHaveBeenCalled()
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'failed' }))
  })

  // Gap C: Budget exhaustion
  it('[P1] TA-C: should throw NonRetriableError when budget exhausted', async () => {
    dbState.returnValues = [[mockFile], []] // CAS + rollback
    mockCheckProjectBudget.mockResolvedValue({ hasQuota: false, remainingBudgetUsd: 0 })

    const { runL3ForFile } = await import('./runL3ForFile')
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('AI quota exhausted')
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  // Gap F: NonRetriableError in chunk rethrown (not partial failure)
  it('[P1] TA-F: should rethrow NonRetriableError from chunk processing (not partial failure)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], []],
    })
    const { NonRetriableError: NRE } = await import('inngest')
    mockGenerateText.mockRejectedValue(new NRE('Schema validation failed'))

    const { runL3ForFile } = await import('./runL3ForFile')
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('Schema validation failed')
  })

  // Gap G: rate_limit classified error in chunk rethrown
  it('[P1] TA-G: should rethrow rate_limit classified error from chunk processing', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], []],
    })
    mockGenerateText.mockRejectedValue(new Error('Rate limited by provider'))
    mockClassifyAIError.mockReturnValue('rate_limit')

    const { runL3ForFile } = await import('./runL3ForFile')
    await expect(
      runL3ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow('Rate limited by provider')
  })

  // Gap H+O: Non-retriable AI error → partial failure, status still l3_completed
  it('[P1] TA-HO: should set partialFailure=true and status=l3_completed when chunk fails with unknown error', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], []],
    })
    mockGenerateText.mockRejectedValue(new Error('Content filter triggered'))
    mockClassifyAIError.mockReturnValue('unknown')

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
    expect(result.partialFailure).toBe(true)
    expect(result.chunksFailed).toBe(1)
    expect(result.chunksSucceeded).toBe(0)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l3_completed' }))
  })

  // Gap Q: Both confirm + contradict on same L2 — contradict takes priority
  it('[P1] TA-Q: should skip confirm and only contradict when L3 returns both for same segment', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    const l2FindingId = faker.string.uuid()
    const l2Finding = {
      id: l2FindingId,
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Mistranslation detected',
      aiConfidence: 80,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Confirmed issue',
          rationale: 'Translation diverges from source',
        },
        {
          segmentId: segId,
          category: 'false_positive_review',
          description: 'Actually acceptable in context',
          rationale: 'Colloquial usage is valid',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], [], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Contradict takes priority: [L3 Disagrees] marker applied
    expect(dbState.setCaptures).toContainEqual(
      expect.objectContaining({ description: expect.stringContaining('[L3 Disagrees]') }),
    )
    // Confirm skipped: no aiConfidence boost should occur
    const boostCaptures = dbState.setCaptures.filter(
      (c: unknown) => 'aiConfidence' in (c as Record<string, unknown>),
    )
    expect(boostCaptures).toHaveLength(0)
  })

  // Gap D: Null segmentId in l2Stats filtered out
  it('[P2] TA-D: should filter out null segmentId from l2Stats (not crash or include)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [
        { segmentId: null, maxConfidence: 90, findingCount: 1 },
        { segmentId: segId, maxConfidence: 80, findingCount: 1 },
      ],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Should still process — null segmentId row filtered, valid row used
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  // Gap I+J+U+V: Confidence clamping boundaries
  it('[P2] TA-IJUV: should clamp L3 finding confidence: -5 to 0, 150 to 100 (not dropped)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    dbState.valuesCaptures = []

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          confidence: -5,
          description: 'Negative',
          rationale: 'Test',
        },
        {
          segmentId: segId,
          category: 'fluency',
          confidence: 150,
          description: 'Over max',
          rationale: 'Test',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Findings should be included (clamped), not dropped
    expect(result.findingCount).toBe(2)

    // Verify clamped values via INSERT batch
    const batch = dbState.valuesCaptures[0] as { aiConfidence: number }[]
    expect(batch).toBeDefined()
    const confidences = batch.map((f) => f.aiConfidence).sort((a, b) => a - b)
    expect(confidences).toEqual([0, 100])
  })

  // Gap K: null aiConfidence confirm boost = 0
  it('[P2] TA-K: should produce boost=0 when L2 aiConfidence is null (null ?? 0 * 1.1 = 0)', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    const l2Finding = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Issue found',
      aiConfidence: null,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Confirmed',
          rationale: 'Clearly wrong',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: null, findingCount: 1 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // null aiConfidence → 0 via ?? → 0 * 1.1 = 0
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 0 }))
    expect(dbState.setCaptures).toContainEqual(
      expect.objectContaining({ description: expect.stringContaining('[L3 Confirmed]') }),
    )
  })

  // Gap L: Idempotent [L3 Disagrees] re-run
  it('[P2] TA-L: should NOT double-append [L3 Disagrees] on idempotent re-run', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    const l2Finding = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Mistranslation\n\n[L3 Disagrees]',
      aiConfidence: 80,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'false_positive_review',
          description: 'Still disagrees',
          rationale: 'Valid in context',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Idempotent: no contradict update should occur (marker already present)
    const contradictUpdates = dbState.setCaptures.filter((c: unknown) => {
      const obj = c as Record<string, unknown>
      return typeof obj.description === 'string' && obj.description.includes('[L3 Disagrees]')
    })
    expect(contradictUpdates).toHaveLength(0)
  })

  // Gap E+T: Single segment file surrounding context
  it('[P2] TA-ET: should provide prev=[] next=[] for single-segment file', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      l2Stats: [{ segmentId: segId, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      surroundingContext: { previous: unknown[]; current: { id: string }; next: unknown[] }[]
    }
    const ctx = promptInput.surroundingContext[0]!
    expect(ctx.previous).toHaveLength(0)
    expect(ctx.current.id).toBe(segId)
    expect(ctx.next).toHaveLength(0)
  })

  // Gap P: find() first match only
  it('[P2] TA-P: should only confirm first L2 match when multiple L2 findings share segment+category', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    const l2Finding1 = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'First accuracy finding',
      aiConfidence: 70,
    }
    const l2Finding2 = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'minor',
      description: 'Second accuracy finding',
      aiConfidence: 60,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        {
          segmentId: segId,
          category: 'accuracy',
          description: 'Confirmed accuracy',
          rationale: 'Clearly wrong',
        },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding1, l2Finding2],
      l2Stats: [{ segmentId: segId, maxConfidence: 70, findingCount: 2 }],
      rest: [[], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Only first L2 finding (70) gets boosted: 70 * 1.1 = 77
    const boostCaptures = dbState.setCaptures.filter(
      (c: unknown) => 'aiConfidence' in (c as Record<string, unknown>),
    )
    expect(boostCaptures).toHaveLength(1)
    expect(boostCaptures[0]).toEqual(expect.objectContaining({ aiConfidence: 77 }))
  })

  // Gap S: Position N-1 surrounding context
  it('[P2] TA-S: should provide 2 previous + 1 next for second-to-last segment (position N-1)', async () => {
    const segIds = Array.from({ length: 5 }, () => faker.string.uuid())
    const segs = segIds.map((id, i) =>
      buildSegmentRow({ id, segmentNumber: i + 1, sourceText: `Segment ${i + 1}` }),
    )

    dbState.returnValues = buildDbReturns({
      segments: segs,
      l2Stats: [{ segmentId: segIds[3]!, maxConfidence: 80, findingCount: 1 }],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const promptInput = mockBuildL3Prompt.mock.calls[0]?.[0] as {
      surroundingContext: {
        previous: { id: string }[]
        current: { id: string }
        next: { id: string }[]
      }[]
    }
    const ctx = promptInput.surroundingContext[0]!
    expect(ctx.previous).toHaveLength(2)
    expect(ctx.previous.map((s) => s.id)).toEqual([segIds[1]!, segIds[2]!])
    expect(ctx.current.id).toBe(segIds[3]!)
    expect(ctx.next).toHaveLength(1)
    expect(ctx.next[0]!.id).toBe(segIds[4]!)
  })

  // Gap W: Boost cap exact boundary
  it('[P2] TA-W: should cap boost at exact boundary: aiConfidence=91 to 100, 90 to 99', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })

    const l2Finding90 = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'Issue at 90',
      aiConfidence: 90,
    }
    const l2Finding91 = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'fluency',
      severity: 'minor',
      description: 'Issue at 91',
      aiConfidence: 91,
    }

    mockGenerateText.mockResolvedValue(
      buildL3Response([
        { segmentId: segId, category: 'accuracy', description: 'Confirmed 90', rationale: 'Test' },
        { segmentId: segId, category: 'fluency', description: 'Confirmed 91', rationale: 'Test' },
      ]),
    )

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding90, l2Finding91],
      l2Stats: [{ segmentId: segId, maxConfidence: 91, findingCount: 2 }],
      rest: [[], [], [], [], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // 90 * 1.1 = 99 (below cap)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 99 }))
    // 91 * 1.1 = 100.1 → Math.round = 100 → min(100, 100) = 100
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ aiConfidence: 100 }))
  })

  // Gap M+X: Zero L3 findings → skip confirm/contradict
  it('[P2] TA-MX: should skip confirm/contradict when L3 produces zero findings', async () => {
    const segId = faker.string.uuid()
    const seg = buildSegmentRow({ id: segId, segmentNumber: 1 })
    const l2Finding = {
      id: faker.string.uuid(),
      segmentId: segId,
      detectedByLayer: 'L2',
      category: 'accuracy',
      severity: 'major',
      description: 'L2 issue (should remain unchanged)',
      aiConfidence: 75,
    }

    mockGenerateText.mockResolvedValue(buildL3Response([]))

    dbState.returnValues = buildDbReturns({
      segments: [seg],
      priorFindings: [l2Finding],
      l2Stats: [{ segmentId: segId, maxConfidence: 75, findingCount: 1 }],
      rest: [[], []],
    })

    const { runL3ForFile } = await import('./runL3ForFile')
    const result = await runL3ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
    // No confirm/contradict updates should have been made
    const confirmContradictUpdates = dbState.setCaptures.filter((c: unknown) => {
      const obj = c as Record<string, unknown>
      return (
        'aiConfidence' in obj ||
        (typeof obj.description === 'string' &&
          (obj.description.includes('[L3 Confirmed]') ||
            obj.description.includes('[L3 Disagrees]')))
      )
    })
    expect(confirmContradictUpdates).toHaveLength(0)
  })
})
