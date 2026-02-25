import { z } from 'zod'

export const getBatchSummarySchema = z.object({
  batchId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type GetBatchSummaryInput = z.infer<typeof getBatchSummarySchema>

export const FILE_HISTORY_FILTERS = ['all', 'passed', 'needs_review', 'failed'] as const

export const getFileHistorySchema = z.object({
  projectId: z.string().uuid(),
  filter: z.enum(FILE_HISTORY_FILTERS),
  page: z.number().int().positive().optional(),
})

export type GetFileHistoryInput = z.infer<typeof getFileHistorySchema>
