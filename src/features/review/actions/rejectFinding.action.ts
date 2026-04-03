'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { segments } from '@/db/schema/segments'
import { executeReviewAction } from '@/features/review/actions/helpers/executeReviewAction'
import type {
  ReviewActionNoOp,
  ReviewActionResult,
} from '@/features/review/actions/helpers/executeReviewAction'
import { rejectFindingSchema } from '@/features/review/validation/reviewAction.schema'
import type { RejectFindingInput } from '@/features/review/validation/reviewAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
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
      code: 'VALIDATION_ERROR',
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
    user: { id: user.id, tenantId: user.tenantId, nativeLanguages: user.nativeLanguages },
  })

  // If not a real state change (no-op or error), skip feedback_events
  if (!result.success) return result
  if (!('findingMeta' in result.data)) return result

  // M1 fix: Segment lookup for language pair — only reject needs this for feedback_events
  const meta = result.data.findingMeta
  let sourceLang: string | null = null
  let targetLang: string | null = null
  if (meta.segmentId) {
    const segRows = await db
      .select({ sourceLang: segments.sourceLang, targetLang: segments.targetLang })
      .from(segments)
      .where(and(eq(segments.id, meta.segmentId), withTenant(segments.tenantId, user.tenantId)))
      .limit(1)
    if (segRows.length > 0) {
      sourceLang = segRows[0]!.sourceLang
      targetLang = segRows[0]!.targetLang
    }
  }

  // Insert feedback_events for AI training data (reject-specific, AC2)
  // ALL NOT NULL columns must be provided per feedbackEvents schema
  // L4: Both `layer` and `detectedByLayer` columns exist in schema — same value by design
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
      reviewerIsNative: !determineNonNative(user.nativeLanguages, targetLang ?? 'unknown'),
      layer: meta.detectedByLayer,
      detectedByLayer: meta.detectedByLayer,
      sourceLang: sourceLang ?? 'unknown',
      targetLang: targetLang ?? 'unknown',
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
