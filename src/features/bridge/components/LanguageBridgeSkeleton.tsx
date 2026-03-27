'use client'

import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * Loading skeleton for LanguageBridge panel.
 *
 * Guardrail #37: Respects prefers-reduced-motion for 150ms fade-in.
 * AC4 state 4: Skeleton for back-translation + explanation sections.
 */
export function LanguageBridgeSkeleton() {
  const reducedMotion = useReducedMotion()

  const animationClass = reducedMotion ? '' : 'animate-pulse'
  const fadeClass = reducedMotion ? '' : 'transition-opacity duration-150 ease-in'

  return (
    <div className={`space-y-3 ${fadeClass}`} data-testid="bt-skeleton">
      {/* Back-translation skeleton */}
      <div className="space-y-2">
        <div className={`h-4 w-24 rounded bg-muted ${animationClass}`} />
        <div className={`h-16 w-full rounded bg-muted ${animationClass}`} />
      </div>
      {/* Explanation skeleton */}
      <div className="space-y-2">
        <div className={`h-4 w-32 rounded bg-muted ${animationClass}`} />
        <div className={`h-12 w-full rounded bg-muted ${animationClass}`} />
      </div>
      {/* Confidence skeleton */}
      <div className={`h-6 w-20 rounded bg-muted ${animationClass}`} />
    </div>
  )
}
