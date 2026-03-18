/**
 * P0-09 / R3-025: Per-finding validation in runL2ForFile
 *
 * Tests segmentId filtering and confidence clamping behavior
 * that occurs AFTER schema validation (lines 360-378 of runL2ForFile.ts).
 */
import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL2Response, buildSegmentRow } from '@/test/fixtures/ai-responses'

import {
  VALID_FILE_ID,
  VALID_PROJECT_ID,
  VALID_TENANT_ID,
  VALID_SEGMENT_ID as VALID_SEGMENT_ID_1,
  VALID_SEGMENT_ID_2,
  buildMockFile,
  buildMockProject,
  resetRunL2Mocks,
  MOCK_FILES_SCHEMA,
  MOCK_SEGMENTS_SCHEMA,
  MOCK_FINDINGS_SCHEMA,
  MOCK_GLOSSARIES_SCHEMA,
  MOCK_GLOSSARY_TERMS_SCHEMA,
  MOCK_TAXONOMY_DEFINITIONS_SCHEMA,
  MOCK_PROJECTS_SCHEMA,
} from './__tests__/runL2ForFile.test-utils'

// ── Hoisted mocks ──
const {
  mocks: { mockGenerateText },
  mocks,
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

// ── Module mocks (must stay in test file — hoisted by vitest) ──

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
vi.mock('@/db/schema/files', () => ({ files: MOCK_FILES_SCHEMA }))
vi.mock('@/db/schema/segments', () => ({ segments: MOCK_SEGMENTS_SCHEMA }))
vi.mock('@/db/schema/findings', () => ({ findings: MOCK_FINDINGS_SCHEMA }))
vi.mock('@/db/schema/glossaries', () => ({ glossaries: MOCK_GLOSSARIES_SCHEMA }))
vi.mock('@/db/schema/glossaryTerms', () => ({ glossaryTerms: MOCK_GLOSSARY_TERMS_SCHEMA }))
vi.mock('@/db/schema/taxonomyDefinitions', () => ({
  taxonomyDefinitions: MOCK_TAXONOMY_DEFINITIONS_SCHEMA,
}))
vi.mock('@/db/schema/projects', () => ({ projects: MOCK_PROJECTS_SCHEMA }))
vi.mock('@/features/pipeline/prompts/build-l2-prompt', () => ({
  buildL2Prompt: (...args: unknown[]) => mockBuildL2Prompt(...args),
}))

// ── Shared mock data ──

const mockFile = buildMockFile()
const mockProject = buildMockProject()

describe('runL2ForFile — Per-finding validation (R3-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRunL2Mocks({ ...mocks, mockAiL2Limit, mockBuildL2Prompt }, dbState, buildL2Response())
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

  it('[P0] should strip brackets from segmentId returned by AI (regression: bracket mismatch bug)', async () => {
    // AI returns segmentId with brackets "[uuid]" instead of bare UUID "uuid".
    // The prompt shows segments as "[uuid] (#1, en→th)" and example says e.g. "[abc-123]",
    // which causes AI to include brackets in its response.
    // runL2ForFile must strip them defensively before validation.
    const bracketedId = `[${VALID_SEGMENT_ID_1}]`

    mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: bracketedId }]))

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

    // Finding MUST be kept — bracket stripping makes UUID match
    expect(result.findingCount).toBe(1)

    // Inserted segmentId must be the bare UUID (no brackets)
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const insertedValues = dbState.valuesCaptures[dbState.valuesCaptures.length - 1] as Array<
      Record<string, unknown>
    >
    const finding = Array.isArray(insertedValues) ? insertedValues[0] : insertedValues
    expect(finding).toEqual(
      expect.objectContaining({
        segmentId: VALID_SEGMENT_ID_1, // bare UUID, not "[uuid]"
      }),
    )

    // No warn logged (bracketed id normalises to valid uuid)
    const { logger } = await import('@/lib/logger')
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled()
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
