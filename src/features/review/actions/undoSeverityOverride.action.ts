'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { undoSeverityOverrideSchema } from '@/features/review/validation/undoAction.schema'
import type { UndoSeverityOverrideInput } from '@/features/review/validation/undoAction.schema'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { FindingSeverity, FindingStatus } from '@/types/finding'

type UndoSeverityResult = {
  findingId: string
  previousSeverity: FindingSeverity
  newSeverity: FindingSeverity
  serverUpdatedAt: string
}

export async function undoSeverityOverride(
  input: UndoSeverityOverrideInput,
): Promise<ActionResult<UndoSeverityResult>> {
  // Zod validation
  const parsed = undoSeverityOverrideSchema.safeParse(input)
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
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const {
    findingId,
    fileId,
    projectId,
    previousSeverity,
    previousOriginalSeverity,
    expectedCurrentSeverity,
  } = parsed.data
  const { id: userId, tenantId } = user

  // Fetch finding (Guardrail #1, #4)
  const rows = await db
    .select({
      id: findings.id,
      segmentId: findings.segmentId,
      severity: findings.severity,
      status: findings.status,
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
  const currentStatus = finding.status as FindingStatus

  // Conflict check
  if (currentSeverity !== expectedCurrentSeverity) {
    return { success: false, error: 'Severity mismatch', code: 'CONFLICT' }
  }

  // Story 5.2a: Determine non-native status for review_actions metadata
  let undoSevTargetLang = 'unknown'
  if (finding.segmentId) {
    const segRows = await db
      .select({ targetLang: segments.targetLang })
      .from(segments)
      .where(and(eq(segments.id, finding.segmentId), withTenant(segments.tenantId, tenantId)))
      .limit(1)
    if (segRows.length > 0) {
      undoSevTargetLang = segRows[0]!.targetLang
    }
  }
  const isNonNative = determineNonNative(user.nativeLanguages, undoSevTargetLang)

  // Transaction: UPDATE severity + original_severity + INSERT review_actions
  const serverUpdatedAt = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(findings)
      .set({
        severity: previousSeverity,
        originalSeverity: previousOriginalSeverity,
        updatedAt: serverUpdatedAt,
      })
      .where(and(eq(findings.id, findingId), withTenant(findings.tenantId, tenantId)))

    await tx.insert(reviewActions).values({
      findingId,
      fileId,
      projectId,
      tenantId,
      actionType: 'undo',
      previousState: currentStatus,
      newState: currentStatus, // Status unchanged — severity-only undo
      userId,
      batchId: null,
      metadata: {
        undoType: 'severity_override',
        previousSeverity,
        restoredOriginalSeverity: previousOriginalSeverity,
        non_native: isNonNative,
      },
    })
  })

  // Audit log (best-effort)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: findingId,
      action: 'finding.undo_severity_override',
      oldValue: { severity: currentSeverity },
      newValue: {
        severity: previousSeverity,
        originalSeverity: previousOriginalSeverity,
        non_native: isNonNative,
      },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, findingId }, 'Audit log write failed for undo severity override')
  }

  // Inngest event (severity affects MQM score)
  try {
    await inngest.send({
      name: 'finding.changed',
      data: {
        findingId,
        fileId,
        projectId,
        tenantId,
        previousState: currentStatus,
        newState: currentStatus,
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (inngestErr) {
    logger.error(
      { err: inngestErr, findingId },
      'Inngest event send failed for undo severity override',
    )
  }

  return {
    success: true,
    data: {
      findingId,
      previousSeverity: currentSeverity,
      newSeverity: previousSeverity,
      serverUpdatedAt: serverUpdatedAt.toISOString(),
    },
  }
}
