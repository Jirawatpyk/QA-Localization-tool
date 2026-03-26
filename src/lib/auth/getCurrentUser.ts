import 'server-only'

import { and, eq } from 'drizzle-orm'
import { cache } from 'react'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { users } from '@/db/schema/users'
import type { UserMetadata } from '@/features/onboarding/types'
import { createServerClient } from '@/lib/supabase/server'
import { type TenantId, validateTenantId } from '@/types/tenant'

export type AppRole = 'admin' | 'qa_reviewer' | 'native_reviewer'

export type CurrentUser = {
  id: string
  email: string
  tenantId: TenantId
  role: AppRole
  displayName: string
  metadata: UserMetadata | null
  nativeLanguages: string[] // BCP-47 array from user profile (empty = non-native for all languages)
}

/**
 * Gets current authenticated user from Supabase session.
 * Uses getClaims() for fast local JWT validation (~1ms, no network call).
 * Extracts tenant_id and user_role injected by custom_access_token_hook.
 * Then fetches displayName + metadata from users table via Drizzle (M3 pattern).
 * Returns null if not authenticated or claims are missing/stale.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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
  // Graceful fallback: if user row doesn't exist yet (race condition during signup),
  // use email as displayName and null metadata — don't return null for authenticated users.
  let displayName = email ?? ''
  let metadata: UserMetadata | null = null
  let nativeLanguages: string[] = []

  try {
    const userRow = await db
      .select({
        displayName: users.displayName,
        metadata: users.metadata,
        nativeLanguages: users.nativeLanguages,
      })
      .from(users)
      .where(and(eq(users.id, userId), withTenant(users.tenantId, validateTenantId(tenantId))))
      .limit(1)

    if (userRow[0]) {
      displayName = userRow[0].displayName
      // Validate metadata is a plain object before casting — corrupted DB data falls back to null
      const rawMeta = userRow[0].metadata
      metadata =
        rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
          ? (rawMeta as UserMetadata)
          : null
      // TD-DATA-001: nativeLanguages from DB (empty array = non-native for all languages)
      nativeLanguages = Array.isArray(userRow[0].nativeLanguages) ? userRow[0].nativeLanguages : []
    }
  } catch {
    // DB query failed (e.g., column mismatch, connection error) — proceed with JWT-only data
  }

  return {
    id: userId,
    email: email ?? '',
    tenantId: validateTenantId(tenantId),
    role: role as AppRole,
    displayName,
    metadata,
    nativeLanguages,
  }
})
