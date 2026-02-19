import { z } from 'zod'

export const importGlossarySchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().min(1, 'Glossary name is required').max(255, 'Name too long'),
  format: z.enum(['csv', 'tbx', 'xlsx']),
})

export const columnMappingSchema = z.object({
  sourceColumn: z.string().min(1, 'Source column required'),
  targetColumn: z.string().min(1, 'Target column required'),
  hasHeader: z.boolean().default(true),
  delimiter: z.enum([',', ';', '\t']).default(','),
})

export const createTermSchema = z.object({
  glossaryId: z.string().uuid('Invalid glossary ID'),
  sourceTerm: z.string().min(1, 'Source term is required').max(500),
  targetTerm: z.string().min(1, 'Target term is required').max(500),
  caseSensitive: z.boolean().default(false),
})

export const updateTermSchema = z.object({
  sourceTerm: z.string().min(1).max(500).optional(),
  targetTerm: z.string().min(1).max(500).optional(),
  caseSensitive: z.boolean().optional(),
})

export type ImportGlossaryInput = z.infer<typeof importGlossarySchema>
export type ColumnMappingInput = z.infer<typeof columnMappingSchema>
export type CreateTermInput = z.infer<typeof createTermSchema>
export type UpdateTermInput = z.infer<typeof updateTermSchema>
