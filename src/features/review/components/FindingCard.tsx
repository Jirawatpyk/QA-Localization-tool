'use client'

import { Check, FileText, FileWarning, X } from 'lucide-react'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import { OverrideBadge } from '@/features/review/components/OverrideBadge'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import { useFileState } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import {
  L3_CONFIRMED_MARKER,
  L3_DISAGREES_MARKER,
  computeConfidenceMin,
  isCjkLang,
  isFallbackModel,
  stripL3Markers,
} from '@/features/review/utils/finding-display'
import { STATUS_BG } from '@/features/review/utils/finding-styles'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export type FindingCardProps = {
  finding: FindingForDisplay
  findingIndex: number
  totalFindings: number
  sourceLang?: string | undefined
  targetLang?: string | undefined
  l2ConfidenceMin?: number | null | undefined
  l3ConfidenceMin?: number | null | undefined
  isNew?: boolean | undefined
  onAccept?: ((findingId: string) => void) | undefined
  onReject?: ((findingId: string) => void) | undefined
  isActionInFlight?: boolean | undefined
  onOverrideBadgeClick?: ((findingId: string) => void) | undefined
}

export function FindingCard({
  finding,
  findingIndex,
  totalFindings,
  sourceLang,
  targetLang,
  l2ConfidenceMin,
  l3ConfidenceMin,
  isNew,
  onAccept,
  onReject,
  isActionInFlight = false,
  onOverrideBadgeClick,
}: FindingCardProps) {
  const reducedMotion = useReducedMotion()
  const overrideCount = useFileState((fs) => fs.overrideCounts.get(finding.id) ?? 0)

  const l3Confirmed = finding.description.includes(L3_CONFIRMED_MARKER)
  const l3Disagrees = finding.description.includes(L3_DISAGREES_MARKER)
  const cleanDescription = stripL3Markers(finding.description)

  const isFallback = isFallbackModel(finding.aiModel, finding.detectedByLayer)
  const confidenceMin = computeConfidenceMin(
    finding.detectedByLayer,
    l2ConfidenceMin,
    l3ConfidenceMin,
  )

  const showNewAnimation = isNew === true && !reducedMotion
  const bgClass = STATUS_BG[finding.status] ?? ''

  // State-based visual styling (Story 4.2 AC3 + Story 4.3 AC5/AC6)
  const isAccepted = finding.status === 'accepted' || finding.status === 're_accepted'
  const isRejected = finding.status === 'rejected'
  const isNoted = finding.status === 'noted'
  const isSourceIssue = finding.status === 'source_issue'
  const isManual = finding.detectedByLayer === 'Manual'
  const isOverridden = finding.originalSeverity !== null
  const stateClass = isRejected ? 'opacity-60' : ''
  const descriptionClass = isAccepted ? 'line-through' : ''
  const borderClass = isManual ? 'border-dashed' : ''

  // Expand/collapse transition (AC5): 150ms ease-out, disabled when reduced motion
  const transitionClass = reducedMotion ? 'duration-0' : 'transition-all duration-150 ease-out'

  return (
    <div
      data-testid="finding-card"
      data-finding-id={finding.id}
      data-status={finding.status}
      data-category={finding.category.toLowerCase()}
      className={`border rounded-lg p-3 ${borderClass} ${bgClass} ${stateClass} ${transitionClass} ${showNewAnimation ? 'animate-fade-in' : ''}`}
    >
      {/* Header row: severity + category + layer + finding number */}
      <div className="flex items-center gap-2 flex-wrap">
        {isOverridden && finding.originalSeverity ? (
          <span className="inline-flex items-center gap-1">
            <span className="line-through opacity-50">
              <SeverityIndicator severity={finding.originalSeverity} />
            </span>
            <span className="text-xs text-muted-foreground">&rarr;</span>
            <SeverityIndicator severity={finding.severity} />
          </span>
        ) : (
          <SeverityIndicator severity={finding.severity} />
        )}

        <span className="text-xs text-muted-foreground">{finding.category}</span>

        <LayerBadge layer={finding.detectedByLayer} />

        {/* L3 markers */}
        {l3Confirmed && (
          <span
            data-testid="l3-confirm-badge"
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-status-pass/10 text-status-pass border border-status-pass/20"
          >
            L3 Confirmed
          </span>
        )}
        {l3Disagrees && (
          <span
            data-testid="l3-disagree-badge"
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-warning/10 text-warning border border-warning/20"
          >
            L3 disagrees
          </span>
        )}

        {/* Fallback badge */}
        {isFallback && (
          <span
            data-testid="fallback-badge"
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-warning/10 text-warning border border-warning/20"
            title={`Generated by ${finding.aiModel}`}
          >
            Fallback
          </span>
        )}

        {/* Story 4.3: Override badge (Guardrail #25: icon + text + color) */}
        {isOverridden && (
          <span
            data-testid="override-badge"
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-warning-light text-warning-foreground border border-warning-border"
          >
            Override
          </span>
        )}

        {/* Story 4.4a: Decision override badge */}
        {overrideCount > 0 && (
          <OverrideBadge
            overrideCount={overrideCount}
            onClick={() => onOverrideBadgeClick?.(finding.id)}
          />
        )}

        {/* Story 4.3: Manual badge */}
        {isManual && (
          <span
            data-testid="manual-badge"
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border"
          >
            Manual
          </span>
        )}

        {/* Story 4.3: Noted state icon + label */}
        {isNoted && (
          <span className="inline-flex items-center gap-1 text-xs text-info">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Noted
          </span>
        )}

        {/* Story 4.3: Source Issue state icon + label */}
        {isSourceIssue && (
          <span className="inline-flex items-center gap-1 text-xs text-source-issue">
            <FileWarning className="h-4 w-4" aria-hidden="true" />
            Source Issue
          </span>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          #{findingIndex + 1}/{totalFindings}
        </span>
      </div>

      {/* Content row: description + source/target */}
      <div className="mt-2 pt-2 border-t text-sm space-y-1">
        <p className={`text-foreground ${descriptionClass}`}>{cleanDescription}</p>

        {finding.sourceTextExcerpt !== null && (
          <p className="text-muted-foreground">
            <span className="font-medium">Source:</span>{' '}
            <span
              lang={sourceLang}
              className={isCjkLang(sourceLang) ? 'text-cjk-scale' : undefined}
            >
              {finding.sourceTextExcerpt}
            </span>
          </p>
        )}
        {finding.targetTextExcerpt !== null && (
          <p className="text-muted-foreground">
            <span className="font-medium">Target:</span>{' '}
            <span
              lang={targetLang}
              className={isCjkLang(targetLang) ? 'text-cjk-scale' : undefined}
            >
              {finding.targetTextExcerpt}
            </span>
          </p>
        )}
      </div>

      {/* Footer row: suggestion + confidence + quick actions */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {finding.suggestedFix !== null && (
          <p className="text-xs italic text-muted-foreground flex-1">
            Suggested: {finding.suggestedFix}
          </p>
        )}

        <ConfidenceBadge confidence={finding.aiConfidence} confidenceMin={confidenceMin} />

        {/* Quick action icons (Story 4.2) */}
        <div role="group" className="flex items-center gap-1 shrink-0" aria-label="Quick actions">
          <button
            type="button"
            disabled={finding.status === 'manual' || isActionInFlight}
            onClick={() => onAccept?.(finding.id)}
            className="text-success hover:bg-success/10 disabled:opacity-50 disabled:cursor-not-allowed lg:p-0.5 p-2.5 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded flex items-center justify-center focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            aria-label="Accept finding"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={finding.status === 'manual' || isActionInFlight}
            onClick={() => onReject?.(finding.id)}
            className="text-error hover:bg-error/10 disabled:opacity-50 disabled:cursor-not-allowed lg:p-0.5 p-2.5 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 rounded flex items-center justify-center focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            aria-label="Reject finding"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
