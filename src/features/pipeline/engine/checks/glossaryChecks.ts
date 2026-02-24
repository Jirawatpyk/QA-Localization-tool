import type {
  GlossaryCheckResult,
  SegmentContext,
} from '@/features/glossary/matching/matchingTypes'

import type {
  GlossaryTermRecord,
  RuleCheckResult,
  SegmentCheckContext,
  SegmentRecord,
} from '../types'

/**
 * Glossary compliance check function type.
 * Matches signature of checkGlossaryCompliance from glossaryMatcher.
 * Extracted for testability (mock injection).
 */
export type GlossaryCheckFn = (
  targetText: string,
  terms: GlossaryTermRecord[],
  targetLang: string,
  ctx: SegmentContext,
) => Promise<GlossaryCheckResult>

/**
 * Check glossary compliance for a single segment.
 *
 * - Pre-filters terms whose sourceTerm appears in segment's sourceText
 * - Calls glossary matcher for the filtered terms
 * - Converts missingTerms to RuleCheckResult findings
 * - lowConfidenceMatches are NOT flagged (boundary ambiguity — match exists)
 */
export async function checkGlossaryComplianceRule(
  segment: SegmentRecord,
  glossaryTerms: GlossaryTermRecord[],
  ctx: SegmentCheckContext,
  checkFn: GlossaryCheckFn,
): Promise<RuleCheckResult[]> {
  // Pre-filter: only pass terms whose sourceTerm appears in source text (case-insensitive)
  const filtered = glossaryTerms.filter((term) =>
    segment.sourceText.toLowerCase().includes(term.sourceTerm.toLowerCase()),
  )

  if (filtered.length === 0) return []

  // Build SegmentContext for the glossary matcher
  const segmentContext: SegmentContext = {
    segmentId: segment.id,
    projectId: segment.projectId,
    tenantId: segment.tenantId,
  }

  const result = await checkFn(segment.targetText, filtered, ctx.targetLang, segmentContext)

  // Convert missing terms to findings
  const findings: RuleCheckResult[] = []
  for (const termId of result.missingTerms) {
    const term = filtered.find((t) => t.id === termId)
    if (!term) continue

    findings.push({
      segmentId: segment.id,
      category: 'glossary_compliance',
      severity: 'major',
      description: `Glossary term '${term.sourceTerm}' not translated as '${term.targetTerm}'`,
      suggestedFix: term.targetTerm,
      sourceExcerpt: segment.sourceText.slice(0, 100),
      targetExcerpt: segment.targetText.slice(0, 100),
    })
  }

  return findings
}
