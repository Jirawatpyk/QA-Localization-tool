import { z } from 'zod'

// Base schema shared by all review actions
const reviewActionBaseSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

export const acceptFindingSchema = reviewActionBaseSchema
export const rejectFindingSchema = reviewActionBaseSchema
export const flagFindingSchema = reviewActionBaseSchema

// Inferred input types
export type AcceptFindingInput = z.infer<typeof acceptFindingSchema>
export type RejectFindingInput = z.infer<typeof rejectFindingSchema>
export type FlagFindingInput = z.infer<typeof flagFindingSchema>
