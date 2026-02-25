// Stub: Story 2.7 — getBatchSummary server action
// TODO: Replace with real implementation in Story 2.7 Task 3.1
import 'server-only'

import type { ActionResult } from '@/types/actionResult'

type FileInBatch = {
  fileId: string
  fileName: string
  status: string
  mqmScore: number | null
  criticalCount: number
  majorCount: number
  minorCount: number
}

type BatchSummaryData = {
  totalFiles: number
  passedCount: number
  needsReviewCount: number
  processingTimeMs: number
  recommendedPass: FileInBatch[]
  needReview: FileInBatch[]
}

export async function getBatchSummary(_input: unknown): Promise<ActionResult<BatchSummaryData>> {
  return { success: false, error: 'Not implemented', code: 'NOT_IMPLEMENTED' }
}
