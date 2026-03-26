'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { undoBulkActionSchema } from '@/features/review/validation/undoAction.schema'
import type { UndoBulkActionInput } from '@/features/review/validation/undoAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { FindingStatus } from '@/types/finding'

type BulkUndoResult = {
  reverted: string[]
  conflicted: string[]
  serverUpdatedAt: string
}

export async function undoBulkAction(
  input: UndoBulkActionInput,
): Promise<ActionResult<BulkUndoResult>> {
  // Zod validation
  const parsed = undoBulkActionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION',
    }
  }

  // Auth
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const { findings: findingInputs, fileId, projectId, force } = parsed.data
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
    .select({ id: findings.id, status: findings.status })
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

  // Partition: canRevert vs conflicted
  const canRevert: Array<{
    findingId: string
    previousState: FindingStatus
    currentState: FindingStatus
  }> = []
  const conflicted: string[] = []

  for (const fi of findingInputs) {
    const currentState = currentStateMap.get(fi.findingId)
    if (!currentState) {
      conflicted.push(fi.findingId) // Finding not found = conflict
      continue
    }
    if (!force && currentState !== fi.expectedCurrentState) {
      conflicted.push(fi.findingId)
      continue
    }
    canRevert.push({
      findingId: fi.findingId,
      previousState: fi.previousState,
      currentState,
    })
  }

  const serverUpdatedAt = new Date()
  const reverted: string[] = []

  if (canRevert.length > 0) {
    // Transaction: UPDATE all findings + INSERT review_actions rows
    await db.transaction(async (tx) => {
      for (const item of canRevert) {
        await tx
          .update(findings)
          .set({ status: item.previousState, updatedAt: serverUpdatedAt })
          .where(and(eq(findings.id, item.findingId), withTenant(findings.tenantId, tenantId)))

        await tx.insert(reviewActions).values({
          findingId: item.findingId,
          fileId,
          projectId,
          tenantId,
          actionType: 'undo',
          previousState: item.currentState,
          newState: item.previousState,
          userId,
          batchId: null,
          isBulk: true,
          metadata: null,
        })

        reverted.push(item.findingId)
      }
    })
  }

  // feedback_events for undone rejects (best-effort)
  const undoneRejects = canRevert.filter((item) => item.currentState === 'rejected')
  if (undoneRejects.length > 0) {
    try {
      const undoneIds = undoneRejects.map((r) => r.findingId)
      const findingMeta = await db
        .select({
          id: findings.id,
          severity: findings.severity,
          category: findings.category,
          detectedByLayer: findings.detectedByLayer,
          segmentId: findings.segmentId,
          sourceTextExcerpt: findings.sourceTextExcerpt,
          targetTextExcerpt: findings.targetTextExcerpt,
        })
        .from(findings)
        .where(and(inArray(findings.id, undoneIds), withTenant(findings.tenantId, tenantId)))

      // CR-H5: Batch segment lookup instead of N+1 queries
      const segmentIds = findingMeta
        .map((m) => m.segmentId)
        .filter((id): id is string => id !== null)
      const segmentLangMap = new Map<string, { sourceLang: string; targetLang: string }>()
      if (segmentIds.length > 0) {
        const segRows = await db
          .select({
            id: segments.id,
            sourceLang: segments.sourceLang,
            targetLang: segments.targetLang,
          })
          .from(segments)
          .where(and(inArray(segments.id, segmentIds), withTenant(segments.tenantId, tenantId)))
        for (const row of segRows) {
          segmentLangMap.set(row.id, { sourceLang: row.sourceLang, targetLang: row.targetLang })
        }
      }

      // CR-H2: Batch INSERT feedback_events (single round-trip instead of N)
      const feedbackRows = findingMeta.map((meta) => {
        const langs = meta.segmentId ? segmentLangMap.get(meta.segmentId) : undefined
        const sourceLang = langs?.sourceLang ?? 'unknown'
        const targetLang = langs?.targetLang ?? 'unknown'

        return {
          tenantId,
          fileId,
          projectId,
          findingId: meta.id,
          reviewerId: userId,
          action: 'undo_reject' as const,
          findingCategory: meta.category,
          originalSeverity: meta.severity,
          isFalsePositive: false,
          reviewerIsNative: !determineNonNative(user.nativeLanguages, targetLang),
          layer: meta.detectedByLayer,
          detectedByLayer: meta.detectedByLayer,
          sourceLang,
          targetLang,
          sourceText: meta.sourceTextExcerpt ?? '',
          originalTarget: meta.targetTextExcerpt ?? '',
        }
      })
      if (feedbackRows.length > 0) {
        await db.insert(feedbackEvents).values(feedbackRows)
      }
    } catch (feedbackErr) {
      logger.error({ err: feedbackErr }, 'feedback_events insert failed for bulk undo-reject')
    }
  }

  // Audit log (best-effort)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: fileId,
      action: 'finding.bulk_undo',
      oldValue: { findingIds: reverted },
      newValue: { reverted: reverted.length, conflicted: conflicted.length },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr }, 'Audit log write failed for bulk undo')
  }

  // Inngest events for score recalculation (best-effort, one per reverted finding)
  for (const item of canRevert) {
    try {
      await inngest.send({
        name: 'finding.changed',
        data: {
          findingId: item.findingId,
          fileId,
          projectId,
          tenantId,
          previousState: item.currentState,
          newState: item.previousState,
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
        },
      })
    } catch (inngestErr) {
      logger.error(
        { err: inngestErr, findingId: item.findingId },
        'Inngest event send failed for bulk undo finding',
      )
    }
  }

  return {
    success: true,
    data: {
      reverted,
      conflicted,
      serverUpdatedAt: serverUpdatedAt.toISOString(),
    },
  }
}
