'use client'

import type { LayerCompleted } from '@/types/finding'
import type { DbFileStatus, ProcessingMode } from '@/types/pipeline'

type ReviewProgressProps = {
  layerCompleted: LayerCompleted | null
  fileStatus: DbFileStatus
  processingMode: ProcessingMode
}

type StepStatus = 'complete' | 'processing' | 'pending' | 'na'

function getL2Status(fileStatus: DbFileStatus, layerCompleted: LayerCompleted | null): StepStatus {
  if (layerCompleted === 'L1L2' || layerCompleted === 'L1L2L3') return 'complete'
  if (fileStatus === 'l2_processing') return 'processing'
  return 'pending'
}

function getL3Status(
  fileStatus: DbFileStatus,
  layerCompleted: LayerCompleted | null,
  processingMode: ProcessingMode,
): StepStatus {
  if (processingMode === 'economy') return 'na'
  if (layerCompleted === 'L1L2L3') return 'complete'
  if (fileStatus === 'l3_processing') return 'processing'
  return 'pending'
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center">
        <svg
          className="h-4 w-4 text-status-pass"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
        <span className="sr-only">complete</span>
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center animate-spin">
        <svg
          className="h-4 w-4 text-status-analyzing"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="sr-only">processing</span>
      </span>
    )
  }
  if (status === 'na') {
    return <span className="text-xs text-muted-foreground font-medium">N/A</span>
  }
  // pending
  return <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
}

export function ReviewProgress({
  layerCompleted,
  fileStatus,
  processingMode,
}: ReviewProgressProps) {
  const l2Status = getL2Status(fileStatus, layerCompleted)
  const l3Status = getL3Status(fileStatus, layerCompleted, processingMode)

  const l2Complete = l2Status === 'complete'

  return (
    <div data-testid="review-progress" className="flex items-center gap-3 text-sm">
      <div data-testid="layer-status-L1" data-completed="true" className="flex items-center gap-1">
        <StatusIcon status="complete" />
        <span>Rules</span>
      </div>
      <div
        data-testid="layer-status-L2"
        data-completed={l2Status === 'complete' ? 'true' : undefined}
        className="flex items-center gap-1"
      >
        <StatusIcon status={l2Status} />
        <span>AI Screening</span>
      </div>
      <div
        data-testid="layer-status-L3"
        data-completed={l3Status === 'complete' ? 'true' : undefined}
        className="flex items-center gap-1"
      >
        <StatusIcon status={l3Status} />
        <span>Deep Analysis</span>
      </div>
      {l2Complete && <span className="text-xs text-muted-foreground ml-2">AI: L2 complete</span>}
    </div>
  )
}
