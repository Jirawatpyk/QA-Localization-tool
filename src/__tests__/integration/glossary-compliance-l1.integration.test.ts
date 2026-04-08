/// <reference types="vitest/globals" />
/**
 * Glossary Compliance L1 Integration Test
 *
 * Tests checkGlossaryComplianceRule with REAL glossaryMatcher (not mocked),
 * REAL Intl.Segmenter, and real L1 ruleEngine.processFile().
 *
 * No DB needed — uses in-memory segment records and glossary term objects.
 */

import { faker } from '@faker-js/faker'

import { checkGlossaryCompliance } from '@/features/glossary/matching/glossaryMatcher'
import { checkGlossaryComplianceRule } from '@/features/pipeline/engine/checks/glossaryChecks'
import { processFile } from '@/features/pipeline/engine/ruleEngine'
import type {
  GlossaryTermRecord,
  SegmentCheckContext,
  SegmentRecord,
} from '@/features/pipeline/engine/types'

// ── Fixed IDs (deterministic, parallel-safe) ──

const TENANT_ID = '10000000-0000-4000-8000-000000000001'
const PROJECT_ID = '10000000-0000-4000-8000-000000000002'
const FILE_ID = '10000000-0000-4000-8000-000000000003'
const GLOSSARY_ID = '10000000-0000-4000-8000-000000000004'

// ── Factories ──

function buildTestSegment(
  overrides: Partial<SegmentRecord> & { sourceText: string; targetText: string },
): SegmentRecord {
  return {
    id: faker.string.uuid(),
    fileId: FILE_ID,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    segmentNumber: 1,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    wordCount: overrides.sourceText.split(' ').length,
    confirmationState: 'Translated',
    matchPercentage: null,
    translatorComment: null,
    inlineTags: null,
    createdAt: new Date(),
    ...overrides,
  }
}

function buildGlossaryTerm(overrides?: Partial<GlossaryTermRecord>): GlossaryTermRecord {
  return {
    id: faker.string.uuid(),
    tenantId: TENANT_ID,
    glossaryId: GLOSSARY_ID,
    sourceTerm: 'database',
    targetTerm: 'ฐานข้อมูล',
    caseSensitive: false,
    notes: null,
    createdAt: new Date(),
    ...overrides,
  }
}

const segCtx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

// ── Tests ──

describe('Glossary Compliance L1 Integration', () => {
  // T1: Missing glossary term detected
  it('should detect missing glossary term and produce a finding', async () => {
    const term = buildGlossaryTerm({
      sourceTerm: 'database',
      targetTerm: 'ฐานข้อมูล',
    })
    const segment = buildTestSegment({
      sourceText: 'The database is running.',
      targetText: 'ระบบกำลังทำงาน',
    })

    const findings = await checkGlossaryComplianceRule(
      segment,
      [term],
      segCtx,
      checkGlossaryCompliance,
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]!.category).toBe('glossary_compliance')
    expect(findings[0]!.severity).toBe('major')
    expect(findings[0]!.description).toContain('database')
    expect(findings[0]!.description).toContain('ฐานข้อมูล')
    expect(findings[0]!.suggestedFix).toBe('ฐานข้อมูล')
  })

  // T2: Correct glossary term passes
  it('should not produce a finding when target contains correct glossary translation', async () => {
    const term = buildGlossaryTerm({
      sourceTerm: 'database',
      targetTerm: 'ฐานข้อมูล',
    })
    const segment = buildTestSegment({
      sourceText: 'The database is running.',
      targetText: 'ฐานข้อมูลกำลังทำงาน',
    })

    const findings = await checkGlossaryComplianceRule(
      segment,
      [term],
      segCtx,
      checkGlossaryCompliance,
    )

    expect(findings).toHaveLength(0)
  })

  // T3: Thai glossary matching with Intl.Segmenter boundary detection
  it('should detect Thai compound word via real Intl.Segmenter boundary validation', async () => {
    const term = buildGlossaryTerm({
      sourceTerm: 'hospital',
      targetTerm: 'โรงพยาบาล',
    })

    // Target contains the Thai term — should match with high boundary confidence
    const segmentWithTerm = buildTestSegment({
      sourceText: 'Go to the hospital.',
      targetText: 'ไปที่โรงพยาบาล',
    })

    const findingsWithTerm = await checkGlossaryComplianceRule(
      segmentWithTerm,
      [term],
      segCtx,
      checkGlossaryCompliance,
    )
    expect(findingsWithTerm).toHaveLength(0)

    // Target is missing the Thai term — should produce finding
    const segmentMissing = buildTestSegment({
      sourceText: 'Go to the hospital.',
      targetText: 'ไปที่คลินิก',
    })

    const findingsMissing = await checkGlossaryComplianceRule(
      segmentMissing,
      [term],
      segCtx,
      checkGlossaryCompliance,
    )
    expect(findingsMissing).toHaveLength(1)
    expect(findingsMissing[0]!.category).toBe('glossary_compliance')
  })

  // T4: Multiple glossary terms in one segment — 3 terms, 1 missing
  it('should produce exactly 1 finding when 1 of 3 glossary terms is missing', async () => {
    const termDatabase = buildGlossaryTerm({
      id: faker.string.uuid(),
      sourceTerm: 'database',
      targetTerm: 'ฐานข้อมูล',
    })
    const termServer = buildGlossaryTerm({
      id: faker.string.uuid(),
      sourceTerm: 'server',
      targetTerm: 'เซิร์ฟเวอร์',
    })
    const termNetwork = buildGlossaryTerm({
      id: faker.string.uuid(),
      sourceTerm: 'network',
      targetTerm: 'เครือข่าย',
    })

    const segment = buildTestSegment({
      sourceText: 'The database, server, and network are connected.',
      targetText: 'ฐานข้อมูลและเซิร์ฟเวอร์เชื่อมต่อแล้ว',
      // "เครือข่าย" (network) is missing
    })

    const findings = await checkGlossaryComplianceRule(
      segment,
      [termDatabase, termServer, termNetwork],
      segCtx,
      checkGlossaryCompliance,
    )

    expect(findings).toHaveLength(1)
    expect(findings[0]!.description).toContain('network')
    expect(findings[0]!.description).toContain('เครือข่าย')
  })

  // T5: Case-insensitive matching — no false positive
  it('should match glossary term case-insensitively (no false positive)', async () => {
    const term = buildGlossaryTerm({
      sourceTerm: 'Database',
      targetTerm: 'ฐานข้อมูล',
      caseSensitive: false,
    })

    // Source has lowercase "database" — pre-filter uses normalizeForComparison so it matches
    const segment = buildTestSegment({
      sourceText: 'The database is ready.',
      targetText: 'ฐานข้อมูลพร้อมแล้ว',
    })

    const findings = await checkGlossaryComplianceRule(
      segment,
      [term],
      segCtx,
      checkGlossaryCompliance,
    )

    expect(findings).toHaveLength(0)
  })

  // T6: Full L1 pipeline with glossary — processFile()
  it('should include glossary findings alongside other L1 checks via processFile()', async () => {
    const term = buildGlossaryTerm({
      sourceTerm: 'training',
      targetTerm: 'การฝึกอบรม',
    })

    const segments: SegmentRecord[] = [
      buildTestSegment({
        segmentNumber: 1,
        sourceText: 'Complete the training program.',
        targetText: 'เสร็จสิ้นโปรแกรม',
        // Missing "การฝึกอบรม" → glossary finding
      }),
      buildTestSegment({
        segmentNumber: 2,
        sourceText: 'Version 3.5 is ready.',
        targetText: 'เวอร์ชัน 4.0 พร้อมแล้ว',
        // Number mismatch (3.5 vs 4.0) → number_format finding
      }),
    ]

    const findings = await processFile(segments, [term], new Set(), [])

    // Should have glossary_compliance from segment 1
    const glossaryFindings = findings.filter((f) => f.category === 'glossary_compliance')
    expect(glossaryFindings.length).toBeGreaterThanOrEqual(1)
    expect(glossaryFindings[0]!.description).toContain('training')

    // Should also have number_format finding from segment 2 (3.5 vs 4.0)
    const numberFindings = findings.filter((f) => f.category === 'number_format')
    expect(numberFindings.length).toBeGreaterThanOrEqual(1)

    // Verify both categories coexist in one processFile() call
    const categories = new Set(findings.map((f) => f.category))
    expect(categories.has('glossary_compliance')).toBe(true)
    expect(categories.has('number_format')).toBe(true)
  })

  // T6b: processFile with no glossary terms — baseline
  it('should produce no glossary findings when glossary terms are empty', async () => {
    const segments: SegmentRecord[] = [
      buildTestSegment({
        sourceText: 'The database is running.',
        targetText: 'ระบบกำลังทำงาน',
      }),
    ]

    const findings = await processFile(segments, [], new Set(), [])
    const glossaryFindings = findings.filter((f) => f.category === 'glossary_compliance')
    expect(glossaryFindings).toHaveLength(0)
  })

  // T5b: Case-sensitive flag respected
  it('should respect caseSensitive=true and flag mismatch when case differs', async () => {
    const term = buildGlossaryTerm({
      sourceTerm: 'API',
      targetTerm: 'API',
      caseSensitive: true,
    })

    // Source has "API" matching exactly, but target has lowercase "api"
    const segment = buildTestSegment({
      sourceText: 'Configure the API endpoint.',
      targetText: 'กำหนดค่า api endpoint',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
    })

    const findings = await checkGlossaryComplianceRule(
      segment,
      [term],
      segCtx,
      checkGlossaryCompliance,
    )

    // "api" (lowercase) should NOT match "API" (uppercase) when caseSensitive=true
    expect(findings).toHaveLength(1)
    expect(findings[0]!.description).toContain('API')
  })
})
