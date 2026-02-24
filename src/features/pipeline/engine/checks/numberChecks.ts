import { THAI_LANG_PREFIXES } from '../constants'
import { isBuddhistYearEquivalent, normalizeThaiNumerals } from '../language/thaiRules'
import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

// Number extraction regex: integers, decimals, thousands separators, percentages, negative
// Supports both comma-dot (1,000.50) and dot-comma (1.000,50) locale formats
// Lookbehind (?<!\d) prevents capturing hyphen in ranges (e.g., "1-10") as negative sign
// Both branches need lookbehind+sign: branch 1 for multi-digit, branch 2 for single-digit (e.g., "-5")
const NUMBER_REGEX = /(?<!\d)[-+]?\d[\d.,]*\d|(?<!\d)[-+]?\d/g

// English cardinal number words (one–ten) mapped to their digit equivalents.
// \b word boundaries prevent substring matches (e.g., "someone" does not match "one").
// Known edge case: compound modifiers like "four-letter" will still match at the hyphen
// boundary — acceptable for L1 since all real findings use standalone cardinal words.
const EN_NUMBER_WORDS: ReadonlyMap<string, string> = new Map([
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['ten', '10'],
])

const EN_NUMBER_WORD_REGEX = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi

/**
 * Check number consistency between source and target.
 * - Digit numbers in source must appear in target
 * - English cardinal words (one–ten) in source must appear as digits in target (or be absent → flag)
 * - Word-to-digit conversion is acceptable: "four" → "4" is PASS, not a flag
 * - Thai numerals (๐-๙) are treated as equivalent to Arabic (0-9)
 * - Buddhist year offset (+543) is exempt: 2026 ↔ 2569
 */
export function checkNumberConsistency(
  segment: SegmentRecord,
  ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const isThaiTarget = THAI_LANG_PREFIXES.some((p) => ctx.targetLang.toLowerCase().startsWith(p))
  const isThaiSource = THAI_LANG_PREFIXES.some((p) => ctx.sourceLang.toLowerCase().startsWith(p))
  const isEnglishSource = ctx.sourceLang.toLowerCase().startsWith('en')

  // Extract numbers from source, normalizing Thai numerals if source is Thai
  const sourceText = isThaiSource ? normalizeThaiNumerals(segment.sourceText) : segment.sourceText
  const sourceDigitNumbers = extractNumbers(sourceText)

  // Extract English cardinal word numbers from source (English source only)
  // Returns [word, digitEquivalent] pairs — e.g., [["four", "4"], ["one", "1"]]
  const sourceWordPairs = isEnglishSource ? extractNumberWordPairs(sourceText) : []

  // Early exit: no numbers of any kind in source
  if (sourceDigitNumbers.length === 0 && sourceWordPairs.length === 0) return null

  // Extract numbers from target, normalizing Thai numerals if target is Thai
  const targetText = isThaiTarget ? normalizeThaiNumerals(segment.targetText) : segment.targetText
  const targetNumbers = extractNumbers(targetText)

  // Build target number set for lookup
  const targetSet = new Set(targetNumbers.map(normalizeNumber))

  const missing: string[] = []
  const sourceDigitNormalized = sourceDigitNumbers.map(normalizeNumber)

  // 1. Check digit numbers (existing logic)
  for (let i = 0; i < sourceDigitNumbers.length; i++) {
    const srcNorm = sourceDigitNormalized[i]!
    if (targetSet.has(srcNorm)) continue

    // Check Buddhist year exemption for Thai targets
    if (isThaiTarget) {
      const srcNum = parseFloat(srcNorm)
      if (!isNaN(srcNum) && hasBuddhistYearEquivalent(srcNum, targetNumbers)) continue
    }

    missing.push(sourceDigitNumbers[i]!)
  }

  // 2. Check English number words — flag only when digit equivalent is absent from target
  // "four" → "4" in target = PASS (word-to-digit conversion is acceptable localization practice)
  // "four" → absent in target = FLAG (quantity information lost)
  for (const [word, digitStr] of sourceWordPairs) {
    const digitNorm = normalizeNumber(digitStr)

    // Skip if this digit was already captured by the digit extractor (avoid double-flagging)
    if (sourceDigitNormalized.includes(digitNorm)) continue

    // Skip if digit equivalent is present in target
    if (targetSet.has(digitNorm)) continue

    missing.push(word)
  }

  if (missing.length === 0) return null

  return {
    segmentId: segment.id,
    category: 'number_format',
    severity: 'major',
    description: `Number mismatch: source contains ${missing.join(', ')} not found in target`,
    suggestedFix: `Verify numbers ${missing.join(', ')} are correctly translated in the target`,
    sourceExcerpt: segment.sourceText,
    targetExcerpt: segment.targetText,
  }
}

/** Extract all number strings from text */
function extractNumbers(text: string): string[] {
  return Array.from(text.matchAll(NUMBER_REGEX), (m) => m[0])
}

/**
 * Extract English cardinal number words from text.
 * Returns [word, digitEquivalent] pairs for each match.
 * Uses word boundaries to avoid substring matches (e.g., "someone" ≠ "one").
 */
function extractNumberWordPairs(text: string): [string, string][] {
  const matches = Array.from(text.matchAll(EN_NUMBER_WORD_REGEX))
  return matches.map((m) => {
    const word = m[0]!
    const digit = EN_NUMBER_WORDS.get(word.toLowerCase())!
    return [word, digit]
  })
}

/**
 * Normalize a number string for comparison:
 * - Remove thousands separators (both comma and dot patterns)
 * - Standardize decimal separator to dot
 */
function normalizeNumber(numStr: string): string {
  // Remove leading +
  let s = numStr.replace(/^\+/, '')

  // Detect locale: if pattern is N.NNN,NN → dot-comma locale
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    // European format: dots are thousands, comma is decimal
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    // Default (US/intl): commas are thousands, dot is decimal
    s = s.replace(/,/g, '')
  }

  // Parse and re-stringify to normalize (remove trailing zeros, etc.)
  const num = parseFloat(s)
  if (isNaN(num)) return s
  return String(num)
}

/** Check if any target number is a Buddhist year equivalent of the source number */
function hasBuddhistYearEquivalent(sourceNum: number, targetNumbers: string[]): boolean {
  for (const tgtStr of targetNumbers) {
    const tgtNum = parseFloat(normalizeNumber(tgtStr))
    if (!isNaN(tgtNum) && isBuddhistYearEquivalent(sourceNum, tgtNum)) {
      return true
    }
  }
  return false
}
