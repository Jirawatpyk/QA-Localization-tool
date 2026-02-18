'use server'

import { eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { auditLogs } from '@/db/schema/auditLogs'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { tenants } from '@/db/schema/tenants'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { createServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/actionResult'

type SetupResult = { tenantId: string; role: string }

/**
 * Server Action called after first successful login/signup.
 * If user doesn't exist in users table: creates tenant, user, admin role.
 */
export async function setupNewUser(): Promise<ActionResult<SetupResult>> {
  const supabase = await createServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  // Check if user already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (existingUser) {
    // User already set up — return existing data
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

  // First-time setup: create tenant, user, and admin role
  const displayName =
    (user.user_metadata?.display_name as string) ?? user.email?.split('@')[0] ?? 'User'

  const [tenant] = await db
    .insert(tenants)
    .values({ name: `${displayName}'s Organization` })
    .returning({ id: tenants.id })

  if (!tenant) {
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to create tenant' }
  }

  await db.insert(users).values({
    id: user.id,
    tenantId: tenant.id,
    email: user.email ?? '',
    displayName,
  })

  await db.insert(userRoles).values({
    userId: user.id,
    tenantId: tenant.id,
    role: 'admin',
  })

  // Seed default language pair configs (Architecture Decision 3.6)
  await db.insert(languagePairConfigs).values([
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
  await db.insert(auditLogs).values({
    tenantId: tenant.id,
    userId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'user.created',
    newValue: { email: user.email, role: 'admin', tenantId: tenant.id },
  })

  return { success: true, data: { tenantId: tenant.id, role: 'admin' } }
}
