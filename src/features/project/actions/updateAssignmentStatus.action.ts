'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateAssignmentStatusSchema } from '@/features/project/validation/fileAssignmentSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import { createNotification, NOTIFICATION_TYPES } from '@/lib/notifications/createNotification'
import type { ActionResult } from '@/types/actionResult'
import type { FileAssignmentPriority, FileAssignmentStatus } from '@/types/assignment'

type FileAssignment = {
  id: string
  fileId: string
  projectId: string
  assignedTo: string
  status: FileAssignmentStatus
  priority: FileAssignmentPriority
}

// Valid status transitions
const VALID_TRANSITIONS: Record<FileAssignmentStatus, FileAssignmentStatus[]> = {
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'assigned', 'cancelled'], // assigned = release back to admin pool, cancelled = self-assigned release
  completed: [],
  cancelled: [],
}

export async function updateAssignmentStatus(
  input: unknown,
): Promise<ActionResult<FileAssignment>> {
  let currentUser
  try {
    currentUser = await requireRole('native_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Authentication required' }
  }

  const parsed = updateAssignmentStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { assignmentId, projectId, status: newStatus } = parsed.data
  const { tenantId, id: userId } = currentUser

  // Fetch current assignment
  const [current] = await db
    .select()
    .from(fileAssignments)
    .where(
      and(
        eq(fileAssignments.id, assignmentId),
        eq(fileAssignments.projectId, projectId),
        withTenant(fileAssignments.tenantId, tenantId),
      ),
    )

  if (!current) {
    return { success: false, code: 'NOT_FOUND', error: 'Assignment not found' }
  }

  // Ownership check: only assigned reviewer, assigning admin/QA, or admin can update
  const isAssignee = current.assignedTo === userId
  const isAssigner = current.assignedBy === userId
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'qa_reviewer'
  if (!isAssignee && !isAssigner && !isAdmin) {
    return { success: false, code: 'FORBIDDEN', error: 'Not authorized to update this assignment' }
  }

  const oldStatus = current.status as FileAssignmentStatus

  // Validate transition
  const allowedTransitions = VALID_TRANSITIONS[oldStatus] ?? []
  if (!allowedTransitions.includes(newStatus)) {
    return {
      success: false,
      code: 'INVALID_TRANSITION',
      error: `Cannot transition from '${oldStatus}' to '${newStatus}'`,
    }
  }

  // R2-C1: privilege escalation guard — `cancelled` may only be chosen by the
  // ORIGINAL self-assigner (self-release) OR an admin/QA (override). A native
  // reviewer who was admin-assigned MUST transition through `assigned` (release
  // back to the admin pool) rather than destroy the assignment.
  if (newStatus === 'cancelled') {
    const isSelfAssigned = current.assignedBy === current.assignedTo
    if (!isSelfAssigned && !isAdmin) {
      return {
        success: false,
        code: 'FORBIDDEN',
        error: 'Only the original self-assigner or an admin can cancel an assignment',
      }
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
  }

  if (newStatus === 'in_progress') {
    updatePayload.startedAt = new Date()
    updatePayload.lastActiveAt = new Date()
  } else if (newStatus === 'completed') {
    updatePayload.completedAt = new Date()
  } else if (newStatus === 'cancelled') {
    // Self-assign release: cancel completely so the file can be picked up by anyone
    updatePayload.completedAt = new Date()
  } else if (newStatus === 'assigned' && oldStatus === 'in_progress') {
    // Admin-assign release: revert to assigned state, clear started_at
    updatePayload.startedAt = null
    updatePayload.lastActiveAt = null
  }

  const rows = await db
    .update(fileAssignments)
    .set(updatePayload)
    .where(
      and(
        eq(fileAssignments.id, assignmentId),
        withTenant(fileAssignments.tenantId, tenantId),
        // Re-check status for optimistic locking
        inArray(fileAssignments.status, [oldStatus]),
      ),
    )
    .returning()

  // Guard rows[0]! (Guardrail #3)
  if (rows.length === 0) {
    return {
      success: false,
      code: 'CONFLICT',
      error: 'Assignment status changed concurrently',
    }
  }
  const updated = rows[0]!

  // Audit log (Guardrail #2)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'file_assignment',
    entityId: assignmentId,
    action: 'assignment_status_changed',
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
  })

  // Notification on completion (fire-and-forget — Guardrail #85, #23)
  if (newStatus === 'completed' && current.assignedBy !== userId) {
    createNotification({
      tenantId,
      userId: current.assignedBy,
      type: NOTIFICATION_TYPES.ASSIGNMENT_COMPLETED,
      title: 'File review completed',
      body: 'A reviewer has completed the assigned file review',
      projectId,
      metadata: { fileId: current.fileId, assignmentId },
    }).catch(() => {})
  }

  logger.info({ assignmentId, oldStatus, newStatus }, 'Assignment status updated')

  return {
    success: true,
    data: {
      id: updated.id,
      fileId: updated.fileId,
      projectId: updated.projectId,
      assignedTo: updated.assignedTo,
      status: updated.status as FileAssignmentStatus,
      priority: updated.priority as FileAssignmentPriority,
    },
  }
}
