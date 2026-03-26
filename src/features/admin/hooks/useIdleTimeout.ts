'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { createBrowserClient } from '@/lib/supabase/client'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const WARNING_BEFORE_MS = 5 * 60 * 1000 // Warning toast 5 minutes before expiry
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const

/**
 * Tracks user activity and signs out after 30 minutes of inactivity.
 * Shows warning toast at 5 minutes remaining.
 * Pauses timer when tab is hidden (background), resumes when visible.
 * Redirects to /login with ?reason=session_expired.
 */
export function useIdleTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedAtRef = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)
  const durationRef = useRef<number>(IDLE_TIMEOUT_MS)
  const warningShownRef = useRef(false)

  const handleTimeout = useCallback(async () => {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    toast.info('Session expired due to inactivity')
    // Hard redirect to clear all React state (matches AuthListener SIGNED_OUT behavior)
    window.location.href = '/login?reason=session_expired'
  }, [])

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    timerRef.current = null
    warningTimerRef.current = null
  }, [])

  const startTimers = useCallback(
    (remaining: number) => {
      clearTimers()
      startedAtRef.current = Date.now()
      durationRef.current = remaining
      warningShownRef.current = false

      // Warning toast at T-5min (only if enough time remains)
      const warningDelay = remaining - WARNING_BEFORE_MS
      if (warningDelay > 0) {
        warningTimerRef.current = setTimeout(() => {
          warningShownRef.current = true
          toast.warning('Session expires in 5 minutes due to inactivity', { duration: 10000 })
        }, warningDelay)
      }

      // Actual timeout
      timerRef.current = setTimeout(handleTimeout, remaining)
    },
    [handleTimeout, clearTimers],
  )

  const resetTimer = useCallback(() => {
    pausedAtRef.current = null
    startTimers(IDLE_TIMEOUT_MS)
  }, [startTimers])

  useEffect(() => {
    resetTimer()

    // Activity events reset the timer
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    // Pause timer when tab goes background, resume when visible
    const handleVisibility = () => {
      if (document.hidden) {
        // Tab hidden — pause by clearing timers
        pausedAtRef.current = Date.now()
        clearTimers()
      } else {
        // Tab visible — calculate how much time has elapsed since timers started
        if (pausedAtRef.current !== null) {
          const elapsedSinceStart = Date.now() - startedAtRef.current
          const remaining = Math.max(0, durationRef.current - elapsedSinceStart)
          pausedAtRef.current = null
          if (remaining <= 0) {
            handleTimeout().catch(() => {
              /* non-critical */
            })
          } else {
            startTimers(remaining)
          }
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimers()
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [resetTimer, clearTimers, startTimers, handleTimeout])
}
