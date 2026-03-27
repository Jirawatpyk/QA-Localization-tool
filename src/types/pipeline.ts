import { z } from 'zod'

import type { FindingStatus } from '@/types/finding'
import type { TenantId } from '@/types/tenant'

/** Branded type for upload batch IDs — prevents accidental assignment of arbitrary strings */
export type UploadBatchId = string & { readonly __brand: 'UploadBatchId' }

// Pipeline types — populated in Epic 2-3
export const PROCESSING_MODES = ['economy', 'thorough'] as const
export type ProcessingMode = (typeof PROCESSING_MODES)[number]

export const PIPELINE_LAYERS = ['L2', 'L3'] as const
export type PipelineLayer = (typeof PIPELINE_LAYERS)[number]

// Zod schemas for Inngest event validation — prevents forged/corrupted tenantId in event data
// tenantId is UUID-strict (security-critical), other IDs are non-empty strings (validated at server action boundary)
// Core validation: tenantId must be a valid UUID (security-critical).
// Other fields validated at server action boundary — passthrough to avoid breaking existing test mocks.
export const pipelineFileEventSchema = z
  .object({
    tenantId: z.string().uuid(),
  })
  .passthrough()

export const pipelineBatchEventSchema = z
  .object({
    tenantId: z.string().uuid(),
  })
  .passthrough()

export const pipelineBatchCompletedEventSchema = z
  .object({
    tenantId: z.string().uuid(),
  })
  .passthrough()

export const pipelineRetryEventSchema = z
  .object({
    tenantId: z.string().uuid(),
  })
  .passthrough()

// Inngest event data types — canonical source for both client.ts schemas and pipeline types.ts
export type PipelineFileEventData = {
  fileId: string
  projectId: string
  tenantId: TenantId
  mode: ProcessingMode
  uploadBatchId: UploadBatchId
  userId: string
}

export type PipelineBatchEventData = {
  batchId: string
  projectId: string
  tenantId: TenantId
  fileIds: string[]
  mode: ProcessingMode
  uploadBatchId: UploadBatchId
  userId: string
}
/** Batch completion event — emitted when all files in batch reach terminal layer (L2 for economy, L3 for thorough). */
export type PipelineBatchCompletedEventData = {
  batchId: string
  projectId: string
  tenantId: TenantId
  mode: ProcessingMode
  userId: string
}

// Finding state change event — triggers score recalculation via Inngest
export type FindingChangedEventData = {
  findingId: string
  fileId: string
  projectId: string
  tenantId: TenantId
  previousState: FindingStatus
  newState: FindingStatus
  triggeredBy: string // userId
  timestamp: string // ISO 8601
  batchId?: string // Story 4.4a: optional — null for single actions, UUID for bulk
}

// DB files.status column — all possible pipeline statuses
export type DbFileStatus =
  | 'uploaded'
  | 'parsing'
  | 'parsed'
  | 'l1_processing'
  | 'l1_completed'
  | 'l2_processing'
  | 'l2_completed'
  | 'l3_processing'
  | 'l3_completed'
  | 'ai_partial'
  | 'failed'

/** File statuses that indicate L1 has been completed (partial results exist) */
export const L1_COMPLETED_STATUSES: ReadonlySet<DbFileStatus> = new Set<DbFileStatus>([
  'l1_completed',
  'l2_processing',
  'l2_completed',
  'l3_processing',
  'l3_completed',
  'ai_partial',
])

// Client-safe primary model constants for fallback badge detection (no server-only import needed)
export const PRIMARY_MODELS: Record<PipelineLayer, string> = {
  L2: 'gpt-4o-mini',
  L3: 'claude-sonnet-4-5-20250929',
} as const

/** Retry failed AI layers event — dispatched by retryAiAnalysis action */
export type RetryFailedLayersEventData = {
  fileId: string
  projectId: string
  tenantId: TenantId
  userId: string
  layersToRetry: PipelineLayer[]
  mode: ProcessingMode
  /** CR-C1: L2 failed chunk segment IDs from original run — forwarded to L3 as "unscreened" */
  l2FailedChunkSegmentIds?: string[]
}

export type PipelineStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type PipelineRun = {
  id: string
  tenantId: TenantId
  projectId: string
  sessionId: string
  mode: ProcessingMode
  status: PipelineStatus
  createdAt: string
  updatedAt: string
}
