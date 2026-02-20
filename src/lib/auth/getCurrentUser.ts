import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { users } from '@/db/schema/users'
import type { UserMetadata } from '@/features/onboarding/types'
import { createServerClient } from '@/lib/supabase/server'

export type AppRole = 'admin' | 'qa_reviewer' | 'native_reviewer'

export type CurrentUser = {
  id: string
  email: string
  tenantId: string
  role: AppRole
  displayName: string
  metadata: UserMetadata | null
}

/**
 * Gets current authenticated user from Supabase session.
 * Uses getClaims() for fast local JWT validation (~1ms, no network call).
 * Extracts tenant_id and user_role injected by custom_access_token_hook.
 * Then fetches displayName + metadata from users table via Drizzle (M3 pattern).
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

  // Fetch displayName + metadata from users table (M3 pattern: JWT for role, DB for profile)
  const userRow = await db
    .select({ displayName: users.displayName, metadata: users.metadata })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!userRow[0]) return null

  return {
    id: userId,
    email: email ?? '',
    tenantId,
    role: role as AppRole,
    displayName: userRow[0].displayName,
    metadata: (userRow[0].metadata as UserMetadata | undefined) ?? null,
  }
}
