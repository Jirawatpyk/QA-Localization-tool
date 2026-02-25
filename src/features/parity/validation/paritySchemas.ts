import { z } from 'zod'

export const generateParityReportSchema = z.object({
  projectId: z.string().uuid(),
  xbenchReportBuffer: z.instanceof(Uint8Array),
  fileId: z.string().uuid().optional(),
})

export type GenerateParityReportInput = z.infer<typeof generateParityReportSchema>

export const compareWithXbenchSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  xbenchReportBuffer: z.instanceof(Uint8Array),
})

export type CompareWithXbenchInput = z.infer<typeof compareWithXbenchSchema>

export const reportMissingCheckSchema = z.object({
  projectId: z.string().uuid(),
  fileReference: z.string().min(1),
  segmentNumber: z.number().int().positive(),
  expectedDescription: z.string().min(1),
  xbenchCheckType: z.string().min(1),
})

export type ReportMissingCheckInput = z.infer<typeof reportMissingCheckSchema>
