'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { scoreFile } from '@/features/scoring/helpers/scoreFile'
import { calculateScoreSchema } from '@/features/scoring/validation/scoreSchema'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { DbFileStatus } from '@/types/pipeline'

type ScoreResult = {
  scoreId: string
  fileId: string
  mqmScore: number
  npt: number
  totalWords: number
  criticalCount: number
  majorCount: number
  minorCount: number
  status: 'calculated' | 'na' | 'auto_passed' | 'partial'
  autoPassRationale: string | null
}

/**
 * Server Action: Calculate MQM score for a file after L1 processing.
 * Thin wrapper — delegates core logic to scoreFile() shared helper.
 *
 * Auth, validation, and ActionResult wrapping here.
 * Score calculation, DB persistence, audit log, and graduation notification in scoreFile().
 */
export async function calculateScore(input: {
  fileId: string
  projectId: string
}): Promise<ActionResult<ScoreResult>> {
  const parsed = calculateScoreSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'INVALID_INPUT', error: 'Invalid file or project ID format' }
  }

  const { fileId, projectId } = parsed.data

  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  const { tenantId, id: userId } = currentUser

  try {
    // P-1 fix: Guard against race with active Inngest pipeline.
    // Reject manual rescore if file is still being processed — prevents stale/partial scores.
    const ACTIVE_PIPELINE_STATUSES: ReadonlySet<DbFileStatus> = new Set<DbFileStatus>([
      'parsing',
      'l1_processing',
      'l2_processing',
      'l3_processing',
    ])

    const [file] = await db
      .select({ status: files.status })
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.projectId, projectId),
          withTenant(files.tenantId, tenantId),
        ),
      )

    if (!file) {
      return { success: false, code: 'NOT_FOUND', error: 'File not found' }
    }

    if (ACTIVE_PIPELINE_STATUSES.has(file.status as DbFileStatus)) {
      return {
        success: false,
        code: 'CONFLICT',
        error: `Cannot rescore while pipeline is active (status: ${file.status})`,
      }
    }

    const result = await scoreFile({ fileId, projectId, tenantId, userId })
    return { success: true, data: result }
  } catch (err) {
    logger.error({ err, fileId }, 'Score calculation failed')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Score calculation failed' }
  }
}
