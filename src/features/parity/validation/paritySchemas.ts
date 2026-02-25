import { z } from 'zod'

export const generateParityReportSchema = z.object({
  projectId: z.string().uuid(),
  xbenchReportFile: z.string().min(1),
  fileId: z.string().uuid().optional(),
})

export type GenerateParityReportInput = z.infer<typeof generateParityReportSchema>

export const reportMissingCheckSchema = z.object({
  projectId: z.string().uuid(),
  fileReference: z.string().min(1),
  segmentNumber: z.number().int().positive(),
  expectedDescription: z.string().min(1),
  xbenchCheckType: z.string().min(1),
})

export type ReportMissingCheckInput = z.infer<typeof reportMissingCheckSchema>
