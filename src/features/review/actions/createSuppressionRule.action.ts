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
import { suppressionRules } from '@/db/schema/suppressionRules'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { computeWordOverlap, extractKeywords } from '@/features/review/utils/pattern-detection'
import { suppressionRuleSchema } from '@/features/review/validation/suppressionRule.schema'
import type { CreateSuppressionRuleInput } from '@/features/review/validation/suppressionRule.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { DetectedByLayer, FindingSeverity } from '@/types/finding'

const MAX_AUTO_REJECT = 100
const MIN_KEYWORD_OVERLAP = 3

export type CreateSuppressionRuleResult = {
  ruleId: string
  autoRejectedCount: number
  autoRejectedIds: string[]
  serverUpdatedAt: string | null // ISO string — use to replace client-clock updatedAt (CR-H2 fix)
}

export async function createSuppressionRule(
  input: CreateSuppressionRuleInput,
): Promise<ActionResult<CreateSuppressionRuleResult>> {
  // Zod validation
  const parsed = suppressionRuleSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  const {
    projectId,
    fileId,
    currentFileId,
    category,
    pattern,
    scope,
    duration,
    sourceLang,
    targetLang,
  } = parsed.data

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
  const patternKeywords = pattern.split(',').map((k) => k.trim().toLocaleLowerCase())

  // Query matching Pending findings in CURRENT FILE (AC3: "All matching Pending findings in current file")
  // Note: scope (file/language_pair/all) controls the RULE's future matching, not the auto-reject batch
  const matchingFindings = await db
    .select({
      id: findings.id,
      findingFileId: findings.fileId,
      status: findings.status,
      category: findings.category,
      description: findings.description,
      severity: findings.severity,
      detectedByLayer: findings.detectedByLayer,
      segmentId: findings.segmentId,
      sourceTextExcerpt: findings.sourceTextExcerpt,
      targetTextExcerpt: findings.targetTextExcerpt,
    })
    .from(findings)
    .where(
      and(
        eq(findings.fileId, currentFileId),
        eq(findings.projectId, projectId),
        eq(findings.category, category),
        eq(findings.status, 'pending'),
        withTenant(findings.tenantId, tenantId),
      ),
    )

  // Filter by keyword overlap in-app
  const toAutoReject = matchingFindings
    .filter((f) => {
      const fKeywords = extractKeywords(f.description)
      return computeWordOverlap(fKeywords, patternKeywords) >= MIN_KEYWORD_OVERLAP
    })
    .slice(0, MAX_AUTO_REJECT) // Safety cap

  // Atomic transaction (Guardrail #6)
  let ruleId: string
  let serverUpdatedAt: string | null = null
  try {
    ruleId = await db.transaction(async (tx) => {
      // INSERT suppression rule
      const ruleRows = await tx
        .insert(suppressionRules)
        .values({
          projectId,
          tenantId,
          pattern,
          category,
          scope,
          duration,
          reason: `Auto-generated from pattern detection: ${pattern}`,
          createdBy: userId,
          fileId: fileId ?? null,
          sourceLang: sourceLang ?? null,
          targetLang: targetLang ?? null,
          matchCount: toAutoReject.length,
        })
        .returning({ id: suppressionRules.id })

      // Guardrail #4: guard rows[0]
      if (ruleRows.length === 0) {
        throw new Error('Failed to insert suppression rule')
      }
      const newRuleId = ruleRows[0]!.id

      // Batch UPDATE findings to rejected (Guardrail #5: guard empty array)
      if (toAutoReject.length > 0) {
        const rejectIds = toAutoReject.map((f) => f.id)
        const txUpdatedAt = new Date()
        serverUpdatedAt = txUpdatedAt.toISOString() // CR-H2: capture for client store sync

        await tx
          .update(findings)
          .set({ status: 'rejected', updatedAt: txUpdatedAt })
          .where(and(inArray(findings.id, rejectIds), withTenant(findings.tenantId, tenantId)))

        // Batch INSERT review_actions (shared batchId, isBulk)
        const reviewActionRows = toAutoReject.map((f, i) => ({
          findingId: f.id,
          fileId: f.findingFileId ?? currentFileId, // CR-H8: guard nullable FK with fallback
          projectId,
          tenantId,
          actionType: 'reject' as const,
          previousState: 'pending' as const,
          newState: 'rejected' as const,
          userId,
          batchId,
          isBulk: true,
          metadata: {
            suppressed: true,
            suppressionRuleId: newRuleId,
            batch_size: toAutoReject.length,
            action_index: i,
          } as Record<string, unknown>,
        }))
        await tx.insert(reviewActions).values(reviewActionRows)

        // Batch INSERT feedback_events with metadata.suppressed = true
        // Batch-fetch segment language data
        const segmentIds = toAutoReject
          .map((f) => f.segmentId)
          .filter((id): id is string => id !== null)

        const segmentLangMap = new Map<string, { sourceLang: string; targetLang: string }>()
        if (segmentIds.length > 0) {
          const segRows = await tx
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

        const feedbackRows = toAutoReject.map((f) => {
          const lang = f.segmentId ? segmentLangMap.get(f.segmentId) : undefined
          return {
            tenantId,
            fileId: f.findingFileId ?? currentFileId, // CR-H8: guard nullable FK with fallback
            projectId,
            findingId: f.id,
            reviewerId: userId,
            action: 'reject' as const,
            findingCategory: f.category,
            originalSeverity: f.severity as FindingSeverity,
            isFalsePositive: true,
            reviewerIsNative: !determineNonNative(
              user.nativeLanguages,
              lang?.targetLang ?? targetLang ?? 'unknown',
            ),
            layer: f.detectedByLayer as DetectedByLayer,
            detectedByLayer: f.detectedByLayer as DetectedByLayer,
            sourceLang: lang?.sourceLang ?? sourceLang ?? 'unknown',
            targetLang: lang?.targetLang ?? targetLang ?? 'unknown',
            sourceText: f.sourceTextExcerpt ?? '',
            originalTarget: f.targetTextExcerpt ?? '',
            metadata: { suppressed: true, suppressionRuleId: newRuleId } as Record<string, unknown>,
          }
        })
        await tx.insert(feedbackEvents).values(feedbackRows)
      }

      return newRuleId
    })
  } catch (txErr) {
    logger.error({ err: txErr, category, pattern }, 'Suppression rule creation transaction failed')
    return {
      success: false,
      error: 'Suppression rule creation failed — all changes rolled back',
      code: 'INTERNAL_ERROR',
    }
  }

  // Best-effort audit log (Guardrail #2)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'suppression_rule',
      entityId: ruleId,
      action: 'suppression_rule.created',
      newValue: {
        ruleId,
        category,
        pattern,
        scope,
        duration,
        autoRejectedCount: toAutoReject.length,
      },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, ruleId }, 'Audit log write failed for suppression rule creation')
  }

  // Best-effort single Inngest event after batch (NOT per-finding)
  if (toAutoReject.length > 0) {
    const firstFinding = toAutoReject[0]!
    try {
      await inngest.send({
        name: 'finding.changed',
        data: {
          findingId: firstFinding.id,
          fileId: firstFinding.findingFileId ?? currentFileId, // CR-H8: guard nullable FK
          projectId,
          tenantId,
          previousState: 'pending',
          newState: 'rejected',
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
          batchId,
        },
      })
    } catch (inngestErr) {
      logger.error(
        { err: inngestErr, ruleId, batchId },
        'Inngest event send failed for suppression auto-reject',
      )
    }
  }

  return {
    success: true,
    data: {
      ruleId,
      autoRejectedCount: toAutoReject.length,
      autoRejectedIds: toAutoReject.map((f) => f.id),
      serverUpdatedAt, // CR-H2: server timestamp for client store sync
    },
  }
}
