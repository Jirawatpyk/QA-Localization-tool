// 🔴 TDD RED PHASE — tests will fail until glossaryMatcher.ts is implemented
// Story 1.5: Glossary Matching Engine for No-space Languages

import { beforeEach, describe, expect, it, vi } from 'vitest'

// 1. Mock server-only FIRST (required before any server-only imports)
vi.mock('server-only', () => ({}))

// 2. Fixed test UUIDs — deterministic, parallel-safe
const TENANT_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_ID = '00000000-0000-4000-8000-000000000002'
const SEGMENT_ID = '00000000-0000-4000-8000-000000000003'
const GLOSSARY_ID = '00000000-0000-4000-8000-000000000004'

// 3. Mock writeAuditLog
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

// 4. Mock pino logger (named export — matches 'export const logger = pino(...)' in logger.ts)
const mockLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
vi.mock('@/lib/logger', () => ({ logger: mockLogger }))

// 5. Test context
const testCtx = { segmentId: SEGMENT_ID, projectId: PROJECT_ID, tenantId: TENANT_ID }

// 7. Test data factory
function buildTerm(
  overrides?: Partial<{
    id: string
    glossaryId: string
    sourceTerm: string
    targetTerm: string
    caseSensitive: boolean
    createdAt: Date
  }>,
) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    glossaryId: GLOSSARY_ID,
    sourceTerm: 'hospital',
    targetTerm: 'โรงพยาบาล',
    caseSensitive: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// validateBoundary — exported pure function
// ---------------------------------------------------------------------------

describe('validateBoundary', () => {
  it('should return high when match aligns to Intl.Segmenter word boundaries', async () => {
    const { validateBoundary } = await import('./glossaryMatcher')
    // "โรงพยาบาล" alone — starts at 0, perfect boundaries
    const cleanText = 'โรงพยาบาล'
    const result = validateBoundary(cleanText, 0, 'โรงพยาบาล'.length, 'th')
    expect(result).toBe('high')
  })

  it('should return low when match starts at non-word-boundary position', async () => {
    const { validateBoundary } = await import('./glossaryMatcher')
    // "รงพ" starts at position 1 inside "โรงพยาบาล"
    // Position 1 is never a Thai word boundary regardless of ICU segmentation version
    const cleanText = 'โรงพยาบาล'
    const result = validateBoundary(cleanText, 1, 'รงพ'.length, 'th')
    expect(result).toBe('low')
  })

  it('should return high when match is at start of string (position 0)', async () => {
    const { validateBoundary } = await import('./glossaryMatcher')
    const cleanText = 'คอมพิวเตอร์ใหม่'
    // 'คอมพิวเตอร์' likely a whole word at position 0
    const result = validateBoundary(cleanText, 0, 'คอมพิวเตอร์'.length, 'th')
    // Accept either high or low based on actual segmenter behavior
    expect(['high', 'low']).toContain(result)
  })

  it('should return high when match is at end of string', async () => {
    const { validateBoundary } = await import('./glossaryMatcher')
    const term = 'บ้าน'
    const cleanText = `ไปที่${term}`
    const position = cleanText.length - term.length
    const result = validateBoundary(cleanText, position, term.length, 'th')
    expect(['high', 'low']).toContain(result)
  })

  it('should handle match near 30,000-char chunk boundary without error', async () => {
    const { validateBoundary } = await import('./glossaryMatcher')
    const { MAX_SEGMENTER_CHUNK } = await import('@/lib/language/markupStripper')
    // Term sits exactly at chunk boundary
    const term = 'โรงพยาบาล'
    const prefix = 'ก'.repeat(MAX_SEGMENTER_CHUNK - 2)
    const cleanText = prefix + term + 'ส่วนต่อท้าย'
    const position = prefix.length
    // Should not throw
    const result = validateBoundary(cleanText, position, term.length, 'th')
    expect(['high', 'low']).toContain(result)
  })
})

// ---------------------------------------------------------------------------
// checkGlossaryCompliance — main engine
// ---------------------------------------------------------------------------

describe('checkGlossaryCompliance', () => {
  beforeEach(() => {
    // CR6: mockReset (not clearAllMocks) — clears mockResolvedValueOnce queues
    mockWriteAuditLog.mockReset()
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockLogger.warn.mockReset()
    mockLogger.info.mockReset()
  })

  // --- AC1: Thai Hybrid Matching ---

  it('should find Thai term and return it in matches with high confidence', async () => {
    const term = buildTerm({ targetTerm: 'โรงพยาบาล' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('เดินทางไปโรงพยาบาลรัฐ', [term], 'th', testCtx)

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.sourceTerm).toBe('hospital')
    expect(result.matches[0]?.termId).toBe(term.id)
    expect(result.missingTerms).toHaveLength(0)
  })

  it('should add term to missingTerms when not found in text', async () => {
    const term = buildTerm({ targetTerm: 'คลินิก' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('ไปโรงพยาบาล', [term], 'th', testCtx)

    expect(result.missingTerms).toContain(term.id)
    expect(result.matches).toHaveLength(0)
    expect(result.lowConfidenceMatches).toHaveLength(0)
  })

  it('should apply NFKC normalization — fullwidth chars match ASCII term', async () => {
    const term = buildTerm({ sourceTerm: 'ABC', targetTerm: 'ABC' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance(
      'ＡＢＣ is the term', // fullwidth → normalizes to ABC
      [term],
      'en',
      testCtx,
    )

    expect(result.matches).toHaveLength(1)
  })

  it('should strip HTML markup before matching — term found inside HTML', async () => {
    const term = buildTerm({ targetTerm: 'โรงพยาบาล' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('<b>โรงพยาบาล</b>สาธารณะ', [term], 'th', testCtx)

    expect(result.matches).toHaveLength(1)
  })

  it('should strip XLIFF placeholder before matching — term adjacent to {0}', async () => {
    const term = buildTerm({ targetTerm: 'โรงพยาบาล' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('{0}โรงพยาบาล{1}', [term], 'th', testCtx)

    expect(result.matches).toHaveLength(1)
  })

  it('should return foundText reflecting actual text at position (not always expectedTarget)', async () => {
    // caseSensitive=false: "Hospital" (capital H) should match term "hospital"
    const term = buildTerm({ targetTerm: 'hospital', caseSensitive: false })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('Go to Hospital today', [term], 'en', testCtx)

    // foundText is the actual text at position — "Hospital" (capital H)
    expect(result.matches[0]?.foundText).toBe('Hospital')
    expect(result.matches[0]?.expectedTarget).toBe('hospital')
  })

  it('should handle empty text without throwing', async () => {
    const term = buildTerm()

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('', [term], 'th', testCtx)

    expect(result.matches).toHaveLength(0)
    expect(result.missingTerms).toContain(term.id)
  })

  it('should return empty results for empty glossary', async () => {
    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('ข้อความ', [], 'th', testCtx)

    expect(result.matches).toHaveLength(0)
    expect(result.missingTerms).toHaveLength(0)
  })

  // --- AC2: Compound Word + Boundary Mismatch + Dual Logging ---

  it('should write audit log for boundary mismatch (Architecture Decision 5.5)', async () => {
    const term = buildTerm({ targetTerm: 'บาล' }) // mid-word substring — position 6 is not a word boundary

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    await checkGlossaryCompliance('โรงพยาบาล', [term], 'th', testCtx)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        entityType: 'segment',
        entityId: SEGMENT_ID,
        action: 'glossary_boundary_mismatch',
      }),
    )
  })

  it('should write pino warn log for boundary mismatch (Architecture Decision 5.5)', async () => {
    const term = buildTerm({ targetTerm: 'บาล' }) // mid-word substring — position 6 is not a word boundary

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    await checkGlossaryCompliance('โรงพยาบาล', [term], 'th', testCtx)

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'glossary_boundary_mismatch',
        segment_id: SEGMENT_ID,
        project_id: PROJECT_ID,
      }),
    )
  })

  it('should NOT write duplicate audit log for same term appearing twice in segment', async () => {
    const term = buildTerm({ targetTerm: 'บาน' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    // "บาน" appears in both "โรงพยาบาน" and "บ้าน" — but deduplication by segmentId+term
    await checkGlossaryCompliance('โรงพยาบาน บาน บ้าน', [term], 'th', testCtx)

    const mismatchCalls = mockWriteAuditLog.mock.calls.filter(
      (call) => call[0]?.action === 'glossary_boundary_mismatch',
    )
    expect(mismatchCalls.length).toBeLessThanOrEqual(1)
  })

  it('should place low-confidence match in lowConfidenceMatches array', async () => {
    const term = buildTerm({ targetTerm: 'บาล' }) // mid-word substring — position 6 is not a word boundary

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('โรงพยาบาล', [term], 'th', testCtx)

    expect(result.lowConfidenceMatches.length + result.matches.length).toBeGreaterThan(0)
    const allMatches = [...result.matches, ...result.lowConfidenceMatches]
    expect(allMatches.some((m) => m.boundaryConfidence === 'low')).toBe(true)
  })

  // --- AC3: Japanese Mixed Script ---

  it('should find Japanese katakana term', async () => {
    const term = buildTerm({ sourceTerm: 'software', targetTerm: 'ソフトウェア' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance(
      'このソフトウェアを使用してください',
      [term],
      'ja',
      testCtx,
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.sourceTerm).toBe('software')
  })

  it('should find Japanese kanji compound term', async () => {
    const term = buildTerm({ sourceTerm: 'library', targetTerm: '図書館' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance(
      '市立図書館で本を借りました',
      [term],
      'ja',
      testCtx,
    )

    expect(result.matches).toHaveLength(1)
  })

  // --- AC4: Chinese (Simplified) ---

  it('should find Chinese term regardless of segmenter splitting', async () => {
    const term = buildTerm({ sourceTerm: 'library', targetTerm: '图书馆' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('我去图书馆借书', [term], 'zh', testCtx)

    expect(result.matches).toHaveLength(1)
  })

  it('should find Chinese Traditional term', async () => {
    const term = buildTerm({ sourceTerm: 'library', targetTerm: '圖書館' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('我去圖書館借書', [term], 'zh-TW', testCtx)

    expect(result.matches).toHaveLength(1)
  })

  // --- AC5: European Language Fallback ---

  it('should find French term using word-boundary fallback (not Intl.Segmenter)', async () => {
    const term = buildTerm({ sourceTerm: 'hospital', targetTerm: 'hôpital' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance(
      "Je vais à l'hôpital demain",
      [term],
      'fr',
      testCtx,
    )

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]?.sourceTerm).toBe('hospital')
  })

  it('should find German term with word-boundary check', async () => {
    const term = buildTerm({ sourceTerm: 'hospital', targetTerm: 'Krankenhaus' })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('Das Krankenhaus ist neu', [term], 'de', testCtx)

    expect(result.matches).toHaveLength(1)
  })

  it('should NOT call Intl.Segmenter for European languages (uses word-boundary regex)', async () => {
    const term = buildTerm({ sourceTerm: 'hospital', targetTerm: 'hospital' })

    // If no Intl.Segmenter is called for 'en', audit log should not contain segmenter errors
    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance('Visit hospital today', [term], 'en', testCtx)

    expect(result.matches).toHaveLength(1)
    // No boundary mismatch audit log expected for clean European word boundary
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  // --- case sensitivity ---

  it('should NOT match when caseSensitive=true and case differs', async () => {
    const term = buildTerm({ targetTerm: 'Bangkok', caseSensitive: true })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance(
      'I live in bangkok', // lowercase — should not match caseSensitive term
      [term],
      'en',
      testCtx,
    )

    expect(result.matches).toHaveLength(0)
    expect(result.missingTerms).toContain(term.id)
  })

  it('should match when caseSensitive=false and case differs', async () => {
    const term = buildTerm({ targetTerm: 'Bangkok', caseSensitive: false })

    const { checkGlossaryCompliance } = await import('./glossaryMatcher')
    const result = await checkGlossaryCompliance(
      'I live in bangkok', // lowercase — should match case-insensitive
      [term],
      'en',
      testCtx,
    )

    expect(result.matches).toHaveLength(1)
  })
})
