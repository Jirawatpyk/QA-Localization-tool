'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { deleteFindingSchema } from '@/features/review/validation/reviewAction.schema'
import type { DeleteFindingInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type DeleteFindingResult = {
  findingId: string
  deleted: true
}

export async function deleteFinding(
  input: DeleteFindingInput,
): Promise<ActionResult<DeleteFindingResult>> {
  // Zod validation
  const parsed = deleteFindingSchema.safeParse(input)
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

  // Fetch finding to verify it's Manual (Guardrail #1, #4)
  const rows = await db
    .select({
      id: findings.id,
      detectedByLayer: findings.detectedByLayer,
      severity: findings.severity,
      category: findings.category,
    })
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
    return { success: false, error: 'Finding not found', code: 'NOT_FOUND' }
  }

  const finding = rows[0]!

  // Guard: only Manual findings can be deleted
  if (finding.detectedByLayer !== 'Manual') {
    return {
      success: false,
      error: 'Only manual findings can be deleted',
      code: 'NOT_MANUAL',
    }
  }

  // Transaction: DELETE review_actions FIRST → then DELETE finding (FK order — Guardrail #6, #7.4)
  await db.transaction(async (tx) => {
    // Delete review_actions first (FK: review_actions.findingId → findings.id ON DELETE RESTRICT)
    await tx
      .delete(reviewActions)
      .where(
        and(eq(reviewActions.findingId, findingId), withTenant(reviewActions.tenantId, tenantId)),
      )

    // Then delete the finding
    await tx
      .delete(findings)
      .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))
  })

  // Audit log (best-effort)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: findingId,
      action: 'finding.delete',
      oldValue: {
        severity: finding.severity,
        category: finding.category,
        detectedByLayer: 'Manual',
      },
      newValue: {},
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, findingId }, 'Audit log write failed for deleteFinding')
  }

  // Inngest event for score recalculation (best-effort)
  try {
    await inngest.send({
      name: 'finding.changed',
      data: {
        findingId,
        fileId,
        projectId,
        tenantId,
        previousState: 'manual',
        newState: 'manual', // Deleted — use same state for event compatibility
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (inngestErr) {
    logger.error({ err: inngestErr, findingId }, 'Inngest event send failed for deleteFinding')
  }

  return {
    success: true,
    data: { findingId, deleted: true },
  }
}
