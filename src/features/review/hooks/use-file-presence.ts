import { useCallback, useEffect, useRef } from 'react'

import { heartbeat } from '@/features/project/actions/heartbeat.action'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds (AC6)

type UseFilePresenceOptions = {
  assignmentId: string | null
  enabled: boolean
  /** H6: optional callback for permanent failures (e.g., assignment cancelled by cron) */
  onPermanentFailure?: () => void
}

/**
 * Hook for file presence heartbeat (AC6).
 * Sends heartbeat every 30s via Server Action.
 * Pauses when tab is hidden (Visibility API).
 * Resumes when tab regains focus.
 *
 * H6 fix: distinguish transient (network) from permanent (NOT_FOUND/UNAUTHORIZED).
 * - Transient: log + continue interval (let next tick retry)
 * - Permanent: kill interval + invoke onPermanentFailure callback so wrapper can surface UX
 */
export function useFilePresence({
  assignmentId,
  enabled,
  onPermanentFailure,
}: UseFilePresenceOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isVisibleRef = useRef(true)
  const onPermanentFailureRef = useRef(onPermanentFailure)
  // Keep latest callback in ref so the effect can call it without re-creating the interval
  // (useEffect, not render-time write — Guardrail React Compiler purity)
  useEffect(() => {
    onPermanentFailureRef.current = onPermanentFailure
  }, [onPermanentFailure])

  const sendHeartbeat = useCallback(async (): Promise<'ok' | 'transient' | 'permanent'> => {
    if (!assignmentId || !isVisibleRef.current) return 'ok'
    try {
      const result = await heartbeat({ assignmentId })
      if (result.success) return 'ok'
      // Server-side known failure: assignment gone or auth lost — permanent
      if (result.code === 'NOT_FOUND' || result.code === 'UNAUTHORIZED') return 'permanent'
      // Other server errors (validation, internal) — treat as transient + log
      return 'transient'
    } catch {
      // Network/promise rejection → transient
      return 'transient'
    }
  }, [assignmentId])

  useEffect(() => {
    if (!enabled || !assignmentId) return

    // R3-M4: use an effect-local `cancelled` flag (captured by closures inside
    // THIS effect run) instead of a shared `isMountedRef`. The ref pattern was
    // incorrect for React strict-mode double-mount: cleanup flips ref to false,
    // second mount flips it back to true, and in-flight promises from the FIRST
    // mount then pass the check and call the callback on the remounted instance.
    // A local `let cancelled = false` is captured per-effect-run, so each
    // scheduled promise sees ONLY its own effect's flag.
    let cancelled = false

    function handleVisibilityChange() {
      isVisibleRef.current = document.visibilityState === 'visible'
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    function killInterval() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    // Send initial heartbeat
    void sendHeartbeat().then((outcome) => {
      if (cancelled) return
      if (outcome === 'permanent') {
        killInterval()
        onPermanentFailureRef.current?.()
      }
      // Transient: keep interval running, next tick retries
    })

    // Start interval
    intervalRef.current = setInterval(() => {
      void sendHeartbeat().then((outcome) => {
        if (cancelled) return
        if (outcome === 'permanent') {
          killInterval()
          onPermanentFailureRef.current?.()
        }
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      killInterval()
    }
  }, [enabled, assignmentId, sendHeartbeat])
}
