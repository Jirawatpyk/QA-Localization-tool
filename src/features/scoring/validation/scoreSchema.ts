import { z } from 'zod'

export const calculateScoreSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export type CalculateScoreInput = z.infer<typeof calculateScoreSchema>
