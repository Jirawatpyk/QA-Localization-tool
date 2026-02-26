// Finding types — canonical source of truth (DB-aligned)
export type FindingSeverity = 'critical' | 'major' | 'minor'

// All 8 valid finding statuses from DB schema (varchar(30))
export type FindingStatus =
  | 'pending'
  | 'accepted'
  | 're_accepted'
  | 'rejected'
  | 'flagged'
  | 'noted'
  | 'source_issue'
  | 'manual'

// Pipeline detection layer (findings.detected_by_layer column)
export type DetectedByLayer = 'L1' | 'L2' | 'L3'

// Score lifecycle statuses (from scores.status column)
export type ScoreStatus =
  | 'calculating'
  | 'calculated'
  | 'partial'
  | 'overridden'
  | 'auto_passed'
  | 'na'

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
