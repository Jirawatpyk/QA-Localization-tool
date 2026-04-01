import { useCallback, useEffect, useRef } from 'react'

import { heartbeat } from '@/features/project/actions/heartbeat.action'

const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds (AC6)

type UseFilePresenceOptions = {
  assignmentId: string | null
  enabled: boolean
}

/**
 * Hook for file presence heartbeat (AC6).
 * Sends heartbeat every 30s via Server Action.
 * Pauses when tab is hidden (Visibility API).
 * Resumes when tab regains focus.
 */
export function useFilePresence({ assignmentId, enabled }: UseFilePresenceOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isVisibleRef = useRef(true)

  const sendHeartbeat = useCallback(async () => {
    if (!assignmentId || !isVisibleRef.current) return
    await heartbeat({ assignmentId })
  }, [assignmentId])

  useEffect(() => {
    if (!enabled || !assignmentId) return

    function handleVisibilityChange() {
      isVisibleRef.current = document.visibilityState === 'visible'
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Send initial heartbeat (P8: .catch stops interval if assignment gone)
    sendHeartbeat().catch(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    })

    // Start interval
    intervalRef.current = setInterval(() => {
      sendHeartbeat().catch(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, assignmentId, sendHeartbeat])
}
