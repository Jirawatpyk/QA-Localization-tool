// Review types — populated in Epic 4
export type ReviewSessionStatus = 'active' | 'completed' | 'archived'

export type ReviewSession = {
  id: string
  tenantId: string
  projectId: string
  status: ReviewSessionStatus
  reviewerId: string
  createdAt: string
  updatedAt: string
}
