'use client'

import { useEffect, useState } from 'react'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'
import { LayerBadge } from '@/features/review/components/LayerBadge'
import type { DetectedByLayer, FindingSeverity } from '@/types/finding'

type FindingForDisplay = {
  id: string
  severity: FindingSeverity
  category: string
  description: string
  detectedByLayer: DetectedByLayer
  aiConfidence: number | null
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  suggestedFix: string | null
}

type FindingListItemProps = {
  finding: FindingForDisplay
  isNew?: boolean | undefined
  l2ConfidenceMin?: number | null | undefined
}

const SEVERITY_CLASSES: Record<FindingSeverity, string> = {
  critical: 'bg-severity-critical/10 text-severity-critical border-severity-critical/20',
  major: 'bg-severity-major/10 text-severity-major border-severity-major/20',
  minor: 'bg-severity-minor/10 text-severity-minor border-severity-minor/20',
}

const L3_CONFIRMED_MARKER = '[L3 Confirmed]'
const L3_DISAGREES_MARKER = '[L3 Disagrees]'

function stripL3Markers(text: string): string {
  return text.replace(L3_CONFIRMED_MARKER, '').replace(L3_DISAGREES_MARKER, '').trim()
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function FindingListItem({ finding, isNew, l2ConfidenceMin }: FindingListItemProps) {
  const [expanded, setExpanded] = useState(false)
  const reducedMotion = useReducedMotion()

  const l3Confirmed = finding.description.includes(L3_CONFIRMED_MARKER)
  const l3Disagrees = finding.description.includes(L3_DISAGREES_MARKER)
  const cleanDescription = stripL3Markers(finding.description)

  const hasDetail =
    cleanDescription.length > 100 ||
    finding.sourceTextExcerpt !== null ||
    finding.targetTextExcerpt !== null ||
    finding.suggestedFix !== null

  const showAnimation = isNew === true && !reducedMotion

  return (
    <div
      data-testid="finding-list-item"
      data-new={isNew === true ? 'true' : undefined}
      className={`border rounded-lg p-3 ${showAnimation ? 'animate-fade-in' : ''}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Severity badge */}
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border capitalize ${SEVERITY_CLASSES[finding.severity]}`}
        >
          {finding.severity}
        </span>

        {/* Category */}
        <span className="text-xs text-muted-foreground">{finding.category}</span>

        {/* Layer badge */}
        <LayerBadge layer={finding.detectedByLayer} />

        {/* Description (truncated, markers stripped) */}
        <span data-testid="finding-description" className="text-sm flex-1 min-w-0">
          {truncate(cleanDescription, 100)}
        </span>

        {/* L3 confirm/contradict badges */}
        {l3Confirmed && (
          <span
            data-testid="l3-confirm-badge"
            className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-status-pass/10 text-status-pass border border-status-pass/20"
          >
            Confirmed by L3
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

        {/* Confidence badge */}
        <ConfidenceBadge confidence={finding.aiConfidence} l2ConfidenceMin={l2ConfidenceMin} />

        {/* Expand/collapse toggle */}
        {hasDetail && (
          <button
            type="button"
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={expanded ? 'Collapse detail' : 'Expand detail'}
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>

      {/* Expanded detail area */}
      {expanded && (
        <div data-testid="finding-detail" className="mt-2 pt-2 border-t text-sm space-y-1">
          {cleanDescription.length > 100 && <p className="text-foreground">{cleanDescription}</p>}
          {finding.sourceTextExcerpt !== null && (
            <p className="text-muted-foreground">
              <span className="font-medium">Source:</span> {finding.sourceTextExcerpt}
            </p>
          )}
          {finding.targetTextExcerpt !== null && (
            <p className="text-muted-foreground">
              <span className="font-medium">Target:</span> {finding.targetTextExcerpt}
            </p>
          )}
          {finding.suggestedFix !== null && (
            <p className="text-muted-foreground">
              <span className="font-medium">Suggested fix:</span> {finding.suggestedFix}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
