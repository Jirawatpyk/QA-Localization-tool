/**
 * P0-09 / R3-025: Per-finding validation in runL2ForFile
 *
 * Tests segmentId filtering and confidence clamping behavior
 * that occurs AFTER schema validation (lines 360-378 of runL2ForFile.ts).
 */
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
const VALID_SEGMENT_ID_1 = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'
const VALID_SEGMENT_ID_2 = 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b'

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

describe('runL2ForFile — Per-finding validation (R3-025)', () => {
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

  it('[P0] should drop finding with invalid segmentId and preserve valid findings', async () => {
    const invalidSegmentId = faker.string.uuid()

    // AI returns 3 findings: 2 valid segmentIds, 1 unknown
    mockGenerateText.mockResolvedValue(
      buildL2Response([
        { segmentId: VALID_SEGMENT_ID_1 },
        { segmentId: VALID_SEGMENT_ID_2 },
        { segmentId: invalidSegmentId },
      ]),
    )

    // CAS(0), segments(1) with 2 valid segments, l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [
      [mockFile],
      [
        buildSegmentRow({ id: VALID_SEGMENT_ID_1 }),
        buildSegmentRow({ id: VALID_SEGMENT_ID_2, segmentNumber: 2 }),
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
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Only 2 valid findings kept, 1 dropped
    expect(result.findingCount).toBe(2)

    // Logger.warn called for the dropped finding
    const { logger } = await import('@/lib/logger')
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        segmentId: invalidSegmentId,
      }),
      'Dropped L2 finding with invalid segmentId',
    )
  })

  it('[P0] should clamp confidence from -5 to 0', async () => {
    mockGenerateText.mockResolvedValue(
      buildL2Response([{ segmentId: VALID_SEGMENT_ID_1, confidence: -5 }]),
    )

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow({ id: VALID_SEGMENT_ID_1 })],
      [],
      [],
      [],
      [mockProject],
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

    // Finding is still preserved (not dropped)
    expect(result.findingCount).toBe(1)

    // Verify the clamped value was inserted into DB via valuesCaptures
    // The insert values contain aiConfidence which should be clamped to 0
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const insertedValues = dbState.valuesCaptures[dbState.valuesCaptures.length - 1] as Array<
      Record<string, unknown>
    >
    const finding = Array.isArray(insertedValues) ? insertedValues[0] : insertedValues
    expect(finding).toEqual(
      expect.objectContaining({
        aiConfidence: 0,
      }),
    )
  })

  it('[P0] should clamp confidence from 150 to 100', async () => {
    mockGenerateText.mockResolvedValue(
      buildL2Response([{ segmentId: VALID_SEGMENT_ID_1, confidence: 150 }]),
    )

    // CAS(0), segments(1), l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), txInsert(7), statusUpdate(8)
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow({ id: VALID_SEGMENT_ID_1 })],
      [],
      [],
      [],
      [mockProject],
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

    // Finding is still preserved (not dropped)
    expect(result.findingCount).toBe(1)

    // Verify the clamped value was inserted into DB via valuesCaptures
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const insertedValues = dbState.valuesCaptures[dbState.valuesCaptures.length - 1] as Array<
      Record<string, unknown>
    >
    const finding = Array.isArray(insertedValues) ? insertedValues[0] : insertedValues
    expect(finding).toEqual(
      expect.objectContaining({
        aiConfidence: 100,
      }),
    )
  })

  it('[P0] should save 0 findings when all findings have invalid segmentIds', async () => {
    const badId1 = faker.string.uuid()
    const badId2 = faker.string.uuid()

    // AI returns 2 findings, both with segmentIds NOT in the loaded segments
    mockGenerateText.mockResolvedValue(
      buildL2Response([{ segmentId: badId1 }, { segmentId: badId2 }]),
    )

    // CAS(0), segments(1) with different IDs, l1Findings(2), glossary(3), taxonomy(4), project(5), txDelete(6), statusUpdate(7)
    // Note: no txInsert slot needed since 0 findings = no insert
    dbState.returnValues = [
      [mockFile],
      [buildSegmentRow({ id: VALID_SEGMENT_ID_1 })],
      [],
      [],
      [],
      [mockProject],
      [],
      [],
    ]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Both findings dropped
    expect(result.findingCount).toBe(0)

    // No error thrown — completed successfully
    expect(result.partialFailure).toBe(false)
    expect(result.chunksSucceeded).toBe(1)
    expect(result.chunksFailed).toBe(0)

    // Logger.warn called for each dropped finding
    const { logger } = await import('@/lib/logger')
    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ segmentId: badId1 }),
      'Dropped L2 finding with invalid segmentId',
    )
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ segmentId: badId2 }),
      'Dropped L2 finding with invalid segmentId',
    )

    // File status still transitions to l2_completed (not failed)
    expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ status: 'l2_completed' }))
  })
})
