import type { TourId } from './types'

// Session-scoped dismiss state — survives component remounts
// Server-side metadata (updateTourState) remains the durable store
// Each tour is independent — markDismissed('setup') does not affect 'project'
const dismissedInSession = new Set<TourId>()

export function markDismissed(tourId: TourId): void {
  dismissedInSession.add(tourId)
}

export function isDismissed(tourId: TourId): boolean {
  return dismissedInSession.has(tourId)
}

export function clearDismissed(tourId: TourId): void {
  dismissedInSession.delete(tourId)
}

/** Test-only: reset all dismiss state between test runs. Underscore prefix signals non-production use. */
export function _resetForTesting(): void {
  dismissedInSession.clear()
}
