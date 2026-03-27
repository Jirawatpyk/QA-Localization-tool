'use server'

import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { reviewActions } from '@/db/schema/reviewActions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateNoteTextSchema } from '@/features/review/validation/reviewAction.schema'
import type { UpdateNoteTextInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type UpdateNoteTextResult = {
  findingId: string
  noteText: string
}

export async function updateNoteText(
  input: UpdateNoteTextInput,
): Promise<ActionResult<UpdateNoteTextResult>> {
  // Zod validation
  const parsed = updateNoteTextSchema.safeParse(input)
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
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }
  }

  const { findingId, fileId, projectId, noteText } = parsed.data
  const { id: userId, tenantId } = user

  // Guard: finding must exist and be in 'noted' state (Guardrail #1, #4)
  const findingRows = await db
    .select({ id: findings.id, status: findings.status })
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

  if (findingRows.length === 0) {
    return { success: false, error: 'Finding not found', code: 'NOT_FOUND' }
  }

  const finding = findingRows[0]!
  if (finding.status !== 'noted') {
    return {
      success: false,
      error: 'Finding must be in noted state to update note text',
      code: 'INVALID_STATE',
    }
  }

  // Find latest review_actions with actionType='note' for this finding (Guardrail #1)
  // TD-AUTH-001: userId in WHERE = DB-level ownership guard (prevents TOCTOU race)
  const actionRows = await db
    .select({ id: reviewActions.id, metadata: reviewActions.metadata })
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.findingId, findingId),
        eq(reviewActions.actionType, 'note'),
        eq(reviewActions.userId, userId),
        withTenant(reviewActions.tenantId, tenantId),
      ),
    )
    .orderBy(desc(reviewActions.createdAt))
    .limit(1)

  if (actionRows.length === 0) {
    return {
      success: false,
      error: 'Note not found or not owned by current user',
      code: 'FORBIDDEN',
    }
  }

  const actionRow = actionRows[0]!

  // Update metadata.noteText (Guardrail #8: use null not '' for empty)
  const existingMetadata =
    actionRow.metadata && typeof actionRow.metadata === 'object' ? actionRow.metadata : {}
  const updatedMetadata = { ...existingMetadata, noteText }

  await db
    .update(reviewActions)
    .set({ metadata: updatedMetadata })
    .where(and(eq(reviewActions.id, actionRow.id), withTenant(reviewActions.tenantId, tenantId)))

  // Audit log (best-effort — Guardrail #2)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'finding',
      entityId: findingId,
      action: 'finding.note_text_update',
      oldValue: { noteText: (existingMetadata as Record<string, unknown>).noteText ?? null },
      newValue: { noteText },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, findingId }, 'Audit log write failed for updateNoteText')
  }

  return {
    success: true,
    data: { findingId, noteText },
  }
}
