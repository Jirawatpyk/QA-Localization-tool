import { BRACKET_PAIRS, QUOTE_CHARS, URL_REGEX } from '../constants'
import { isFullwidthEquivalent } from '../language/cjkRules'
import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

/**
 * Check for double (multiple consecutive) spaces in target text.
 */
export function checkDoubleSpaces(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  if (/ {2,}/.test(segment.targetText)) {
    return {
      segmentId: segment.id,
      category: 'spacing',
      severity: 'minor',
      description: 'Double spaces detected in target text',
      suggestedFix: 'Replace multiple consecutive spaces with a single space',
      sourceExcerpt: segment.sourceText,
      targetExcerpt: segment.targetText,
    }
  }
  return null
}

/**
 * Check for leading/trailing whitespace mismatch between source and target.
 */
export function checkLeadingTrailingSpaces(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  const sourceLeading = segment.sourceText.match(/^\s+/)?.[0] ?? ''
  const targetLeading = segment.targetText.match(/^\s+/)?.[0] ?? ''
  const sourceTrailing = segment.sourceText.match(/\s+$/)?.[0] ?? ''
  const targetTrailing = segment.targetText.match(/\s+$/)?.[0] ?? ''

  if (sourceLeading !== targetLeading) {
    results.push({
      segmentId: segment.id,
      category: 'spacing',
      severity: 'minor',
      description: 'Leading whitespace mismatch between source and target',
      suggestedFix: sourceLeading
        ? 'Add leading whitespace to match source'
        : 'Remove leading whitespace from target',
      sourceExcerpt: segment.sourceText,
      targetExcerpt: segment.targetText,
    })
  }

  if (sourceTrailing !== targetTrailing) {
    results.push({
      segmentId: segment.id,
      category: 'spacing',
      severity: 'minor',
      description: 'Trailing whitespace mismatch between source and target',
      suggestedFix: sourceTrailing
        ? 'Add trailing whitespace to match source'
        : 'Remove trailing whitespace from target',
      sourceExcerpt: segment.sourceText,
      targetExcerpt: segment.targetText,
    })
  }

  return results
}

/**
 * Check for unpaired brackets and quotes in target text.
 * Supports: (), [], {}, 「」, 【】, "", ''
 */
export function checkUnpairedBrackets(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []
  const text = segment.targetText

  // Check bracket pairs (open/close are different characters)
  for (const [open, close] of BRACKET_PAIRS) {
    let depth = 0
    for (const char of text) {
      if (char === open) depth++
      else if (char === close) depth--
      if (depth < 0) break // more closers than openers
    }

    if (depth !== 0) {
      results.push({
        segmentId: segment.id,
        category: 'punctuation',
        severity: 'minor',
        description: `Unpaired bracket in target: ${open}${close}`,
        suggestedFix: `Check for missing ${depth > 0 ? 'closing' : 'opening'} ${depth > 0 ? close : open}`,
        sourceExcerpt: segment.sourceText,
        targetExcerpt: segment.targetText,
      })
    }
  }

  // Check quote pairs (same character for open and close — must be even)
  for (const quote of QUOTE_CHARS) {
    let count = 0
    for (const char of text) {
      if (char === quote) count++
    }
    if (count % 2 !== 0) {
      results.push({
        segmentId: segment.id,
        category: 'punctuation',
        severity: 'minor',
        description: `Unpaired quote in target: ${quote}`,
        suggestedFix: `Check for missing ${quote} in target`,
        sourceExcerpt: segment.sourceText,
        targetExcerpt: segment.targetText,
      })
    }
  }

  return results
}

/**
 * Check for URL mismatches between source and target.
 */
export function checkUrlMismatches(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const sourceUrls = extractUrls(segment.sourceText)
  const targetUrls = extractUrls(segment.targetText)

  if (sourceUrls.length === 0) return null

  const targetSet = new Set(targetUrls)
  const missing = sourceUrls.filter((url) => !targetSet.has(url))

  if (missing.length === 0) return null

  return {
    segmentId: segment.id,
    category: 'url_integrity',
    severity: 'major',
    description: `URL mismatch: ${missing.join(', ')} missing or modified in target`,
    suggestedFix: 'Ensure URLs from source are preserved exactly in target',
    sourceExcerpt: segment.sourceText,
    targetExcerpt: segment.targetText,
  }
}

/**
 * Check end punctuation mismatch between source and target.
 * Skip if both end with alphanumeric characters.
 * Map CJK fullwidth terminal punctuation as equivalent.
 */
export function checkEndPunctuation(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const sourceEnd = getLastNonWhitespace(segment.sourceText)
  const targetEnd = getLastNonWhitespace(segment.targetText)

  if (!sourceEnd || !targetEnd) return null

  // Skip if both end with alphanumeric
  if (/[a-zA-Z0-9]/.test(sourceEnd) && /[a-zA-Z0-9]/.test(targetEnd)) return null

  // Check exact match or fullwidth ↔ halfwidth equivalence
  if (sourceEnd === targetEnd) return null
  if (isFullwidthEquivalent(sourceEnd, targetEnd)) return null

  return {
    segmentId: segment.id,
    category: 'punctuation',
    severity: 'minor',
    description: `End punctuation mismatch: source ends with "${sourceEnd}", target ends with "${targetEnd}"`,
    suggestedFix: `Match the ending punctuation with the source`,
    sourceExcerpt: segment.sourceText,
    targetExcerpt: segment.targetText,
  }
}

function extractUrls(text: string): string[] {
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags)
  return Array.from(text.matchAll(re), (m) => m[0])
}

function getLastNonWhitespace(text: string): string | null {
  const trimmed = text.trimEnd()
  if (trimmed.length === 0) return null
  // Use Array.from to iterate code points correctly (handles surrogate pairs/emoji)
  const chars = Array.from(trimmed)
  return chars[chars.length - 1] ?? null
}
