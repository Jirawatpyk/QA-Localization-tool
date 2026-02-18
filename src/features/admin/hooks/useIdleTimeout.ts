'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { createBrowserClient } from '@/lib/supabase/client'

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000 // 8 hours
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const

/**
 * Tracks user activity and signs out after 8 hours of inactivity.
 * Redirects to /login with ?reason=session_expired.
 */
export function useIdleTimeout() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTimeout = useCallback(async () => {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    toast.info('Session expired due to inactivity')
    router.push('/login?reason=session_expired')
  }, [router])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(handleTimeout, IDLE_TIMEOUT_MS)
  }, [handleTimeout])

  useEffect(() => {
    resetTimer()

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [resetTimer])
}
