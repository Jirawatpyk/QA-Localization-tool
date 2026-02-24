import { applyCjkNfkcNormalization } from '../language/cjkRules'
import { stripThaiParticles } from '../language/thaiRules'
import type { FileCheckContext, RuleCheckResult, SegmentRecord } from '../types'

const THAI_LANG_PREFIXES = ['th']

/**
 * Cross-segment: identical source text with different translations.
 * NFKC-normalized before comparison. Thai particles stripped.
 */
export function checkSameSourceDiffTarget(ctx: FileCheckContext): RuleCheckResult[] {
  const results: RuleCheckResult[] = []
  const isThai = THAI_LANG_PREFIXES.some((p) => ctx.targetLang.toLowerCase().startsWith(p))

  // Group segments by normalized source text
  const groups = new Map<string, SegmentRecord[]>()
  for (const seg of ctx.segments) {
    const key = applyCjkNfkcNormalization(seg.sourceText.trim())
    const group = groups.get(key)
    if (group) {
      group.push(seg)
    } else {
      groups.set(key, [seg])
    }
  }

  // Check each group for inconsistent translations
  for (const [, segs] of groups) {
    if (segs.length < 2) continue

    const uniqueTargets = new Map<string, SegmentRecord>()
    for (const seg of segs) {
      let normalized = applyCjkNfkcNormalization(seg.targetText.trim())
      if (isThai) normalized = stripThaiParticles(normalized)
      if (!uniqueTargets.has(normalized)) {
        uniqueTargets.set(normalized, seg)
      }
    }

    if (uniqueTargets.size <= 1) continue

    // Flag variants after the first
    const entries = [...uniqueTargets.entries()]
    for (let i = 1; i < entries.length; i++) {
      const seg = entries[i]![1]
      results.push({
        segmentId: seg.id,
        category: 'consistency',
        severity: 'minor',
        description: `Inconsistent translation: same source text "${seg.sourceText.slice(0, 50)}" has different translations`,
        suggestedFix: `Check if the translation should match other occurrences`,
        sourceExcerpt: seg.sourceText.slice(0, 100),
        targetExcerpt: seg.targetText.slice(0, 100),
      })
    }
  }

  return results
}

/**
 * Cross-segment: identical target text from different source texts.
 * NFKC-normalized before comparison. Thai particles stripped.
 */
export function checkSameTargetDiffSource(ctx: FileCheckContext): RuleCheckResult[] {
  const results: RuleCheckResult[] = []
  const isThai = THAI_LANG_PREFIXES.some((p) => ctx.targetLang.toLowerCase().startsWith(p))

  // Group segments by normalized target text
  const groups = new Map<string, SegmentRecord[]>()
  for (const seg of ctx.segments) {
    let key = applyCjkNfkcNormalization(seg.targetText.trim())
    if (isThai) key = stripThaiParticles(key)
    // Skip empty targets
    if (key.length === 0) continue
    const group = groups.get(key)
    if (group) {
      group.push(seg)
    } else {
      groups.set(key, [seg])
    }
  }

  // Check each group for different source texts
  for (const [, segs] of groups) {
    if (segs.length < 2) continue

    const uniqueSources = new Map<string, SegmentRecord>()
    for (const seg of segs) {
      const normalized = applyCjkNfkcNormalization(seg.sourceText.trim())
      if (!uniqueSources.has(normalized)) {
        uniqueSources.set(normalized, seg)
      }
    }

    if (uniqueSources.size <= 1) continue

    const entries = [...uniqueSources.entries()]
    for (let i = 1; i < entries.length; i++) {
      const seg = entries[i]![1]
      results.push({
        segmentId: seg.id,
        category: 'consistency',
        severity: 'minor',
        description: `Same translation used for different sources: "${seg.targetText.slice(0, 50)}"`,
        suggestedFix: `Verify if the same translation is appropriate for different source texts`,
        sourceExcerpt: seg.sourceText.slice(0, 100),
        targetExcerpt: seg.targetText.slice(0, 100),
      })
    }
  }

  return results
}

/**
 * Cross-segment: glossary terms used inconsistently.
 * For each glossary term appearing in multiple source segments,
 * verify the same target term translation is used consistently.
 */
export function checkKeyTermConsistency(ctx: FileCheckContext): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  if (ctx.glossaryTerms.length === 0) return results

  // For each glossary term, find segments containing it in source
  for (const term of ctx.glossaryTerms) {
    const sourceTerm = term.sourceTerm
    const isCaseSensitive = term.caseSensitive
    const matchingSegments: SegmentRecord[] = []

    for (const seg of ctx.segments) {
      const sourceMatch = isCaseSensitive
        ? seg.sourceText.includes(sourceTerm)
        : seg.sourceText.toLowerCase().includes(sourceTerm.toLowerCase())
      if (sourceMatch) {
        matchingSegments.push(seg)
      }
    }

    if (matchingSegments.length < 2) continue

    // Check if the expected target term is used consistently
    const targetTerm = term.targetTerm
    const segsWithTerm: SegmentRecord[] = []
    const segsWithoutTerm: SegmentRecord[] = []

    for (const seg of matchingSegments) {
      const targetMatch = isCaseSensitive
        ? seg.targetText.includes(targetTerm)
        : seg.targetText.toLowerCase().includes(targetTerm.toLowerCase())
      if (targetMatch) {
        segsWithTerm.push(seg)
      } else {
        segsWithoutTerm.push(seg)
      }
    }

    // If some segments use the term and some don't, flag the inconsistency
    if (segsWithTerm.length > 0 && segsWithoutTerm.length > 0) {
      for (const seg of segsWithoutTerm) {
        results.push({
          segmentId: seg.id,
          category: 'consistency',
          severity: 'major',
          description: `Key term inconsistency: "${sourceTerm}" translated inconsistently — expected "${targetTerm}"`,
          suggestedFix: `Use "${targetTerm}" consistently for "${sourceTerm}"`,
          sourceExcerpt: seg.sourceText.slice(0, 100),
          targetExcerpt: seg.targetText.slice(0, 100),
        })
      }
    }
  }

  return results
}
