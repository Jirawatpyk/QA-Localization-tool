import { z } from 'zod'

// M2: 10 MB limit for Xbench report uploads — prevents unbounded memory usage
const MAX_XBENCH_REPORT_BYTES = 10 * 1024 * 1024

const xbenchReportBuffer = z
  .instanceof(Uint8Array)
  .refine((buf) => buf.byteLength <= MAX_XBENCH_REPORT_BYTES, {
    message: `Xbench report must be under ${MAX_XBENCH_REPORT_BYTES / 1024 / 1024} MB`,
  })

export const generateParityReportSchema = z.object({
  projectId: z.string().uuid(),
  xbenchReportBuffer,
  fileId: z.string().uuid().optional(),
})

export type GenerateParityReportInput = z.infer<typeof generateParityReportSchema>

export const compareWithXbenchSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  xbenchReportBuffer,
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
