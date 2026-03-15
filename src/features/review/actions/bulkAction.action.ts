'use server'

import 'server-only'

import crypto from 'node:crypto'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { getNewState } from '@/features/review/utils/state-transitions'
import { bulkActionSchema } from '@/features/review/validation/reviewAction.schema'
import type { BulkActionInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import { FINDING_STATUSES } from '@/types/finding'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

export type BulkActionResult = {
  batchId: string
  processedCount: number
  skippedCount: number
  skippedIds: string[]
  processedFindings: Array<{
    findingId: string
    previousState: FindingStatus
    newState: FindingStatus
    serverUpdatedAt: string
  }>
}

type ProcessedFinding = {
  findingId: string
  previousState: FindingStatus
  newState: FindingStatus
  segmentId: string | null
  severity: FindingSeverity
  category: string
  detectedByLayer: DetectedByLayer
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
}

export async function bulkAction(input: BulkActionInput): Promise<ActionResult<BulkActionResult>> {
  // Zod validation
  const parsed = bulkActionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  const { findingIds, action, fileId, projectId } = parsed.data

  // Guardrail #5: empty array guard for inArray
  if (findingIds.length === 0) {
    return {
      success: true,
      data: {
        batchId: '',
        processedCount: 0,
        skippedCount: 0,
        skippedIds: [],
        processedFindings: [],
      },
    }
  }

  // Auth
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }
  }

  const { id: userId, tenantId } = user
  const batchId = crypto.randomUUID()

  // Fetch all findings with tenant isolation (Guardrail #1)
  const foundFindings = await db
    .select({
      id: findings.id,
      fileId: findings.fileId,
      projectId: findings.projectId,
      tenantId: findings.tenantId,
      segmentId: findings.segmentId,
      status: findings.status,
      severity: findings.severity,
      category: findings.category,
      detectedByLayer: findings.detectedByLayer,
      sourceTextExcerpt: findings.sourceTextExcerpt,
      targetTextExcerpt: findings.targetTextExcerpt,
    })
    .from(findings)
    .where(
      and(
        inArray(findings.id, findingIds),
        eq(findings.fileId, fileId),
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
      ),
    )

  // Compute transitions — skip no-ops
  const processed: ProcessedFinding[] = []
  const skippedIds: string[] = []

  for (const finding of foundFindings) {
    // Runtime verify status (Guardrail #3)
    if (!FINDING_STATUSES.includes(finding.status as FindingStatus)) {
      skippedIds.push(finding.id)
      continue
    }

    const currentState = finding.status as FindingStatus
    const newState = getNewState(action, currentState)

    if (newState === null) {
      // No-op — already in target state or manual
      skippedIds.push(finding.id)
      continue
    }

    processed.push({
      findingId: finding.id,
      previousState: currentState,
      newState,
      segmentId: finding.segmentId,
      severity: finding.severity as FindingSeverity,
      category: finding.category,
      detectedByLayer: finding.detectedByLayer as DetectedByLayer,
      sourceTextExcerpt: finding.sourceTextExcerpt,
      targetTextExcerpt: finding.targetTextExcerpt,
    })
  }

  // Also count findings in findingIds that weren't found in DB
  const foundIds = new Set(foundFindings.map((f) => f.id))
  for (const id of findingIds) {
    if (!foundIds.has(id) && !skippedIds.includes(id)) {
      skippedIds.push(id)
    }
  }

  // If all no-ops, return early — no transaction, no event
  if (processed.length === 0) {
    return {
      success: true,
      data: {
        batchId,
        processedCount: 0,
        skippedCount: skippedIds.length,
        skippedIds,
        processedFindings: [],
      },
    }
  }

  // Atomic transaction — UPDATE findings + INSERT review_actions (Guardrail #6)
  const serverUpdatedAt = new Date()
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < processed.length; i++) {
        const p = processed[i]!

        // UPDATE finding status (Guardrail #1 — withTenant on UPDATE)
        await tx
          .update(findings)
          .set({ status: p.newState, updatedAt: serverUpdatedAt })
          .where(and(eq(findings.id, p.findingId), withTenant(findings.tenantId, tenantId)))

        // INSERT review_actions (INSERT = set tenantId in values)
        await tx.insert(reviewActions).values({
          findingId: p.findingId,
          fileId,
          projectId,
          tenantId,
          actionType: action,
          previousState: p.previousState,
          newState: p.newState,
          userId,
          batchId,
          isBulk: true,
          metadata: { is_bulk: true, batch_size: processed.length, action_index: i },
        })
      }
    })
  } catch (txErr) {
    logger.error(
      { err: txErr, batchId, findingCount: processed.length },
      'Bulk action transaction failed',
    )
    return {
      success: false,
      error: 'Bulk operation failed — all changes rolled back',
      code: 'INTERNAL_ERROR',
    }
  }

  // Best-effort audit log (Guardrail #2)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: batchId,
      action: `finding.bulk_${action}`,
      oldValue: { findingCount: processed.length },
      newValue: { batchId, processedCount: processed.length },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, batchId }, 'Audit log write failed for bulk action')
  }

  // Best-effort Inngest event — single event using first processed finding (Guardrail #13)
  const firstProcessed = processed[0]!
  try {
    await inngest.send({
      name: 'finding.changed',
      data: {
        findingId: firstProcessed.findingId,
        fileId,
        projectId,
        tenantId,
        previousState: firstProcessed.previousState,
        newState: firstProcessed.newState,
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
        batchId,
      },
    })
  } catch (inngestErr) {
    logger.error(
      { err: inngestErr, batchId },
      'Inngest event send failed for bulk action — score recalculation may be delayed',
    )
  }

  // feedback_events for reject (AI training data) — best-effort, non-fatal
  if (action === 'reject') {
    try {
      // Batch-fetch segment language data (Guardrail #5: guard empty)
      const segmentIds = processed.map((p) => p.segmentId).filter((id): id is string => id !== null)

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

        for (const seg of segRows) {
          segmentLangMap.set(seg.id, { sourceLang: seg.sourceLang, targetLang: seg.targetLang })
        }
      }

      // Insert feedback_events one by one (different data per finding)
      for (const p of processed) {
        const lang = p.segmentId ? segmentLangMap.get(p.segmentId) : undefined
        await db.insert(feedbackEvents).values({
          tenantId,
          fileId,
          projectId,
          findingId: p.findingId,
          reviewerId: userId,
          action: 'reject',
          findingCategory: p.category,
          originalSeverity: p.severity,
          isFalsePositive: true,
          reviewerIsNative: false, // TODO(story-5.2): wire from user profile
          layer: p.detectedByLayer,
          detectedByLayer: p.detectedByLayer,
          sourceLang: lang?.sourceLang ?? 'unknown',
          targetLang: lang?.targetLang ?? 'unknown',
          sourceText: p.sourceTextExcerpt ?? '',
          originalTarget: p.targetTextExcerpt ?? '',
        })
      }
    } catch (feedbackErr) {
      logger.error({ err: feedbackErr, batchId }, 'feedback_events insert failed for bulk reject')
    }
  }

  const serverTimestamp = serverUpdatedAt.toISOString()

  return {
    success: true,
    data: {
      batchId,
      processedCount: processed.length,
      skippedCount: skippedIds.length,
      skippedIds,
      processedFindings: processed.map((p) => ({
        findingId: p.findingId,
        previousState: p.previousState,
        newState: p.newState,
        serverUpdatedAt: serverTimestamp,
      })),
    },
  }
}
