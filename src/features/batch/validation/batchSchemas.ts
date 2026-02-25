// Stub: Story 2.7 — batch validation schemas
// TODO: Implement in Story 2.7
import { z } from 'zod'

export const getBatchSummarySchema = z.object({
  batchId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type GetBatchSummaryInput = z.infer<typeof getBatchSummarySchema>

export const getFileHistorySchema = z.object({
  projectId: z.string().uuid(),
  filter: z.enum(['all', 'passed', 'needs_review', 'failed']),
  page: z.number().int().positive().optional(),
})

export type GetFileHistoryInput = z.infer<typeof getFileHistorySchema>
