import { z } from 'zod'

export const addToGlossarySchema = z.object({
  findingId: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceLang: z.string().min(1, 'Source language is required'),
  targetLang: z.string().min(1, 'Target language is required'),
  sourceTerm: z
    .string()
    .min(1, 'Source term is required')
    .max(500, 'Source term too long (max 500)'),
  targetTerm: z
    .string()
    .min(1, 'Target term is required')
    .max(500, 'Target term too long (max 500)'),
  notes: z.string().max(1000, 'Notes too long (max 1000)').optional(),
  caseSensitive: z.boolean().default(false),
})

export type AddToGlossaryInput = z.infer<typeof addToGlossarySchema>

export const updateGlossaryTermSchema = z.object({
  termId: z.string().uuid(),
  targetTerm: z
    .string()
    .min(1, 'Target term is required')
    .max(500, 'Target term too long (max 500)'),
  projectId: z.string().uuid(),
})

export type UpdateGlossaryTermInput = z.infer<typeof updateGlossaryTermSchema>
