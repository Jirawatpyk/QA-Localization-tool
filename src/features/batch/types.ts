import type { ScoreStatus } from '@/types/finding'
import type { DbFileStatus } from '@/types/pipeline'

export type FileInBatch = {
  fileId: string
  fileName: string
  status: DbFileStatus
  createdAt: Date
  updatedAt: Date
  mqmScore: number | null
  scoreStatus: ScoreStatus | null
  criticalCount: number | null
  majorCount: number | null
  minorCount: number | null
}

export type BatchSummaryData = {
  batchId: string
  projectId: string
  totalFiles: number
  passedCount: number
  needsReviewCount: number
  processingTimeMs: number | null
  recommendedPass: FileInBatch[]
  needsReview: FileInBatch[]
  crossFileFindings: CrossFileFindingSummary[]
}

export type CrossFileFindingSummary = {
  id: string
  description: string
  sourceTextExcerpt: string | null
  relatedFileIds: string[]
}

export type FileHistoryRow = {
  id: string
  fileName: string
  uploadDate: Date
  processingStatus: DbFileStatus
  mqmScore: number | null
  scoreStatus: ScoreStatus | null
  criticalCount: number | null
  lastReviewerName: string | null
  decisionStatus: string | null // TODO(story-4.x): define union type when review decisions are built
}

export const FILE_HISTORY_PAGE_SIZE = 50
