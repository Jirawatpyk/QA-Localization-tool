// Stub: Story 2.7 — parity validation schemas
// TODO: Implement in Story 2.7
import { z } from 'zod'

export const generateParityReportSchema = z.object({
  projectId: z.string().uuid(),
  xbenchReportFile: z.string().min(1),
  fileId: z.string().uuid().optional(),
})

export type GenerateParityReportInput = z.infer<typeof generateParityReportSchema>

export const reportMissingCheckSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid(),
  segmentNumber: z.number().int().positive(),
  expectedCategory: z.string().min(1),
  expectedDescription: z.string().min(1),
})

export type ReportMissingCheckInput = z.infer<typeof reportMissingCheckSchema>
