'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findingAssignments } from '@/db/schema/findingAssignments'
import { findingComments } from '@/db/schema/findingComments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { addFindingCommentSchema } from '@/features/review/validation/reviewAction.schema'
import type { AddFindingCommentInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { createNotification, NOTIFICATION_TYPES } from '@/lib/notifications/createNotification'
import type { ActionResult } from '@/types/actionResult'

/**
 * Add a comment to a finding assignment (AC4).
 * Ownership validation: only assigned_to, assigned_by, or admin (Guardrail #73).
 * Comments are immutable — no edit, no delete.
 */
export async function addFindingComment(
  input: AddFindingCommentInput,
): Promise<ActionResult<{ commentId: string; createdAt: string }>> {
  const parsed = addFindingCommentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  const { findingId, findingAssignmentId, body } = parsed.data

  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    // native_reviewer is the minimum role; qa_reviewer + admin pass via hierarchy
    user = await requireRole('native_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { id: userId, tenantId, role } = user

  // Verify assignment exists + ownership (Guardrail #73)
  const assignmentRows = await db
    .select({
      id: findingAssignments.id,
      assignedTo: findingAssignments.assignedTo,
      assignedBy: findingAssignments.assignedBy,
      fileId: findingAssignments.fileId,
      projectId: findingAssignments.projectId,
    })
    .from(findingAssignments)
    .where(
      and(
        eq(findingAssignments.id, findingAssignmentId),
        eq(findingAssignments.findingId, findingId),
        withTenant(findingAssignments.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (assignmentRows.length === 0) {
    return { success: false, error: 'Assignment not found', code: 'NOT_FOUND' }
  }

  const assignment = assignmentRows[0]!

  // S-FIX-7: Lock ownership check (AC3 — defense-in-depth)
  const lockError = await assertLockOwnership(assignment.fileId, tenantId, userId)
  if (lockError) return lockError

  // Ownership check: must be assigned_to, assigned_by, or admin
  if (role !== 'admin' && userId !== assignment.assignedTo && userId !== assignment.assignedBy) {
    return {
      success: false,
      error: 'Not authorized to comment on this assignment',
      code: 'FORBIDDEN',
    }
  }

  // Insert comment
  const [comment] = await db
    .insert(findingComments)
    .values({
      findingId,
      findingAssignmentId,
      tenantId,
      authorId: userId,
      body,
    })
    .returning({ id: findingComments.id, createdAt: findingComments.createdAt })

  if (!comment) {
    return { success: false, error: 'Failed to create comment', code: 'INTERNAL_ERROR' }
  }

  // Audit log (Guardrail #78)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'finding_comment',
    entityId: comment.id,
    action: 'comment_created',
    newValue: { findingId, findingAssignmentId, bodyLength: body.length },
  })

  // Notification to other parties (non-blocking — Guardrail #74, #85)
  // Notify all involved parties except the commenter (handles admin as 3rd actor)
  const notifyUserIds = new Set<string>()
  if (userId !== assignment.assignedTo) notifyUserIds.add(assignment.assignedTo)
  if (userId !== assignment.assignedBy) notifyUserIds.add(assignment.assignedBy)

  for (const recipientId of notifyUserIds) {
    createNotification({
      tenantId,
      userId: recipientId,
      type: NOTIFICATION_TYPES.NATIVE_COMMENT_ADDED,
      title: 'New comment on flagged finding',
      body: 'A comment was added to a flagged finding',
      projectId: assignment.projectId,
      metadata: {
        findingId,
        assignmentId: findingAssignmentId,
        commentId: comment.id,
        projectId: assignment.projectId,
        fileId: assignment.fileId,
      },
    }).catch(() => {})
  }

  return {
    success: true,
    data: {
      commentId: comment.id,
      createdAt: comment.createdAt.toISOString(),
    },
  }
}
