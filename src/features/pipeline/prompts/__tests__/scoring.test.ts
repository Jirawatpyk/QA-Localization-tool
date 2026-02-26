import { describe, expect, it } from 'vitest'

import { evaluateFindings, formatEvaluationReport } from '../evaluation/scoring'
import type { ActualFinding, GoldenSegment } from '../evaluation/types'

describe('evaluateFindings', () => {
  const makeSegment = (
    overrides: Partial<GoldenSegment> & Pick<GoldenSegment, 'id'>,
  ): GoldenSegment => ({
    label: 'test segment',
    source: 'Hello',
    target: 'สวัสดี',
    sourceLang: 'en',
    targetLang: 'th',
    expectedFindings: [],
    expectNoFinding: false,
    ...overrides,
  })

  const makeFinding = (overrides: Partial<ActualFinding> = {}): ActualFinding => ({
    segmentId: 'seg-1',
    category: 'accuracy',
    severity: 'major',
    description: 'Test finding description',
    confidence: 80,
    ...overrides,
  })

  describe('true negative (clean segment)', () => {
    it('should score TN=1 when AI correctly returns no findings', () => {
      const segments: GoldenSegment[] = [makeSegment({ id: 'seg-1', expectNoFinding: true })]
      const findings = new Map<string, ActualFinding[]>()

      const result = evaluateFindings(segments, findings)

      expect(result.trueNegatives).toBe(1)
      expect(result.falsePositives).toBe(0)
      expect(result.precision).toBe(1)
      expect(result.recall).toBe(1)
      expect(result.f1Score).toBe(1)
    })

    it('should score FP when AI flags a clean segment', () => {
      const segments: GoldenSegment[] = [makeSegment({ id: 'seg-1', expectNoFinding: true })]
      const findings = new Map([['seg-1', [makeFinding({ segmentId: 'seg-1' })]]])

      const result = evaluateFindings(segments, findings)

      expect(result.trueNegatives).toBe(0)
      expect(result.falsePositives).toBe(1)
      expect(result.precision).toBe(0)
    })
  })

  describe('true positive (finding detected)', () => {
    it('should score TP=1 when AI correctly detects expected finding', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['mistranslation'] },
          ],
        }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'This is a mistranslation of the source',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.truePositives).toBe(1)
      expect(result.falseNegatives).toBe(0)
      expect(result.recall).toBe(1)
    })

    it('should match case-insensitively on category', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'Accuracy', severity: 'major', descriptionKeywords: ['error'] },
          ],
        }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Translation error found',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.truePositives).toBe(1)
    })

    it('should match partial category names', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'style', severity: 'minor', descriptionKeywords: ['punctuation'] },
          ],
        }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'style',
              description: 'Halfwidth punctuation used instead of fullwidth',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)
      expect(result.truePositives).toBe(1)
    })
  })

  describe('false negative (finding missed)', () => {
    it('should score FN when AI misses an expected finding', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['omission'] },
          ],
        }),
      ]
      const findings = new Map<string, ActualFinding[]>()

      const result = evaluateFindings(segments, findings)

      expect(result.falseNegatives).toBe(1)
      expect(result.truePositives).toBe(0)
      expect(result.recall).toBe(0)
    })

    it('should score FN when category matches but keywords do not', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            {
              category: 'accuracy',
              severity: 'critical',
              descriptionKeywords: ['omission', 'missing'],
            },
          ],
        }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Spelling error in target text',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      // No keyword match → FN for expected + FP for actual
      expect(result.falseNegatives).toBe(1)
      expect(result.falsePositives).toBe(1)
    })
  })

  describe('false positive (unexpected finding)', () => {
    it('should score FP for findings not in expected list', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['meaning'] },
          ],
        }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Changed meaning',
            }),
            makeFinding({
              segmentId: 'seg-1',
              category: 'fluency',
              description: 'Awkward phrasing',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.truePositives).toBe(1) // accuracy matched
      expect(result.falsePositives).toBe(1) // fluency was unexpected
    })
  })

  describe('aggregate metrics', () => {
    it('should calculate precision correctly', () => {
      // 2 TP, 1 FP → precision = 2/3
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['error'] },
          ],
        }),
        makeSegment({
          id: 'seg-2',
          expectedFindings: [
            { category: 'fluency', severity: 'minor', descriptionKeywords: ['awkward'] },
          ],
        }),
        makeSegment({ id: 'seg-3', expectNoFinding: true }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Translation error',
            }),
          ],
        ],
        [
          'seg-2',
          [
            makeFinding({
              segmentId: 'seg-2',
              category: 'fluency',
              description: 'Awkward phrasing',
            }),
          ],
        ],
        [
          'seg-3',
          [
            makeFinding({
              segmentId: 'seg-3',
              category: 'style',
              description: 'Minor style issue',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.truePositives).toBe(2)
      expect(result.falsePositives).toBe(1)
      expect(result.precision).toBeCloseTo(0.667, 2)
      expect(result.recall).toBe(1)
    })

    it('should calculate recall correctly', () => {
      // 1 TP, 1 FN → recall = 1/2
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['error'] },
          ],
        }),
        makeSegment({
          id: 'seg-2',
          expectedFindings: [
            { category: 'fluency', severity: 'minor', descriptionKeywords: ['awkward'] },
          ],
        }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Translation error',
            }),
          ],
        ],
        // seg-2: no findings → missed
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.truePositives).toBe(1)
      expect(result.falseNegatives).toBe(1)
      expect(result.recall).toBe(0.5)
    })

    it('should calculate F1 score correctly', () => {
      // precision=0.667, recall=0.5 → F1 = 2*0.667*0.5/(0.667+0.5) = 0.571
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['error'] },
          ],
        }),
        makeSegment({
          id: 'seg-2',
          expectedFindings: [
            { category: 'fluency', severity: 'minor', descriptionKeywords: ['awkward'] },
          ],
        }),
        makeSegment({ id: 'seg-3', expectNoFinding: true }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Translation error',
            }),
          ],
        ],
        // seg-2: missed
        [
          'seg-3',
          [makeFinding({ segmentId: 'seg-3', category: 'style', description: 'False alarm' })],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.precision).toBeCloseTo(0.5, 2)
      expect(result.recall).toBe(0.5)
      expect(result.f1Score).toBe(0.5)
    })

    it('should handle perfect score (all correct)', () => {
      const segments: GoldenSegment[] = [
        makeSegment({
          id: 'seg-1',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['error'] },
          ],
        }),
        makeSegment({ id: 'seg-2', expectNoFinding: true }),
      ]
      const findings = new Map([
        [
          'seg-1',
          [
            makeFinding({
              segmentId: 'seg-1',
              category: 'accuracy',
              description: 'Translation error',
            }),
          ],
        ],
      ])

      const result = evaluateFindings(segments, findings)

      expect(result.precision).toBe(1)
      expect(result.recall).toBe(1)
      expect(result.f1Score).toBe(1)
      expect(result.truePositives).toBe(1)
      expect(result.trueNegatives).toBe(1)
    })

    it('should handle empty segments', () => {
      const result = evaluateFindings([], new Map())

      expect(result.totalSegments).toBe(0)
      expect(result.precision).toBe(1) // vacuous truth
      expect(result.recall).toBe(1)
      expect(result.f1Score).toBe(1)
    })
  })
})

describe('formatEvaluationReport', () => {
  it('should generate human-readable report', () => {
    const summary = evaluateFindings(
      [
        {
          id: 'seg-1',
          label: 'Test segment',
          source: 'Hello',
          target: 'สวัสดี',
          sourceLang: 'en',
          targetLang: 'th',
          expectedFindings: [
            { category: 'accuracy', severity: 'critical', descriptionKeywords: ['error'] },
          ],
          expectNoFinding: false,
        },
      ],
      new Map([
        [
          'seg-1',
          [
            {
              segmentId: 'seg-1',
              category: 'accuracy',
              severity: 'critical',
              description: 'Translation error',
              confidence: 90,
            },
          ],
        ],
      ]),
    )

    const report = formatEvaluationReport(summary)

    expect(report).toContain('# Prompt Evaluation Report')
    expect(report).toContain('Precision')
    expect(report).toContain('Recall')
    expect(report).toContain('F1 Score')
    expect(report).toContain('Test segment')
    expect(report).toContain('✅')
  })
})
