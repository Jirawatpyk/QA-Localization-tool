export type FileInBatch = {
  fileId: string
  fileName: string
  status: string
  createdAt: Date
  updatedAt: Date
  mqmScore: number | null
  scoreStatus: string | null
  criticalCount: number | null
  majorCount: number | null
  minorCount: number | null
}

export type BatchFileGroup = {
  recommendedPass: FileInBatch[]
  needsReview: FileInBatch[]
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
  processingStatus: string
  mqmScore: number | null
  scoreStatus: string | null
  criticalCount: number | null
  lastReviewerName: string | null
  decisionStatus: string | null
}

export const FILE_HISTORY_PAGE_SIZE = 50
