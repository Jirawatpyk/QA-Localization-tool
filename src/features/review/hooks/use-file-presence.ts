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
  // R2-H2: track mount state so async heartbeats that resolve AFTER unmount
  // don't invoke the failure callback on a detached component instance
  const isMountedRef = useRef(true)
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

    // R2-H2: flag mount on effect start; cleanup flips to false
    isMountedRef.current = true

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
      // R2-H2: gate on mount state to prevent stale setState/toast on detached component
      if (!isMountedRef.current) return
      if (outcome === 'permanent') {
        killInterval()
        onPermanentFailureRef.current?.()
      }
      // Transient: keep interval running, next tick retries
    })

    // Start interval
    intervalRef.current = setInterval(() => {
      void sendHeartbeat().then((outcome) => {
        if (!isMountedRef.current) return
        if (outcome === 'permanent') {
          killInterval()
          onPermanentFailureRef.current?.()
        }
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      isMountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      killInterval()
    }
  }, [enabled, assignmentId, sendHeartbeat])
}
