'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findingAssignments } from '@/db/schema/findingAssignments'
import { findings } from '@/db/schema/findings'
import { notifications } from '@/db/schema/notifications'
import { reviewActions } from '@/db/schema/reviewActions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import type { ReviewActionResult } from '@/features/review/actions/helpers/executeReviewAction'
import { overrideNativeSchema } from '@/features/review/validation/reviewAction.schema'
import type { OverrideNativeInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

/**
 * Native reviewer overrides a flagged finding with a new status (AC3).
 * Dynamic target: accepted or rejected (chosen by native reviewer).
 * NOT in state-transition matrix — handled entirely in action code.
 */
export async function overrideNativeReview(
  input: OverrideNativeInput,
): Promise<ActionResult<ReviewActionResult>> {
  const parsed = overrideNativeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION',
    }
  }

  const { findingId, fileId, projectId, newStatus } = parsed.data

  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('native_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { id: userId, tenantId } = user

  // Fetch assignment — verify assigned to current user (Guardrail #64)
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
  const findingDetailRows = await db
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

  const findingDetail = findingDetailRows[0]

  if (assignment.status !== 'pending' && assignment.status !== 'in_review') {
    return { success: false, error: 'Assignment already completed', code: 'INVALID_STATE' }
  }

  const newFindingStatus = newStatus as FindingStatus

  // Atomic transaction (Guardrail #67)
  const now = new Date()
  await db.transaction(async (tx) => {
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

    await tx
      .update(findingAssignments)
      .set({ status: 'overridden', updatedAt: now })
      .where(
        and(
          eq(findingAssignments.id, assignment.id),
          withTenant(findingAssignments.tenantId, tenantId),
        ),
      )

    await tx.insert(reviewActions).values({
      findingId,
      fileId: assignment.fileId,
      projectId,
      tenantId,
      actionType: 'override_native',
      previousState: 'flagged',
      newState: newFindingStatus,
      userId,
      metadata: {
        native_verified: true,
        native_override: true,
        native_override_to: newFindingStatus,
      },
    })
  })

  // Audit (Guardrail #78)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'finding_assignment',
    entityId: assignment.id,
    action: 'assignment_overridden',
    oldValue: { status: assignment.status },
    newValue: { status: 'overridden', findingStatus: newFindingStatus },
  })

  // Send Inngest event for score recalculation (same pattern as confirmNativeReview)
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
      'Inngest event send failed for native override — score recalculation may be delayed',
    )
  }

  // Notification (non-blocking — Guardrail #74)
  try {
    await db.insert(notifications).values({
      tenantId,
      userId: assignment.assignedBy,
      type: 'native_review_completed',
      title: 'Native review completed (override)',
      body: `A native reviewer has overridden the finding to ${newFindingStatus}`,
      metadata: { findingId, projectId, fileId, assignmentId: assignment.id },
    })
  } catch (err) {
    logger.error({ err, findingId }, 'Failed to create notification')
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
