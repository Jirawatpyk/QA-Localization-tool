'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { users } from '@/db/schema/users'
import { getFileAssignmentSchema } from '@/features/project/validation/fileAssignmentSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'
import type { FileAssignmentPriority, FileAssignmentStatus } from '@/types/assignment'

type FileAssignmentWithUser = {
  id: string
  fileId: string
  projectId: string
  assignedTo: string
  assignedBy: string
  status: FileAssignmentStatus
  priority: FileAssignmentPriority
  lastActiveAt: string | null
  assigneeName: string
}

/**
 * Fetch the current active assignment for a file (if any).
 * Used by the review page to determine soft lock state.
 */
export async function getFileAssignment(
  input: unknown,
): Promise<ActionResult<{ assignment: FileAssignmentWithUser | null; currentUserId: string }>> {
  let currentUser
  try {
    currentUser = await requireRole('native_reviewer', 'read')
  } catch {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  const parsed = getFileAssignmentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { fileId, projectId } = parsed.data

  const rows = await db
    .select({
      id: fileAssignments.id,
      fileId: fileAssignments.fileId,
      projectId: fileAssignments.projectId,
      assignedTo: fileAssignments.assignedTo,
      assignedBy: fileAssignments.assignedBy,
      status: fileAssignments.status,
      priority: fileAssignments.priority,
      lastActiveAt: fileAssignments.lastActiveAt,
      assigneeName: users.displayName,
    })
    .from(fileAssignments)
    .innerJoin(users, eq(users.id, fileAssignments.assignedTo))
    .where(
      and(
        eq(fileAssignments.fileId, fileId),
        eq(fileAssignments.projectId, projectId),
        withTenant(fileAssignments.tenantId, currentUser.tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .limit(1)

  const row = rows[0]
  const assignment: FileAssignmentWithUser | null = row
    ? {
        id: row.id,
        fileId: row.fileId,
        projectId: row.projectId,
        assignedTo: row.assignedTo,
        assignedBy: row.assignedBy,
        status: row.status as FileAssignmentStatus,
        priority: row.priority as FileAssignmentPriority,
        lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
        assigneeName: row.assigneeName,
      }
    : null

  return {
    success: true,
    data: { assignment, currentUserId: currentUser.id },
  }
}
