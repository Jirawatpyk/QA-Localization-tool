'use client'

import { MessageSquare } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import type { SegmentForContext } from '@/features/review/actions/getSegmentContext.action'
import { SegmentTextDisplay } from '@/features/review/components/SegmentTextDisplay'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type SegmentContextListProps = {
  contextBefore: SegmentForContext[]
  currentSegment: SegmentForContext
  contextAfter: SegmentForContext[]
  findingsBySegmentId: Record<string, string[]>
  onNavigateToFinding: (findingId: string) => void
  sourceExcerpt?: string | null | undefined
  targetExcerpt?: string | null | undefined
}

type LoadingProps = {
  contextRange: number
}

type ErrorProps = {
  error: string
  onRetry: () => void
}

/**
 * Renders the surrounding segment context (before + current + after) in a vertical list.
 * Context segments with findings show clickable affordance for navigation.
 * Per-segment lang attribute (Guardrail #39, SC 3.1.2).
 */
export function SegmentContextList({
  contextBefore,
  currentSegment,
  contextAfter,
  findingsBySegmentId,
  onNavigateToFinding,
  sourceExcerpt,
  targetExcerpt,
}: SegmentContextListProps) {
  function handleSegmentClick(segmentId: string) {
    const findingIds = findingsBySegmentId[segmentId]
    if (findingIds && findingIds.length > 0) {
      onNavigateToFinding(findingIds[0]!)
    }
  }

  function renderSegmentRow(segment: SegmentForContext, isCurrent: boolean) {
    const hasFindings = !isCurrent && (findingsBySegmentId[segment.id]?.length ?? 0) > 0
    const isClickable = hasFindings

    return (
      <div
        key={segment.id}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={
          isClickable ? `Navigate to finding in segment ${segment.segmentNumber}` : undefined
        }
        className={`grid grid-cols-2 gap-3 px-3 py-2 ${
          isCurrent
            ? 'bg-primary/5 text-base'
            : `opacity-70 text-sm bg-muted/30 ${
                isClickable
                  ? 'underline decoration-dotted cursor-pointer hover:bg-accent/50'
                  : 'cursor-default'
              }`
        } ${isCurrent ? '' : 'border-t border-border'}`}
        onClick={isClickable ? () => handleSegmentClick(segment.id) : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSegmentClick(segment.id)
                }
              }
            : undefined
        }
        data-testid={isCurrent ? 'current-segment' : 'context-segment'}
      >
        {/* Source column */}
        <div className="min-w-0 break-words">
          <span className="text-xs text-muted-foreground block mb-0.5">
            Seg {segment.segmentNumber}
            {isClickable && <MessageSquare className="inline h-3 w-3 ml-1" aria-hidden="true" />}
          </span>
          <SegmentTextDisplay
            fullText={segment.sourceText}
            excerpt={isCurrent ? (sourceExcerpt ?? null) : null}
            lang={segment.sourceLang}
            label="source"
          />
        </div>
        {/* Target column */}
        <div className="min-w-0 break-words">
          <SegmentTextDisplay
            fullText={segment.targetText}
            excerpt={isCurrent ? (targetExcerpt ?? null) : null}
            lang={segment.targetLang}
            label="target"
          />
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="segment-context-loaded"
      className="rounded border border-border overflow-hidden"
    >
      {contextBefore.map((seg) => renderSegmentRow(seg, false))}
      {renderSegmentRow(currentSegment, true)}
      {contextAfter.map((seg) => renderSegmentRow(seg, false))}
    </div>
  )
}

/** Loading skeleton matching the 2-column segment layout */
export function SegmentContextSkeleton({ contextRange }: LoadingProps) {
  const reducedMotion = useReducedMotion()
  const rowCount = contextRange * 2 + 1

  return (
    <div
      data-testid="segment-context-skeleton"
      className={reducedMotion ? '[&_*]:animate-none' : ''}
    >
      {Array.from({ length: rowCount }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-2 gap-3 px-3 py-2 border-t border-border first:border-t-0"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

/** Error state for segment context area */
export function SegmentContextError({ error, onRetry }: ErrorProps) {
  return (
    <div
      className="text-sm text-error p-4 border border-error/20 rounded bg-error/5"
      aria-live="assertive"
      data-testid="segment-context-error"
    >
      <p>{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-xs underline hover:no-underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
      >
        Retry
      </button>
    </div>
  )
}

/** Cross-file finding fallback */
export function SegmentContextCrossFile() {
  return (
    <p className="text-sm text-muted-foreground italic p-4" data-testid="cross-file-message">
      Cross-file finding — no specific segment context available
    </p>
  )
}
