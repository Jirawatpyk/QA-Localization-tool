'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { redoBulkActionSchema } from '@/features/review/validation/undoAction.schema'
import type { RedoBulkActionInput } from '@/features/review/validation/undoAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { FindingStatus } from '@/types/finding'

type BulkRedoResult = {
  reverted: string[]
  conflicted: string[]
  serverUpdatedAt: string
}

export async function redoBulkAction(
  input: RedoBulkActionInput,
): Promise<ActionResult<BulkRedoResult>> {
  // Zod validation
  const parsed = redoBulkActionSchema.safeParse(input)
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

  const { findings: findingInputs, fileId, projectId } = parsed.data
  const { id: userId, tenantId } = user

  // Guardrail #5: empty array guard
  if (findingInputs.length === 0) {
    return {
      success: true,
      data: { reverted: [], conflicted: [], serverUpdatedAt: new Date().toISOString() },
    }
  }

  const findingIds = findingInputs.map((f) => f.findingId)

  // Fetch all findings in batch (Guardrail #1)
  const rows = await db
    .select({ id: findings.id, status: findings.status, segmentId: findings.segmentId })
    .from(findings)
    .where(
      and(
        inArray(findings.id, findingIds),
        eq(findings.fileId, fileId),
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
      ),
    )

  const currentStateMap = new Map(rows.map((r) => [r.id, r.status as FindingStatus]))

  // Partition
  const canRedo: Array<{
    findingId: string
    targetState: FindingStatus
    currentState: FindingStatus
  }> = []
  const conflicted: string[] = []

  for (const fi of findingInputs) {
    const currentState = currentStateMap.get(fi.findingId)
    if (!currentState) {
      conflicted.push(fi.findingId)
      continue
    }
    if (currentState !== fi.expectedCurrentState) {
      conflicted.push(fi.findingId)
      continue
    }
    canRedo.push({
      findingId: fi.findingId,
      targetState: fi.targetState,
      currentState,
    })
  }

  // Story 5.2a CR-R1 L1: Determine non-native ONCE for entire bulk redo
  // Uses segmentId from initial SELECT (was a separate query before CR-R1)
  let redoBulkTargetLang = 'unknown'
  const firstRedoSegmentId =
    canRedo.length > 0
      ? (rows.find((r) => r.id === canRedo[0]!.findingId)?.segmentId ?? null)
      : null
  if (firstRedoSegmentId) {
    const segRows = await db
      .select({ targetLang: segments.targetLang })
      .from(segments)
      .where(and(eq(segments.id, firstRedoSegmentId), withTenant(segments.tenantId, tenantId)))
      .limit(1)
    if (segRows.length > 0) {
      redoBulkTargetLang = segRows[0]!.targetLang
    }
  }
  const isNonNative = determineNonNative(user.nativeLanguages, redoBulkTargetLang)

  const serverUpdatedAt = new Date()
  const reverted: string[] = []

  if (canRedo.length > 0) {
    await db.transaction(async (tx) => {
      for (const item of canRedo) {
        await tx
          .update(findings)
          .set({ status: item.targetState, updatedAt: serverUpdatedAt })
          .where(and(eq(findings.id, item.findingId), withTenant(findings.tenantId, tenantId)))

        await tx.insert(reviewActions).values({
          findingId: item.findingId,
          fileId,
          projectId,
          tenantId,
          actionType: 'redo',
          previousState: item.currentState,
          newState: item.targetState,
          userId,
          batchId: null,
          isBulk: true,
          metadata: { non_native: isNonNative },
        })

        reverted.push(item.findingId)
      }
    })
  }

  // Audit log (best-effort)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: fileId,
      action: 'finding.bulk_redo',
      oldValue: { findingIds: reverted },
      newValue: {
        reverted: reverted.length,
        conflicted: conflicted.length,
        non_native: isNonNative,
      },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr }, 'Audit log write failed for bulk redo')
  }

  // Inngest event for score recalculation (best-effort, single event for entire batch)
  const firstRedone = canRedo[0]
  if (firstRedone) {
    try {
      await inngest.send({
        name: 'finding.changed',
        data: {
          findingId: firstRedone.findingId,
          fileId,
          projectId,
          tenantId,
          previousState: firstRedone.currentState,
          newState: firstRedone.targetState,
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
        },
      })
    } catch (inngestErr) {
      logger.error({ err: inngestErr, fileId }, 'Redo bulk Inngest event failed (non-fatal)')
    }
  }

  return {
    success: true,
    data: { reverted, conflicted, serverUpdatedAt: serverUpdatedAt.toISOString() },
  }
}
