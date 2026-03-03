'use client'

type ConfidenceBadgeProps = {
  confidence: number | null
  l2ConfidenceMin?: number | null | undefined
}

type ConfidenceLevel = 'high' | 'medium' | 'low'

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 85) return 'high'
  if (confidence >= 70) return 'medium'
  return 'low'
}

const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const LEVEL_CLASSES: Record<ConfidenceLevel, string> = {
  high: 'bg-success/10 text-success border-success/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  low: 'bg-error/10 text-error border-error/20',
}

export function ConfidenceBadge({ confidence, l2ConfidenceMin }: ConfidenceBadgeProps) {
  if (confidence === null) return null

  const level = getConfidenceLevel(confidence)
  const label = LEVEL_LABELS[level]
  const classes = LEVEL_CLASSES[level]
  const displayPct = Math.round(confidence)
  const isBelowThreshold =
    l2ConfidenceMin !== null && l2ConfidenceMin !== undefined && confidence < l2ConfidenceMin

  return (
    <span className="inline-flex items-center gap-1">
      <span
        data-testid="confidence-badge"
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border ${classes}`}
      >
        {label} ({displayPct}%)
      </span>
      {isBelowThreshold && (
        <span
          data-testid="confidence-warning"
          className="text-warning"
          title={`Below threshold (${l2ConfidenceMin}%)`}
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span className="sr-only">Below threshold</span>
        </span>
      )}
    </span>
  )
}
