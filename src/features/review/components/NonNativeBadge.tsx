'use client'

import { Eye } from 'lucide-react'

export type NonNativeBadgeProps = {
  className?: string | undefined
  /** Compact variant: shorter text for FindingCardCompact */
  compact?: boolean | undefined
}

/**
 * Story 5.2a AC4/AC5: "Subject to native audit" badge for non-native reviewer actions.
 *
 * Accessibility (Guardrail #25, #36):
 * - Icon decorative (aria-hidden="true"), text is accessible name
 * - Icon 16px (h-4 w-4) min per Guardrail #36
 * - Uses text-muted-foreground — NOT severity color (audit tag, not quality indicator)
 * - Contrast >= 4.5:1 on both light/dark backgrounds (tokens.css muted-foreground)
 */
export function NonNativeBadge({ className, compact = false }: NonNativeBadgeProps) {
  return (
    <span
      data-testid="non-native-badge"
      className={`inline-flex items-center gap-1 text-xs italic text-muted-foreground shrink-0 ${className ?? ''}`}
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
      {compact ? 'Non-native' : 'Subject to native audit'}
    </span>
  )
}
