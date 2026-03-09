import type { ReactNode } from 'react'

/**
 * Review-specific layout override (Story 4.0 Task 4.3).
 *
 * Removes the max-width constraint from the parent layout so the review page
 * can render a full-width 3-zone layout (nav + finding list + detail sheet).
 * The global DetailPanel still renders in (app)/layout.tsx but is empty/hidden —
 * review uses shadcn Sheet exclusively.
 */
export default function ReviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full" data-testid="review-layout">
      {children}
    </div>
  )
}
