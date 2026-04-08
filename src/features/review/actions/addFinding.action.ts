'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { MAX_EXCERPT_LENGTH } from '@/features/pipeline/engine/constants'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { buildFeedbackEventRow } from '@/features/review/helpers/buildFeedbackEventRow'
import { addFindingSchema } from '@/features/review/validation/reviewAction.schema'
import type { AddFindingInput } from '@/features/review/validation/reviewAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { tryNonFatal } from '@/lib/utils/tryNonFatal'
import type { ActionResult } from '@/types/actionResult'
import type { FindingSeverity } from '@/types/finding'

type AddFindingResult = {
  findingId: string
  status: 'manual'
  severity: FindingSeverity
  category: string
  description: string
  detectedByLayer: 'Manual'
}

export async function addFinding(input: AddFindingInput): Promise<ActionResult<AddFindingResult>> {
  // Zod validation
  const parsed = addFindingSchema.safeParse(input)
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

  const { fileId, projectId, segmentId, category, severity, description, suggestion } = parsed.data
  const { id: userId, tenantId } = user

  // S-FIX-7: Lock ownership check (AC3 — defense-in-depth)
  const lockError = await assertLockOwnership(fileId, tenantId, userId)
  if (lockError) return lockError

  // Validate segment exists and belongs to file (Guardrail #1, #4)
  const segRows = await db
    .select({
      id: segments.id,
      sourceText: segments.sourceText,
      targetText: segments.targetText,
      sourceLang: segments.sourceLang,
      targetLang: segments.targetLang,
    })
    .from(segments)
    .where(
      and(
        eq(segments.id, segmentId),
        eq(segments.fileId, fileId),
        withTenant(segments.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (segRows.length === 0) {
    return { success: false, error: 'Segment not found', code: 'NOT_FOUND' }
  }

  const segment = segRows[0]!

  // CR-R1-H5: validate category is still active in taxonomy (no tenant_id — shared data)
  const catRows = await db
    .select({ isActive: taxonomyDefinitions.isActive })
    .from(taxonomyDefinitions)
    .where(and(eq(taxonomyDefinitions.category, category), eq(taxonomyDefinitions.isActive, true)))
    .limit(1)

  if (catRows.length === 0) {
    return { success: false, error: 'Category not found or inactive', code: 'INVALID_CATEGORY' }
  }
  const sourceExcerpt = segment.sourceText.slice(0, MAX_EXCERPT_LENGTH)
  const targetExcerpt = segment.targetText.slice(0, MAX_EXCERPT_LENGTH)

  // Story 5.2a CR-R1: hoist non-native detection for reuse in audit log (AC6)
  const isNonNative = determineNonNative(user.nativeLanguages, segment.targetLang)

  // Transaction: INSERT finding + INSERT review_actions (Guardrail #6)
  const insertedRows = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(findings)
      .values({
        segmentId,
        fileId,
        projectId,
        tenantId,
        status: 'manual',
        severity,
        category,
        description,
        detectedByLayer: 'Manual',
        aiConfidence: null,
        aiModel: null,
        suggestedFix: suggestion,
        sourceTextExcerpt: sourceExcerpt,
        targetTextExcerpt: targetExcerpt,
        segmentCount: 1,
        scope: 'per-file',
      })
      .returning()

    // Guard rows[0]! (Guardrail #4)
    if (rows.length === 0) {
      throw new Error('Failed to insert finding')
    }

    const newFinding = rows[0]!

    // Insert review_actions
    await tx.insert(reviewActions).values({
      findingId: newFinding.id,
      fileId,
      projectId,
      tenantId,
      actionType: 'add',
      previousState: 'none',
      newState: 'manual',
      userId,
      batchId: null,
      metadata: {
        isManual: true,
        non_native: isNonNative,
      },
    })

    return rows
  })

  // Guard (Guardrail #4)
  if (insertedRows.length === 0) {
    return { success: false, error: 'Failed to create finding', code: 'INTERNAL_ERROR' }
  }

  const newFinding = insertedRows[0]!
  const findingId = newFinding.id

  // Audit log (best-effort)
  await tryNonFatal(
    () =>
      writeAuditLog({
        tenantId,
        userId,
        entityType: 'finding',
        entityId: findingId,
        action: 'finding.add',
        oldValue: {},
        newValue: { status: 'manual', severity, category, non_native: isNonNative },
      }),
    { operation: 'audit log (addFinding)', meta: { findingId } },
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
          previousState: 'pending', // New finding — no prior state, use 'pending' as baseline
          newState: 'manual',
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
        },
      }),
    { operation: 'inngest event (addFinding)', meta: { findingId } },
  )

  // Insert feedback_events for AI training (FR80 — best-effort)
  await tryNonFatal(
    () =>
      db.insert(feedbackEvents).values(
        buildFeedbackEventRow({
          tenantId,
          fileId,
          projectId,
          findingId,
          reviewerId: userId,
          action: 'manual_add',
          isFalsePositive: false,
          findingCategory: category,
          originalSeverity: severity,
          layer: 'Manual',
          detectedByLayer: 'Manual',
          sourceLang: segment.sourceLang,
          targetLang: segment.targetLang,
          sourceText: sourceExcerpt,
          originalTarget: targetExcerpt,
          reviewerNativeLanguages: user.nativeLanguages,
          reviewerIsNative: !isNonNative,
        }),
      ),
    { operation: 'feedback_events insert (addFinding)', meta: { findingId } },
  )

  return {
    success: true,
    data: {
      findingId,
      status: 'manual',
      severity,
      category,
      description,
      detectedByLayer: 'Manual',
    },
  }
}
