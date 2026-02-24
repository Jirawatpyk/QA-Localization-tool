import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

// UPPERCASE: 2+ consecutive uppercase Latin letters
const UPPERCASE_REGEX = /\b[A-Z]{2,}\b/g

// CamelCase: starts uppercase, followed by lowercase, then another uppercase+lowercase sequence
const CAMELCASE_REGEX = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g

// Test for presence of any Latin character in text
const HAS_LATIN_REGEX = /[a-zA-Z]/

/**
 * Check that UPPERCASE words from source appear in target.
 * For CJK/Thai targets: skip only if target contains zero Latin characters.
 */
export function checkUppercaseWords(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  const sourceWords = extractMatches(segment.sourceText, UPPERCASE_REGEX)
  if (sourceWords.length === 0) return results

  // Skip if target has zero Latin characters (purely CJK/Thai without any Latin terms)
  if (!HAS_LATIN_REGEX.test(segment.targetText)) return results

  for (const word of sourceWords) {
    if (!segment.targetText.includes(word)) {
      results.push({
        segmentId: segment.id,
        category: 'capitalization',
        severity: 'minor',
        description: `UPPERCASE word "${word}" from source not found in target`,
        suggestedFix: `Ensure "${word}" appears in the target text with correct case`,
        sourceExcerpt: segment.sourceText.slice(0, 100),
        targetExcerpt: segment.targetText.slice(0, 100),
      })
    }
  }

  return results
}

/**
 * Check that CamelCase words from source appear in target.
 * Same Latin-presence check as UPPERCASE.
 */
export function checkCamelCaseWords(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  const sourceWords = extractMatches(segment.sourceText, CAMELCASE_REGEX)
  if (sourceWords.length === 0) return results

  if (!HAS_LATIN_REGEX.test(segment.targetText)) return results

  for (const word of sourceWords) {
    if (!segment.targetText.includes(word)) {
      results.push({
        segmentId: segment.id,
        category: 'capitalization',
        severity: 'minor',
        description: `CamelCase word "${word}" from source not found in target`,
        suggestedFix: `Ensure "${word}" appears in the target text`,
        sourceExcerpt: segment.sourceText.slice(0, 100),
        targetExcerpt: segment.targetText.slice(0, 100),
      })
    }
  }

  return results
}

function extractMatches(text: string, regex: RegExp): string[] {
  const re = new RegExp(regex.source, regex.flags)
  return Array.from(text.matchAll(re), (m) => m[0])
}
