import { z } from 'zod'

import { PROCESSING_MODES } from '@/types/pipeline'

export const startProcessingSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate file IDs are not allowed',
    }),
  projectId: z.string().uuid(),
  mode: z.enum(PROCESSING_MODES),
})

export type StartProcessingInput = z.infer<typeof startProcessingSchema>
