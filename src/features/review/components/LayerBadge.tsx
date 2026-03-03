'use client'

import type { DetectedByLayer } from '@/types/finding'

type LayerBadgeProps = {
  layer: DetectedByLayer
}

export function LayerBadge({ layer }: LayerBadgeProps) {
  const isRule = layer === 'L1'
  const label = isRule ? 'Rule' : 'AI'
  const classes = isRule
    ? 'bg-info/10 text-info border-info/20'
    : 'bg-status-ai-screened/10 text-status-ai-screened border-status-ai-screened/20'

  return (
    <span
      data-testid="layer-badge"
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border ${classes}`}
    >
      {label}
    </span>
  )
}
