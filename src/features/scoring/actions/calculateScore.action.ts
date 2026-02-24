'use server'

import 'server-only'

import { scoreFile } from '@/features/scoring/helpers/scoreFile'
import { calculateScoreSchema } from '@/features/scoring/validation/scoreSchema'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type ScoreResult = {
  scoreId: string
  fileId: string
  mqmScore: number
  npt: number
  totalWords: number
  criticalCount: number
  majorCount: number
  minorCount: number
  status: 'calculated' | 'na' | 'auto_passed'
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
    const result = await scoreFile({ fileId, projectId, tenantId, userId })
    return { success: true, data: result }
  } catch (err) {
    logger.error({ err, fileId }, 'Score calculation failed')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Score calculation failed' }
  }
}
