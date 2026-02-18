'use server'

import { eq, and } from 'drizzle-orm'

import { db } from '@/db/client'
import { auditLogs } from '@/db/schema/auditLogs'
import { userRoles } from '@/db/schema/userRoles'
import { updateRoleSchema } from '@/features/admin/validation/userSchemas'
import type { AppRole } from '@/lib/auth/getCurrentUser'
import { requireRole } from '@/lib/auth/requireRole'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/types/actionResult'

type UpdateRoleResult = { userId: string; newRole: AppRole }

/**
 * Updates a user's role.
 * Admin-only operation. Updates user_roles table and Supabase Auth app_metadata.
 * Triggers JWT claim refresh via app_metadata update.
 */
export async function updateUserRole(input: unknown): Promise<ActionResult<UpdateRoleResult>> {
  const currentUser = await requireRole('admin', 'write')

  const parsed = updateRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { userId, newRole } = parsed.data

  // Get current role for audit
  const [current] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.tenantId, currentUser.tenantId)))
    .limit(1)

  if (!current) {
    return { success: false, code: 'NOT_FOUND', error: 'User role not found' }
  }

  const previousRole = current.role

  // Update role in DB
  await db
    .update(userRoles)
    .set({ role: newRole })
    .where(and(eq(userRoles.userId, userId), eq(userRoles.tenantId, currentUser.tenantId)))

  // Update Supabase Auth app_metadata to trigger JWT claim refresh
  const adminClient = createAdminClient()
  await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { user_role: newRole, tenant_id: currentUser.tenantId },
  })

  // Audit log
  await db.insert(auditLogs).values({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'user_role',
    entityId: userId,
    action: 'role.updated',
    oldValue: { role: previousRole },
    newValue: { role: newRole },
  })

  return { success: true, data: { userId, newRole } }
}
