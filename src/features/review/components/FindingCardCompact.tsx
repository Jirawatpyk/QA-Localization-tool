'use client'

import { Check, X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'
import type { FindingForDisplay } from '@/features/review/types'
import {
  L3_CONFIRMED_MARKER,
  L3_DISAGREES_MARKER,
  computeConfidenceMin,
  isCjkLang,
  isFallbackModel,
  truncate,
} from '@/features/review/utils/finding-display'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export type FindingCardCompactProps = {
  finding: FindingForDisplay
  isActive: boolean
  isExpanded?: boolean | undefined
  isNew?: boolean | undefined
  sourceLang?: string | undefined
  targetLang?: string | undefined
  l2ConfidenceMin?: number | null | undefined
  l3ConfidenceMin?: number | null | undefined
  onExpand: (id: string) => void
}

export function FindingCardCompact({
  finding,
  isActive,
  isExpanded = false,
  isNew,
  sourceLang,
  targetLang,
  l2ConfidenceMin,
  l3ConfidenceMin,
  onExpand,
}: FindingCardCompactProps) {
  const reducedMotion = useReducedMotion()

  const l3Confirmed = finding.description.includes(L3_CONFIRMED_MARKER)
  const l3Disagrees = finding.description.includes(L3_DISAGREES_MARKER)

  const isFallback = isFallbackModel(finding.aiModel, finding.detectedByLayer)
  const confidenceMin = computeConfidenceMin(
    finding.detectedByLayer,
    l2ConfidenceMin,
    l3ConfidenceMin,
  )

  const showAnimation = isNew === true && !reducedMotion

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    // Don't expand when clicking disabled action buttons (RT#5)
    const target = e.target as HTMLElement
    if (target.closest('button')) return
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

  return (
    <div
      role="row"
      data-testid="finding-compact-row"
      data-finding-id={finding.id}
      tabIndex={isActive ? 0 : -1}
      aria-expanded={isExpanded ? 'true' : 'false'}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 ${showAnimation ? 'animate-fade-in' : ''}`}
    >
      {/* Severity badge — Guardrail #36 */}
      <SeverityIndicator severity={finding.severity} />

      {/* Category (truncate > 20 chars) */}
      <span className="text-xs text-muted-foreground shrink-0">
        {truncate(finding.category, 20)}
      </span>

      {/* Layer badge */}
      <LayerBadge layer={finding.detectedByLayer} />

      {/* Source→Target preview (truncated) — Guardrail #39: lang attr */}
      <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
        {finding.sourceTextExcerpt && (
          <span lang={sourceLang} className={isCjkLang(sourceLang) ? 'text-cjk-scale' : undefined}>
            {truncate(finding.sourceTextExcerpt, 60)}
          </span>
        )}
        {finding.sourceTextExcerpt && finding.targetTextExcerpt && ' → '}
        {finding.targetTextExcerpt && (
          <span lang={targetLang} className={isCjkLang(targetLang) ? 'text-cjk-scale' : undefined}>
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

      {/* Quick action icons — disabled until Story 4.2 */}
      <div role="group" className="flex items-center gap-1 shrink-0" aria-label="Quick actions">
        <button
          type="button"
          disabled
          className="opacity-50 cursor-not-allowed p-0.5 rounded"
          aria-label="Accept finding"
          onClick={(e) => e.stopPropagation()}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled
          className="opacity-50 cursor-not-allowed p-0.5 rounded"
          aria-label="Reject finding"
          onClick={(e) => e.stopPropagation()}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
