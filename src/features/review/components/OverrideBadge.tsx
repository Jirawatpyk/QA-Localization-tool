'use client'

import { RotateCcw } from 'lucide-react'

export type OverrideBadgeProps = {
  overrideCount: number
  onClick: () => void
}

/**
 * Amber pill badge shown when a finding has been re-decided (overrideCount > 0).
 * overrideCount = (raw review_actions COUNT) - 1
 *
 * Guardrail #25: icon (RotateCcw) + text label + color
 * Guardrail #26: text-amber-800 on bg-amber-100 >= 4.5:1 contrast
 */
export function OverrideBadge({ overrideCount, onClick }: OverrideBadgeProps) {
  if (overrideCount <= 0) return null

  const label = overrideCount > 1 ? `Override ×${overrideCount}` : 'Override'

  return (
    <button
      type="button"
      data-testid="decision-override-badge"
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning-light text-warning-foreground border border-warning-border min-h-[20px] shrink-0 cursor-pointer hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
      aria-label={`Decision overridden ${overrideCount} time${overrideCount !== 1 ? 's' : ''}, click to view history`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <RotateCcw className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  )
}
