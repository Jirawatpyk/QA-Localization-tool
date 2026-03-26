import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'
import type { TenantId } from '@/types/tenant'

import { CONSERVATIVE_AUTO_PASS_THRESHOLD, NEW_PAIR_FILE_THRESHOLD } from './constants'
import type { AutoPassRationaleData, AutoPassResult, FindingsSummary } from './types'

type AutoPassInput = {
  mqmScore: number
  criticalCount: number
  projectId: string
  tenantId: TenantId
  sourceLang: string
  targetLang: string
  findingsSummary?: FindingsSummary | undefined
}

/**
 * Determine auto-pass eligibility for a scored file.
 *
 * Threshold resolution (AC #5, #6):
 * 1. language_pair_configs entry → use its auto_pass_threshold
 * 2. No config (new pair), fileCount < 50 → DISABLED (mandatory manual review)
 * 3. No config (established), fileCount >= 50 → fall back to projects.auto_pass_threshold
 */
export async function checkAutoPass(input: AutoPassInput): Promise<AutoPassResult> {
  const { mqmScore, criticalCount, projectId, tenantId, sourceLang, targetLang, findingsSummary } =
    input

  // L1 fix: Run independent queries in parallel (reduces latency ~50%)
  const [langConfigRows, countRows] = await Promise.all([
    // Load language pair config for this tenant+source+target
    db
      .select({ autoPassThreshold: languagePairConfigs.autoPassThreshold })
      .from(languagePairConfigs)
      .where(
        and(
          withTenant(languagePairConfigs.tenantId, tenantId),
          eq(languagePairConfigs.sourceLang, sourceLang),
          eq(languagePairConfigs.targetLang, targetLang),
        ),
      )
      .limit(1),
    // Count distinct scored files for this language pair within the project+tenant
    // S6 fix: only count terminal score statuses — exclude 'calculating'/'partial' to prevent
    // inflated fileCount from triggering premature graduation notification
    db
      .select({ count: sql<number>`count(distinct ${scores.fileId})` })
      .from(scores)
      .innerJoin(segments, eq(scores.fileId, segments.fileId))
      .where(
        and(
          eq(scores.projectId, projectId),
          eq(segments.sourceLang, sourceLang),
          eq(segments.targetLang, targetLang),
          withTenant(scores.tenantId, tenantId),
          withTenant(segments.tenantId, tenantId), // defense-in-depth on JOIN
          // CR-M3: only terminal statuses count toward graduation threshold
          // excluded: calculating, partial, na (incomplete or not applicable)
          // TODO(Epic 6): 'overridden' = PM-adjusted terminal score — currently no code writes this
          // status. When override-score feature is added, verify it writes consistent status via scoreFile.
          inArray(scores.status, ['calculated', 'auto_passed', 'overridden']),
        ),
      ),
  ])
  const [langConfig] = langConfigRows
  const [countResult] = countRows

  const fileCount = Number(countResult?.count ?? 0)
  const isNewPair = !langConfig

  if (isNewPair) {
    // New language pair: mandatory manual review for first 50 files (AC #6)
    if (fileCount < NEW_PAIR_FILE_THRESHOLD) {
      return {
        eligible: false,
        rationale: `New language pair: mandatory manual review (file ${fileCount}/${NEW_PAIR_FILE_THRESHOLD})`,
        isNewPair: true,
        fileCount,
        rationaleData: null,
      }
    }

    // fileCount >= 50 for new pair without config → fall back to projects.auto_pass_threshold
    const [project] = await db
      .select({ autoPassThreshold: projects.autoPassThreshold })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))
      .limit(1)

    const threshold = project?.autoPassThreshold ?? CONSERVATIVE_AUTO_PASS_THRESHOLD
    const eligible = mqmScore >= threshold && criticalCount === 0

    return buildResult({
      eligible,
      mqmScore,
      threshold,
      criticalCount,
      isNewPair: true,
      fileCount,
      thresholdType: 'project',
      findingsSummary,
    })
  }

  // Language pair config exists → use its threshold
  // Defense-in-depth: ?? guard against null (DB has NOT NULL constraint, but JS coerces null→0 in >=)
  const threshold = langConfig.autoPassThreshold ?? CONSERVATIVE_AUTO_PASS_THRESHOLD
  const eligible = mqmScore >= threshold && criticalCount === 0

  return buildResult({
    eligible,
    mqmScore,
    threshold,
    criticalCount,
    isNewPair: false,
    fileCount,
    thresholdType: 'configured',
    findingsSummary,
  })
}

function buildResult(params: {
  eligible: boolean
  mqmScore: number
  threshold: number
  criticalCount: number
  isNewPair: boolean
  fileCount: number
  thresholdType: 'project' | 'configured'
  findingsSummary?: FindingsSummary | undefined
}): AutoPassResult {
  const {
    eligible,
    mqmScore,
    threshold,
    criticalCount,
    isNewPair,
    fileCount,
    thresholdType,
    findingsSummary,
  } = params

  const rationale = eligible
    ? `Score ${mqmScore} >= ${thresholdType} threshold ${threshold} with no critical findings`
    : criticalCount > 0
      ? `Critical findings (${criticalCount}) prevent auto-pass`
      : `Score ${mqmScore} below ${thresholdType} threshold ${threshold}`

  const rationaleData: AutoPassRationaleData | null = findingsSummary
    ? {
        score: mqmScore,
        threshold,
        margin: mqmScore - threshold,
        severityCounts: findingsSummary.severityCounts,
        riskiestFinding: findingsSummary.riskiestFinding,
        criteria: {
          scoreAboveThreshold: mqmScore >= threshold,
          noCriticalFindings: criticalCount === 0,
          // checkAutoPass is only called when pipeline is not partial → layers are complete
          allLayersComplete: true,
        },
        isNewPair,
        fileCount,
      }
    : null

  return {
    eligible,
    rationale: rationaleData ? JSON.stringify(rationaleData) : rationale,
    isNewPair,
    fileCount,
    rationaleData,
  }
}
