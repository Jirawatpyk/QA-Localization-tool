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
import type { ContributingFinding, FindingsSummary } from '@/features/scoring/types'
import { logger } from '@/lib/logger'
import type { DetectedByLayer, LayerCompleted } from '@/types/finding'

type ScoreFileInput = {
  fileId: string
  projectId: string
  tenantId: string
  userId: string
  /** Filter findings to a specific layer. undefined = all layers (review context). */
  layerFilter?: DetectedByLayer | undefined
  /** Override persisted layerCompleted value. Used by pipeline after L2/L3 completes. */
  layerCompleted?: LayerCompleted | undefined
  /** Set score status to 'partial' when pipeline failed after L1 (AC5). Skips auto-pass. */
  scoreStatus?: 'partial' | undefined
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
  status: 'calculated' | 'na' | 'auto_passed' | 'partial'
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
  layerCompleted: layerCompletedOverride,
  scoreStatus,
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
  // Story 3.5: expanded SELECT to include fields needed for structured auto-pass rationale
  const findingRows = await db
    .select({
      id: findings.id,
      severity: findings.severity,
      status: findings.status,
      segmentCount: findings.segmentCount,
      category: findings.category,
      aiConfidence: findings.aiConfidence,
      description: findings.description,
      detectedByLayer: findings.detectedByLayer,
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
  // SAFETY: Drizzle returns varchar → string but DB CHECK constraints guarantee valid Severity/FindingStatus values
  const scoreResult = calculateMqmScore(
    findingRows as ContributingFinding[],
    totalWords,
    penaltyWeights,
  )

  // Determine final status
  // When scoreStatus='partial' (AI pipeline failed), skip auto-pass — incomplete data
  let status: 'na' | 'auto_passed' | 'calculated' | 'partial'
  let autoPassResult: Awaited<ReturnType<typeof checkAutoPass>> | null = null

  if (scoreStatus === 'partial') {
    status = 'partial'
  } else {
    // Story 3.5: build findings summary for structured auto-pass rationale
    const findingsSummary = buildFindingsSummary(findingRows)

    autoPassResult = await checkAutoPass({
      mqmScore: scoreResult.mqmScore,
      criticalCount: scoreResult.criticalCount,
      projectId,
      tenantId,
      sourceLang,
      targetLang,
      findingsSummary,
    })
    status =
      scoreResult.status === 'na' ? 'na' : autoPassResult.eligible ? 'auto_passed' : 'calculated'
  }

  // Persist in transaction: load previous score → delete → insert (idempotent)
  const { newScore, previousScore } = await db.transaction(async (tx) => {
    // Load previous score for audit old_value (before delete)
    const [prev] = await tx
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    // Override MUST be checked FIRST — after L2/L3 completes, prev has stale 'L1'
    const layerCompleted = layerCompletedOverride ?? prev?.layerCompleted ?? layerFilter ?? 'L1'

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
        autoPassRationale:
          status === 'auto_passed' && autoPassResult ? autoPassResult.rationale : null,
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
      action:
        status === 'auto_passed'
          ? 'score.auto_passed'
          : status === 'partial'
            ? 'score.partial'
            : 'score.calculated',
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
  if (autoPassResult?.isNewPair && autoPassResult.fileCount === NEW_PAIR_FILE_THRESHOLD) {
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
    status: newScore.status as 'calculated' | 'na' | 'auto_passed' | 'partial',
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

// Severity priority for riskiest finding selection
const SEVERITY_PRIORITY: Record<string, number> = { critical: 3, major: 2, minor: 1 }

/**
 * Build findings summary for structured auto-pass rationale (Story 3.5).
 * Riskiest finding = highest severity, then highest confidence within that severity.
 * L1 findings (aiConfidence=null) are skipped for riskiest selection.
 */
function buildFindingsSummary(
  findingRows: Array<{
    id: string
    severity: string
    status: string
    category: string
    aiConfidence: number | null
    description: string
    detectedByLayer: string
  }>,
): FindingsSummary {
  const severityCounts = { critical: 0, major: 0, minor: 0 }

  for (const f of findingRows) {
    if (f.severity === 'critical') severityCounts.critical++
    else if (f.severity === 'major') severityCounts.major++
    else if (f.severity === 'minor') severityCounts.minor++
  }

  // Select riskiest finding: highest severity, then highest confidence
  // Skip L1 findings (no aiConfidence = no risk ranking)
  let riskiest: FindingsSummary['riskiestFinding'] = null
  let riskiestPriority = -1
  let riskiestConfidence = -1

  for (const f of findingRows) {
    if (f.aiConfidence === null) continue // Skip L1 findings (FM-3.2)

    const priority = SEVERITY_PRIORITY[f.severity] ?? 0
    if (
      priority > riskiestPriority ||
      (priority === riskiestPriority && f.aiConfidence > riskiestConfidence)
    ) {
      riskiestPriority = priority
      riskiestConfidence = f.aiConfidence
      riskiest = {
        category: f.category,
        severity: f.severity,
        confidence: f.aiConfidence,
        description: f.description,
      }
    }
  }

  return { severityCounts, riskiestFinding: riskiest }
}
