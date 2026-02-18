'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { createBrowserClient } from '@/lib/supabase/client'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes fallback

/**
 * Subscribes to user_roles changes via Supabase Realtime.
 * On role change: refreshes session to get new JWT claims.
 * Fallback: polls every 5 minutes.
 */
export function useRoleSync(userId: string | undefined) {
  const router = useRouter()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!userId) return

    const supabase = createBrowserClient()

    // Primary: Realtime subscription
    const channel = supabase
      .channel('role-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const newRole = (payload.new as { role?: string }).role
          toast.info(`Your role has been updated to ${newRole}`)

          // Refresh session to get new JWT claims
          await supabase.auth.refreshSession()
          router.refresh()
        },
      )
      .subscribe()

    // Fallback: poll every 5 minutes
    pollRef.current = setInterval(async () => {
      await supabase.auth.refreshSession()
    }, POLL_INTERVAL_MS)

    return () => {
      supabase.removeChannel(channel)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [userId, router])
}
