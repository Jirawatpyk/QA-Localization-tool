'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findingAssignments } from '@/db/schema/findingAssignments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'
import type { AssignmentStatus } from '@/types/assignment'

/**
 * Transition assignment status: pending → in_review (AC6).
 * Called when native reviewer selects a finding.
 * Idempotent: if already 'in_review', returns success without change.
 */
export async function startNativeReview(
  assignmentId: string,
): Promise<ActionResult<{ assignmentId: string; newStatus: AssignmentStatus }>> {
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('native_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { id: userId, tenantId } = user

  // Fetch assignment — verify ownership
  const rows = await db
    .select({ id: findingAssignments.id, status: findingAssignments.status })
    .from(findingAssignments)
    .where(
      and(
        eq(findingAssignments.id, assignmentId),
        eq(findingAssignments.assignedTo, userId),
        withTenant(findingAssignments.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (rows.length === 0) {
    return { success: false, error: 'Assignment not found', code: 'NOT_FOUND' }
  }

  const assignment = rows[0]!

  // Idempotent: already in_review → success
  if (assignment.status === 'in_review') {
    return { success: true, data: { assignmentId, newStatus: 'in_review' } }
  }

  // Only pending → in_review is valid
  if (assignment.status !== 'pending') {
    return { success: false, error: 'Assignment is not in pending state', code: 'INVALID_STATE' }
  }

  // Update status + updatedAt (5.2b TODO M4)
  await db
    .update(findingAssignments)
    .set({ status: 'in_review', updatedAt: new Date() })
    .where(
      and(
        eq(findingAssignments.id, assignmentId),
        withTenant(findingAssignments.tenantId, tenantId),
      ),
    )

  // Audit (Guardrail #78)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'finding_assignment',
    entityId: assignmentId,
    action: 'assignment_started',
    oldValue: { status: 'pending' },
    newValue: { status: 'in_review' },
  })

  return { success: true, data: { assignmentId, newStatus: 'in_review' } }
}
