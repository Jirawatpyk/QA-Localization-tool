'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { files } from '@/db/schema/files'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { assignFileSchema } from '@/features/project/validation/fileAssignmentSchemas'
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

export async function assignFile(input: unknown): Promise<ActionResult<FileAssignment>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin or QA reviewer access required' }
  }

  const parsed = assignFileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { fileId, projectId, assignedTo, priority, notes } = parsed.data
  const { tenantId, id: userId } = currentUser

  // Verify file belongs to tenant + project
  const [file] = await db
    .select({ id: files.id, fileName: files.fileName })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.projectId, projectId),
        withTenant(files.tenantId, tenantId),
      ),
    )

  if (!file) {
    return { success: false, code: 'NOT_FOUND', error: 'File not found in project' }
  }

  // Insert assignment — partial unique index enforces one active per file (Guardrail #82)
  let rows
  try {
    rows = await db
      .insert(fileAssignments)
      .values({
        fileId,
        projectId,
        tenantId,
        assignedTo,
        assignedBy: userId,
        priority,
        notes,
      })
      .returning()
  } catch (err) {
    // Unique constraint violation = file already has active assignment
    const pgErr = err as { code?: string }
    if (pgErr.code === '23505') {
      return { success: false, code: 'CONFLICT', error: 'File already has an active assignment' }
    }
    throw err
  }

  // Guard rows[0]! (Guardrail #3)
  if (rows.length === 0) {
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to create assignment' }
  }
  const assignment = rows[0]!

  // Audit log (Guardrail #2: let throw on happy path)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'file_assignment',
    entityId: assignment.id,
    action: 'file_assigned',
    newValue: { fileId, assignedTo, priority, notes },
  })

  // Notification (fire-and-forget — Guardrail #85)
  void createNotification({
    tenantId,
    userId: assignedTo,
    type: NOTIFICATION_TYPES.FILE_ASSIGNED,
    title: `File '${file.fileName}' assigned to you`,
    body: `You have been assigned a file for review${priority === 'urgent' ? ' (URGENT)' : ''}`,
    projectId,
    metadata: { fileId, assignmentId: assignment.id, priority },
  })

  // Urgent notification (separate — Guardrail #85)
  if (priority === 'urgent') {
    void createNotification({
      tenantId,
      userId: assignedTo,
      type: NOTIFICATION_TYPES.FILE_URGENT,
      title: `File '${file.fileName}' marked as urgent`,
      body: 'This file has been marked as urgent priority',
      projectId,
      metadata: { fileId, assignmentId: assignment.id },
    })
  }

  logger.info({ fileId, assignedTo, priority }, 'File assigned')

  return {
    success: true,
    data: {
      id: assignment.id,
      fileId: assignment.fileId,
      projectId: assignment.projectId,
      assignedTo: assignment.assignedTo,
      status: assignment.status as FileAssignmentStatus,
      priority: assignment.priority as FileAssignmentPriority,
    },
  }
}
