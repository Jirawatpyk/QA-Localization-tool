// Finding types — canonical source of truth (DB-aligned)
export type FindingSeverity = 'critical' | 'major' | 'minor'

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
export type DetectedByLayer = 'L1' | 'L2' | 'L3'

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

export type Finding = {
  id: string
  tenantId: string
  projectId: string
  sessionId: string
  segmentId: string
  severity: FindingSeverity
  category: string
  status: FindingStatus
  source: string
  description: string
  createdAt: string
  updatedAt: string
}
