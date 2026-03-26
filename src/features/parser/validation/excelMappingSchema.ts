import { z } from 'zod'

export const excelColumnMappingSchema = z
  .object({
    sourceColumn: z.string().min(1, 'Source column is required').max(200),
    targetColumn: z.string().min(1, 'Target column is required').max(200),
    hasHeader: z.boolean().default(true),
    segmentIdColumn: z.string().max(200).optional(),
    contextColumn: z.string().max(200).optional(),
    languageColumn: z.string().max(200).optional(),
  })
  .refine((data) => data.sourceColumn !== data.targetColumn, {
    message: 'Source and Target columns must be different',
    path: ['targetColumn'],
  })
  .refine(
    (data) => {
      const reserved = new Set([data.sourceColumn, data.targetColumn])
      const optionals = [data.segmentIdColumn, data.contextColumn, data.languageColumn]
      return optionals.every((col) => col === undefined || !reserved.has(col))
    },
    {
      message: 'Optional columns must not be the same as Source or Target column',
      path: ['segmentIdColumn'],
    },
  )

export type ExcelColumnMapping = z.infer<typeof excelColumnMappingSchema>
