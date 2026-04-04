'use client'

import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import type { LayerCompleted, ScoreBadgeState } from '@/types/finding'

type ReviewStatusBarProps = {
  score: number | null
  badgeState: ScoreBadgeState | undefined
  reviewedCount: number
  totalCount: number
  layerCompleted: LayerCompleted | null
  processingMode: 'economy' | 'thorough'
  isVisible: boolean
}

function getAiStatusText(
  layerCompleted: LayerCompleted | null,
  processingMode: 'economy' | 'thorough',
): { text: string; colorClass: string } {
  if (layerCompleted === null) {
    return { text: 'Rule-based', colorClass: 'text-muted-foreground' }
  }
  switch (layerCompleted) {
    case 'L1':
      return { text: 'AI L2 processing...', colorClass: 'text-info' }
    case 'L1L2':
      if (processingMode === 'thorough') {
        return { text: 'AI L3 processing...', colorClass: 'text-warning-foreground' }
      }
      return { text: 'Complete', colorClass: 'text-success' }
    case 'L1L2L3':
      return { text: 'Complete', colorClass: 'text-success' }
    default:
      return { text: 'Unknown', colorClass: 'text-muted-foreground' }
  }
}

/**
 * ReviewStatusBar — 32px persistent status bar at bottom of review layout.
 * Shows: Score | Progress | AI Status | Keyboard Shortcuts.
 * Hidden at < 1024px (mobile — not enough vertical space).
 *
 * S-FIX-4 AC2 (UX-NEW-09)
 */
export function ReviewStatusBar({
  score,
  badgeState,
  reviewedCount,
  totalCount,
  layerCompleted,
  processingMode,
  isVisible,
}: ReviewStatusBarProps) {
  if (!isVisible) return null

  const remaining = totalCount - reviewedCount
  const aiStatus = getAiStatusText(layerCompleted, processingMode)

  return (
    <div
      className="h-8 sticky bottom-0 z-[5] flex items-center justify-between px-4 bg-surface-secondary border-t border-border text-xs shrink-0"
      data-testid="review-status-bar"
    >
      {/* Section 1: Score */}
      <div className="flex items-center gap-2" role="status" aria-label="Current MQM score">
        <span className="text-muted-foreground">Score:</span>
        <ScoreBadge score={score} size="sm" state={badgeState} />
      </div>

      {/* Section 2: Progress */}
      <div role="status" aria-label="Review progress" aria-live="polite">
        <span className="font-mono">
          {reviewedCount}/{totalCount}
        </span>
        <span className="text-muted-foreground ml-1">reviewed ({remaining} remaining)</span>
      </div>

      {/* Section 3: AI Status */}
      <div role="status" aria-label="AI analysis status">
        <span className={aiStatus.colorClass}>{aiStatus.text}</span>
      </div>

      {/* Section 4: Keyboard Shortcuts */}
      <div className="text-muted-foreground hidden lg:block" aria-label="Keyboard shortcuts">
        J/K navigate &nbsp; A accept &nbsp; R reject &nbsp; ? help
      </div>
    </div>
  )
}
