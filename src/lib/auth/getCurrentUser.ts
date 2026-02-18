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
 * Extracts tenant_id and role from JWT claims (fast path, no DB query).
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  // Extract claims from JWT app_metadata (injected by custom_access_token_hook)
  const tenantId = (user.app_metadata?.tenant_id as string) ?? null
  const role = (user.app_metadata?.user_role as AppRole) ?? null

  if (!tenantId || !role) return null

  return {
    id: user.id,
    email: user.email ?? '',
    tenantId,
    role,
  }
}
