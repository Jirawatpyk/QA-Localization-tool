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
import { CONTRIBUTING_STATUSES, NEW_PAIR_FILE_THRESHOLD } from '@/features/scoring/constants'
import { calculateMqmScore } from '@/features/scoring/mqmCalculator'
import { loadPenaltyWeights } from '@/features/scoring/penaltyWeightLoader'
import type { ContributingFinding, FindingsSummary, FindingStatus } from '@/features/scoring/types'
import { logger } from '@/lib/logger'
import type { DetectedByLayer, FindingSeverity, LayerCompleted } from '@/types/finding'
import type { TenantId } from '@/types/tenant'

type ScoreFileInput = {
  fileId: string
  projectId: string
  tenantId: TenantId
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
  // SAFETY: Drizzle returns varchar → string for severity/status columns, but DB CHECK
  // constraints guarantee valid Severity ('critical'|'major'|'minor') and FindingStatus values.
  // The cast is safe because invalid values cannot exist in the DB.
  const scoreResult = calculateMqmScore(
    findingRows as ContributingFinding[],
    totalWords,
    penaltyWeights,
  )

  // S3 fix: derive layerCompleted from findings already loaded (no extra DB query)
  // Reachable only on first score via Server Action (no pipeline run yet).
  // Inngest paths always supply layerCompleted or layerFilter — derivedLayer is the last fallback.
  const derivedLayerCompleted: LayerCompleted = deriveLayerFromFindings(findingRows)

  // CR-H1 fix: map layerFilter (DetectedByLayer) to valid LayerCompleted value
  // layerFilter='L1' → 'L1', 'L2' → 'L1L2', 'L3' → 'L1L2L3' (never use raw layerFilter as layerCompleted)
  const layerFilterAsCompleted: LayerCompleted | undefined =
    layerFilter === 'L1'
      ? 'L1'
      : layerFilter === 'L2'
        ? 'L1L2'
        : layerFilter === 'L3'
          ? 'L1L2L3'
          : undefined

  // Determine final status
  // When scoreStatus='partial' (AI pipeline failed), skip auto-pass — incomplete data
  let status: 'na' | 'auto_passed' | 'calculated' | 'partial'
  let autoPassResult: Awaited<ReturnType<typeof checkAutoPass>> | null = null

  if (scoreStatus === 'partial') {
    status = 'partial'
  } else if (scoreResult.status === 'na') {
    // S5 fix: skip checkAutoPass when totalWords=0 (result would be overridden to 'na' anyway)
    status = 'na'
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
    status = autoPassResult.eligible ? 'auto_passed' : 'calculated'
  }

  // Persist in transaction: load previous score → delete → insert (idempotent)
  // S1 fix: uq_scores_file_tenant constraint prevents duplicate rows from concurrent
  // Server Action + Inngest race. onConflictDoUpdate is the safety net.
  const { newScore, previousScore } = await db.transaction(async (tx) => {
    // Load previous score for audit old_value (before delete)
    const [prev] = await tx
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    // Override MUST be checked FIRST — after L2/L3 completes, prev has stale 'L1'
    // CR-H1: use layerFilterAsCompleted (mapped to valid LayerCompleted) instead of raw layerFilter
    const layerCompleted =
      layerCompletedOverride ??
      prev?.layerCompleted ??
      layerFilterAsCompleted ??
      derivedLayerCompleted

    // Delete existing score (if any)
    await tx
      .delete(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    const scoreValues = {
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
    }

    // Insert new score (onConflictDoUpdate = safety net for race condition — S1 fix)
    // CR-H4: explicitly omit `id` from update set (don't rely on undefined behavior)
    const { ...updateSet } = scoreValues // scoreValues has no id field, spread is clean
    const [inserted] = await tx
      .insert(scores)
      .values(scoreValues)
      .onConflictDoUpdate({
        target: [scores.fileId, scores.tenantId],
        set: updateSet,
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

  // Language pair graduation notification (file 51+ for new pair)
  // CR-H3: use >= instead of === to handle concurrent re-scoring edge case
  // (dedup guard in createGraduationNotification prevents duplicate notifications)
  if (autoPassResult?.isNewPair && autoPassResult.fileCount >= NEW_PAIR_FILE_THRESHOLD) {
    try {
      await createGraduationNotification({
        tenantId,
        projectId,
        sourceLang,
        targetLang,
        fileCount: autoPassResult.fileCount,
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
 * Create in-app notifications for all tenant admins when a language pair graduates.
 * Includes deduplication guard to prevent duplicate notifications on idempotent re-runs.
 * Non-fatal — scoring must not fail because of notification failure.
 */
async function createGraduationNotification(params: {
  tenantId: TenantId
  projectId: string
  sourceLang: string
  targetLang: string
  fileCount: number
}): Promise<void> {
  const { tenantId, projectId, sourceLang, targetLang, fileCount } = params

  try {
    // Deduplication guard: check if graduation notification already exists for this pair+project
    // TD-SCORE-001 fix: include projectId — graduation is per-project (threshold is per-project)
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          withTenant(notifications.tenantId, tenantId),
          eq(notifications.type, 'language_pair_graduated'),
          sql`${notifications.metadata} @> ${JSON.stringify({ sourceLang, targetLang, projectId })}::jsonb`,
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
    // Note: no unique constraint on notifications table — dedup guard above (JSONB containment)
    // prevents duplicate graduation notifications. Race between concurrent Inngest runs is
    // possible but harmless (worst case: duplicate notifications, not data corruption).
    await db.insert(notifications).values(
      admins.map((admin) => ({
        tenantId,
        userId: admin.userId,
        type: 'language_pair_graduated',
        title: 'Language pair ready for calibration',
        body: `${sourceLang}->${targetLang} has processed ${fileCount} files. Review confidence thresholds in language pair settings.`,
        metadata: { sourceLang, targetLang, fileCount, projectId } as Record<string, unknown>,
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
const SEVERITY_PRIORITY: Record<FindingSeverity, number> = { critical: 3, major: 2, minor: 1 }

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
  // H-2: Only count contributing findings (same filter as MQM calculator)
  // Without this, rejected/false_positive findings would inflate severity counts
  // while the MQM score excludes them — causing rationale inconsistency
  const contributing = findingRows.filter((f) =>
    CONTRIBUTING_STATUSES.has(f.status as FindingStatus),
  )

  const severityCounts = { critical: 0, major: 0, minor: 0 }

  for (const f of contributing) {
    if (f.severity === 'critical') severityCounts.critical++
    else if (f.severity === 'major') severityCounts.major++
    else if (f.severity === 'minor') severityCounts.minor++
  }

  // Select riskiest finding: highest severity, then highest confidence
  // Skip L1 findings (no aiConfidence = no risk ranking)
  let riskiest: FindingsSummary['riskiestFinding'] = null
  let riskiestPriority = -1
  let riskiestConfidence = -1

  for (const f of contributing) {
    if (f.aiConfidence === null) continue // Skip L1 findings (FM-3.2)

    const priority = SEVERITY_PRIORITY[f.severity as FindingSeverity] ?? 0
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

/**
 * Derive layerCompleted from the highest detection layer present in findings.
 * Used as fallback when no override, prev score, or layerFilter exists (review context).
 */
function deriveLayerFromFindings(findingRows: Array<{ detectedByLayer: string }>): LayerCompleted {
  const layers = new Set(findingRows.map((f) => f.detectedByLayer))
  if (layers.has('L3')) return 'L1L2L3'
  if (layers.has('L2')) return 'L1L2'
  return 'L1'
}
