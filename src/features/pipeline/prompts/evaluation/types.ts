// ── Prompt Evaluation Types ──

export type ExpectedFinding = {
  /** Which category the AI should detect */
  category: string
  /** Expected severity level */
  severity: 'critical' | 'major' | 'minor'
  /** Keywords that MUST appear in the AI's description (at least one) */
  descriptionKeywords: string[]
}

export type GoldenSegment = {
  /** Unique identifier for this test case */
  id: string
  /** Readable label for test output */
  label: string
  /** Source text */
  source: string
  /** Target text */
  target: string
  /** Source language code */
  sourceLang: string
  /** Target language code */
  targetLang: string
  /** Findings the AI MUST detect (true positives) */
  expectedFindings: ExpectedFinding[]
  /** If true, AI must return NO findings for this segment (true negative) */
  expectNoFinding: boolean
}

export type ActualFinding = {
  segmentId: string
  category: string
  severity: string
  description: string
  confidence: number
}

export type EvaluationResult = {
  segmentId: string
  label: string
  /** True positives: expected findings correctly detected */
  truePositives: number
  /** False negatives: expected findings missed */
  falseNegatives: number
  /** False positives: unexpected findings reported */
  falsePositives: number
  /** True negatives: correctly reported no issues */
  trueNegatives: number
  /** Detailed match results */
  matches: MatchDetail[]
}

export type MatchDetail = {
  expected: ExpectedFinding | null
  actual: ActualFinding | null
  matched: boolean
  reason: string
}

export type EvaluationSummary = {
  totalSegments: number
  precision: number
  recall: number
  f1Score: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  trueNegatives: number
  perSegment: EvaluationResult[]
}
