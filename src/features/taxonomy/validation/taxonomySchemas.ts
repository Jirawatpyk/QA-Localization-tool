import { z } from 'zod'

export const severityValues = ['critical', 'major', 'minor'] as const
export type Severity = (typeof severityValues)[number]

export const createMappingSchema = z.object({
  category: z.string().trim().min(1, 'MQM category is required').max(100),
  parentCategory: z.string().trim().max(100).nullable().optional(),
  internalName: z.string().trim().min(1, 'QA Cosmetic name is required').max(200),
  severity: z.enum(severityValues),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(1000, 'Description too long'),
})

export const updateMappingSchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  parentCategory: z.string().trim().max(100).nullable().optional(),
  internalName: z.string().trim().min(1).max(200).optional(),
  severity: z.enum(severityValues).optional(),
  description: z.string().trim().min(1).max(1000, 'Description too long').optional(),
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
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, 'Duplicate IDs')

export type CreateMappingInput = z.infer<typeof createMappingSchema>
export type UpdateMappingInput = z.infer<typeof updateMappingSchema>
export type ReorderMappingsInput = z.infer<typeof reorderMappingsSchema>
