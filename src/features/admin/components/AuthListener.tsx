'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { useIdleTimeout } from '@/features/admin/hooks/useIdleTimeout'
import { useRoleSync } from '@/features/admin/hooks/useRoleSync'
import { createBrowserClient } from '@/lib/supabase/client'

/** Decode base64url JWT payload safely (handles -/_ chars and missing padding) */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    // base64url → base64: replace -/_ and add padding
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Client Component placed in (app)/layout.tsx.
 * Handles auth state sync, role sync, and idle timeout.
 */
export function AuthListener() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | undefined>()
  const [tenantId, setTenantId] = useState<string | undefined>()

  /** Extract tenantId from session JWT claims */
  const updateTenantFromSession = useCallback((accessToken: string | undefined) => {
    if (!accessToken) return
    const claims = decodeJwtPayload(accessToken)
    const tid = claims?.tenant_id
    if (typeof tid === 'string' && tid !== 'none') {
      setTenantId(tid)
    }
  }, [])

  useEffect(() => {
    const supabase = createBrowserClient()

    // Get initial user + tenant from session JWT
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUserId(data.user?.id)
      })
      .catch(() => {
        /* non-critical: auth state listener will handle */
      })
    supabase.auth
      .getSession()
      .then(({ data }) => {
        updateTenantFromSession(data.session?.access_token)
      })
      .catch(() => {
        /* non-critical */
      })

    // Listen for auth state changes — also update tenantId on token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id)
      updateTenantFromSession(session?.access_token)
      if (event === 'SIGNED_OUT') {
        setTenantId(undefined)
        // Redirect immediately — router.refresh() alone won't leave the protected page
        window.location.href = '/login'
        return
      }
      router.refresh()
    })

    return () => subscription.unsubscribe()
  }, [router, updateTenantFromSession])

  // Role sync via Realtime + fallback polling (tenantId for defense-in-depth filtering)
  useRoleSync(userId, tenantId)

  // Idle timeout (30 minutes)
  useIdleTimeout()

  return null
}
