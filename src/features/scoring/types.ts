import type { Severity } from '@/features/pipeline/engine/types'

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

// All valid finding statuses — calculator filters internally via CONTRIBUTING_STATUSES
export type FindingStatus =
  | 'pending'
  | 'accepted'
  | 're_accepted'
  | 'rejected'
  | 'flagged'
  | 'noted'
  | 'source_issue'
  | 'manual'

// Minimal shape needed for scoring (subset of DB finding columns)
export type ContributingFinding = {
  severity: Severity
  status: FindingStatus
  segmentCount: number
}
