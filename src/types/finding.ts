// Finding types — populated in Epic 2
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'enhancement'
export type FindingStatus = 'pending' | 'accepted' | 'rejected' | 'edited'

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
