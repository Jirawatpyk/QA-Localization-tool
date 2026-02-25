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
const EXCERPT_MAX_LENGTH = 500

export async function crossFileConsistency(
  input: CrossFileConsistencyInput,
): Promise<CrossFileConsistencyResult> {
  const { projectId, tenantId, fileIds } = input

  // C6: Guard against empty fileIds — inArray([]) generates invalid SQL
  if (fileIds.length === 0) {
    return { findingCount: 0 }
  }

  // 1. Fetch all segments across batch files (selective columns for M9)
  const allSegments = await db
    .select({
      id: segments.id,
      fileId: segments.fileId,
      sourceText: segments.sourceText,
      targetText: segments.targetText,
      wordCount: segments.wordCount,
      confirmationState: segments.confirmationState,
    })
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
  const glossary = await db
    .select({ sourceTerm: glossaryTerms.sourceTerm, targetTerm: glossaryTerms.targetTerm })
    .from(glossaryTerms)
    .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
    .where(withTenant(glossaries.tenantId, tenantId))

  // Build glossary lookup: both source and target terms for exclusion (M3: spec requires both sides)
  const glossaryTermSet = new Set<string>()
  for (const g of glossary) {
    glossaryTermSet.add(g.sourceTerm.normalize('NFKC').trim().toLowerCase())
    glossaryTermSet.add(g.targetTerm.normalize('NFKC').trim().toLowerCase())
  }

  // 3. Group segments by NFKC-normalized source text
  const sourceGroups = new Map<
    string,
    Array<{ fileId: string; targetText: string; segmentId: string; sourceText: string }>
  >()

  for (const seg of allSegments) {
    // Skip ApprovedSignOff segments
    if (seg.confirmationState === 'ApprovedSignOff') continue

    const sourceText = (seg.sourceText as string).normalize('NFKC').trim()
    const wordCount = seg.wordCount as number

    // Skip short source texts (< 3 words)
    if (wordCount < MIN_WORD_COUNT) continue

    // M3: Skip segments whose source OR target text contains a glossary term (substring match on both sides)
    const sourceLower = sourceText.toLowerCase()
    const targetLower = (seg.targetText as string).normalize('NFKC').trim().toLowerCase()
    const matchesGlossary = [...glossaryTermSet].some(
      (term) => sourceLower.includes(term) || targetLower.includes(term),
    )
    if (matchesGlossary) continue

    const key = sourceText.toLowerCase()
    const entry = sourceGroups.get(key) ?? []
    entry.push({
      fileId: seg.fileId as string,
      targetText: (seg.targetText as string).normalize('NFKC').trim(),
      segmentId: seg.id as string,
      sourceText,
    })
    sourceGroups.set(key, entry)
  }

  // 4. Find inconsistencies: same source with different targets across different files
  const inconsistencies: Array<{
    sourceText: string
    targets: Map<string, string[]>
    relatedFileIds: string[]
    mostCommonTarget: string
  }> = []

  for (const [_sourceKey, entries] of sourceGroups) {
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
    let mostCommonTarget = ''
    let maxCount = 0
    for (const [target, fIds] of targetToFileIds) {
      targets.set(target, [...fIds])
      for (const fId of fIds) allFileIds.add(fId)
      if (fIds.size > maxCount) {
        maxCount = fIds.size
        mostCommonTarget = target
      }
    }

    // Ensure the inconsistency spans multiple files (not just within one file)
    if (allFileIds.size < 2) continue

    inconsistencies.push({
      sourceText: entries[0]!.sourceText,
      targets,
      relatedFileIds: [...allFileIds],
      mostCommonTarget,
    })
  }

  if (inconsistencies.length === 0) {
    return { findingCount: 0 }
  }

  // 5+6. Atomic DELETE+INSERT in transaction (C1: prevents data loss if INSERT fails after DELETE)
  const findingValues = inconsistencies.map((inconsistency) => {
    const targetVariants = [...inconsistency.targets.keys()]
    const description = `Cross-file translation inconsistency: same source text has ${targetVariants.length} different translations across files`

    return {
      projectId,
      tenantId,
      fileId: inconsistency.relatedFileIds[0]!,
      segmentId: null,
      category: 'consistency' as const,
      severity: 'minor' as const, // H3: AC#7 says minor, not major
      description,
      detectedByLayer: 'L1' as const,
      status: 'open' as const,
      scope: 'cross-file' as const,
      relatedFileIds: inconsistency.relatedFileIds,
      // M2: Add source/target excerpts for UI display
      sourceTextExcerpt: inconsistency.sourceText.slice(0, EXCERPT_MAX_LENGTH),
      targetTextExcerpt: inconsistency.mostCommonTarget.slice(0, EXCERPT_MAX_LENGTH),
    }
  })

  await db.transaction(async (tx) => {
    // Delete existing cross-file L1 findings for THIS batch's files only (idempotent re-run)
    // C3: Scoped to batch files — prevents destroying cross-file findings from other batches
    await tx
      .delete(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.projectId, projectId),
          eq(findings.scope, 'cross-file'),
          eq(findings.detectedByLayer, 'L1'),
          inArray(findings.fileId, fileIds),
        ),
      )

    // Batch insert new findings (H8: single INSERT instead of loop)
    await tx.insert(findings).values(findingValues)
  })

  logger.info(
    { findingCount: inconsistencies.length, fileCount: fileIds.length },
    'Cross-file consistency analysis complete',
  )

  return { findingCount: inconsistencies.length }
}
