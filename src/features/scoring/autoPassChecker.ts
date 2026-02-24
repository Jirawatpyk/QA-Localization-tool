import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'

import { CONSERVATIVE_AUTO_PASS_THRESHOLD, NEW_PAIR_FILE_THRESHOLD } from './constants'
import type { AutoPassResult } from './types'

type AutoPassInput = {
  mqmScore: number
  criticalCount: number
  projectId: string
  tenantId: string
  sourceLang: string
  targetLang: string
}

/**
 * Determine auto-pass eligibility for a scored file.
 *
 * Threshold resolution (AC #5, #6):
 * 1. language_pair_configs entry → use its auto_pass_threshold
 * 2. No config (new pair), fileCount <= 50 → DISABLED (mandatory manual review)
 * 3. No config (established), fileCount > 50 → fall back to projects.auto_pass_threshold
 */
export async function checkAutoPass(input: AutoPassInput): Promise<AutoPassResult> {
  const { mqmScore, criticalCount, projectId, tenantId, sourceLang, targetLang } = input

  // Load language pair config for this tenant+source+target
  const [langConfig] = await db
    .select({ autoPassThreshold: languagePairConfigs.autoPassThreshold })
    .from(languagePairConfigs)
    .where(
      and(
        withTenant(languagePairConfigs.tenantId, tenantId),
        eq(languagePairConfigs.sourceLang, sourceLang),
        eq(languagePairConfigs.targetLang, targetLang),
      ),
    )
    .limit(1)

  // Count distinct scored files for this language pair within the project+tenant
  const [countResult] = await db
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
      ),
    )

  const fileCount = Number(countResult?.count ?? 0)
  const isNewPair = !langConfig

  if (isNewPair) {
    // New language pair: mandatory manual review for first 50 files (AC #6)
    // fileCount = already-scored files BEFORE this file is inserted.
    // fileCount < 50  → files 1-50 are blocked (correct: "first 50 files disabled")
    // fileCount >= 50 → file 51+ is eligible
    if (fileCount < NEW_PAIR_FILE_THRESHOLD) {
      return {
        eligible: false,
        rationale: `New language pair: mandatory manual review (file ${fileCount}/${NEW_PAIR_FILE_THRESHOLD})`,
        isNewPair: true,
        fileCount,
      }
    }

    // fileCount > 50 for new pair without config → fall back to projects.auto_pass_threshold
    const [project] = await db
      .select({ autoPassThreshold: projects.autoPassThreshold })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))
      .limit(1)

    const threshold = project?.autoPassThreshold ?? CONSERVATIVE_AUTO_PASS_THRESHOLD
    const eligible = mqmScore >= threshold && criticalCount === 0

    return {
      eligible,
      rationale: eligible
        ? `Score ${mqmScore} >= project threshold ${threshold} with no critical findings`
        : criticalCount > 0
          ? `Critical findings (${criticalCount}) prevent auto-pass`
          : `Score ${mqmScore} below project threshold ${threshold}`,
      isNewPair: true,
      fileCount,
    }
  }

  // Language pair config exists → use its threshold
  const threshold = langConfig.autoPassThreshold
  const eligible = mqmScore >= threshold && criticalCount === 0

  return {
    eligible,
    rationale: eligible
      ? `Score ${mqmScore} >= configured threshold ${threshold} with no critical findings`
      : criticalCount > 0
        ? `Critical findings (${criticalCount}) prevent auto-pass`
        : `Score ${mqmScore} below configured threshold ${threshold}`,
    isNewPair: false,
    fileCount,
  }
}
