'use server'

import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findingAssignments } from '@/db/schema/findingAssignments'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import type { ReviewActionResult } from '@/features/review/actions/helpers/executeReviewAction'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { confirmNativeSchema } from '@/features/review/validation/reviewAction.schema'
import type { ConfirmNativeInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { createNotification, NOTIFICATION_TYPES } from '@/lib/notifications/createNotification'
import type { ActionResult } from '@/types/actionResult'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

/**
 * Native reviewer confirms a flagged finding (AC3).
 * Determines accepted vs re_accepted based on the pre-flagged state.
 * Guardrails: #64 (double defense), #66 (never clear non_native), #67 (atomic), #78 (audit).
 */
export async function confirmNativeReview(
  input: ConfirmNativeInput,
): Promise<ActionResult<ReviewActionResult>> {
  const parsed = confirmNativeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  const { findingId, fileId, projectId } = parsed.data

  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('native_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { id: userId, tenantId } = user

  // S-FIX-7: Lock ownership check (AC3 — defense-in-depth)
  const lockError = await assertLockOwnership(fileId, tenantId, userId)
  if (lockError) return lockError

  // Fetch assignment — verify current user is assigned (Guardrail #64)
  const assignmentRows = await db
    .select({
      id: findingAssignments.id,
      status: findingAssignments.status,
      fileId: findingAssignments.fileId,
      assignedBy: findingAssignments.assignedBy,
    })
    .from(findingAssignments)
    .where(
      and(
        eq(findingAssignments.findingId, findingId),
        eq(findingAssignments.fileId, fileId), // CR-H8 fix: Guardrail #14 — symmetric filter
        eq(findingAssignments.assignedTo, userId),
        withTenant(findingAssignments.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (assignmentRows.length === 0) {
    return {
      success: false,
      error: 'Assignment not found or not assigned to you',
      code: 'NOT_FOUND',
    }
  }

  const assignment = assignmentRows[0]!

  // Fetch finding details for findingMeta
  const findingRows = await db
    .select({
      segmentId: findings.segmentId,
      severity: findings.severity,
      category: findings.category,
      detectedByLayer: findings.detectedByLayer,
      sourceTextExcerpt: findings.sourceTextExcerpt,
      targetTextExcerpt: findings.targetTextExcerpt,
    })
    .from(findings)
    .where(
      and(
        eq(findings.id, findingId),
        eq(findings.projectId, projectId), // CR-R2 F3: defense-in-depth (Guardrail #7)
        withTenant(findings.tenantId, tenantId),
      ),
    )
    .limit(1)

  const findingDetail = findingRows[0]

  // Guard: can only confirm pending or in_review assignments
  if (assignment.status !== 'pending' && assignment.status !== 'in_review') {
    return { success: false, error: 'Assignment already completed', code: 'INVALID_STATE' }
  }

  // Determine re_accepted vs accepted: lookup MOST RECENT flag_for_native review_action
  // C5 fix: orderBy(desc) ensures correct row when finding flagged multiple times
  const flagActionRows = await db
    .select({ previousState: reviewActions.previousState })
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.findingId, findingId),
        eq(reviewActions.actionType, 'flag_for_native'),
        withTenant(reviewActions.tenantId, tenantId),
      ),
    )
    .orderBy(desc(reviewActions.createdAt))
    .limit(1)

  // CR-M9: If no flag action found (defensive), default to 'accepted' (not undefined crash)
  const preFlaggedState = flagActionRows[0]?.previousState as FindingStatus | undefined
  const newFindingStatus: FindingStatus =
    preFlaggedState === 'rejected' ? 're_accepted' : 'accepted'

  // Atomic transaction (Guardrail #67)
  const now = new Date()
  await db.transaction(async (tx) => {
    // Update finding status
    await tx
      .update(findings)
      .set({ status: newFindingStatus, updatedAt: now })
      .where(
        and(
          eq(findings.id, findingId),
          eq(findings.projectId, projectId), // CR-R2 F3: defense-in-depth
          withTenant(findings.tenantId, tenantId),
        ),
      )

    // Update assignment status + updatedAt (5.2b TODO M4)
    await tx
      .update(findingAssignments)
      .set({ status: 'confirmed', updatedAt: now })
      .where(
        and(
          eq(findingAssignments.id, assignment.id),
          withTenant(findingAssignments.tenantId, tenantId),
        ),
      )

    // Insert review_action (Guardrail #66: add native_verified, never clear non_native)
    await tx.insert(reviewActions).values({
      findingId,
      fileId: assignment.fileId,
      projectId,
      tenantId,
      actionType: 'confirm_native',
      previousState: 'flagged',
      newState: newFindingStatus,
      userId,
      metadata: {
        native_verified: true,
        native_verified_by: userId,
        native_verified_at: now.toISOString(),
      },
    })
  })

  // Audit log AFTER transaction (Guardrail #78)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'finding_assignment',
    entityId: assignment.id,
    action: 'assignment_confirmed',
    oldValue: { status: assignment.status },
    newValue: { status: 'confirmed', findingStatus: newFindingStatus },
  })

  // Send Inngest event for score recalculation (same pattern as executeReviewAction)
  // CR-R2-H1: try-catch post-commit side effect — DB transaction already committed,
  // Inngest failure must not propagate error to client
  try {
    await inngest.send({
      name: 'finding.changed',
      data: {
        findingId,
        fileId,
        projectId,
        tenantId,
        previousState: 'flagged',
        newState: newFindingStatus,
        triggeredBy: userId,
        timestamp: now.toISOString(),
      },
    })
  } catch (inngestErr) {
    logger.error(
      { err: inngestErr, findingId },
      'Inngest event send failed for native confirm — score recalculation may be delayed',
    )
  }

  // Notification to original flagger (non-blocking — Guardrail #74, #85)
  // CR-R2 F11: Skip self-notification (e.g., admin re-assigned finding to themselves)
  if (assignment.assignedBy !== userId) {
    await createNotification({
      tenantId,
      userId: assignment.assignedBy,
      type: NOTIFICATION_TYPES.NATIVE_REVIEW_COMPLETED,
      title: 'Native review completed',
      body: 'A native reviewer has confirmed your flagged finding',
      metadata: { findingId, projectId, fileId, assignmentId: assignment.id },
    })
  }

  return {
    success: true,
    data: {
      findingId,
      previousState: 'flagged' as FindingStatus,
      newState: newFindingStatus,
      findingMeta: {
        segmentId: findingDetail?.segmentId ?? null,
        severity: (findingDetail?.severity ?? 'minor') as FindingSeverity,
        category: findingDetail?.category ?? '',
        detectedByLayer: (findingDetail?.detectedByLayer ?? 'L1') as DetectedByLayer,
        sourceTextExcerpt: findingDetail?.sourceTextExcerpt ?? null,
        targetTextExcerpt: findingDetail?.targetTextExcerpt ?? null,
      },
      serverUpdatedAt: now.toISOString(),
    },
  }
}
