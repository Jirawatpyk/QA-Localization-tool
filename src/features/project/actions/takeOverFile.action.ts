'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { takeOverFileSchema } from '@/features/project/validation/fileAssignmentSchemas'
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

export async function takeOverFile(input: unknown): Promise<ActionResult<FileAssignment>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin or QA reviewer access required' }
  }

  const parsed = takeOverFileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { currentAssignmentId, projectId } = parsed.data
  const { tenantId, id: userId } = currentUser

  // Transaction: cancel old + insert new (Guardrail #5)
  const result = await db.transaction(async (tx) => {
    // Optimistic locking: WHERE id AND status IN active (Guardrail #81)
    const cancelledRows = await tx
      .update(fileAssignments)
      .set({ status: 'cancelled' as FileAssignmentStatus, updatedAt: new Date() })
      .where(
        and(
          eq(fileAssignments.id, currentAssignmentId),
          withTenant(fileAssignments.tenantId, tenantId),
          inArray(fileAssignments.status, ['assigned', 'in_progress']),
        ),
      )
      .returning()

    // Guard rows[0]! (Guardrail #3)
    if (cancelledRows.length === 0) {
      return { conflict: true as const }
    }
    const oldAssignment = cancelledRows[0]!

    // Insert new assignment
    const newRows = await tx
      .insert(fileAssignments)
      .values({
        fileId: oldAssignment.fileId,
        projectId,
        tenantId,
        assignedTo: userId,
        assignedBy: userId,
        status: 'in_progress' as FileAssignmentStatus,
        priority: oldAssignment.priority as FileAssignmentPriority,
        startedAt: new Date(),
        lastActiveAt: new Date(),
      })
      .returning()

    if (newRows.length === 0) {
      throw new Error('Failed to create takeover assignment')
    }
    const newAssignment = newRows[0]!

    return {
      conflict: false as const,
      assignment: newAssignment,
      oldAssignment: {
        id: oldAssignment.id,
        assignedTo: oldAssignment.assignedTo,
        status: oldAssignment.status,
        fileId: oldAssignment.fileId,
      },
    }
  })

  if (result.conflict) {
    return {
      success: false,
      code: 'CONFLICT',
      error: 'Assignment no longer active — may have been completed or cancelled',
    }
  }

  // Audit + notification OUTSIDE transaction (Guardrail #2, #5, #85)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'file_assignment',
    entityId: result.assignment.id,
    action: 'file_takeover',
    oldValue: {
      assignmentId: result.oldAssignment.id,
      assignedTo: result.oldAssignment.assignedTo,
      status: result.oldAssignment.status,
    },
    newValue: {
      assignmentId: result.assignment.id,
      assignedTo: userId,
      status: 'in_progress',
    },
  })

  void createNotification({
    tenantId,
    userId: result.oldAssignment.assignedTo,
    type: NOTIFICATION_TYPES.FILE_REASSIGNED,
    title: 'File reassigned',
    body: 'Another reviewer has taken over the file you were assigned',
    projectId,
    metadata: {
      fileId: result.oldAssignment.fileId,
      oldAssignmentId: result.oldAssignment.id,
      newAssignmentId: result.assignment.id,
    },
  })

  logger.info({ assignmentId: result.assignment.id, userId }, 'File takeover completed')

  return {
    success: true,
    data: {
      id: result.assignment.id,
      fileId: result.assignment.fileId,
      projectId: result.assignment.projectId,
      assignedTo: result.assignment.assignedTo,
      status: result.assignment.status as FileAssignmentStatus,
      priority: result.assignment.priority as FileAssignmentPriority,
    },
  }
}
