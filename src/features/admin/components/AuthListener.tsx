'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useIdleTimeout } from '@/features/admin/hooks/useIdleTimeout'
import { useRoleSync } from '@/features/admin/hooks/useRoleSync'
import { createBrowserClient } from '@/lib/supabase/client'

/**
 * Client Component placed in (app)/layout.tsx.
 * Handles auth state sync, role sync, and idle timeout.
 */
export function AuthListener() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | undefined>()

  useEffect(() => {
    const supabase = createBrowserClient()

    // Get initial user
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id)
    })

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id)
      if (event === 'SIGNED_OUT') {
        // Redirect immediately — router.refresh() alone won't leave the protected page
        window.location.href = '/login'
        return
      }
      router.refresh()
    })

    return () => subscription.unsubscribe()
  }, [router])

  // Role sync via Realtime + fallback polling
  useRoleSync(userId)

  // Idle timeout (8 hours)
  useIdleTimeout()

  return null
}
