'use server'

import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { users } from '@/db/schema/users'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { selfAssignFileSchema } from '@/features/project/validation/fileAssignmentSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { FileAssignmentPriority, FileAssignmentStatus } from '@/types/assignment'

type SelfAssignResult = {
  assignment: {
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
  created: boolean
}

/**
 * Self-assign a file on first review action (ad-hoc lock).
 * Uses ON CONFLICT on partial unique index `uq_file_assignments_active` to handle race conditions.
 * If conflict: returns existing lock holder data with `created: false`.
 */
export async function selfAssignFile(input: unknown): Promise<ActionResult<SelfAssignResult>> {
  let currentUser
  try {
    currentUser = await requireRole('native_reviewer', 'write')
  } catch {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  const parsed = selfAssignFileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { fileId, projectId } = parsed.data
  const { tenantId, id: userId } = currentUser

  // Attempt INSERT with ON CONFLICT DO NOTHING (partial unique index handles race)
  const insertRows = await db
    .insert(fileAssignments)
    .values({
      fileId,
      projectId,
      tenantId,
      assignedTo: userId,
      assignedBy: userId,
      status: 'in_progress' as FileAssignmentStatus,
      priority: 'normal' as FileAssignmentPriority,
      startedAt: new Date(),
      lastActiveAt: new Date(),
    })
    .onConflictDoNothing({
      target: [fileAssignments.fileId, fileAssignments.tenantId],
      where: sql`status IN ('assigned', 'in_progress')`,
    })
    .returning()

  // Self-assign succeeded
  if (insertRows.length > 0) {
    const row = insertRows[0]!

    // Audit log (non-fatal in happy path — let it throw, caller catches)
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'file_assignment',
      entityId: row.id,
      action: 'self_assign',
      newValue: { assignmentId: row.id, fileId },
    })

    logger.info({ assignmentId: row.id, fileId, userId }, 'Self-assignment created')

    // Fetch display name for response
    const [userRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    return {
      success: true,
      data: {
        assignment: {
          id: row.id,
          fileId: row.fileId,
          projectId: row.projectId,
          assignedTo: row.assignedTo,
          assignedBy: row.assignedBy,
          status: row.status as FileAssignmentStatus,
          priority: row.priority as FileAssignmentPriority,
          lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
          assigneeName: userRow?.displayName ?? currentUser.email,
        },
        created: true,
      },
    }
  }

  // Conflict: another reviewer already has an active assignment — fetch existing lock holder
  const existingRows = await db
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
        withTenant(fileAssignments.tenantId, tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .limit(1)

  if (existingRows.length === 0) {
    // Edge case: assignment was released between INSERT and SELECT
    return { success: false, code: 'CONFLICT', error: 'Assignment state changed — please retry' }
  }

  const existing = existingRows[0]!

  // If the existing lock holder is the current user, return it as success
  if (existing.assignedTo === userId) {
    return {
      success: true,
      data: {
        assignment: {
          id: existing.id,
          fileId: existing.fileId,
          projectId: existing.projectId,
          assignedTo: existing.assignedTo,
          assignedBy: existing.assignedBy,
          status: existing.status as FileAssignmentStatus,
          priority: existing.priority as FileAssignmentPriority,
          lastActiveAt: existing.lastActiveAt?.toISOString() ?? null,
          assigneeName: existing.assigneeName,
        },
        created: false,
      },
    }
  }

  // Another reviewer holds the lock
  return {
    success: true,
    data: {
      assignment: {
        id: existing.id,
        fileId: existing.fileId,
        projectId: existing.projectId,
        assignedTo: existing.assignedTo,
        assignedBy: existing.assignedBy,
        status: existing.status as FileAssignmentStatus,
        priority: existing.priority as FileAssignmentPriority,
        lastActiveAt: existing.lastActiveAt?.toISOString() ?? null,
        assigneeName: existing.assigneeName,
      },
      created: false,
    },
  }
}
