import type { ReactNode } from 'react'

/**
 * Review-specific layout override (Story 4.0 Task 4.3).
 *
 * Removes the max-width constraint from the parent layout so the review page
 * can render a full-width 3-zone layout (nav + finding list + detail aside/sheet).
 * S-FIX-4: Global DetailPanel removed from (app)/layout.tsx — review owns its aside.
 */
export default function ReviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full" data-testid="review-layout">
      {children}
    </div>
  )
}
