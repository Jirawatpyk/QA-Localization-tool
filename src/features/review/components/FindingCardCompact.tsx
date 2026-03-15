'use client'

import { Check, FileText, FileWarning, Flag, X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import { OverrideBadge } from '@/features/review/components/OverrideBadge'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import {
  L3_CONFIRMED_MARKER,
  L3_DISAGREES_MARKER,
  computeConfidenceMin,
  isCjkLang,
  isFallbackModel,
  truncate,
} from '@/features/review/utils/finding-display'
import { STATUS_BG } from '@/features/review/utils/finding-styles'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export type FindingCardCompactProps = {
  finding: FindingForDisplay
  isActive: boolean
  isExpanded?: boolean | undefined
  isNew?: boolean | undefined
  findingIndex: number
  totalFindings: number
  sourceLang?: string | undefined
  targetLang?: string | undefined
  l2ConfidenceMin?: number | null | undefined
  l3ConfidenceMin?: number | null | undefined
  onExpand: (id: string) => void
  onAccept?: ((findingId: string) => void) | undefined
  onReject?: ((findingId: string) => void) | undefined
  isActionInFlight?: boolean | undefined
  onOverrideBadgeClick?: ((findingId: string) => void) | undefined
}

export function FindingCardCompact({
  finding,
  isActive,
  isExpanded = false,
  isNew,
  findingIndex,
  totalFindings,
  sourceLang,
  targetLang,
  l2ConfidenceMin,
  l3ConfidenceMin,
  onExpand,
  onAccept,
  onReject,
  isActionInFlight = false,
  onOverrideBadgeClick,
}: FindingCardCompactProps) {
  const reducedMotion = useReducedMotion()
  const selectionMode = useReviewStore((s) => s.selectionMode)
  const isSelected = useReviewStore((s) => s.selectedIds.has(finding.id))
  const overrideCount = useReviewStore((s) => s.overrideCounts.get(finding.id) ?? 0)
  const toggleSelection = useReviewStore((s) => s.toggleSelection)
  const addToSelection = useReviewStore((s) => s.addToSelection)
  const setSelectionMode = useReviewStore((s) => s.setSelectionMode)
  const clearSelection = useReviewStore((s) => s.clearSelection)

  const l3Confirmed = finding.description.includes(L3_CONFIRMED_MARKER)
  const l3Disagrees = finding.description.includes(L3_DISAGREES_MARKER)

  const isFallback = isFallbackModel(finding.aiModel, finding.detectedByLayer)
  const confidenceMin = computeConfidenceMin(
    finding.detectedByLayer,
    l2ConfidenceMin,
    l3ConfidenceMin,
  )

  const showAnimation = isNew === true && !reducedMotion
  const bgClass = STATUS_BG[finding.status] ?? ''
  const isAccepted = finding.status === 'accepted' || finding.status === 're_accepted'
  const isRejected = finding.status === 'rejected'
  const isNoted = finding.status === 'noted'
  const isSourceIssue = finding.status === 'source_issue'
  const isManual = finding.detectedByLayer === 'Manual'
  const isOverridden = finding.originalSeverity !== null
  const stateClass = isRejected ? 'opacity-60' : ''
  const borderClass = isManual ? 'border-dashed' : ''

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    // Don't expand when clicking disabled action buttons (RT#5)
    const target = e.target as HTMLElement
    if (target.closest('button')) return

    // Story 4.4a: Shift+Click enters bulk mode + range selection
    if (e.shiftKey) {
      e.preventDefault()
      const store = useReviewStore.getState()
      const anchorId = store.selectedId
      if (selectionMode !== 'bulk') {
        setSelectionMode('bulk')
      }
      if (anchorId && anchorId !== finding.id) {
        // Range select from anchor to clicked finding (inclusive)
        store.selectRange(anchorId, finding.id)
      } else {
        // No anchor or same finding — just add this one
        addToSelection(finding.id)
      }
      return
    }

    // Regular click: if in bulk mode, clear selection and return to single
    if (selectionMode === 'bulk') {
      clearSelection()
      setSelectionMode('single')
    }

    onExpand(finding.id)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      onExpand(finding.id)
    }
    if (e.key === 'Escape' && isExpanded) {
      e.stopPropagation()
      onExpand(finding.id)
    }
  }

  // Build accessible label: "Finding N of M, severity, category, status" (AC6 T6.1)
  const ariaLabel = `Finding ${findingIndex + 1} of ${totalFindings}, ${finding.severity} severity, ${finding.category}, ${finding.status}`

  return (
    <div
      role="row"
      data-testid="finding-compact-row"
      data-finding-id={finding.id}
      data-status={finding.status}
      tabIndex={isActive ? 0 : -1}
      aria-expanded={isExpanded ? 'true' : 'false'}
      aria-label={ariaLabel}
      aria-rowindex={findingIndex + 1}
      aria-selected={isSelected ? 'true' : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`border rounded-lg px-3 py-2 cursor-pointer hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 ${borderClass} ${bgClass} ${stateClass} ${showAnimation ? 'animate-fade-in' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}
    >
      <div role="gridcell" className="flex items-center gap-2">
        {/* Story 4.4a: Bulk selection checkbox — visible in bulk mode */}
        {selectionMode === 'bulk' && (
          <div
            className="w-5 shrink-0 flex items-center justify-center"
            role="checkbox"
            tabIndex={0}
            aria-checked={isSelected}
            aria-label={`Select finding ${findingIndex + 1}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleSelection(finding.id)
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                toggleSelection(finding.id)
              }
            }}
          >
            <div
              className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                isSelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground'
              }`}
            >
              {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
            </div>
          </div>
        )}

        {/* Severity badge — Guardrail #36 */}
        <SeverityIndicator severity={finding.severity} />

        {/* Flag icon for flagged findings (AC3) */}
        {finding.status === 'flagged' && (
          <Flag
            className="h-3.5 w-3.5 text-warning shrink-0"
            aria-hidden="true"
            data-testid="flag-icon"
          />
        )}

        {/* Category (truncate > 20 chars) */}
        <span className="text-xs text-muted-foreground shrink-0">
          {truncate(finding.category, 20)}
        </span>

        {/* Layer badge */}
        <LayerBadge layer={finding.detectedByLayer} />

        {/* Source→Target preview (truncated) — Guardrail #39: lang attr */}
        <span
          className={`flex-1 min-w-0 text-xs text-muted-foreground truncate ${isAccepted ? 'line-through' : ''}`}
        >
          {finding.sourceTextExcerpt && (
            <span
              lang={sourceLang}
              className={isCjkLang(sourceLang) ? 'text-cjk-scale' : undefined}
            >
              {truncate(finding.sourceTextExcerpt, 60)}
            </span>
          )}
          {finding.sourceTextExcerpt && finding.targetTextExcerpt && ' → '}
          {finding.targetTextExcerpt && (
            <span
              lang={targetLang}
              className={isCjkLang(targetLang) ? 'text-cjk-scale' : undefined}
            >
              {truncate(finding.targetTextExcerpt, 60)}
            </span>
          )}
        </span>

        {/* L3 markers */}
        {l3Confirmed && (
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-status-pass/10 text-status-pass border border-status-pass/20 shrink-0">
            L3 Confirmed
          </span>
        )}
        {l3Disagrees && (
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-warning/10 text-warning border border-warning/20 shrink-0">
            L3 Disagrees
          </span>
        )}

        {/* Confidence badge — hidden for L1 */}
        <ConfidenceBadge confidence={finding.aiConfidence} confidenceMin={confidenceMin} />

        {/* Fallback badge */}
        {isFallback && (
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-warning/10 text-warning border border-warning/20 shrink-0">
            Fallback
          </span>
        )}

        {/* Story 4.3: severity override badge */}
        {isOverridden && (
          <span
            data-testid="override-badge"
            className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-warning-light text-warning-foreground border border-warning-border shrink-0"
          >
            Override
          </span>
        )}
        {/* Story 4.4a: decision override badge */}
        {overrideCount > 0 && (
          <OverrideBadge
            overrideCount={overrideCount}
            onClick={() => onOverrideBadgeClick?.(finding.id)}
          />
        )}
        {isManual && (
          <span
            data-testid="manual-badge"
            className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border shrink-0"
          >
            Manual
          </span>
        )}
        {isNoted && (
          <span className="inline-flex items-center gap-1 text-[10px] text-info shrink-0">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Noted
          </span>
        )}
        {isSourceIssue && (
          <span className="inline-flex items-center gap-1 text-[10px] text-source-issue shrink-0">
            <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
            Source Issue
          </span>
        )}

        {/* Quick action icons (Story 4.2) */}
        <div role="group" className="flex items-center gap-1 shrink-0" aria-label="Quick actions">
          <button
            type="button"
            disabled={finding.status === 'manual' || isActionInFlight}
            className="text-success hover:bg-success/10 disabled:opacity-50 disabled:cursor-not-allowed p-0.5 rounded focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            aria-label="Accept finding"
            onClick={(e) => {
              e.stopPropagation()
              onAccept?.(finding.id)
            }}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={finding.status === 'manual' || isActionInFlight}
            className="text-error hover:bg-error/10 disabled:opacity-50 disabled:cursor-not-allowed p-0.5 rounded focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            aria-label="Reject finding"
            onClick={(e) => {
              e.stopPropagation()
              onReject?.(finding.id)
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
