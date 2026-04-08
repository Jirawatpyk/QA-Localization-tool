'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { feedbackEvents } from '@/db/schema/feedbackEvents'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { overrideSeveritySchema } from '@/features/review/validation/reviewAction.schema'
import type { OverrideSeverityInput } from '@/features/review/validation/reviewAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { tryNonFatal } from '@/lib/utils/tryNonFatal'
import type { ActionResult } from '@/types/actionResult'
import { FINDING_SEVERITIES, FINDING_STATUSES } from '@/types/finding'
import type { FindingSeverity, FindingStatus } from '@/types/finding'

type OverrideSeverityResult = {
  findingId: string
  originalSeverity: FindingSeverity
  newSeverity: FindingSeverity
  serverUpdatedAt: string
}

export async function overrideSeverity(
  input: OverrideSeverityInput,
): Promise<ActionResult<OverrideSeverityResult>> {
  // Zod validation
  const parsed = overrideSeveritySchema.safeParse(input)
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

  const { findingId, fileId, projectId, newSeverity } = parsed.data
  const { id: userId, tenantId } = user

  // S-FIX-7: Lock ownership check (AC3 — defense-in-depth)
  const lockError = await assertLockOwnership(fileId, tenantId, userId)
  if (lockError) return lockError

  // Fetch finding with tenant isolation (Guardrail #1, #4)
  const rows = await db
    .select({
      id: findings.id,
      status: findings.status,
      severity: findings.severity,
      originalSeverity: findings.originalSeverity,
      category: findings.category,
      detectedByLayer: findings.detectedByLayer,
      segmentId: findings.segmentId,
      sourceTextExcerpt: findings.sourceTextExcerpt,
      targetTextExcerpt: findings.targetTextExcerpt,
    })
    .from(findings)
    .where(
      and(
        eq(findings.id, findingId),
        eq(findings.fileId, fileId),
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
      ),
    )
    .limit(1)

  if (rows.length === 0) {
    return { success: false, error: 'Finding not found', code: 'NOT_FOUND' }
  }

  const finding = rows[0]!
  const currentSeverity = finding.severity as FindingSeverity

  // Guard: can't override to same severity
  if (currentSeverity === newSeverity) {
    return {
      success: false,
      error: `Finding already has severity: ${newSeverity}`,
      code: 'SAME_SEVERITY',
    }
  }

  // Validate current severity (Guardrail #3)
  if (!FINDING_SEVERITIES.includes(currentSeverity)) {
    return {
      success: false,
      error: `Invalid current severity: ${currentSeverity}`,
      code: 'INVALID_STATE',
    }
  }

  // Determine if this is "reset to original" or new override
  const isReset = finding.originalSeverity !== null && newSeverity === finding.originalSeverity
  const serverUpdatedAt = new Date()

  // Story 5.2a CR-R1: Unified segment lookup for non-native detection + feedback_events (was 2 queries)
  let segmentSourceLang = 'unknown'
  let segmentTargetLang = 'unknown'
  if (finding.segmentId) {
    const overrideSegRows = await db
      .select({ sourceLang: segments.sourceLang, targetLang: segments.targetLang })
      .from(segments)
      .where(and(eq(segments.id, finding.segmentId), withTenant(segments.tenantId, tenantId)))
      .limit(1)
    if (overrideSegRows.length > 0) {
      segmentSourceLang = overrideSegRows[0]!.sourceLang
      segmentTargetLang = overrideSegRows[0]!.targetLang
    }
  }
  const isNonNative = determineNonNative(user.nativeLanguages, segmentTargetLang)

  // Transaction: UPDATE finding + INSERT review_actions (Guardrail #6)
  await db.transaction(async (tx) => {
    if (isReset) {
      // Reset: restore original severity, clear originalSeverity
      await tx
        .update(findings)
        .set({
          severity: newSeverity,
          originalSeverity: null,
          updatedAt: serverUpdatedAt,
        })
        .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))
    } else {
      // Override: set originalSeverity only if not already set (preserve first original)
      await tx
        .update(findings)
        .set({
          severity: newSeverity,
          originalSeverity: finding.originalSeverity ?? currentSeverity,
          updatedAt: serverUpdatedAt,
        })
        .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))
    }

    // Insert review_actions row (isNonNative computed before transaction)
    await tx.insert(reviewActions).values({
      findingId,
      fileId,
      projectId,
      tenantId,
      actionType: 'override',
      previousState: currentSeverity,
      newState: newSeverity,
      userId,
      batchId: null,
      metadata: {
        originalSeverity: finding.originalSeverity ?? currentSeverity,
        newSeverity,
        isReset,
        non_native: isNonNative,
      },
    })
  })

  // Audit log (best-effort — Guardrail #2)
  await tryNonFatal(
    () =>
      writeAuditLog({
        tenantId,
        userId,
        entityType: 'finding',
        entityId: findingId,
        action: 'finding.override',
        oldValue: { severity: currentSeverity },
        newValue: { severity: newSeverity, non_native: isNonNative },
      }),
    { operation: 'audit log (overrideSeverity)', meta: { findingId } },
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
          previousState: (FINDING_STATUSES.includes(finding.status as FindingStatus)
            ? finding.status
            : 'pending') as FindingStatus,
          newState: (FINDING_STATUSES.includes(finding.status as FindingStatus)
            ? finding.status
            : 'pending') as FindingStatus,
          triggeredBy: userId,
          timestamp: new Date().toISOString(),
        },
      }),
    { operation: 'inngest event (overrideSeverity)', meta: { findingId } },
  )

  // Insert feedback_events for AI training (FR79 — best-effort)
  // CR-R1 M1 fix: reuse segment lookup from above (was duplicated query)
  await tryNonFatal(
    () =>
      db.insert(feedbackEvents).values({
        tenantId,
        fileId,
        projectId,
        findingId,
        reviewerId: userId,
        action: 'change_severity',
        findingCategory: finding.category,
        originalSeverity: currentSeverity,
        newSeverity,
        isFalsePositive: false,
        reviewerIsNative: !isNonNative,
        layer: finding.detectedByLayer,
        detectedByLayer: finding.detectedByLayer,
        sourceLang: segmentSourceLang,
        targetLang: segmentTargetLang,
        sourceText: finding.sourceTextExcerpt ?? '',
        originalTarget: finding.targetTextExcerpt ?? '',
      }),
    { operation: 'feedback_events insert (overrideSeverity)', meta: { findingId } },
  )

  return {
    success: true,
    data: {
      findingId,
      originalSeverity: currentSeverity,
      newSeverity,
      serverUpdatedAt: serverUpdatedAt.toISOString(),
    },
  }
}
