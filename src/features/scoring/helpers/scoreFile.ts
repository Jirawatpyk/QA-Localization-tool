import { and, eq, sql } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

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
import { logger } from '@/lib/logger'
import type { DetectedByLayer } from '@/types/finding'

type ScoreFileInput = {
  fileId: string
  projectId: string
  tenantId: string
  userId: string
  /** Filter findings to a specific layer. undefined = all layers (review context). */
  layerFilter?: DetectedByLayer | undefined
}

type ScoreFileResult = {
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
 * Shared helper: Calculate MQM score for a file and persist results.
 *
 * NO 'use server' / import 'server-only' — importable from Inngest runtime.
 * NO requireRole — auth handled at event trigger boundary (Server Action or Inngest).
 * Throws on error — Inngest handles retry; Server Action wrappers handle ActionResult mapping.
 */
export async function scoreFile({
  fileId,
  projectId,
  tenantId,
  userId,
  layerFilter,
}: ScoreFileInput): Promise<ScoreFileResult> {
  // Load all segments for word count SUM
  // Include ALL segments (even ApprovedSignOff) per MQM standard and Xbench parity
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

  if (segmentRows.length === 0) {
    throw new NonRetriableError(`No segments found for file ${fileId} — cannot calculate score`)
  }

  const totalWords = segmentRows.reduce((sum, s) => sum + s.wordCount, 0)
  const sourceLang = segmentRows[0]!.sourceLang
  const targetLang = segmentRows[0]!.targetLang

  // Load findings — calculator will filter by CONTRIBUTING_STATUSES
  // When layerFilter is set (pipeline context): only that layer's findings
  // When layerFilter is undefined (review context): ALL layers
  // Filter by projectId (defense-in-depth: prevents within-tenant cross-project contamination)
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
        eq(findings.projectId, projectId),
        withTenant(findings.tenantId, tenantId),
        layerFilter ? eq(findings.detectedByLayer, layerFilter) : undefined,
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
  const status: 'na' | 'auto_passed' | 'calculated' =
    scoreResult.status === 'na' ? 'na' : autoPassResult.eligible ? 'auto_passed' : 'calculated'

  // Persist in transaction: load previous score → delete → insert (idempotent)
  const { newScore, previousScore } = await db.transaction(async (tx) => {
    // Load previous score for audit old_value (before delete)
    const [prev] = await tx
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    // Preserve existing layerCompleted from previous score row, or default based on layerFilter
    const layerCompleted = prev?.layerCompleted ?? layerFilter ?? 'L1'

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
        layerCompleted,
        status,
        // Only store rationale when file actually auto-passed (H2: prevents non-null rationale
        // being persisted when status='na' overrides auto-pass)
        autoPassRationale: status === 'auto_passed' ? autoPassResult.rationale : null,
        calculatedAt: new Date(),
      })
      .returning()

    if (!inserted) {
      throw new Error(`Score insert returned no rows for file ${fileId}`)
    }
    return { newScore: inserted, previousScore: prev }
  })

  // Write audit log (non-fatal — score already committed)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'score',
      entityId: newScore.id,
      action: status === 'auto_passed' ? 'score.auto_passed' : 'score.calculated',
      ...(previousScore
        ? { oldValue: { mqmScore: previousScore.mqmScore, status: previousScore.status } }
        : {}),
      newValue: { mqmScore: newScore.mqmScore, npt: newScore.npt, status: newScore.status },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, scoreId: newScore.id }, 'Audit log write failed for score')
  }

  // Language pair graduation notification (file 51 for new pair)
  // Fires when fileCount === 50 (50 already scored = this is file 51, first eligible)
  // Non-fatal: wrap at call site so outer errors never suppress scoring result
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
    scoreId: newScore.id,
    fileId,
    mqmScore: newScore.mqmScore,
    npt: newScore.npt,
    totalWords: newScore.totalWords,
    criticalCount: newScore.criticalCount,
    majorCount: newScore.majorCount,
    minorCount: newScore.minorCount,
    status: newScore.status as 'calculated' | 'na' | 'auto_passed',
    autoPassRationale: newScore.autoPassRationale ?? null,
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
      return
    }

    // Query all admin users in this tenant
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
