import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { users } from '@/db/schema/users'
import type { ActionResult } from '@/types/actionResult'
import type { TenantId } from '@/types/tenant'

type LockCheckResult =
  | { locked: false }
  | { locked: true; isOwner: true }
  | { locked: true; isOwner: false; lockedBy: string }

/**
 * Check if the current user owns the file lock (or if no lock exists).
 *
 * - No assignment → { locked: false } (action proceeds, self-assign will create one)
 * - Assignment exists, owned → { locked: true, isOwner: true }
 * - Assignment exists, not owned → { locked: true, isOwner: false, lockedBy: displayName }
 */
export async function checkLockOwnership(
  fileId: string,
  tenantId: TenantId,
  userId: string,
): Promise<LockCheckResult> {
  const rows = await db
    .select({
      assignedTo: fileAssignments.assignedTo,
      assigneeName: users.displayName,
    })
    .from(fileAssignments)
    .innerJoin(users, eq(users.id, fileAssignments.assignedTo))
    .where(
      and(
        eq(fileAssignments.fileId, fileId),
        withTenant(fileAssignments.tenantId, tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .limit(1)

  if (rows.length === 0) {
    return { locked: false }
  }

  const row = rows[0]!

  if (row.assignedTo === userId) {
    return { locked: true, isOwner: true }
  }

  return { locked: true, isOwner: false, lockedBy: row.assigneeName }
}

/**
 * Assert lock ownership for a review mutation action.
 * Returns null if action can proceed, or an `ActionResult` error if blocked.
 *
 * M10 fix: typed as `ActionResult<never>` so callers can pattern-match on the
 * discriminated union without relying on structural compatibility.
 *
 * Note: admin escalation/compliance flows that need to bypass locks should use
 * a dedicated `takeOverFile` action (which atomically transfers ownership) rather
 * than a bypass parameter — the latter creates audit blind spots for admin mutations.
 */
export async function assertLockOwnership(
  fileId: string,
  tenantId: TenantId,
  userId: string,
): Promise<ActionResult<never> | null> {
  const result = await checkLockOwnership(fileId, tenantId, userId)

  if (result.locked && !result.isOwner) {
    return {
      success: false,
      error: 'File is being reviewed by another user',
      code: 'LOCK_CONFLICT',
    }
  }

  return null // OK — no lock or owner
}
