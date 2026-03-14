import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL2Response, buildSegmentRow } from '@/test/fixtures/ai-responses'

import {
  VALID_FILE_ID,
  VALID_PROJECT_ID,
  VALID_TENANT_ID,
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
  mocks: { mockGenerateText, mockClassifyAIError, mockLogAIUsage },
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

describe('runL2ForFile — chunk N fails, N+1 continues (P1-10, Chaos #1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRunL2Mocks({ ...mocks, mockAiL2Limit, mockBuildL2Prompt }, dbState, buildL2Response())
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
