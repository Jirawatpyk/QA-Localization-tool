'use server'

import { db } from '@/db/client'
import { auditLogs } from '@/db/schema/auditLogs'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { createUserSchema } from '@/features/admin/validation/userSchemas'
import type { AppRole } from '@/lib/auth/getCurrentUser'
import { requireRole } from '@/lib/auth/requireRole'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/types/actionResult'

type CreateUserResult = { id: string; email: string; role: AppRole }

/**
 * Creates a new user with specified role.
 * Admin-only operation (M3 DB check via requireRole write).
 */
export async function createUser(input: unknown): Promise<ActionResult<CreateUserResult>> {
  const currentUser = await requireRole('admin', 'write')

  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { email, displayName, role } = parsed.data

  // Create user in Supabase Auth via admin API
  const adminClient = createAdminClient()
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })

  if (authError || !authData.user) {
    return {
      success: false,
      code: 'INTERNAL_ERROR',
      error: authError?.message ?? 'Failed to create auth user',
    }
  }

  // Insert user record
  await db.insert(users).values({
    id: authData.user.id,
    tenantId: currentUser.tenantId,
    email,
    displayName,
  })

  // Assign role
  await db.insert(userRoles).values({
    userId: authData.user.id,
    tenantId: currentUser.tenantId,
    role,
  })

  // Audit log
  await db.insert(auditLogs).values({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'user',
    entityId: authData.user.id,
    action: 'user.created',
    newValue: { email, role, displayName },
  })

  return { success: true, data: { id: authData.user.id, email, role } }
}
