import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildL2Response, buildSegmentRow } from '@/test/fixtures/ai-responses'

import {
  VALID_FILE_ID,
  VALID_PROJECT_ID,
  VALID_TENANT_ID,
  VALID_SEGMENT_ID,
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
  mocks: { mockGenerateText, mockWriteAuditLog },
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

describe('runL2ForFile — suspicious zero findings (P1-14, R3-034)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRunL2Mocks({ ...mocks, mockAiL2Limit, mockBuildL2Prompt }, dbState, buildL2Response())
  })

  it('[P1] should return findingCount=0 when AI returns zero findings', async () => {
    // AI returns empty findings array
    mockGenerateText.mockResolvedValue(buildL2Response([]))

    // CAS(0), segments(1), l1(2), glossary(3), taxonomy(4), project(5), txDel(6), statusUp(7)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
    expect(result.partialFailure).toBe(false)
    // Zero findings is logged in audit with findingCount: 0
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file.l2_completed',
        newValue: expect.objectContaining({
          findingCount: 0,
        }),
      }),
    )
  })

  it('[P1] should not emit suspicious-zero warning when AI returns 1+ findings', async () => {
    // AI returns findings
    mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: VALID_SEGMENT_ID }]))

    // CAS(0), segments(1), l1(2), glossary(3), taxonomy(4), project(5), txDel(6), txIns(7), statusUp(8)
    dbState.returnValues = [[mockFile], [buildSegmentRow()], [], [], [], [mockProject], [], [], []]

    const { runL2ForFile } = await import('./runL2ForFile')
    const result = await runL2ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)

    // Verify no 'suspicious-zero' log — logger.warn should not be called with that context
    const { logger } = modules.logger as { logger: { warn: ReturnType<typeof vi.fn> } }
    const warnCalls = logger.warn.mock.calls as Array<[Record<string, unknown>, string]>
    const suspiciousZeroCalls = warnCalls.filter(
      (call) => typeof call[1] === 'string' && call[1].toLowerCase().includes('suspicious'),
    )
    expect(suspiciousZeroCalls).toHaveLength(0)
  })
})
