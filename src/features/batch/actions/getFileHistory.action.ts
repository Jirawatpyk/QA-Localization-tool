// Stub: Story 2.7 — getFileHistory server action
// TODO: Replace with real implementation in Story 2.7 Task 5.1
import 'server-only'

import type { ActionResult } from '@/types/actionResult'

type FileHistoryRow = {
  fileId: string
  fileName: string
  processedAt: string
  status: string
  mqmScore: number | null
  lastReviewerName: string | null
}

type FileHistoryData = {
  files: FileHistoryRow[]
  totalCount: number
}

export async function getFileHistory(_input: unknown): Promise<ActionResult<FileHistoryData>> {
  return { success: false, error: 'Not implemented', code: 'NOT_IMPLEMENTED' }
}
