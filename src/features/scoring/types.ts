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

export type AutoPassResult =
  | { eligible: true; rationale: string; isNewPair: boolean; fileCount: number }
  | { eligible: false; rationale: string; isNewPair: boolean; fileCount: number }

export type ScoreInput = {
  fileId: string
  projectId: string
}

// Minimal shape needed for scoring (subset of DB finding columns)
export type ContributingFinding = {
  severity: Severity
  status: FindingStatus
  segmentCount: number
}
