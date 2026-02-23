import { z } from 'zod'

export const checkDuplicateSchema = z.object({
  fileHash: z.string().length(64, 'Invalid SHA-256 hash'),
  projectId: z.string().uuid('Invalid project ID'),
})

export const createBatchSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  fileCount: z.number().int().min(1).max(50, 'Maximum 50 files per batch'),
})

export const getUploadedFilesSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
})

export type CheckDuplicateInput = z.infer<typeof checkDuplicateSchema>
export type CreateBatchInput = z.infer<typeof createBatchSchema>
export type GetUploadedFilesInput = z.infer<typeof getUploadedFilesSchema>
