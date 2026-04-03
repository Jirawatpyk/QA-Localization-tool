'use server'

import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findingComments } from '@/db/schema/findingComments'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { requireRole } from '@/lib/auth/requireRole'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

type FindingComment = {
  id: string
  authorId: string
  authorName: string
  authorRole: string
  body: string
  createdAt: string
}

/**
 * Load comments for a finding assignment, ordered by createdAt ASC (AC4).
 * JOIN users for author display name and role.
 */
export async function getFindingComments(
  findingAssignmentId: string,
): Promise<ActionResult<FindingComment[]>> {
  // CR-H5 fix: UUID validation (consistent with other actions)
  if (!isUuid(findingAssignmentId)) {
    return { success: false, error: 'Invalid assignment ID', code: 'VALIDATION' }
  }

  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('native_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { tenantId } = user

  const rows = await db
    .select({
      id: findingComments.id,
      authorId: findingComments.authorId,
      authorName: users.displayName,
      authorRole: userRoles.role,
      body: findingComments.body,
      createdAt: findingComments.createdAt,
    })
    .from(findingComments)
    .innerJoin(
      users,
      and(eq(users.id, findingComments.authorId), withTenant(users.tenantId, tenantId)),
    )
    // CR-H7 fix: leftJoin with LIMIT-like behavior — pick first role only.
    // Users with multiple roles would produce duplicate comments.
    // Using sql subquery to get highest-priority role per user.
    .leftJoin(
      userRoles,
      and(
        eq(userRoles.userId, findingComments.authorId),
        withTenant(userRoles.tenantId, tenantId),
        // Prefer admin > qa_reviewer > native_reviewer to avoid duplicates
        sql`${userRoles.id} = (SELECT ur.id FROM user_roles ur WHERE ur.user_id = ${findingComments.authorId} AND ur.tenant_id = ${findingComments.tenantId} ORDER BY CASE ur.role WHEN 'admin' THEN 1 WHEN 'qa_reviewer' THEN 2 ELSE 3 END LIMIT 1)`,
      ),
    )
    .where(
      and(
        eq(findingComments.findingAssignmentId, findingAssignmentId),
        withTenant(findingComments.tenantId, tenantId),
      ),
    )
    .orderBy(asc(findingComments.createdAt))
    .limit(100) // CR-H5 fix: prevent unbounded query

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorName,
      authorRole: r.authorRole ?? 'unknown',
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}
