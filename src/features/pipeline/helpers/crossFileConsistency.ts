import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { segments } from '@/db/schema/segments'
import { logger } from '@/lib/logger'

type CrossFileConsistencyInput = {
  projectId: string
  tenantId: string
  batchId: string
  fileIds: string[]
}

type CrossFileConsistencyResult = {
  findingCount: number
}

const MIN_WORD_COUNT = 3

export async function crossFileConsistency(
  input: CrossFileConsistencyInput,
): Promise<CrossFileConsistencyResult> {
  const { projectId, tenantId, fileIds } = input

  // 1. Fetch all segments across batch files
  const allSegments = await db
    .select()
    .from(segments)
    .where(
      and(
        withTenant(segments.tenantId, tenantId),
        eq(segments.projectId, projectId),
        inArray(segments.fileId, fileIds),
      ),
    )

  if (allSegments.length === 0) {
    return { findingCount: 0 }
  }

  // 2. Fetch glossary terms for this tenant (for exclusion)
  // glossaryTerms → glossaries (via glossaryId) → glossaries.tenantId
  const glossary = await db
    .select({ sourceTerm: glossaryTerms.sourceTerm, targetTerm: glossaryTerms.targetTerm })
    .from(glossaryTerms)
    .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
    .where(withTenant(glossaries.tenantId, tenantId))

  const glossarySourceTerms = glossary.map((g) =>
    g.sourceTerm.normalize('NFKC').trim().toLowerCase(),
  )

  // 3. Group segments by NFKC-normalized source text
  const sourceGroups = new Map<
    string,
    Array<{ fileId: string; targetText: string; segmentId: string }>
  >()

  for (const seg of allSegments) {
    // Skip ApprovedSignOff segments
    if (seg.confirmationState === 'ApprovedSignOff') continue

    const sourceText = (seg.sourceText as string).normalize('NFKC').trim()
    const wordCount = seg.wordCount as number

    // Skip short source texts (< 3 words)
    if (wordCount < MIN_WORD_COUNT) continue

    // Skip segments whose source text contains a glossary term (substring match)
    const sourceLower = sourceText.toLowerCase()
    if (glossarySourceTerms.some((term) => sourceLower.includes(term))) continue

    const key = sourceText.toLowerCase()
    const entry = sourceGroups.get(key) ?? []
    entry.push({
      fileId: seg.fileId as string,
      targetText: (seg.targetText as string).normalize('NFKC').trim(),
      segmentId: seg.id as string,
    })
    sourceGroups.set(key, entry)
  }

  // 4. Find inconsistencies: same source with different targets across different files
  const inconsistencies: Array<{
    sourceText: string
    targets: Map<string, string[]>
    relatedFileIds: string[]
  }> = []

  for (const [sourceKey, entries] of sourceGroups) {
    // Group by target text
    const targetToFileIds = new Map<string, Set<string>>()
    for (const entry of entries) {
      const tKey = entry.targetText.toLowerCase()
      const fileSet = targetToFileIds.get(tKey) ?? new Set<string>()
      fileSet.add(entry.fileId)
      targetToFileIds.set(tKey, fileSet)
    }

    // Only flag if there are multiple distinct targets across different files
    if (targetToFileIds.size < 2) continue

    // Collect all file IDs involved
    const allFileIds = new Set<string>()
    const targets = new Map<string, string[]>()
    for (const [target, fIds] of targetToFileIds) {
      targets.set(target, [...fIds])
      for (const fId of fIds) allFileIds.add(fId)
    }

    // Ensure the inconsistency spans multiple files (not just within one file)
    if (allFileIds.size < 2) continue

    inconsistencies.push({
      sourceText: sourceKey,
      targets,
      relatedFileIds: [...allFileIds],
    })
  }

  if (inconsistencies.length === 0) {
    return { findingCount: 0 }
  }

  // 5. Check for existing cross-file findings (for idempotency — delete + re-insert)
  // CRITICAL: scope filter prevents deleting L1/L2/L3 per-file findings
  const existingFindings = await db
    .select()
    .from(findings)
    .where(
      and(
        withTenant(findings.tenantId, tenantId),
        eq(findings.projectId, projectId),
        eq(findings.scope, 'cross-file'),
        eq(findings.detectedByLayer, 'L1'),
      ),
    )

  if (existingFindings.length > 0) {
    await db
      .delete(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.projectId, projectId),
          eq(findings.scope, 'cross-file'),
          eq(findings.detectedByLayer, 'L1'),
        ),
      )
  }

  // 6. Insert new findings — one per inconsistency (deduplicated)
  for (const inconsistency of inconsistencies) {
    const targetVariants = [...inconsistency.targets.keys()]
    const description = `Cross-file translation inconsistency: same source text has ${targetVariants.length} different translations across files`

    await db.insert(findings).values({
      projectId,
      tenantId,
      fileId: inconsistency.relatedFileIds[0],
      segmentId: null,
      category: 'consistency',
      severity: 'major',
      description,
      detectedByLayer: 'L1',
      status: 'open',
      scope: 'cross-file',
      relatedFileIds: inconsistency.relatedFileIds,
    })
  }

  logger.info(
    `Cross-file consistency: found ${inconsistencies.length} inconsistencies across ${fileIds.length} files`,
  )

  return { findingCount: inconsistencies.length }
}
