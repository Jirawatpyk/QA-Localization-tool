import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { getNewState } from '@/features/review/utils/state-transitions'
import type { ReviewAction } from '@/features/review/utils/state-transitions'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import { FINDING_STATUSES } from '@/types/finding'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

export type ReviewActionInput = {
  findingId: string
  fileId: string
  projectId: string
}

export type FindingMeta = {
  severity: FindingSeverity
  category: string
  detectedByLayer: DetectedByLayer
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  sourceLang: string | null
  targetLang: string | null
}

export type ReviewActionResult = {
  findingId: string
  previousState: FindingStatus
  newState: FindingStatus
  findingMeta: FindingMeta
}

export type ReviewActionNoOp = {
  findingId: string
  currentState: FindingStatus
  noOp: true
}

type ExecuteReviewActionParams = {
  input: ReviewActionInput
  action: ReviewAction
  user: { id: string; tenantId: string }
}

/**
 * Shared DRY helper for accept/reject/flag Server Actions.
 * Pattern: validate transition → fetch finding → check transition → update → audit → review_actions → Inngest event
 */
export async function executeReviewAction({
  input,
  action,
  user,
}: ExecuteReviewActionParams): Promise<ActionResult<ReviewActionResult | ReviewActionNoOp>> {
  const { findingId, fileId, projectId } = input
  const { id: userId, tenantId } = user

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

  // Runtime verify: DB varchar(30) → validated FindingStatus (Guardrail #3)
  if (!FINDING_STATUSES.includes(finding.status as FindingStatus)) {
    return {
      success: false,
      error: `Invalid finding status: ${finding.status}`,
      code: 'INVALID_STATE',
    }
  }
  const currentState = finding.status as FindingStatus

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

  // Update finding status (Guardrail #1 — withTenant on UPDATE)
  await db
    .update(findings)
    .set({ status: newState, updatedAt: new Date() })
    .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))

  // Insert review_actions row (INSERT = set tenantId in values)
  await db.insert(reviewActions).values({
    findingId,
    fileId,
    projectId,
    tenantId,
    actionType: action,
    previousState: currentState,
    newState,
    userId,
    batchId: null,
    metadata: null,
  })

  // Audit log (Guardrail #2 — non-fatal on error path)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: findingId,
      action: `finding.${action}`,
      oldValue: { status: currentState },
      newValue: { status: newState },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, findingId, action }, 'Audit log write failed for review action')
  }

  // Send Inngest event for score recalculation (full FindingChangedEventData schema)
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

  // Resolve language pair from segment (for feedback_events — reject action)
  let sourceLang: string | null = null
  let targetLang: string | null = null
  if (finding.segmentId) {
    const segRows = await db
      .select({ sourceLang: segments.sourceLang, targetLang: segments.targetLang })
      .from(segments)
      .where(and(eq(segments.id, finding.segmentId), withTenant(segments.tenantId, tenantId)))
      .limit(1)
    if (segRows.length > 0) {
      sourceLang = segRows[0]!.sourceLang
      targetLang = segRows[0]!.targetLang
    }
  }

  return {
    success: true,
    data: {
      findingId,
      previousState: currentState,
      newState,
      findingMeta: {
        severity: finding.severity as FindingSeverity,
        category: finding.category,
        detectedByLayer: finding.detectedByLayer as DetectedByLayer,
        sourceTextExcerpt: finding.sourceTextExcerpt,
        targetTextExcerpt: finding.targetTextExcerpt,
        sourceLang,
        targetLang,
      },
    },
  }
}
