'use server'

import 'server-only'

import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { notifications } from '@/db/schema/notifications'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'
import { userRoles } from '@/db/schema/userRoles'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { checkAutoPass } from '@/features/scoring/autoPassChecker'
import { NEW_PAIR_FILE_THRESHOLD } from '@/features/scoring/constants'
import { calculateMqmScore } from '@/features/scoring/mqmCalculator'
import { loadPenaltyWeights } from '@/features/scoring/penaltyWeightLoader'
import type { ContributingFinding } from '@/features/scoring/types'
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
 *
 * Flow:
 * 1. Auth (M3 write pattern)
 * 2. Load segments → SUM word_count (ALL segments including ApprovedSignOff per MQM standard)
 * 3. Load L1 findings (unfiltered — calculator filters by CONTRIBUTING_STATUSES)
 * 4. Load penalty weights (tenant override chain)
 * 5. Calculate MQM score (pure function)
 * 6. Check auto-pass eligibility
 * 7. Persist (DELETE old + INSERT new) in transaction — idempotent
 * 8. Write audit log (non-fatal)
 * 9. Handle file-51 language pair graduation notification (non-fatal)
 */
export async function calculateScore(input: {
  fileId: string
  projectId: string
}): Promise<ActionResult<ScoreResult>> {
  // Validate input
  const parsed = calculateScoreSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'INVALID_INPUT', error: 'Invalid file or project ID format' }
  }

  const { fileId, projectId } = parsed.data

  // Auth: M3 write pattern
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  const { tenantId, id: userId } = currentUser

  try {
    // Load all segments for word count SUM
    // Include ALL segments (even ApprovedSignOff) per MQM standard and Xbench parity
    // Filter by projectId + fileId to prevent within-tenant cross-project score contamination (H2)
    const segmentRows = await db
      .select({
        wordCount: segments.wordCount,
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
      })
      .from(segments)
      .where(
        and(
          eq(segments.fileId, fileId),
          eq(segments.projectId, projectId),
          withTenant(segments.tenantId, tenantId),
        ),
      )

    // File not found or no segments
    if (segmentRows.length === 0) {
      return { success: false, code: 'NOT_FOUND', error: 'File not found or has no segments' }
    }

    const totalWords = segmentRows.reduce((sum, s) => sum + s.wordCount, 0)
    // Get source/target lang from first segment (same pattern as ruleEngine.ts:53-54)
    const sourceLang = segmentRows[0]!.sourceLang
    const targetLang = segmentRows[0]!.targetLang

    // Load L1 findings — calculator will filter by CONTRIBUTING_STATUSES
    const findingRows = await db
      .select({
        severity: findings.severity,
        status: findings.status,
        segmentCount: findings.segmentCount,
      })
      .from(findings)
      .where(
        and(
          eq(findings.fileId, fileId),
          eq(findings.projectId, projectId), // defense-in-depth: M1 parity with segments query
          eq(findings.detectedByLayer, 'L1'),
          withTenant(findings.tenantId, tenantId),
        ),
      )

    // Load penalty weights (tenant override chain)
    const penaltyWeights = await loadPenaltyWeights(tenantId)

    // Calculate MQM score (pure function)
    // Cast severity + status from string to typed union — DB constraint guarantees valid values
    const scoreResult = calculateMqmScore(
      findingRows as unknown as ContributingFinding[],
      totalWords,
      penaltyWeights,
    )

    // Check auto-pass eligibility
    const autoPassResult = await checkAutoPass({
      mqmScore: scoreResult.mqmScore,
      criticalCount: scoreResult.criticalCount,
      projectId,
      tenantId,
      sourceLang,
      targetLang,
    })

    // Determine final status
    // TODO(story-2.6): Add UNIQUE INDEX ON scores(file_id, tenant_id) WHERE file_id IS NOT NULL
    // to prevent duplicate rows from concurrent calls before Inngest serialization.
    const status: 'na' | 'auto_passed' | 'calculated' =
      scoreResult.status === 'na' ? 'na' : autoPassResult.eligible ? 'auto_passed' : 'calculated'

    // Persist in transaction: load previous score → delete → insert (idempotent)
    const { newScore, previousScore } = await db.transaction(async (tx) => {
      // Load previous score for audit old_value (before delete)
      const [prev] = await tx
        .select()
        .from(scores)
        .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

      // Delete existing score (if any)
      await tx
        .delete(scores)
        .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

      // Insert new score
      const [inserted] = await tx
        .insert(scores)
        .values({
          fileId,
          projectId,
          tenantId,
          mqmScore: scoreResult.mqmScore,
          totalWords: scoreResult.totalWords,
          criticalCount: scoreResult.criticalCount,
          majorCount: scoreResult.majorCount,
          minorCount: scoreResult.minorCount,
          npt: scoreResult.npt,
          layerCompleted: 'L1',
          status,
          // Only store rationale when the file actually auto-passed (H2: prevents
          // non-null rationale being persisted when status='na' overrides auto-pass)
          autoPassRationale: status === 'auto_passed' ? autoPassResult.rationale : null,
          calculatedAt: new Date(),
        })
        .returning()

      return { newScore: inserted!, previousScore: prev }
    })

    // Write audit log (non-fatal — score already committed)
    try {
      await writeAuditLog({
        tenantId,
        userId,
        entityType: 'score',
        entityId: newScore.id,
        action: status === 'auto_passed' ? 'score.auto_passed' : 'score.calculated',
        // exactOptionalPropertyTypes: spread to omit oldValue when undefined
        ...(previousScore
          ? { oldValue: { mqmScore: previousScore.mqmScore, status: previousScore.status } }
          : {}),
        newValue: { mqmScore: newScore.mqmScore, npt: newScore.npt, status: newScore.status },
      })
    } catch (auditErr) {
      logger.error({ err: auditErr, scoreId: newScore.id }, 'Audit log write failed for score')
    }

    // Task 6: Language pair graduation notification (file 51 for new pair)
    // Fires when fileCount === 50 (50 already scored = this is file 51, first eligible)
    // Non-fatal: wrap at call site so outer try never catches notification errors
    if (autoPassResult.isNewPair && autoPassResult.fileCount === NEW_PAIR_FILE_THRESHOLD) {
      try {
        await createGraduationNotification({
          tenantId,
          projectId,
          sourceLang,
          targetLang,
        })
      } catch (notifErr) {
        logger.warn(
          { err: notifErr, tenantId, sourceLang, targetLang },
          'Graduation notification call failed',
        )
      }
    }

    return {
      success: true,
      data: {
        scoreId: newScore.id,
        fileId,
        mqmScore: newScore.mqmScore,
        npt: newScore.npt,
        totalWords: newScore.totalWords,
        criticalCount: newScore.criticalCount,
        majorCount: newScore.majorCount,
        minorCount: newScore.minorCount,
        // Cast from varchar — DB constraint guarantees only these three values are stored
        status: newScore.status as 'calculated' | 'na' | 'auto_passed',
        autoPassRationale: newScore.autoPassRationale ?? null,
      },
    }
  } catch (err) {
    logger.error({ err, fileId }, 'Score calculation failed')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Score calculation failed' }
  }
}

/**
 * Create in-app notifications for all tenant admins when a language pair reaches file 51.
 * Includes deduplication guard to prevent duplicate notifications on idempotent re-runs.
 * Non-fatal — scoring must not fail because of notification failure.
 */
async function createGraduationNotification(params: {
  tenantId: string
  projectId: string
  sourceLang: string
  targetLang: string
}): Promise<void> {
  const { tenantId, projectId, sourceLang, targetLang } = params

  try {
    // Deduplication guard: check if graduation notification already exists for this pair
    // Uses JSONB containment query — prevents duplicates on idempotent re-runs of file 51
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          withTenant(notifications.tenantId, tenantId),
          eq(notifications.type, 'language_pair_graduated'),
          sql`${notifications.metadata} @> ${JSON.stringify({ sourceLang, targetLang })}::jsonb`,
        ),
      )
      .limit(1)

    if (existing) {
      // Already notified — skip to prevent duplicate
      return
    }

    // Query all admin users in this tenant (no 'owner' role in this codebase)
    const admins = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.role, 'admin'), withTenant(userRoles.tenantId, tenantId)))

    if (admins.length === 0) {
      return
    }

    // Insert one notification per admin
    await db.insert(notifications).values(
      admins.map((admin) => ({
        tenantId,
        userId: admin.userId,
        type: 'language_pair_graduated',
        title: 'Language pair ready for calibration',
        body: `${sourceLang}->${targetLang} has processed 51 files. Review confidence thresholds in language pair settings.`,
        metadata: { sourceLang, targetLang, fileCount: 51, projectId } as Record<string, unknown>,
      })),
    )
  } catch (err) {
    logger.warn(
      { err, tenantId, sourceLang, targetLang },
      'Failed to create graduation notification',
    )
  }
}
