'use server'

import 'server-only'

import { db } from '@/db/client'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { executeReviewAction } from '@/features/review/actions/helpers/executeReviewAction'
import type {
  ReviewActionNoOp,
  ReviewActionResult,
} from '@/features/review/actions/helpers/executeReviewAction'
import { rejectFindingSchema } from '@/features/review/validation/reviewAction.schema'
import type { RejectFindingInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

export async function rejectFinding(
  input: RejectFindingInput,
): Promise<ActionResult<ReviewActionResult | ReviewActionNoOp>> {
  // Zod validation
  const parsed = rejectFindingSchema.safeParse(input)
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
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }
  }

  // Execute shared review action logic
  const result = await executeReviewAction({
    input: parsed.data,
    action: 'reject',
    user: { id: user.id, tenantId: user.tenantId },
  })

  // If not a real state change (no-op or error), skip feedback_events
  if (!result.success) return result
  if (!('findingMeta' in result.data)) return result

  // Insert feedback_events for AI training data (reject-specific, AC2)
  // ALL NOT NULL columns must be provided per feedbackEvents schema
  const meta = result.data.findingMeta
  try {
    await db.insert(feedbackEvents).values({
      tenantId: user.tenantId,
      fileId: parsed.data.fileId,
      projectId: parsed.data.projectId,
      findingId: parsed.data.findingId,
      reviewerId: user.id,
      action: 'reject',
      findingCategory: meta.category,
      originalSeverity: meta.severity,
      isFalsePositive: true,
      reviewerIsNative: false, // TODO(story-5.2): wire from user profile
      layer: meta.detectedByLayer,
      detectedByLayer: meta.detectedByLayer,
      sourceLang: meta.sourceLang ?? 'unknown',
      targetLang: meta.targetLang ?? 'unknown',
      sourceText: meta.sourceTextExcerpt ?? '',
      originalTarget: meta.targetTextExcerpt ?? '',
    })
  } catch (feedbackErr) {
    // Non-fatal — the reject action itself succeeded
    logger.error(
      { err: feedbackErr, findingId: parsed.data.findingId },
      'feedback_events insert failed',
    )
  }

  return result
}
