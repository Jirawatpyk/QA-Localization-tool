'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { findings } from '@/db/schema/findings'
import { segments } from '@/db/schema/segments'
import { executeUndoRedo } from '@/features/review/actions/helpers/executeUndoRedo'
import type { UndoRedoResult } from '@/features/review/actions/helpers/executeUndoRedo'
import { buildFeedbackEventRow } from '@/features/review/helpers/buildFeedbackEventRow'
import { undoActionSchema } from '@/features/review/validation/undoAction.schema'
import type { UndoActionInput } from '@/features/review/validation/undoAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

export async function undoAction(input: UndoActionInput): Promise<ActionResult<UndoRedoResult>> {
  // Zod validation
  const parsed = undoActionSchema.safeParse(input)
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

  const { findingId, fileId, projectId, previousState, expectedCurrentState, force } = parsed.data

  // Execute shared undo logic
  const result = await executeUndoRedo({
    findingId,
    fileId,
    projectId,
    targetState: previousState,
    expectedCurrentState,
    force,
    actionType: 'undo',
    user: { id: user.id, tenantId: user.tenantId, nativeLanguages: user.nativeLanguages },
  })

  // If undo failed or not a real revert, skip feedback_events
  if (!result.success) return result

  // AC1: If undoing a reject, insert feedback_events with action: 'undo_reject'
  if (expectedCurrentState === 'rejected') {
    try {
      // Fetch finding meta for feedback_events
      const findingRows = await db
        .select({
          severity: findings.severity,
          category: findings.category,
          detectedByLayer: findings.detectedByLayer,
          segmentId: findings.segmentId,
          sourceTextExcerpt: findings.sourceTextExcerpt,
          targetTextExcerpt: findings.targetTextExcerpt,
        })
        .from(findings)
        .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, user.tenantId)))
        .limit(1)

      if (findingRows.length > 0) {
        const meta = findingRows[0]!
        let sourceLang = 'unknown'
        let targetLang = 'unknown'

        if (meta.segmentId) {
          const segRows = await db
            .select({ sourceLang: segments.sourceLang, targetLang: segments.targetLang })
            .from(segments)
            .where(
              and(eq(segments.id, meta.segmentId), withTenant(segments.tenantId, user.tenantId)),
            )
            .limit(1)
          if (segRows.length > 0) {
            sourceLang = segRows[0]!.sourceLang
            targetLang = segRows[0]!.targetLang
          }
        }

        await db.insert(feedbackEvents).values(
          buildFeedbackEventRow({
            tenantId: user.tenantId,
            fileId,
            projectId,
            findingId,
            reviewerId: user.id,
            action: 'undo_reject',
            isFalsePositive: false,
            findingCategory: meta.category,
            originalSeverity: meta.severity,
            layer: meta.detectedByLayer,
            detectedByLayer: meta.detectedByLayer,
            sourceLang,
            targetLang,
            sourceText: meta.sourceTextExcerpt ?? '',
            originalTarget: meta.targetTextExcerpt ?? '',
            reviewerNativeLanguages: user.nativeLanguages,
          }),
        )
      }
    } catch (feedbackErr) {
      logger.error({ err: feedbackErr, findingId }, 'feedback_events insert failed for undo-reject')
    }
  }

  return result
}
