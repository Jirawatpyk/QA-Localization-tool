import { z } from 'zod'

export const calculateScoreSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})
