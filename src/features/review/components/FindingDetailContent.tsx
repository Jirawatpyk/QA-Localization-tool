'use client'

import { BookMarked, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { LanguageBridgePanel } from '@/features/bridge/components/LanguageBridgePanel'
import { AddToGlossaryDialog } from '@/features/review/components/AddToGlossaryDialog'
import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { FindingCommentThread } from '@/features/review/components/FindingCommentThread'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import type { OverrideHistoryEntry } from '@/features/review/components/OverrideHistoryPanel'
import { OverrideHistoryPanel } from '@/features/review/components/OverrideHistoryPanel'
import { ReviewActionBar } from '@/features/review/components/ReviewActionBar'
import {
  SegmentContextList,
  SegmentContextSkeleton,
  SegmentContextError,
  SegmentContextCrossFile,
} from '@/features/review/components/SegmentContextList'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import { useSegmentContext } from '@/features/review/hooks/use-segment-context'
import { useFileState } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import type { ReviewAction } from '@/features/review/utils/state-transitions'
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
  /** S-FIX-4 AC3: Additional action handlers for full 7-button ReviewActionBar */
  onNote?: (() => void) | undefined
  onSource?: (() => void) | undefined
  onOverride?: (() => void) | undefined
  onAdd?: (() => void) | undefined
  isActionInFlight?: boolean | undefined
  /** S-FIX-4 AC3: Active action for spinner display */
  activeAction?: ReviewAction | null | undefined
  /** S-FIX-4 AC3: Finding number for ARIA labels */
  findingNumber?: number | undefined
  /** S-FIX-4 AC3: Manual finding flag */
  isManualFinding?: boolean | undefined
  /** S-FIX-4 AC3: Native reviewer mode */
  isNativeReviewer?: boolean | undefined
  onConfirmNative?: (() => void) | undefined
  onOverrideNative?: (() => void) | undefined
  projectId?: string | undefined
  fetchOverrideHistory?:
    | ((input: { findingId: string; projectId: string }) => Promise<{
        success: boolean
        data?: OverrideHistoryEntry[]
        error?: string
      }>)
    | undefined
  /** Story 5.1: Whether current user is non-native for file's target language */
  isNonNative?: boolean | undefined
  /** Story 5.1: Project-level BT confidence threshold */
  btConfidenceThreshold?: number | undefined
  /** Story 5.2c: Assignment info for flagged findings */
  assignmentId?: string | undefined
  flaggerComment?: string | null | undefined
}

/**
 * Shared content for finding detail panel — rendered inside both
 * the static <aside> (desktop) and Radix Sheet (laptop/mobile).
 *
 * Extracted from FindingDetailSheet for DRY dual rendering (Story 4.1d AC4).
 */
export function FindingDetailContent({
  finding,
  sourceLang,
  targetLang,
  fileId,
  contextRange: contextRangeProp,
  onNavigateToFinding,
  onAccept,
  onReject,
  onFlag,
  onDelete,
  onNote,
  onSource,
  onOverride,
  onAdd,
  isActionInFlight = false,
  activeAction = null,
  findingNumber,
  isManualFinding = false,
  isNativeReviewer = false,
  onConfirmNative,
  onOverrideNative,
  projectId,
  fetchOverrideHistory,
  isNonNative = false,
  btConfidenceThreshold,
  assignmentId,
  flaggerComment,
}: FindingDetailContentProps) {
  const [contextRange, setContextRange] = useState(contextRangeProp ?? 2)

  // CR-R2 F4: Render-time adjustment pattern (Guardrail — no setState in useEffect for React Compiler)
  const [prevContextRangeProp, setPrevContextRangeProp] = useState(contextRangeProp)
  if (contextRangeProp !== prevContextRangeProp) {
    setPrevContextRangeProp(contextRangeProp)
    if (contextRangeProp !== undefined) {
      setContextRange(contextRangeProp)
    }
  }

  // Story 4.4a: Override history visibility
  const [showHistory, setShowHistory] = useState(false)
  const overrideCount = useFileState((fs) =>
    finding ? (fs.overrideCounts.get(finding.id) ?? 0) : 0,
  )

  // Story 4.7: Add to Glossary dialog state (declared before ref check so setter is available)
  const [glossaryDialogOpen, setGlossaryDialogOpen] = useState(false)

  // Reset history + dialog visibility when finding changes (render-time adjustment — React 19 pattern)
  const prevFindingIdRef = useRef<string | null>(null)
  const currentFindingId = finding?.id ?? null
  if (currentFindingId !== prevFindingIdRef.current) {
    prevFindingIdRef.current = currentFindingId
    // Only reset if we have a new REAL finding (avoid setState on null → null transition)
    if (currentFindingId !== null) {
      setShowHistory(false)
      setGlossaryDialogOpen(false) // CR-R1 M4: close dialog when finding changes (stale form data)
    }
  }

  // TD-A11Y-001: Suppress auto-focus on <select> during finding transition.
  // Browser may auto-focus first form element in aside on re-render.
  // Ref is true during transition, cleared after rAF. Select's onFocus
  // checks this and redirects focus back to the active finding row.
  const findingTransitionRef = useRef(false)
  useEffect(() => {
    if (!currentFindingId) return
    findingTransitionRef.current = true
    const rafId = requestAnimationFrame(() => {
      findingTransitionRef.current = false
    })
    return () => cancelAnimationFrame(rafId)
  }, [currentFindingId])

  // AC4: button visible only for Terminology findings with source text, both langs, and projectId
  // Case-insensitive: taxonomy seed uses 'Terminology', L1 rule engine may use 'terminology'
  const showAddToGlossary =
    finding !== null &&
    finding.category.toLowerCase() === 'terminology' &&
    finding.sourceTextExcerpt != null &&
    sourceLang !== '' &&
    targetLang !== '' &&
    projectId != null

  // Segment context hook
  const segmentCtx = useSegmentContext({
    fileId,
    segmentId: finding?.segmentId ?? null,
    contextRange,
  })

  const isCrossFile = finding !== null && finding.segmentId === null

  return (
    <div
      data-testid="finding-detail-content"
      className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 space-y-4"
    >
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
                  onFocus={() => {
                    // TD-A11Y-001: If focus arrived during finding transition (aside re-render),
                    // redirect to active row so hotkeys aren't suppressed (Guardrail #17).
                    // Tab navigation outside transition is unaffected (WCAG SC 2.1.1).
                    if (findingTransitionRef.current) {
                      const row = document.querySelector(
                        '[role="row"][tabindex="0"]',
                      ) as HTMLElement | null
                      row?.focus()
                    }
                  }}
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

          {/* ── Story 5.1: Language Bridge Panel ── */}
          {projectId && finding.segmentId && (
            <LanguageBridgePanel
              segmentId={finding.segmentId}
              sourceLang={sourceLang}
              projectId={projectId}
              isNonNative={isNonNative}
              confidenceThreshold={btConfidenceThreshold}
            />
          )}

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

          {/* ── S-FIX-4 AC3: All 7 action buttons via ReviewActionBar ── */}
          <ReviewActionBar
            onAccept={finding ? () => onAccept?.(finding.id) : undefined}
            onReject={finding ? () => onReject?.(finding.id) : undefined}
            onFlag={finding ? () => onFlag?.(finding.id) : undefined}
            onNote={onNote}
            onSource={onSource}
            onOverride={onOverride}
            onAdd={onAdd}
            isDisabled={!finding || isActionInFlight}
            isInFlight={isActionInFlight}
            activeAction={activeAction}
            findingNumber={findingNumber}
            isManualFinding={isManualFinding}
            isNativeReviewer={isNativeReviewer}
            onConfirmNative={onConfirmNative}
            onOverrideNative={onOverrideNative}
          />

          {/* Delete button — visible only for Manual findings (preserved from AC3) */}
          {finding.detectedByLayer === 'Manual' && (
            <div className="pt-2">
              <button
                type="button"
                disabled={isActionInFlight}
                onClick={() => onDelete?.(finding.id)}
                data-testid="delete-finding-button"
                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium bg-error/10 text-error border border-error/20 hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            </div>
          )}

          {/* Story 4.7: Add to Glossary — OUTSIDE toolbar (glossary action ≠ review action) */}
          {showAddToGlossary && projectId && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGlossaryDialogOpen(true)}
                data-testid="add-to-glossary-button"
                className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
              >
                <BookMarked className="h-4 w-4 mr-1" aria-hidden="true" />
                Add to Glossary
              </Button>
            </div>
          )}

          {/* Story 4.7: Glossary dialog */}
          {finding && projectId && (
            <AddToGlossaryDialog
              open={glossaryDialogOpen}
              onOpenChange={setGlossaryDialogOpen}
              finding={finding}
              sourceLang={sourceLang}
              targetLang={targetLang}
              projectId={projectId}
            />
          )}

          {/* Story 5.2c: Finding comment thread for flagged findings with assignments */}
          {finding && assignmentId && (
            <div className="mt-4 border-t pt-4">
              <FindingCommentThread
                findingId={finding.id}
                findingAssignmentId={assignmentId}
                flaggerComment={flaggerComment}
              />
            </div>
          )}
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
