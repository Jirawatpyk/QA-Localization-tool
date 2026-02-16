// Pipeline types — populated in Epic 2-3
export type ProcessingMode = 'economy' | 'thorough'
export type PipelineStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type PipelineRun = {
  id: string
  tenantId: string
  projectId: string
  sessionId: string
  mode: ProcessingMode
  status: PipelineStatus
  createdAt: string
  updatedAt: string
}
