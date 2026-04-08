'use server'

import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { files } from '@/db/schema/files'
import { users } from '@/db/schema/users'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { selfAssignFileSchema } from '@/features/project/validation/fileAssignmentSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import { tryNonFatal } from '@/lib/utils/tryNonFatal'
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
  /**
   * `true` if a NEW row was inserted (success path).
   * `false` if conflict and we returned the existing row (own or other).
   */
  created: boolean
  /**
   * M12: explicit discriminator — `true` when the existing/new lock is owned by the caller,
   * `false` when another reviewer holds it. Callers should check this BEFORE proceeding
   * with mutations even if `success: true`.
   */
  ownedBySelf: boolean
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
  } catch (err) {
    // L10 fix: distinguish FORBIDDEN (insufficient role) from UNAUTHORIZED (no auth)
    const code =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'FORBIDDEN'
        ? ('FORBIDDEN' as const)
        : ('UNAUTHORIZED' as const)
    return {
      success: false,
      code,
      error: code === 'FORBIDDEN' ? 'Insufficient role' : 'Not authenticated',
    }
  }

  const parsed = selfAssignFileSchema.safeParse(input)
  if (!parsed.success) {
    // M4 fix: use first issue message instead of stringified array
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const { fileId, projectId } = parsed.data
  const { tenantId, id: userId } = currentUser

  // R2-D1 + R5-M1: wrap the file-project verification + INSERT in a single
  // transaction AND acquire a row-level lock via `SELECT ... FOR UPDATE` so
  // an admin can't move the file to another project between our SELECT and
  // INSERT. The plain transaction alone (default READ COMMITTED) does NOT
  // prevent this race — each statement gets a fresh snapshot. `.for('update')`
  // takes a ROW SHARE lock on the files row that blocks concurrent UPDATE
  // until our transaction commits.
  const txResult = await db.transaction(async (tx) => {
    // S-FIX-7 H4: verify file belongs to project
    const fileRows = await tx
      .select({ projectId: files.projectId })
      .from(files)
      .where(and(eq(files.id, fileId), withTenant(files.tenantId, tenantId)))
      .for('update')
      .limit(1)

    if (fileRows.length === 0) {
      return { kind: 'not_found' as const }
    }
    if (fileRows[0]!.projectId !== projectId) {
      return { kind: 'project_mismatch' as const }
    }

    // Attempt INSERT with ON CONFLICT DO NOTHING (partial unique index handles race)
    const inserted = await tx
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

    return { kind: 'ok' as const, rows: inserted }
  })

  if (txResult.kind === 'not_found') {
    return { success: false, code: 'NOT_FOUND', error: 'File not found' }
  }
  if (txResult.kind === 'project_mismatch') {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'File does not belong to project',
    }
  }
  const insertRows = txResult.rows

  // Self-assign succeeded
  if (insertRows.length > 0) {
    const row = insertRows[0]!

    // S-FIX-7 H8: audit log non-fatal — INSERT already committed, never let audit
    // failure mask the success and confuse the user with "self-assign failed" toast
    await tryNonFatal(
      () =>
        writeAuditLog({
          tenantId,
          userId,
          entityType: 'file_assignment',
          entityId: row.id,
          action: 'self_assign',
          newValue: { assignmentId: row.id, fileId },
        }),
      { operation: 'selfAssignFile audit log', meta: { assignmentId: row.id } },
    )

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
        ownedBySelf: true, // we just inserted it
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

  // M3 fix: NULL fallback for displayName (users.displayName is nullable)
  const displayNameFallback = existing.assigneeName ?? 'another reviewer'

  // M11: audit log contested-lock attempt for incident forensics
  // (only when ANOTHER user holds the lock, not when own existing assignment)
  if (existing.assignedTo !== userId) {
    await tryNonFatal(
      () =>
        writeAuditLog({
          tenantId,
          userId,
          entityType: 'file_assignment',
          entityId: existing.id,
          action: 'self_assign_conflict',
          newValue: {
            attemptedFileId: fileId,
            existingAssignmentId: existing.id,
            existingAssignedTo: existing.assignedTo,
          },
        }),
      { operation: 'selfAssignFile conflict audit', meta: { fileId } },
    )
  }

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
          assigneeName: existing.assigneeName ?? currentUser.email,
        },
        created: false,
        ownedBySelf: true, // existing row is ours
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
        assigneeName: displayNameFallback,
      },
      created: false,
      ownedBySelf: false, // M12: explicit signal — caller MUST short-circuit mutation
    },
  }
}
