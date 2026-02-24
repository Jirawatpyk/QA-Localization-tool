import type { ProcessingMode } from '@/types/pipeline'

export type { ProcessingMode }

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
