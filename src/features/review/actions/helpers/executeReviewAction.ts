import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { assertLockOwnership } from '@/features/review/helpers/assertLockOwnership'
import { getNewState } from '@/features/review/utils/state-transitions'
import type { ReviewAction } from '@/features/review/utils/state-transitions'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import { DETECTED_BY_LAYERS, FINDING_SEVERITIES, FINDING_STATUSES } from '@/types/finding'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'
import type { TenantId } from '@/types/tenant'

export type ReviewActionInput = {
  findingId: string
  fileId: string
  projectId: string
}

export type FindingMeta = {
  segmentId: string | null
  severity: FindingSeverity
  category: string
  detectedByLayer: DetectedByLayer
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
}

export type ReviewActionResult = {
  findingId: string
  previousState: FindingStatus
  newState: FindingStatus
  findingMeta: FindingMeta
  /** Server-side updatedAt timestamp — used to clear optimistic timestamp lock (H2 fix) */
  serverUpdatedAt: string
  /** CR-R2 P0-1: Assignment ID returned by flagForNative action */
  assignmentId?: string | undefined
}

export type ReviewActionNoOp = {
  findingId: string
  currentState: FindingStatus
  noOp: true
}

type ExecuteReviewActionParams = {
  input: ReviewActionInput
  action: ReviewAction
  user: { id: string; tenantId: TenantId; nativeLanguages: string[] }
}

/**
 * Shared DRY helper for accept/reject/flag Server Actions.
 * Pattern: fetch finding → validate transition → transaction(update + review_actions) → audit → Inngest
 *
 * M1: Segment lookup for sourceLang/targetLang moved to rejectFinding.action.ts
 * (only reject needs it for feedback_events).
 */
export async function executeReviewAction({
  input,
  action,
  user,
}: ExecuteReviewActionParams): Promise<ActionResult<ReviewActionResult | ReviewActionNoOp>> {
  const { findingId, fileId, projectId } = input
  const { id: userId, tenantId } = user

  // S-FIX-7: Lock ownership check (AC3 — defense-in-depth)
  const lockError = await assertLockOwnership(fileId, tenantId, userId)
  if (lockError) return lockError

  // Fetch finding with tenant isolation (Guardrail #1)
  const rows = await db
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
        eq(findings.id, findingId),
        eq(findings.fileId, fileId),
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
      ),
    )
    .limit(1)

  // Guard rows[0]! (Guardrail #4)
  if (rows.length === 0) {
    return {
      success: false,
      error: 'Finding not found',
      code: 'NOT_FOUND',
    }
  }

  const finding = rows[0]!

  // Runtime verify: DB varchar → validated types (Guardrail #3, M5 fix)
  if (!FINDING_STATUSES.includes(finding.status as FindingStatus)) {
    return {
      success: false,
      error: `Invalid finding status: ${finding.status}`,
      code: 'INVALID_STATE',
    }
  }
  if (!FINDING_SEVERITIES.includes(finding.severity as FindingSeverity)) {
    return {
      success: false,
      error: `Invalid finding severity: ${finding.severity}`,
      code: 'INVALID_STATE',
    }
  }
  if (!DETECTED_BY_LAYERS.includes(finding.detectedByLayer as DetectedByLayer)) {
    return {
      success: false,
      error: `Invalid detection layer: ${finding.detectedByLayer}`,
      code: 'INVALID_STATE',
    }
  }

  const currentState = finding.status as FindingStatus
  const validatedSeverity = finding.severity as FindingSeverity
  const validatedLayer = finding.detectedByLayer as DetectedByLayer

  // Check state transition
  const newState = getNewState(action, currentState)

  // No-op: already in target state
  if (newState === null) {
    return {
      success: true,
      data: {
        findingId,
        currentState,
        noOp: true,
      },
    }
  }

  // Story 5.2a: Determine non-native status for review_actions metadata (Guardrail #66: write-once)
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
  // segmentId null (cross-file finding) → conservative default: non-native = true
  const isNonNative = determineNonNative(user.nativeLanguages, targetLang)

  // H2 fix: UPDATE + INSERT in transaction (Guardrail #6)
  const serverUpdatedAt = new Date()
  await db.transaction(async (tx) => {
    // Update finding status (Guardrail #1 — withTenant on UPDATE)
    await tx
      .update(findings)
      .set({ status: newState, updatedAt: serverUpdatedAt })
      .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))

    // Insert review_actions row (INSERT = set tenantId in values)
    // Story 5.2a: non_native set at INSERT, never updated (Guardrail #66)
    await tx.insert(reviewActions).values({
      findingId,
      fileId,
      projectId,
      tenantId,
      actionType: action,
      previousState: currentState,
      newState,
      userId,
      batchId: null,
      metadata: { non_native: isNonNative },
    })
  })

  // H3: Audit log — kept as try-catch (best-effort for review actions).
  // Guardrail #2 says happy-path should let throw, but executeReviewAction's callers
  // (acceptFinding, flagFinding) do `return executeReviewAction(...)` with NO try-catch.
  // If audit throws, the client sees an error even though the finding status change succeeded.
  // Decision: audit is best-effort here — the primary value (status change) must not fail.
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: findingId,
      action: `finding.${action}`,
      oldValue: { status: currentState },
      newValue: { status: newState, non_native: isNonNative },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, findingId, action }, 'Audit log write failed for review action')
  }

  // Send Inngest event for score recalculation (full FindingChangedEventData schema)
  // CR-R2-H1: try-catch post-commit side effect — DB transaction already committed,
  // Inngest failure must not propagate error to client (same pattern as audit log above)
  try {
    await inngest.send({
      name: 'finding.changed',
      data: {
        findingId,
        fileId,
        projectId,
        tenantId,
        previousState: currentState,
        newState,
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (inngestErr) {
    logger.error(
      { err: inngestErr, findingId, action },
      'Inngest event send failed for review action — score recalculation may be delayed',
    )
  }

  return {
    success: true,
    data: {
      findingId,
      previousState: currentState,
      newState,
      findingMeta: {
        segmentId: finding.segmentId,
        severity: validatedSeverity,
        category: finding.category,
        detectedByLayer: validatedLayer,
        sourceTextExcerpt: finding.sourceTextExcerpt,
        targetTextExcerpt: finding.targetTextExcerpt,
      },
      serverUpdatedAt: serverUpdatedAt.toISOString(),
    },
  }
}
