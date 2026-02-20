import { z } from 'zod'

export const severityValues = ['critical', 'major', 'minor'] as const
export type Severity = (typeof severityValues)[number]

export const createMappingSchema = z.object({
  category: z.string().min(1, 'MQM category is required').max(100),
  parentCategory: z.string().max(100).nullable().optional(),
  internalName: z.string().min(1, 'QA Cosmetic name is required').max(200),
  severity: z.enum(severityValues),
  description: z.string().min(1, 'Description is required'),
})

export const updateMappingSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  parentCategory: z.string().max(100).nullable().optional(),
  internalName: z.string().min(1).max(200).optional(),
  severity: z.enum(severityValues).optional(),
  description: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

export const reorderMappingsSchema = z
  .array(
    z.object({
      id: z.string().uuid('Invalid mapping ID'),
      displayOrder: z.number().int().min(0),
    }),
  )
  .min(1, 'At least one mapping required')

export type CreateMappingInput = z.infer<typeof createMappingSchema>
export type UpdateMappingInput = z.infer<typeof updateMappingSchema>
export type ReorderMappingsInput = z.infer<typeof reorderMappingsSchema>
