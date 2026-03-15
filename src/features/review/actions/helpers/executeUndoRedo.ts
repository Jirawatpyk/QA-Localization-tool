import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { FindingStatus } from '@/types/finding'

export type UndoRedoResult = {
  findingId: string
  previousState: string
  newState: string
  serverUpdatedAt: string
}

type ExecuteUndoRedoParams = {
  findingId: string
  fileId: string
  projectId: string
  targetState: FindingStatus
  expectedCurrentState: FindingStatus
  force: boolean
  actionType: 'undo' | 'redo'
  user: { id: string; tenantId: string }
}

/**
 * Shared helper for single undo/redo status revert.
 * Pattern: fetch → verify state → transaction(update + review_actions) → audit → Inngest
 */
export async function executeUndoRedo({
  findingId,
  fileId,
  projectId,
  targetState,
  expectedCurrentState,
  force,
  actionType,
  user,
}: ExecuteUndoRedoParams): Promise<ActionResult<UndoRedoResult>> {
  const { id: userId, tenantId } = user

  // Fetch finding with tenant isolation (Guardrail #1)
  const rows = await db
    .select({
      id: findings.id,
      status: findings.status,
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

  // Guard rows[0]! (Guardrail #4)
  if (rows.length === 0) {
    return { success: false, error: 'Finding not found', code: 'NOT_FOUND' }
  }

  const finding = rows[0]!
  const currentState = finding.status as FindingStatus

  // Conflict check: verify current state matches expected (skip if force=true)
  if (!force && currentState !== expectedCurrentState) {
    return {
      success: false,
      error: 'State mismatch',
      code: 'CONFLICT',
    }
  }

  // Transaction: UPDATE finding + INSERT review_actions (Guardrail #6)
  // CRITICAL: set updatedAt = new Date() — without this, Realtime merge guard drops the change
  const serverUpdatedAt = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(findings)
      .set({ status: targetState, updatedAt: serverUpdatedAt })
      .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))

    await tx.insert(reviewActions).values({
      findingId,
      fileId,
      projectId,
      tenantId,
      actionType,
      previousState: currentState,
      newState: targetState,
      userId,
      batchId: null,
      metadata: null,
    })
  })

  // Audit log (best-effort — Guardrail #2)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: findingId,
      action: `finding.${actionType}`,
      oldValue: { status: currentState },
      newValue: { status: targetState },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, findingId, actionType }, 'Audit log write failed for undo/redo')
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
        previousState: currentState,
        newState: targetState,
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (inngestErr) {
    logger.error(
      { err: inngestErr, findingId, actionType },
      'Inngest event send failed for undo/redo',
    )
  }

  return {
    success: true,
    data: {
      findingId,
      previousState: currentState,
      newState: targetState,
      serverUpdatedAt: serverUpdatedAt.toISOString(),
    },
  }
}
