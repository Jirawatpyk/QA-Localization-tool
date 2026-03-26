/**
 * Shared test utilities for runL2ForFile.*.test.ts files.
 *
 * Extracts duplicated constants, mock object builders, beforeEach helpers,
 * and schema mock shapes so each test file only contains its unique test logic.
 *
 * NOTE: vi.mock() calls MUST remain in each test file (they're hoisted).
 * This file only exports data/helpers that vi.mock() factories can reference.
 */
import { vi } from 'vitest'

import { BUDGET_HAS_QUOTA } from '@/test/fixtures/ai-responses'
import { asTenantId } from '@/types/tenant'

// ── Test Constants ──

export const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
export const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
export const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
export const VALID_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'
export const VALID_SEGMENT_ID_2 = 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b'

// ── Mock Object Builders ──

export function buildMockFile(overrides?: Partial<typeof DEFAULT_MOCK_FILE>) {
  return { ...DEFAULT_MOCK_FILE, ...overrides }
}

const DEFAULT_MOCK_FILE = {
  id: VALID_FILE_ID,
  projectId: VALID_PROJECT_ID,
  tenantId: VALID_TENANT_ID,
  status: 'l2_processing' as const,
}

export function buildMockProject(overrides?: Partial<typeof DEFAULT_MOCK_PROJECT>) {
  return { ...DEFAULT_MOCK_PROJECT, ...overrides }
}

const DEFAULT_MOCK_PROJECT = {
  name: 'Test Project',
  description: null,
  sourceLang: 'en',
  targetLangs: ['th'],
  processingMode: 'economy' as const,
}

// ── Schema Mock Shapes ──
// These constants match the column name mappings used in vi.mock('@/db/schema/...')

export const MOCK_FILES_SCHEMA = {
  id: 'id',
  tenantId: 'tenant_id',
  status: 'status',
  projectId: 'project_id',
}

export const MOCK_SEGMENTS_SCHEMA = {
  id: 'id',
  tenantId: 'tenant_id',
  fileId: 'file_id',
  projectId: 'project_id',
  sourceText: 'source_text',
  targetText: 'target_text',
  segmentNumber: 'segment_number',
  sourceLang: 'source_lang',
  targetLang: 'target_lang',
}

export const MOCK_FINDINGS_SCHEMA = {
  id: 'id',
  tenantId: 'tenant_id',
  fileId: 'file_id',
  segmentId: 'segment_id',
  projectId: 'project_id',
  detectedByLayer: 'detected_by_layer',
  category: 'category',
  severity: 'severity',
  description: 'description',
}

export const MOCK_GLOSSARIES_SCHEMA = {
  id: 'id',
  tenantId: 'tenant_id',
  projectId: 'project_id',
}

export const MOCK_GLOSSARY_TERMS_SCHEMA = {
  id: 'id',
  glossaryId: 'glossary_id',
  sourceTerm: 'source_term',
  targetTerm: 'target_term',
  caseSensitive: 'case_sensitive',
}

export const MOCK_TAXONOMY_DEFINITIONS_SCHEMA = {
  id: 'id',
  category: 'category',
  parentCategory: 'parent_category',
  severity: 'severity',
  description: 'description',
  isActive: 'is_active',
}

export const MOCK_PROJECTS_SCHEMA = {
  id: 'id',
  tenantId: 'tenant_id',
  name: 'name',
  description: 'description',
  sourceLang: 'source_lang',
  targetLangs: 'target_langs',
  processingMode: 'processing_mode',
}

// ── beforeEach Helper ──

type RunL2Mocks = {
  mockGenerateText: ReturnType<typeof vi.fn>
  mockCheckProjectBudget: ReturnType<typeof vi.fn>
  mockAiL2Limit: ReturnType<typeof vi.fn>
  mockClassifyAIError: ReturnType<typeof vi.fn>
  mockWriteAuditLog: ReturnType<typeof vi.fn>
  mockBuildL2Prompt: ReturnType<typeof vi.fn>
  mockAggregateUsage: ReturnType<typeof vi.fn>
  mockGetModelForLayerWithFallback: ReturnType<typeof vi.fn>
}

type DbState = {
  callIndex: number
  returnValues: unknown[]
  setCaptures: unknown[]
  throwAtCallIndex?: number | null
}

/**
 * Resets all mocks to standard defaults for runL2ForFile tests.
 * Call this inside beforeEach() after vi.clearAllMocks().
 *
 * @param mocks - The mock functions from vi.hoisted()
 * @param dbState - The dbState from createDrizzleMock()
 * @param defaultResponse - Optional default generateText response (defaults to buildL2Response())
 */
export function resetRunL2Mocks(
  mocks: RunL2Mocks,
  dbState: DbState,
  defaultResponse: unknown,
): void {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  if ('throwAtCallIndex' in dbState) {
    dbState.throwAtCallIndex = null
  }

  mocks.mockGenerateText.mockResolvedValue(defaultResponse)
  mocks.mockCheckProjectBudget.mockResolvedValue(BUDGET_HAS_QUOTA)
  mocks.mockAiL2Limit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  })
  mocks.mockClassifyAIError.mockReturnValue('unknown')
  mocks.mockWriteAuditLog.mockResolvedValue(undefined)
  mocks.mockBuildL2Prompt.mockReturnValue('mocked L2 prompt')
  mocks.mockAggregateUsage.mockReturnValue({
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.001,
  })
  mocks.mockGetModelForLayerWithFallback.mockResolvedValue({
    primary: 'gpt-4o-mini',
    fallbacks: [],
  })
}
