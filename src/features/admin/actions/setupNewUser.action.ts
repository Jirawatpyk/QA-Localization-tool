'use server'

import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { auditLogs } from '@/db/schema/auditLogs'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { tenants } from '@/db/schema/tenants'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { logger } from '@/lib/logger'
import { createServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/actionResult'

type SetupResult = { tenantId: string; role: string }

/**
 * Server Action called after first successful login/signup.
 * If user doesn't exist in users table: creates tenant, user, admin role.
 */
export async function setupNewUser(): Promise<ActionResult<SetupResult>> {
  // Auth check — outside try-catch so `user` is accessible everywhere
  const supabase = await createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  try {
    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    if (existingUser) {
      const [role] = await db
        .select({ role: userRoles.role, tenantId: userRoles.tenantId })
        .from(userRoles)
        .where(eq(userRoles.userId, user.id))
        .limit(1)

      if (role) {
        return { success: true, data: { tenantId: role.tenantId, role: role.role } }
      }

      // User row exists but user_roles row is missing (e.g. previous migration
      // or partial failure left orphan record). Repair by creating the role.
      const [userRow] = await db
        .select({ tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)

      if (userRow) {
        await db.insert(userRoles).values({
          userId: user.id,
          tenantId: userRow.tenantId,
          role: 'admin',
        })
        logger.info({ userId: user.id }, 'setupNewUser: repaired missing user_roles row')
        return { success: true, data: { tenantId: userRow.tenantId, role: 'admin' } }
      }

      return { success: false, code: 'INTERNAL_ERROR', error: 'User record is incomplete' }
    }

    // First-time setup: create tenant, user, and admin role
    const displayName =
      (user.user_metadata?.display_name as string) ?? user.email?.split('@')[0] ?? 'User'

    // IMPORTANT: Uses Drizzle (DATABASE_URL direct connection) which bypasses RLS.
    // This is required because at this point the user's JWT has tenant_id: "none"
    // (no tenant exists yet). DO NOT refactor to use Supabase client — RLS would block.
    // Atomic transaction: all-or-nothing to prevent orphan records
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: `${displayName}'s Organization` })
        .returning({ id: tenants.id })

      if (!tenant) throw new Error('Failed to create tenant')

      await tx.insert(users).values({
        id: user.id,
        tenantId: tenant.id,
        email: user.email ?? '',
        displayName,
      })

      await tx.insert(userRoles).values({
        userId: user.id,
        tenantId: tenant.id,
        role: 'admin',
      })

      // Seed default language pair configs (Architecture Decision 3.6)
      await tx.insert(languagePairConfigs).values([
        {
          tenantId: tenant.id,
          sourceLang: 'en',
          targetLang: 'th',
          autoPassThreshold: 93,
          l2ConfidenceMin: 70,
          l3ConfidenceMin: 80,
        },
        {
          tenantId: tenant.id,
          sourceLang: 'en',
          targetLang: 'ja',
          autoPassThreshold: 93,
          l2ConfidenceMin: 70,
          l3ConfidenceMin: 80,
        },
        {
          tenantId: tenant.id,
          sourceLang: 'en',
          targetLang: 'ko',
          autoPassThreshold: 94,
          l2ConfidenceMin: 70,
          l3ConfidenceMin: 80,
        },
        {
          tenantId: tenant.id,
          sourceLang: 'en',
          targetLang: 'zh-CN',
          autoPassThreshold: 94,
          l2ConfidenceMin: 70,
          l3ConfidenceMin: 80,
        },
      ])

      // Audit log
      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        userId: user.id,
        entityType: 'user',
        entityId: user.id,
        action: 'user.created',
        newValue: { email: user.email, role: 'admin', tenantId: tenant.id },
      })

      return { tenantId: tenant.id }
    })

    return { success: true, data: { tenantId: result.tenantId, role: 'admin' } }
  } catch (err) {
    // Race condition: concurrent signup hit unique constraint — retry lookup
    const isUniqueViolation = err instanceof Error && err.message.includes('unique constraint')
    if (isUniqueViolation) {
      const [role] = await db
        .select({ role: userRoles.role, tenantId: userRoles.tenantId })
        .from(userRoles)
        .where(eq(userRoles.userId, user.id))
        .limit(1)
      return {
        success: true,
        data: { tenantId: role?.tenantId ?? '', role: role?.role ?? 'admin' },
      }
    }
    // Log the real error server-side, return generic message to client (avoid leaking DB details)
    const realMessage = err instanceof Error ? err.message : String(err)
    logger.error({ err: realMessage }, 'setupNewUser: unexpected error')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to setup user account' }
  }
}
