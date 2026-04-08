import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { heartbeat } from '@/features/project/actions/heartbeat.action'

const INACTIVITY_WARNING_MS = 25 * 60 * 1000 // 25 minutes
const CHECK_INTERVAL_MS = 30_000 // Check every 30s

type UseInactivityWarningOptions = {
  assignmentId: string | null
  enabled: boolean
}

/**
 * S-FIX-7 AC5: 25-minute inactivity warning toast.
 *
 * When 25 minutes elapse since last heartbeat success,
 * shows a persistent toast warning that the lock expires in 5 minutes.
 * Any user interaction (mouse/keyboard/click) fires immediate heartbeat + dismisses toast.
 *
 * Guardrail #20: prefers-reduced-motion:reduce on toast entry — handled by sonner.
 */
export function useInactivityWarning({ assignmentId, enabled }: UseInactivityWarningOptions) {
  const lastActivityRef = useRef(0)
  const toastIdRef = useRef<string | number | null>(null)
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset activity timer on any user interaction
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now()

    // Dismiss warning toast if visible
    if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null

      // Fire immediate heartbeat to reset server-side timer
      if (assignmentId) {
        heartbeat({ assignmentId }).catch(() => {})
      }
    }
  }, [assignmentId])

  useEffect(() => {
    if (!enabled || !assignmentId) {
      // Cleanup
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current)
        toastIdRef.current = null
      }
      return
    }

    // Reset on mount
    lastActivityRef.current = Date.now()

    // Listen for user activity (AC5: "any action — mouse click, keyboard, scroll")
    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const
    for (const event of events) {
      document.addEventListener(event, resetActivity, { passive: true })
    }

    // Check inactivity interval
    checkIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current
      if (elapsed >= INACTIVITY_WARNING_MS && toastIdRef.current === null) {
        toastIdRef.current = toast.warning(
          'Your review lock expires in 5 minutes. Click anywhere to keep reviewing.',
          { duration: Infinity },
        )
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const event of events) {
        document.removeEventListener(event, resetActivity)
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current)
        toastIdRef.current = null
      }
    }
  }, [enabled, assignmentId, resetActivity])
}
