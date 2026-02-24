import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

// Matches adjacent duplicate words (case-insensitive).
// \b word boundaries prevent partial matches (e.g., "there their" ≠ match).
// \w+ covers Latin letters, digits, underscore — intentionally excludes Thai/CJK
// characters (which lack word-boundary spaces), avoiding false positives in
// non-space-delimited scripts.
const REPEATED_WORD_REGEX = /\b(\w+)\s+\1\b/gi

/**
 * Check for repeated adjacent words in target text.
 * Example: "the the translation" → flag "the"
 *
 * Applies to target only — source repetition is not a translation error.
 * Severity: Minor, Category: repeated_word
 */
export function checkRepeatedWords(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const target = segment.targetText
  if (target.trim().length === 0) return null

  REPEATED_WORD_REGEX.lastIndex = 0
  const match = REPEATED_WORD_REGEX.exec(target)
  if (!match) return null

  const word = match[1]!.toLowerCase()

  return {
    segmentId: segment.id,
    category: 'repeated_word',
    severity: 'minor',
    description: `Repeated word in target: "${word}"`,
    suggestedFix: `Remove the duplicate "${word}" from the target`,
    sourceExcerpt: segment.sourceText,
    targetExcerpt: segment.targetText,
  }
}
