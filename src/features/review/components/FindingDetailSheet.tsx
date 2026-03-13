'use client'

import { Check, Flag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import {
  SegmentContextList,
  SegmentContextSkeleton,
  SegmentContextError,
  SegmentContextCrossFile,
} from '@/features/review/components/SegmentContextList'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import { useSegmentContext } from '@/features/review/hooks/use-segment-context'
import type { FindingForDisplay } from '@/features/review/types'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { FindingStatus } from '@/types/finding'

// Stable noop to avoid re-renders from inline arrow
function noop(_findingId: string) {
  /* Story 4.2 wires real handler */
}

type FindingDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  findingId: string | null
  finding: FindingForDisplay | null
  sourceLang: string
  targetLang: string
  fileId: string | null
  contextRange?: number
  onNavigateToFinding?: (findingId: string) => void
}

/**
 * Finding detail side sheet — AC1 (metadata), AC2 (segment context), AC4 (context range).
 *
 * Wraps shadcn Sheet with side="right" and role="complementary".
 * Radix provides: focus trap (Guardrail #30), Esc-to-close, focus restore, portal rendering.
 * Action buttons rendered disabled — wired in Story 4.2.
 */
export function FindingDetailSheet({
  open,
  onOpenChange,
  findingId: _findingId,
  finding,
  sourceLang: _sourceLang,
  targetLang: _targetLang,
  fileId,
  contextRange: contextRangeProp,
  onNavigateToFinding,
}: FindingDetailSheetProps) {
  const reducedMotion = useReducedMotion()
  const [contextRange, setContextRange] = useState(contextRangeProp ?? 2)
  const prevFindingIdRef = useRef<string | null>(null)

  // Segment context hook
  const segmentCtx = useSegmentContext({
    fileId,
    segmentId: finding?.segmentId ?? null,
    contextRange,
  })

  // Announce finding changes via aria-live (Guardrail #33)
  // setState in effect is intentional: syncs prop change → aria-live region text
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (finding && finding.id !== prevFindingIdRef.current) {
      setAnnouncement(`Viewing ${finding.severity} ${finding.category} finding`) // eslint-disable-line react-hooks/set-state-in-effect -- aria-live must change after mount
      prevFindingIdRef.current = finding.id
    } else if (!finding) {
      prevFindingIdRef.current = null
      setAnnouncement('')
    }
  }, [finding])

  const isCrossFile = finding !== null && finding.segmentId === null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        role="complementary"
        aria-label="Finding detail"
        className={reducedMotion ? '[&[data-state]]:duration-0 [&[data-state]]:animate-none' : ''}
        data-testid="finding-detail-sheet"
      >
        <SheetHeader>
          <SheetTitle>Finding Detail</SheetTitle>
          <SheetDescription>
            Review finding details, segment context, and take actions
          </SheetDescription>
        </SheetHeader>

        {/* aria-live region for screen reader announcements (Guardrail #33) */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {finding ? (
            <>
              {/* ── Finding Metadata (AC1) ── */}
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

              {/* ── Segment Context (AC2, AC3, AC4) ── */}
              <section data-testid="segment-context-section">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Segment Context</h3>
                  {/* Context range selector — AC4 */}
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

              {/* ── Action Buttons (AC1 — disabled, wired in Story 4.2) ── */}
              <div
                role="toolbar"
                aria-label="Review actions"
                className="flex items-center gap-2 pt-2 border-t border-border"
              >
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-success/10 text-success border border-success/20 cursor-not-allowed opacity-60"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Accept
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-error/10 text-error border border-error/20 cursor-not-allowed opacity-60"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Reject
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-warning/10 text-warning border border-warning/20 cursor-not-allowed opacity-60"
                >
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  Flag
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a finding to view details</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Internal status badge ──

function StatusBadge({ status }: { status: FindingStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border bg-muted/50 text-muted-foreground border-border">
      {label}
    </span>
  )
}
