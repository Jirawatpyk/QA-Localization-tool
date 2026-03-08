import type { Severity } from '@/features/pipeline/engine/types'
import type { FindingStatus } from '@/types/finding'

export type { FindingStatus } from '@/types/finding'

export type PenaltyWeights = {
  critical: number
  major: number
  minor: number
}

export type MqmScoreResult = {
  mqmScore: number
  npt: number
  criticalCount: number
  majorCount: number
  minorCount: number
  totalWords: number
  status: 'calculated' | 'na'
}

// Structured auto-pass rationale for Story 3.5 — stored as JSON string in scores.auto_pass_rationale
export type AutoPassRationaleData = {
  score: number
  threshold: number
  margin: number
  severityCounts: {
    critical: number
    major: number
    minor: number
  }
  riskiestFinding: {
    category: string
    severity: string
    confidence: number | null
    description: string
  } | null
  criteria: {
    scoreAboveThreshold: boolean
    noCriticalFindings: boolean
    allLayersComplete: boolean
  }
  isNewPair: boolean
  fileCount: number
}

// Summary of findings passed from scoreFile to checkAutoPass for structured rationale
export type FindingsSummary = {
  severityCounts: {
    critical: number
    major: number
    minor: number
  }
  riskiestFinding: {
    category: string
    severity: string
    confidence: number | null
    description: string
  } | null
}

export type AutoPassResult = {
  eligible: boolean
  rationale: string
  isNewPair: boolean
  fileCount: number
  rationaleData: AutoPassRationaleData | null
}

// Minimal shape needed for scoring (subset of DB finding columns)
export type ContributingFinding = {
  severity: Severity
  status: FindingStatus
  segmentCount: number
}
