'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { undoAddFindingSchema } from '@/features/review/validation/undoAction.schema'
import type { UndoAddFindingInput } from '@/features/review/validation/undoAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { tryNonFatal } from '@/lib/utils/tryNonFatal'
import type { ActionResult } from '@/types/actionResult'

type UndoAddResult = {
  findingId: string
  deleted: true
}

export async function undoAddFinding(
  input: UndoAddFindingInput,
): Promise<ActionResult<UndoAddResult>> {
  // Zod validation
  const parsed = undoAddFindingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  // Auth
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const { findingId, fileId, projectId } = parsed.data
  const { id: userId, tenantId } = user

  // S-FIX-7: Lock ownership check (AC3 — defense-in-depth)
  const lockError = await assertLockOwnership(fileId, tenantId, userId)
  if (lockError) return lockError

  // Verify finding exists (Guardrail #1, #4)
  const rows = await db
    .select({ id: findings.id })
    .from(findings)
    .where(
      and(
        eq(findings.id, findingId),
        eq(findings.fileId, fileId),
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (rows.length === 0) {
    return { success: false, error: 'Finding not found or already deleted', code: 'NOT_FOUND' }
  }

  // Transaction: DELETE review_actions FIRST → then DELETE finding (FK order)
  await db.transaction(async (tx) => {
    await tx
      .delete(reviewActions)
      .where(
        and(eq(reviewActions.findingId, findingId), withTenant(reviewActions.tenantId, tenantId)),
      )

    await tx
      .delete(findings)
      .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))
  })

  // Audit log (best-effort)
  await tryNonFatal(
    () =>
      writeAuditLog({
        tenantId,
        userId,
        entityType: 'finding',
        entityId: findingId,
        action: 'finding.undo_add',
        oldValue: { findingId },
        newValue: {},
      }),
    { operation: 'audit log (undoAddFinding)', meta: { findingId } },
  )

  // Inngest event for score recalculation (best-effort)
  await tryNonFatal(
    () =>
      inngest.send({
        name: 'finding.changed',
        data: {
          findingId,
          fileId,
          projectId,
          tenantId,
          previousState: 'manual',
          newState: 'manual',
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
        },
      }),
    { operation: 'inngest event (undoAddFinding)', meta: { findingId } },
  )

  return {
    success: true,
    data: { findingId, deleted: true },
  }
}
