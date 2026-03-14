// Finding types — canonical source of truth (DB-aligned)
// Const array for runtime validation (Guardrail #3), type derived from it
export const FINDING_SEVERITIES = ['critical', 'major', 'minor'] as const
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]

// All 8 valid finding statuses from DB schema (varchar(30))
// Const array for runtime validation (Zod enum, Set membership), type derived from it
export const FINDING_STATUSES = [
  'pending',
  'accepted',
  're_accepted',
  'rejected',
  'flagged',
  'noted',
  'source_issue',
  'manual',
] as const

export type FindingStatus = (typeof FINDING_STATUSES)[number]

// Pipeline detection layer (findings.detected_by_layer column)
// Const array for runtime validation (Guardrail #3), type derived from it
export const DETECTED_BY_LAYERS = ['L1', 'L2', 'L3'] as const
export type DetectedByLayer = (typeof DETECTED_BY_LAYERS)[number]

// Score lifecycle statuses (from scores.status column)
// Const array for runtime validation, type derived from it
export const SCORE_STATUSES = [
  'calculating',
  'calculated',
  'partial',
  'overridden',
  'auto_passed',
  'na',
] as const

export type ScoreStatus = (typeof SCORE_STATUSES)[number]

// Layer completion tracking (matches scores.layer_completed DB column)
export type LayerCompleted = 'L1' | 'L1L2' | 'L1L2L3'

// ScoreBadge visual states (NOT the DB lifecycle type — that's ScoreStatus above)
// These represent the visual appearance of the score badge in the UI
export type ScoreBadgeState =
  | 'pass'
  | 'review'
  | 'fail'
  | 'analyzing'
  | 'rule-only'
  | 'ai-screened'
  | 'deep-analyzed'
  | 'partial'
export type ScoreBadgeSize = 'sm' | 'md' | 'lg'

// Score impact per finding status — maps each status to whether it counts as MQM penalty
export type FindingStatusScoreImpact = Record<FindingStatus, { countsPenalty: boolean }>

export type Finding = {
  id: string
  tenantId: string
  projectId: string
  sessionId: string
  segmentId: string | null
  severity: FindingSeverity
  category: string
  status: FindingStatus
  description: string
  createdAt: string
  updatedAt: string
  // DB-aligned fields (Story 3.2c AC3)
  fileId: string | null
  detectedByLayer: DetectedByLayer
  aiModel: string | null
  aiConfidence: number | null
  suggestedFix: string | null
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  segmentCount: number
  scope: 'per-file' | 'cross-file'
  reviewSessionId: string | null
  relatedFileIds: string[] | null
}
