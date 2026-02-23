import { z } from 'zod'

import { MAX_FILE_SIZE_BYTES } from '@/lib/constants'

import { ALLOWED_EXTENSIONS } from '../constants'

export const fileUploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE_BYTES, `File exceeds maximum size of 15MB`),
  fileType: z.enum(['sdlxliff', 'xliff', 'xlsx'], {
    error: `Unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
  }),
  projectId: z.string().uuid('Invalid project ID'),
})

export const checkDuplicateSchema = z.object({
  fileHash: z.string().length(64, 'Invalid SHA-256 hash'),
  projectId: z.string().uuid('Invalid project ID'),
})

export const createBatchSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  fileCount: z.number().int().min(1).max(50, 'Maximum 50 files per batch'),
})

export type FileUploadInput = z.infer<typeof fileUploadSchema>
export type CheckDuplicateInput = z.infer<typeof checkDuplicateSchema>
export type CreateBatchInput = z.infer<typeof createBatchSchema>
