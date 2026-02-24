// Stub — Story 2.6 TDD RED phase. Implementation pending.

import { z } from 'zod'

export const startProcessingSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(100),
  projectId: z.string().uuid(),
  mode: z.enum(['economy', 'thorough']),
})

export type StartProcessingInput = z.infer<typeof startProcessingSchema>
