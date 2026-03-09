'use client'

import { Progress } from '@/components/ui/progress'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { DbFileStatus, ProcessingMode } from '@/types/pipeline'

export type ReviewProgressProps = {
  reviewedCount: number
  totalCount: number
  fileStatus: DbFileStatus
  processingMode: ProcessingMode
}

/** Derive AI processing percentage from file status */
function getAiProgress(fileStatus: DbFileStatus, processingMode: ProcessingMode): number {
  if (fileStatus === 'failed') return 0
  if (fileStatus === 'ai_partial') return 50

  // Economy mode: L2 is the terminal layer
  if (processingMode === 'economy') {
    if (fileStatus === 'l2_completed' || fileStatus === 'l3_completed') return 100
    if (fileStatus === 'l2_processing') return 50
    if (fileStatus === 'l1_completed' || fileStatus === 'l1_processing') return 25
    return 0
  }

  // Thorough mode: L3 is the terminal layer
  if (fileStatus === 'l3_completed') return 100
  if (fileStatus === 'l3_processing') return 75
  if (fileStatus === 'l2_completed') return 50
  if (fileStatus === 'l2_processing') return 30
  if (fileStatus === 'l1_completed' || fileStatus === 'l1_processing') return 15
  return 0
}

/** Derive AI status label */
function getAiStatusLabel(fileStatus: DbFileStatus, processingMode: ProcessingMode): string {
  if (fileStatus === 'failed') return 'AI: error'
  if (fileStatus === 'ai_partial') return 'AI: partial'
  if (fileStatus === 'l2_processing') return 'Processing L2...'
  if (fileStatus === 'l3_processing') return 'Processing L3...'

  if (processingMode === 'economy') {
    if (fileStatus === 'l2_completed' || fileStatus === 'l3_completed') return 'AI: complete'
  } else {
    if (fileStatus === 'l3_completed') return 'AI: complete'
    if (fileStatus === 'l2_completed') return 'AI: L2 complete'
  }

  if (fileStatus === 'l1_completed' || fileStatus === 'l1_processing') return 'AI: pending'
  return 'AI: analyzing...'
}

export function ReviewProgress({
  reviewedCount,
  totalCount,
  fileStatus,
  processingMode,
}: ReviewProgressProps) {
  const reducedMotion = useReducedMotion()

  const reviewPercent = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0
  const aiProgress = getAiProgress(fileStatus, processingMode)
  const aiLabel = getAiStatusLabel(fileStatus, processingMode)
  const isAiComplete = aiProgress === 100
  const isReviewComplete = totalCount > 0 && reviewedCount >= totalCount
  const isAllDone = isAiComplete && isReviewComplete
  const isFailed = fileStatus === 'failed'

  // Review label
  const reviewLabel = isAllDone ? 'All reviewed' : `Reviewed: ${reviewedCount}/${totalCount}`

  return (
    <div data-testid="review-progress" className={`flex flex-col gap-2 ${reducedMotion ? '' : ''}`}>
      {/* Track 1: Review progress */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium min-w-[120px]">{reviewLabel}</span>
        <div
          data-testid="review-progress-bar"
          role="progressbar"
          aria-valuenow={reviewedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label="Review progress"
          className="flex-1"
        >
          <Progress
            value={reviewPercent}
            className={reducedMotion ? '[&>div]:transition-none' : ''}
          />
        </div>
        {isReviewComplete && (
          <span className="text-xs text-status-pass" aria-hidden="true">
            ✓
          </span>
        )}
      </div>

      {/* Track 2: AI processing status */}
      <div className="flex items-center gap-3" data-testid="ai-status-track">
        <span className={`text-sm font-medium min-w-[120px] ${isFailed ? 'text-destructive' : ''}`}>
          {aiLabel}
        </span>
        <div
          data-testid="ai-progress-bar"
          role="progressbar"
          aria-valuenow={aiProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="AI processing progress"
          className="flex-1"
        >
          <Progress value={aiProgress} className={reducedMotion ? '[&>div]:transition-none' : ''} />
        </div>
        {isAiComplete && (
          <span className="text-xs text-status-pass" aria-hidden="true">
            ✓
          </span>
        )}
      </div>

      {/* All Done label */}
      {isAllDone && <span className="text-xs text-status-pass font-medium">All Done</span>}
    </div>
  )
}
