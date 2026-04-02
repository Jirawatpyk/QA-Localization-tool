import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { userRoles } from '@/db/schema/userRoles'
import type { TenantId } from '@/types/tenant'

/**
 * Get all admin users for a tenant, optionally excluding a specific user (self-notify guard).
 */
export async function getAdminRecipients(
  tenantId: TenantId,
  excludeUserId?: string,
): Promise<Array<{ userId: string }>> {
  const admins = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.role, 'admin'), withTenant(userRoles.tenantId, tenantId)))

  if (!excludeUserId) return admins
  return admins.filter((a) => a.userId !== excludeUserId)
}

/**
 * Get the active file assignee (assigned or in_progress) for a file.
 * Returns userId or null if no active assignee exists.
 */
export async function getFileAssignee(fileId: string, tenantId: TenantId): Promise<string | null> {
  const [row] = await db
    .select({ userId: fileAssignments.assignedTo })
    .from(fileAssignments)
    .where(
      and(
        eq(fileAssignments.fileId, fileId),
        withTenant(fileAssignments.tenantId, tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .limit(1)

  return row?.userId ?? null
}

/**
 * Get all project members: admins + users with active file assignments in the project.
 * Deduplicated (admin who is also an assignee appears once).
 * Optionally excludes a specific user (self-notify guard).
 */
export async function getProjectMembers(
  projectId: string,
  tenantId: TenantId,
  excludeUserId?: string,
): Promise<Array<{ userId: string }>> {
  const admins = await getAdminRecipients(tenantId)
  const assignees = await db
    .selectDistinct({ userId: fileAssignments.assignedTo })
    .from(fileAssignments)
    .where(
      and(
        eq(fileAssignments.projectId, projectId),
        withTenant(fileAssignments.tenantId, tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )

  // Deduplicate (admin may also be assignee)
  const seen = new Set<string>()
  const result: Array<{ userId: string }> = []
  for (const u of [...admins, ...assignees]) {
    if (excludeUserId && u.userId === excludeUserId) continue
    if (seen.has(u.userId)) continue
    seen.add(u.userId)
    result.push(u)
  }
  return result
}
