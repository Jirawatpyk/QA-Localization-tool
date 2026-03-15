'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { undoDeleteFindingSchema } from '@/features/review/validation/undoAction.schema'
import type { UndoDeleteFindingInput } from '@/features/review/validation/undoAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type UndoDeleteResult = {
  findingId: string
  restored: true
}

export async function undoDeleteFinding(
  input: UndoDeleteFindingInput,
): Promise<ActionResult<UndoDeleteResult>> {
  // Zod validation
  const parsed = undoDeleteFindingSchema.safeParse(input)
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

  const { snapshot, fileId, projectId } = parsed.data
  const { id: userId, tenantId } = user

  // Coordinate consistency check — snapshot must match outer params (tenant isolation)
  if (snapshot.fileId !== fileId || snapshot.projectId !== projectId) {
    return {
      success: false,
      error: 'Snapshot coordinate mismatch',
      code: 'VALIDATION',
    }
  }

  // FK guard: verify segmentId still exists (AC4 — segments FK is onDelete: cascade)
  if (snapshot.segmentId) {
    const segRows = await db
      .select({ id: segments.id })
      .from(segments)
      .where(and(eq(segments.id, snapshot.segmentId), withTenant(segments.tenantId, tenantId)))
      .limit(1)

    if (segRows.length === 0) {
      return {
        success: false,
        error: 'Cannot restore: parent segment was deleted',
        code: 'FK_VIOLATION',
      }
    }
  }

  // FK guard: verify fileId still exists
  const fileRows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, fileId), withTenant(files.tenantId, tenantId)))
    .limit(1)

  if (fileRows.length === 0) {
    return {
      success: false,
      error: 'Cannot restore: parent file was deleted',
      code: 'FK_VIOLATION',
    }
  }

  // Transaction: INSERT finding FIRST → then INSERT review_actions (FK order)
  await db.transaction(async (tx) => {
    // Re-insert finding with explicit id (overrides defaultRandom())
    await tx.insert(findings).values({
      id: snapshot.id,
      segmentId: snapshot.segmentId,
      fileId,
      projectId,
      tenantId, // Server-derived from requireRole() — NEVER use snapshot.tenantId
      reviewSessionId: snapshot.reviewSessionId,
      status: snapshot.status,
      severity: snapshot.severity,
      originalSeverity: snapshot.originalSeverity,
      category: snapshot.category,
      description: snapshot.description,
      detectedByLayer: snapshot.detectedByLayer,
      aiModel: snapshot.aiModel,
      aiConfidence: snapshot.aiConfidence,
      suggestedFix: snapshot.suggestedFix,
      sourceTextExcerpt: snapshot.sourceTextExcerpt,
      targetTextExcerpt: snapshot.targetTextExcerpt,
      scope: snapshot.scope,
      relatedFileIds: snapshot.relatedFileIds,
      segmentCount: snapshot.segmentCount,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(),
    })

    // Insert review_actions
    await tx.insert(reviewActions).values({
      findingId: snapshot.id,
      fileId,
      projectId,
      tenantId,
      actionType: 'undo',
      previousState: 'deleted',
      newState: snapshot.status,
      userId,
      batchId: null,
      metadata: { undoType: 'delete_restore' },
    })
  })

  // Audit log (best-effort)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: snapshot.id,
      action: 'finding.undo_delete',
      oldValue: {},
      newValue: { status: snapshot.status, severity: snapshot.severity },
    })
  } catch (auditErr) {
    logger.error(
      { err: auditErr, findingId: snapshot.id },
      'Audit log write failed for undoDeleteFinding',
    )
  }

  // Inngest event for score recalculation (best-effort)
  try {
    await inngest.send({
      name: 'finding.changed',
      data: {
        findingId: snapshot.id,
        fileId,
        projectId,
        tenantId,
        previousState: 'manual',
        newState: snapshot.status,
        triggeredBy: userId,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (inngestErr) {
    logger.error(
      { err: inngestErr, findingId: snapshot.id },
      'Inngest event send failed for undoDeleteFinding',
    )
  }

  return {
    success: true,
    data: { findingId: snapshot.id, restored: true },
  }
}
