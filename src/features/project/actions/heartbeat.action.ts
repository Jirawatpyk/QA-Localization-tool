'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { heartbeatSchema } from '@/features/project/validation/fileAssignmentSchemas'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import type { ActionResult } from '@/types/actionResult'

/**
 * Lightweight heartbeat — fires every 30s from active reviewers.
 * Uses JWT claim check only (M3 read pattern) — no DB role lookup.
 * No audit log, no notification. Just UPDATE last_active_at.
 */
export async function heartbeat(input: unknown): Promise<ActionResult<{ ok: true }>> {
  const user = await getCurrentUser()
  if (!user) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  const parsed = heartbeatSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { assignmentId } = parsed.data

  // Update last_active_at — only for own active assignment
  const rows = await db
    .update(fileAssignments)
    .set({ lastActiveAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(fileAssignments.id, assignmentId),
        eq(fileAssignments.assignedTo, user.id),
        withTenant(fileAssignments.tenantId, user.tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .returning({ id: fileAssignments.id })

  if (rows.length === 0) {
    return { success: false, code: 'NOT_FOUND', error: 'Active assignment not found' }
  }

  return { success: true, data: { ok: true } }
}
