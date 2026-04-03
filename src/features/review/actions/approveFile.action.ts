'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { scores } from '@/db/schema/scores'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionErrorCode } from '@/types/actionErrorCode'
import type { ActionResult } from '@/types/actionResult'
import type { ScoreStatus } from '@/types/finding'

export type ApproveFileInput = {
  fileId: string
  projectId: string
}

export type ApproveFileData = {
  fileId: string
  mqmScore: number | null
  status: ScoreStatus
}

const inputSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

/** Score statuses that allow manual approval */
const APPROVABLE_STATUSES = new Set(['calculated', 'overridden'])

/** Map non-approvable statuses to error codes */
const STATUS_ERROR_MAP: Record<string, ActionErrorCode> = {
  calculating: 'SCORE_STALE',
  partial: 'SCORE_PARTIAL',
  na: 'SCORE_NA',
  auto_passed: 'ALREADY_APPROVED',
}

const STATUS_ERROR_MSG: Record<string, string> = {
  calculating: 'Score is still being calculated — please wait and retry',
  partial: 'Score is partial — AI analysis incomplete',
  na: 'Score is not applicable — cannot approve',
  auto_passed: 'File has already been auto-approved',
}

/**
 * Approve a file after QA review.
 * Guards: score must be in calculated | overridden status before approval.
 * Error codes: SCORE_STALE | SCORE_PARTIAL | SCORE_NA | ALREADY_APPROVED | SCORE_NOT_FOUND
 */
export async function approveFile(input: ApproveFileInput): Promise<ActionResult<ApproveFileData>> {
  // Zod validation
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  const { fileId, projectId } = parsed.data

  // Auth — requireRole throws ActionResult-compatible error
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch (err) {
    const authErr = err as { success: false; code: ActionErrorCode; error: string }
    return {
      success: false,
      error: authErr.error ?? 'Unauthorized',
      code: authErr.code ?? 'UNAUTHORIZED',
    }
  }

  const { tenantId } = user

  // Fetch score with tenant isolation + cross-project guard (RT-2)
  const [score] = await db
    .select({
      id: scores.id,
      fileId: scores.fileId,
      projectId: scores.projectId,
      mqmScore: scores.mqmScore,
      status: scores.status,
    })
    .from(scores)
    .where(
      and(
        eq(scores.fileId, fileId),
        eq(scores.projectId, projectId),
        withTenant(scores.tenantId, tenantId),
      ),
    )
    .limit(1)

  // No score found — either cross-tenant, cross-project, or pipeline hasn't run
  if (!score) {
    return {
      success: false,
      error: 'No score found for this file',
      code: 'SCORE_NOT_FOUND',
    }
  }

  // Score status gate
  if (!APPROVABLE_STATUSES.has(score.status)) {
    const errorCode = STATUS_ERROR_MAP[score.status] ?? 'SCORE_STALE'
    const errorMsg = STATUS_ERROR_MSG[score.status] ?? 'Score is not in an approvable state'
    return {
      success: false,
      error: errorMsg,
      code: errorCode,
    }
  }

  // Audit log (non-fatal on error path)
  try {
    await writeAuditLog({
      tenantId,
      userId: user.id,
      entityType: 'file',
      entityId: fileId,
      action: 'file.approve',
      newValue: { mqmScore: score.mqmScore, status: score.status },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, fileId }, 'Audit log write failed for file approve')
  }

  return {
    success: true,
    data: {
      fileId,
      mqmScore: score.mqmScore,
      status: score.status as ScoreStatus,
    },
  }
}
