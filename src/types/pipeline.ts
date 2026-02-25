// Pipeline types — populated in Epic 2-3
export const PROCESSING_MODES = ['economy', 'thorough'] as const
export type ProcessingMode = (typeof PROCESSING_MODES)[number]

// Inngest event data types — canonical source for both client.ts schemas and pipeline types.ts
export type PipelineFileEventData = {
  fileId: string
  projectId: string
  tenantId: string
  mode: ProcessingMode
  uploadBatchId: string
  userId: string
}

export type PipelineBatchEventData = {
  batchId: string
  projectId: string
  tenantId: string
  fileIds: string[]
  mode: ProcessingMode
  uploadBatchId: string
  userId: string
}
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
