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
export function useRoleSync(
  userId: string | undefined,
  tenantId: string | undefined,
  onSessionRefreshed?: (accessToken: string) => void,
) {
  const router = useRouter()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!userId || !tenantId) return

    const supabase = createBrowserClient()

    // Primary: Realtime subscription
    // Note: Supabase Realtime filter supports single column only.
    // tenant_id is validated in the callback for defense-in-depth.
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
          // Defense-in-depth: fail-closed — only process if tenant_id present AND matches
          const eventTenantId = (payload.new as { tenant_id?: string }).tenant_id
          if (!eventTenantId || eventTenantId !== tenantId) return

          const newRole = (payload.new as { role?: string }).role
          toast.info(`Your role has been updated to ${newRole}`)

          // Refresh session to get new JWT claims + notify parent to re-extract tenantId
          const { data } = await supabase.auth.refreshSession()
          if (data.session?.access_token && onSessionRefreshed) {
            onSessionRefreshed(data.session.access_token)
          }
          router.refresh()
        },
      )
      .subscribe()

    // Fallback: poll every 5 minutes
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.auth.refreshSession()
      if (data.session?.access_token && onSessionRefreshed) {
        onSessionRefreshed(data.session.access_token)
      }
    }, POLL_INTERVAL_MS)

    return () => {
      supabase.removeChannel(channel)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [userId, tenantId, router, onSessionRefreshed])
}
