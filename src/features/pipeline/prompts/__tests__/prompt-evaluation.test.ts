import { describe, expect, it } from 'vitest'

import { buildL2Prompt } from '../build-l2-prompt'
import { buildL3Prompt } from '../build-l3-prompt'
import {
  GOLDEN_SEGMENTS,
  NEGATIVE_SEGMENTS,
  POSITIVE_SEGMENTS,
} from '../evaluation/golden-segments'
import { evaluateFindings } from '../evaluation/scoring'
import type { ActualFinding } from '../evaluation/types'
import type { L2PromptInput, L3PromptInput, ProjectContext } from '../types'

// ── Shared test data ──

const testProject: ProjectContext = {
  name: 'Golden Test Project',
  description: 'Localization QA evaluation test project',
  sourceLang: 'en',
  targetLangs: ['th', 'ja', 'zh-CN'],
  processingMode: 'thorough',
}

const testGlossary = [
  { sourceTerm: 'dashboard', targetTerm: 'แดชบอร์ด', caseSensitive: false },
  { sourceTerm: 'upload', targetTerm: 'อัปโหลด', caseSensitive: false },
  { sourceTerm: 'Save', targetTerm: 'บันทึก', caseSensitive: false },
]

const testTaxonomy = [
  {
    category: 'accuracy',
    parentCategory: null,
    severity: 'major',
    description: 'Translation accuracy issues',
  },
  {
    category: 'fluency',
    parentCategory: null,
    severity: 'minor',
    description: 'Target language fluency',
  },
  {
    category: 'terminology',
    parentCategory: null,
    severity: 'major',
    description: 'Incorrect terminology',
  },
  {
    category: 'style',
    parentCategory: null,
    severity: 'minor',
    description: 'Style and register issues',
  },
]

describe('Golden Segments Integrity', () => {
  it('should have at least 10 positive segments', () => {
    expect(POSITIVE_SEGMENTS.length).toBeGreaterThanOrEqual(10)
  })

  it('should have at least 5 negative segments', () => {
    expect(NEGATIVE_SEGMENTS.length).toBeGreaterThanOrEqual(5)
  })

  it('should have unique IDs for all segments', () => {
    const ids = GOLDEN_SEGMENTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('should have positive segments with at least one expected finding', () => {
    for (const seg of POSITIVE_SEGMENTS) {
      expect(seg.expectedFindings.length).toBeGreaterThanOrEqual(1)
      expect(seg.expectNoFinding).toBe(false)
    }
  })

  it('should have negative segments with no expected findings', () => {
    for (const seg of NEGATIVE_SEGMENTS) {
      expect(seg.expectedFindings).toEqual([])
      expect(seg.expectNoFinding).toBe(true)
    }
  })

  it('should cover at least 3 different target languages', () => {
    const langs = new Set(GOLDEN_SEGMENTS.map((s) => s.targetLang))
    expect(langs.size).toBeGreaterThanOrEqual(3)
  })

  it('should cover at least 4 different finding categories', () => {
    const categories = new Set(
      POSITIVE_SEGMENTS.flatMap((s) => s.expectedFindings.map((f) => f.category)),
    )
    expect(categories.size).toBeGreaterThanOrEqual(4)
  })

  it('should cover all three severity levels', () => {
    const severities = new Set(
      POSITIVE_SEGMENTS.flatMap((s) => s.expectedFindings.map((f) => f.severity)),
    )
    expect(severities).toContain('critical')
    expect(severities).toContain('major')
    expect(severities).toContain('minor')
  })
})

describe('L2 Prompt with Golden Segments', () => {
  it('should build valid L2 prompt for each golden segment', () => {
    for (const segment of GOLDEN_SEGMENTS) {
      const input: L2PromptInput = {
        segments: [
          {
            id: segment.id,
            sourceText: segment.source,
            targetText: segment.target,
            segmentNumber: 1,
            sourceLang: segment.sourceLang,
            targetLang: segment.targetLang,
          },
        ],
        l1Findings: [],
        glossaryTerms: testGlossary,
        taxonomyCategories: testTaxonomy,
        project: testProject,
      }

      const prompt = buildL2Prompt(input)

      // Structural validity
      expect(prompt).toContain(segment.source)
      expect(prompt).toContain(segment.target)
      expect(prompt).toContain(segment.id)
      expect(prompt).toContain('## Project Context')
      expect(prompt).toContain('## Approved Terminology')
      expect(prompt).toContain('## MQM Error Taxonomy')
      expect(prompt).toContain('## Calibration Examples')
      expect(prompt).toContain('## Confidence Scoring')
    }
  })

  it('should include language-specific instructions per segment language', () => {
    const thaiSegment = GOLDEN_SEGMENTS.find((s) => s.targetLang === 'th')!
    const jaSegment = GOLDEN_SEGMENTS.find((s) => s.targetLang === 'ja')!

    const thPrompt = buildL2Prompt({
      segments: [
        {
          id: thaiSegment.id,
          sourceText: thaiSegment.source,
          targetText: thaiSegment.target,
          segmentNumber: 1,
          sourceLang: 'en',
          targetLang: 'th',
        },
      ],
      l1Findings: [],
      glossaryTerms: testGlossary,
      taxonomyCategories: testTaxonomy,
      project: testProject,
    })

    const jaPrompt = buildL2Prompt({
      segments: [
        {
          id: jaSegment.id,
          sourceText: jaSegment.source,
          targetText: jaSegment.target,
          segmentNumber: 1,
          sourceLang: 'en',
          targetLang: 'ja',
        },
      ],
      l1Findings: [],
      glossaryTerms: testGlossary,
      taxonomyCategories: testTaxonomy,
      project: testProject,
    })

    expect(thPrompt).toContain('Thai Language-Specific')
    expect(jaPrompt).toContain('Japanese Language-Specific')
  })
})

describe('L3 Prompt with Golden Segments', () => {
  it('should build valid L3 prompt for each golden segment', () => {
    for (const segment of GOLDEN_SEGMENTS) {
      const input: L3PromptInput = {
        segments: [
          {
            id: segment.id,
            sourceText: segment.source,
            targetText: segment.target,
            segmentNumber: 1,
            sourceLang: segment.sourceLang,
            targetLang: segment.targetLang,
          },
        ],
        priorFindings: [],
        glossaryTerms: testGlossary,
        taxonomyCategories: testTaxonomy,
        project: testProject,
      }

      const prompt = buildL3Prompt(input)

      // L3-specific sections
      expect(prompt).toContain('senior localization QA specialist')
      expect(prompt).toContain('Cross-Layer Deduplication')
      expect(prompt).toContain('rationale')
      expect(prompt).toContain(segment.source)
      expect(prompt).toContain(segment.target)
    }
  })

  it('should include dedup context when prior findings exist', () => {
    const segment = GOLDEN_SEGMENTS[0]!
    const input: L3PromptInput = {
      segments: [
        {
          id: segment.id,
          sourceText: segment.source,
          targetText: segment.target,
          segmentNumber: 1,
          sourceLang: segment.sourceLang,
          targetLang: segment.targetLang,
        },
      ],
      priorFindings: [
        {
          id: 'f-prior',
          segmentId: segment.id,
          category: 'accuracy',
          severity: 'major',
          description: 'L2 found mistranslation',
          detectedByLayer: 'L2',
        },
      ],
      glossaryTerms: testGlossary,
      taxonomyCategories: testTaxonomy,
      project: testProject,
    }

    const prompt = buildL3Prompt(input)

    expect(prompt).toContain('Prior Findings from L1 + L2')
    expect(prompt).toContain('L2 AI Screening Findings (1)')
    expect(prompt).toContain('L2 found mistranslation')
  })
})

describe('Evaluation Scoring with Golden Segments', () => {
  it('should score perfect when all findings match expectations', () => {
    // Simulate perfect AI: detects all positive, ignores all negative
    const findings = new Map<string, ActualFinding[]>()

    for (const seg of POSITIVE_SEGMENTS) {
      findings.set(
        seg.id,
        seg.expectedFindings.map((ef) => ({
          segmentId: seg.id,
          category: ef.category,
          severity: ef.severity,
          description: ef.descriptionKeywords.join(' '),
          confidence: 90,
        })),
      )
    }
    // Negative segments: no findings (correct behavior)

    const result = evaluateFindings(GOLDEN_SEGMENTS, findings)

    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1Score).toBe(1)
    expect(result.falsePositives).toBe(0)
    expect(result.falseNegatives).toBe(0)
    expect(result.trueNegatives).toBe(NEGATIVE_SEGMENTS.length)
  })

  it('should score zero recall when AI returns no findings at all', () => {
    const result = evaluateFindings(GOLDEN_SEGMENTS, new Map())

    expect(result.recall).toBe(0)
    expect(result.trueNegatives).toBe(NEGATIVE_SEGMENTS.length)
    expect(result.falseNegatives).toBe(
      POSITIVE_SEGMENTS.reduce((sum, s) => sum + s.expectedFindings.length, 0),
    )
  })

  it('should penalize precision when AI over-flags negative segments', () => {
    const findings = new Map<string, ActualFinding[]>()

    // Correct: detect all positive findings
    for (const seg of POSITIVE_SEGMENTS) {
      findings.set(
        seg.id,
        seg.expectedFindings.map((ef) => ({
          segmentId: seg.id,
          category: ef.category,
          severity: ef.severity,
          description: ef.descriptionKeywords.join(' '),
          confidence: 90,
        })),
      )
    }
    // Wrong: also flag all negative segments (false positives)
    for (const seg of NEGATIVE_SEGMENTS) {
      findings.set(seg.id, [
        {
          segmentId: seg.id,
          category: 'style',
          severity: 'minor',
          description: 'unnecessary flag',
          confidence: 50,
        },
      ])
    }

    const result = evaluateFindings(GOLDEN_SEGMENTS, findings)

    expect(result.recall).toBe(1) // All positives found
    expect(result.precision).toBeLessThan(1) // Over-flagging penalized
    expect(result.falsePositives).toBe(NEGATIVE_SEGMENTS.length)
  })
})
