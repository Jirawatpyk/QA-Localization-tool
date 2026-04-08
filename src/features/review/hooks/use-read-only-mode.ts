import { createContext, useCallback, useContext } from 'react'

/**
 * Self-assign result — returned by the lock guard before review actions.
 * - 'proceed': action can execute (no lock or owner)
 * - 'conflict': another user holds the lock → switched to read-only
 * - 'already-assigned': current user already holds the lock (no-op self-assign)
 */
type SelfAssignOutcome = 'proceed' | 'conflict' | 'already-assigned'

type ReadOnlyContextValue = {
  isReadOnly: boolean
  /**
   * S-FIX-7: Call before any review mutation on an unassigned file.
   * Returns 'proceed' if the action should execute, 'conflict' if blocked.
   * Returns null if no self-assign is needed (assignment already exists).
   */
  selfAssignIfNeeded: (fileId: string, projectId: string) => Promise<SelfAssignOutcome>
}

// L8 fix: warn if a consumer uses the default (no SoftLockWrapper ancestor).
// In production this is a silent no-op fallback; in dev it surfaces missing wrappers.
const defaultSelfAssign = async () => {
  // eslint-disable-next-line no-restricted-syntax -- client hook can't import @/lib/env (server-only); NODE_ENV is build-inlined by Next.js
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[useLockGuard] selfAssignIfNeeded called without SoftLockWrapper ancestor — lock guard is bypassed.',
    )
  }
  return 'proceed' as const
}

export const ReadOnlyContext = createContext<ReadOnlyContextValue>({
  isReadOnly: false,
  selfAssignIfNeeded: defaultSelfAssign,
})

export function useReadOnlyMode(): boolean {
  return useContext(ReadOnlyContext).isReadOnly
}

export function useLockGuard(): ReadOnlyContextValue {
  return useContext(ReadOnlyContext)
}

/**
 * H9: aria-live announcer for read-only denials.
 *
 * Returns a function `announce(actionLabel)` that fires an sr-only aria-live
 * polite announcement every time. Screen-reader users get feedback on every
 * silently-blocked mutation attempt (WCAG SC 4.1.3 Status Messages).
 *
 * Usage:
 * ```
 * const announce = useReadOnlyAnnouncer()
 * if (isReadOnly) { announce('approve file'); return }
 * ```
 *
 * R2-H1 fix: removed the once-per-session dedupe Set — repeated denials now
 * re-announce. R2-M4 fix: uses a module-level ref for the live region (not
 * getElementById) to avoid ID collisions; uses setTimeout(100) instead of rAF
 * so screen readers reliably pick up the new textContent.
 */
const LIVE_REGION_DATA_ATTR = 'data-readonly-announcer'
let liveRegionRef: HTMLElement | null = null

function ensureLiveRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (liveRegionRef && liveRegionRef.isConnected) return liveRegionRef
  const region = document.createElement('div')
  region.setAttribute(LIVE_REGION_DATA_ATTR, 'true')
  region.setAttribute('role', 'status')
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('aria-atomic', 'true')
  // sr-only styles (Tailwind sr-only equivalent)
  region.style.cssText =
    'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
  document.body.appendChild(region)
  liveRegionRef = region
  return region
}

export function useReadOnlyAnnouncer(): (actionLabel: string) => void {
  return useCallback((actionLabel: string) => {
    const region = ensureLiveRegion()
    if (!region) return

    // Clear then set so screen readers re-announce identical messages.
    // setTimeout(100) is more reliable than rAF for SR pickup across browsers.
    region.textContent = ''
    const message = `${actionLabel} ignored — file is read-only`
    setTimeout(() => {
      if (region.isConnected) region.textContent = message
    }, 100)
  }, [])
}
