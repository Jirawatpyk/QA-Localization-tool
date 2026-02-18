import 'server-only'

import { createServerClient } from '@/lib/supabase/server'

export type AppRole = 'admin' | 'qa_reviewer' | 'native_reviewer'

export type CurrentUser = {
  id: string
  email: string
  tenantId: string
  role: AppRole
}

/**
 * Gets current authenticated user from Supabase session.
 * Uses getClaims() for fast local JWT validation (~1ms, no network call).
 * Extracts tenant_id and user_role injected by custom_access_token_hook.
 * Returns null if not authenticated or claims are missing/stale.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerClient()
  const { data: claimsData, error } = await supabase.auth.getClaims()

  if (error || !claimsData) return null

  const claims = claimsData.claims as Record<string, unknown>

  const userId = claims.sub as string | undefined
  const email = claims.email as string | undefined
  const tenantId = claims.tenant_id as string | undefined
  const role = claims.user_role as string | undefined

  // Reject if claims are missing or still have the default "none" value
  // (happens when JWT was issued before setupNewUser created the role)
  if (!userId || !tenantId || !role || tenantId === 'none' || role === 'none') {
    return null
  }

  // Validate role is a known AppRole
  const validRoles: AppRole[] = ['admin', 'qa_reviewer', 'native_reviewer']
  if (!validRoles.includes(role as AppRole)) return null

  return {
    id: userId,
    email: (email as string) ?? '',
    tenantId,
    role: role as AppRole,
  }
}
