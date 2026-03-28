'use server'

import 'server-only'

import { and, eq, count, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findingAssignments } from '@/db/schema/findingAssignments'
import { findings } from '@/db/schema/findings'
import { notifications } from '@/db/schema/notifications'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import type { ReviewActionResult } from '@/features/review/actions/helpers/executeReviewAction'
import { flagForNativeSchema } from '@/features/review/validation/reviewAction.schema'
import type { FlagForNativeInput } from '@/features/review/validation/reviewAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import { FINDING_STATUSES } from '@/types/finding'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

/**
 * Flag a finding for native review (AC1).
 * Atomic transaction: UPDATE finding status + INSERT assignment + INSERT review_action.
 * Audit log + notification AFTER transaction (Guardrails #67, #74, #78).
 */
export async function flagForNative(
  input: FlagForNativeInput,
): Promise<ActionResult<ReviewActionResult>> {
  // Zod validation
  const parsed = flagForNativeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION',
    }
  }

  const { findingId, fileId: _fileId, projectId, assignedTo, flaggerComment } = parsed.data

  // Auth: qa_reviewer or admin (hierarchy)
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'AUTH_ERROR' }
  }

  const { id: userId, tenantId } = user

  // Step 1: Fetch finding — verify exists + fileId NOT NULL (5.2b TODO M1)
  const findingRows = await db
    .select({
      status: findings.status,
      fileId: findings.fileId,
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
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (findingRows.length === 0) {
    return { success: false, error: 'Finding not found', code: 'NOT_FOUND' }
  }

  const finding = findingRows[0]!

  // Guard: cross-file findings cannot be assigned (fileId is null)
  if (!finding.fileId) {
    return {
      success: false,
      error: 'Cross-file findings cannot be assigned',
      code: 'VALIDATION',
    }
  }

  // Runtime validate status (Guardrail #3)
  if (!FINDING_STATUSES.includes(finding.status as FindingStatus)) {
    return {
      success: false,
      error: `Invalid finding status: ${finding.status}`,
      code: 'INVALID_STATE',
    }
  }

  const previousState = finding.status as FindingStatus

  // Step 2: Count existing assignments — max 3 per finding (RLS design D2)
  const [assignmentCount] = await db
    .select({ value: count() })
    .from(findingAssignments)
    .where(
      and(
        eq(findingAssignments.findingId, findingId),
        withTenant(findingAssignments.tenantId, tenantId),
      ),
    )

  if (assignmentCount && assignmentCount.value >= 3) {
    return {
      success: false,
      error: 'Maximum 3 concurrent assignments per finding',
      code: 'LIMIT_EXCEEDED',
    }
  }

  // Step 3a: Resolve target language from segment (needed for reviewer language check)
  let targetLang = 'unknown'
  if (finding.segmentId) {
    const segRows = await db
      .select({ targetLang: segments.targetLang })
      .from(segments)
      .where(and(eq(segments.id, finding.segmentId), withTenant(segments.tenantId, tenantId)))
      .limit(1)
    if (segRows.length > 0) {
      targetLang = segRows[0]!.targetLang
    }
  }

  // Step 3b: Verify assignedTo is native_reviewer with matching language (Guardrail #64)
  const reviewerRows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      nativeLanguages: users.nativeLanguages,
    })
    .from(users)
    .innerJoin(
      userRoles,
      and(
        eq(userRoles.userId, users.id),
        eq(userRoles.role, 'native_reviewer'),
        withTenant(userRoles.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(users.id, assignedTo),
        withTenant(users.tenantId, tenantId),
        // jsonb containment: nativeLanguages @> ["th"] (CF-7 fix: was using fileId UUID)
        sql`${users.nativeLanguages} @> ${JSON.stringify([targetLang])}::jsonb`,
      ),
    )
    .limit(1)

  if (reviewerRows.length === 0) {
    return {
      success: false,
      error: 'User is not a native reviewer for this language',
      code: 'VALIDATION',
    }
  }

  // Determine non-native status for metadata (Guardrail #66)
  // CR-H6 fix: use actual targetLang from segment, not 'unknown'
  const isNonNative = determineNonNative(user.nativeLanguages, targetLang)

  // Step 4: Atomic transaction (Guardrail #67)
  const now = new Date()
  const assignmentId = await db.transaction(async (tx) => {
    // 4a. Update finding status → flagged
    await tx
      .update(findings)
      .set({ status: 'flagged', updatedAt: now })
      .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))

    // 4b. Insert assignment (Guardrail #4: guard returning)
    const [assignment] = await tx
      .insert(findingAssignments)
      .values({
        findingId,
        fileId: finding.fileId!,
        projectId,
        tenantId,
        assignedTo,
        assignedBy: userId,
        status: 'pending',
        flaggerComment,
        updatedAt: now,
      })
      .returning({ id: findingAssignments.id })

    if (!assignment) throw new Error('Assignment insert failed')

    // 4c. Insert review_action (Guardrail #66: non_native write-once)
    await tx.insert(reviewActions).values({
      findingId,
      fileId: finding.fileId!,
      projectId,
      tenantId,
      actionType: 'flag_for_native',
      previousState,
      newState: 'flagged',
      userId,
      metadata: { non_native: isNonNative },
    })

    return assignment.id
  })

  // Step 5: Audit log AFTER transaction (Guardrail #78)
  await writeAuditLog({
    tenantId,
    userId,
    entityType: 'finding_assignment',
    entityId: assignmentId,
    action: 'assignment_created',
    oldValue: { status: previousState },
    newValue: { status: 'flagged', assignedTo, flaggerComment },
  })

  // Step 6: Notification (non-blocking — Guardrail #74)
  try {
    await db.insert(notifications).values({
      tenantId,
      userId: assignedTo,
      type: 'finding_flagged_for_native',
      title: 'Finding flagged for your review',
      body: `A finding has been flagged for native review`,
      metadata: { findingId, projectId, fileId: finding.fileId, assignmentId },
    })
  } catch (err) {
    logger.error({ err, findingId, assignedTo }, 'Failed to create notification')
  }

  return {
    success: true,
    data: {
      findingId,
      previousState,
      newState: 'flagged' as FindingStatus,
      findingMeta: {
        segmentId: finding.segmentId,
        severity: finding.severity as FindingSeverity,
        category: finding.category,
        detectedByLayer: finding.detectedByLayer as DetectedByLayer,
        sourceTextExcerpt: finding.sourceTextExcerpt,
        targetTextExcerpt: finding.targetTextExcerpt,
      },
      serverUpdatedAt: now.toISOString(),
    },
  }
}
