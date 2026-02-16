import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type CompactLayoutProps = {
  children: ReactNode
  className?: string
}

/**
 * 0.75x density wrapper for professional review tool spacing.
 * Skeletons MUST match this density to prevent layout shift.
 */
export function CompactLayout({ children, className }: CompactLayoutProps) {
  return (
    <div className={cn('space-y-[calc(var(--spacing-unit)*3*var(--density-factor))] p-[calc(var(--spacing-unit)*4*var(--density-factor))]', className)}>
      {children}
    </div>
  )
}
