'use client'

import { Check, Flag, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import type { OverrideHistoryEntry } from '@/features/review/components/OverrideHistoryPanel'
import { OverrideHistoryPanel } from '@/features/review/components/OverrideHistoryPanel'
import {
  SegmentContextList,
  SegmentContextSkeleton,
  SegmentContextError,
  SegmentContextCrossFile,
} from '@/features/review/components/SegmentContextList'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import { useSegmentContext } from '@/features/review/hooks/use-segment-context'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import type { FindingStatus } from '@/types/finding'

// Stable noop to avoid re-renders from inline arrow
function noop(_findingId: string) {}

type FindingDetailContentProps = {
  finding: FindingForDisplay | null
  sourceLang: string
  targetLang: string
  fileId: string
  contextRange: number | undefined
  onNavigateToFinding: ((findingId: string) => void) | undefined
  onAccept?: ((findingId: string) => void) | undefined
  onReject?: ((findingId: string) => void) | undefined
  onFlag?: ((findingId: string) => void) | undefined
  onDelete?: ((findingId: string) => void) | undefined
  isActionInFlight?: boolean | undefined
  projectId?: string | undefined
  fetchOverrideHistory?:
    | ((input: { findingId: string; projectId: string }) => Promise<{
        success: boolean
        data?: OverrideHistoryEntry[]
        error?: string
      }>)
    | undefined
}

/**
 * Shared content for finding detail panel — rendered inside both
 * the static <aside> (desktop) and Radix Sheet (laptop/mobile).
 *
 * Extracted from FindingDetailSheet for DRY dual rendering (Story 4.1d AC4).
 */
export function FindingDetailContent({
  finding,
  sourceLang: _sourceLang,
  targetLang: _targetLang,
  fileId,
  contextRange: contextRangeProp,
  onNavigateToFinding,
  onAccept,
  onReject,
  onFlag,
  onDelete,
  isActionInFlight = false,
  projectId,
  fetchOverrideHistory,
}: FindingDetailContentProps) {
  const [contextRange, setContextRange] = useState(contextRangeProp ?? 2)

  // Sync contextRange when prop changes (Guardrail #12 — ref/state not reset on prop change)
  useEffect(() => {
    if (contextRangeProp !== undefined) {
      setContextRange(contextRangeProp) // eslint-disable-line react-hooks/set-state-in-effect -- sync prop-driven initial value after parent changes (external system subscription pattern)
    }
  }, [contextRangeProp])

  // Story 4.4a: Override history visibility — reset on finding change via render-time state adjustment (React 19 pattern)
  const [showHistory, setShowHistory] = useState(false)
  const overrideCount = useReviewStore((s) =>
    finding ? (s.overrideCounts.get(finding.id) ?? 0) : 0,
  )
  const [prevFindingId, setPrevFindingId] = useState<string | null>(null)
  if (finding?.id !== prevFindingId) {
    setPrevFindingId(finding?.id ?? null)
    if (showHistory) setShowHistory(false)
  }

  // Segment context hook
  const segmentCtx = useSegmentContext({
    fileId,
    segmentId: finding?.segmentId ?? null,
    contextRange,
  })

  const isCrossFile = finding !== null && finding.segmentId === null

  return (
    <div data-testid="finding-detail-content" className="flex-1 overflow-y-auto p-4 space-y-4">
      {finding ? (
        <>
          {/* ── Finding Metadata ── */}
          <section data-testid="finding-metadata">
            {/* Severity + Category row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <SeverityIndicator severity={finding.severity} />
              <span className="text-sm text-muted-foreground">{finding.category}</span>
            </div>

            {/* Layer + Status row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <LayerBadge layer={finding.detectedByLayer} />
              <StatusBadge status={finding.status} />
            </div>

            {/* Description */}
            <p className="text-sm leading-relaxed">{finding.description}</p>

            {/* AI Confidence + Model (only for L2/L3) */}
            {finding.detectedByLayer !== 'L1' && finding.aiConfidence !== null && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <ConfidenceBadge confidence={finding.aiConfidence} />
                {finding.aiModel && (
                  <span className="text-xs text-muted-foreground">{finding.aiModel}</span>
                )}
              </div>
            )}

            {/* Suggested Fix */}
            {finding.suggestedFix && (
              <div className="mt-3 rounded border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Suggestion</p>
                <p className="text-sm">{finding.suggestedFix}</p>
              </div>
            )}
          </section>

          {/* ── Segment Context ── */}
          <section data-testid="segment-context-section">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Segment Context</h3>
              {/* Context range selector */}
              {!isCrossFile && (
                <select
                  aria-label="Context range"
                  value={contextRange}
                  onChange={(e) => setContextRange(Number(e.target.value))}
                  className="text-xs border border-border rounded px-1 py-0.5 bg-background"
                  data-testid="context-range-selector"
                >
                  <option value={1}>±1</option>
                  <option value={2}>±2</option>
                  <option value={3}>±3</option>
                </select>
              )}
            </div>

            {isCrossFile ? (
              <SegmentContextCrossFile />
            ) : segmentCtx.isLoading ? (
              <SegmentContextSkeleton contextRange={contextRange} />
            ) : segmentCtx.error ? (
              <SegmentContextError error={segmentCtx.error} onRetry={segmentCtx.retry} />
            ) : segmentCtx.data ? (
              <SegmentContextList
                contextBefore={segmentCtx.data.contextBefore}
                currentSegment={segmentCtx.data.currentSegment}
                contextAfter={segmentCtx.data.contextAfter}
                findingsBySegmentId={segmentCtx.data.findingsBySegmentId}
                onNavigateToFinding={onNavigateToFinding ?? noop}
                sourceExcerpt={finding.sourceTextExcerpt}
                targetExcerpt={finding.targetTextExcerpt}
              />
            ) : null}
          </section>

          {/* ── Story 4.4a: Override History Panel ── */}
          {overrideCount > 0 && projectId && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-warning-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                {showHistory ? 'Hide' : 'Show'} decision history ({overrideCount} override
                {overrideCount !== 1 ? 's' : ''})
              </button>
              <OverrideHistoryPanel
                findingId={finding.id}
                projectId={projectId}
                isVisible={showHistory}
                fetchHistory={fetchOverrideHistory}
              />
            </div>
          )}

          {/* ── Action Buttons (Story 4.2) ── */}
          <div
            role="toolbar"
            aria-label="Review actions"
            className="flex items-center gap-2 pt-2 border-t border-border"
          >
            <button
              type="button"
              disabled={finding.status === 'manual' || isActionInFlight}
              onClick={() => onAccept?.(finding.id)}
              className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-success/10 text-success border border-success/20 hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Accept
            </button>
            <button
              type="button"
              disabled={finding.status === 'manual' || isActionInFlight}
              onClick={() => onReject?.(finding.id)}
              className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-error/10 text-error border border-error/20 hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reject
            </button>
            <button
              type="button"
              disabled={finding.status === 'manual' || isActionInFlight}
              onClick={() => onFlag?.(finding.id)}
              className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              <Flag className="h-4 w-4" aria-hidden="true" />
              Flag
            </button>

            {/* Story 4.3: Delete button — visible only for Manual findings (AC5) */}
            {finding.detectedByLayer === 'Manual' && (
              <button
                type="button"
                disabled={isActionInFlight}
                onClick={() => onDelete?.(finding.id)}
                data-testid="delete-finding-button"
                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-error/10 text-error border border-error/20 hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 ml-auto"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Select a finding to view details</p>
      )}
    </div>
  )
}

// ── Internal status badge ──

function StatusBadge({ status }: { status: FindingStatus }) {
  const label = status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border bg-muted/50 text-muted-foreground border-border">
      {label}
    </span>
  )
}
