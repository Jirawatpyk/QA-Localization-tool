import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

// Numbers-only regex: segments containing only digits, spaces, commas, periods
const NUMBERS_ONLY_RE = /^[\d\s.,]+$/

// Single-word proper noun: starts with uppercase, at least 1 lowercase after, < 30 chars
const PROPER_NOUN_RE = /^[A-Z][a-z]{1,28}$/

/**
 * Check: empty or whitespace-only target text → untranslated segment.
 * Severity: Critical, Category: completeness
 */
export function checkUntranslated(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  if (segment.targetText.trim().length === 0) {
    // Skip if source is also empty — nothing to translate
    if (segment.sourceText.trim().length === 0) return null

    return {
      segmentId: segment.id,
      category: 'completeness',
      severity: 'critical',
      description: 'Untranslated segment: target text is empty',
      suggestedFix: null,
      sourceExcerpt: segment.sourceText,
      targetExcerpt: segment.targetText,
    }
  }
  return null
}

/**
 * Check: target text is identical to source text.
 * Exceptions: numbers-only, single-word proper nouns, brand-like patterns.
 * Uses NFKC normalization for CJK comparison.
 * Severity: Major, Category: completeness
 */
export function checkTargetIdenticalToSource(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const source = segment.sourceText.normalize('NFKC')
  const target = segment.targetText.normalize('NFKC')

  if (source !== target) return null

  // Exception: numbers-only segments
  if (NUMBERS_ONLY_RE.test(source.trim())) return null

  // Exception: single-word proper noun (uppercase first letter, < 30 chars)
  if (PROPER_NOUN_RE.test(source.trim())) return null

  return {
    segmentId: segment.id,
    category: 'completeness',
    severity: 'major',
    description: 'Target text is identical to source text',
    suggestedFix: null,
    sourceExcerpt: segment.sourceText,
    targetExcerpt: segment.targetText,
  }
}
