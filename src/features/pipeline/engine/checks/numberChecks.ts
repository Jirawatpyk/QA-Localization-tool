import { isBuddhistYearEquivalent, normalizeThaiNumerals } from '../language/thaiRules'
import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

// Number extraction regex: integers, decimals, thousands separators, percentages, negative
// Supports both comma-dot (1,000.50) and dot-comma (1.000,50) locale formats
const NUMBER_REGEX = /[-+]?\d[\d.,]*\d|\d/g

// Thai language codes for Thai-specific number handling
const THAI_LANG_PREFIXES = ['th']

/**
 * Check number consistency between source and target.
 * - Numbers in source must appear in target
 * - Thai numerals (๐-๙) are treated as equivalent to Arabic (0-9)
 * - Buddhist year offset (+543) is exempt: 2026 ↔ 2569
 */
export function checkNumberConsistency(
  segment: SegmentRecord,
  ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const isThaiTarget = THAI_LANG_PREFIXES.some((p) => ctx.targetLang.toLowerCase().startsWith(p))

  // Extract numbers from source (always use Arabic digits)
  const sourceNumbers = extractNumbers(segment.sourceText)
  if (sourceNumbers.length === 0) return null

  // Extract numbers from target, normalizing Thai numerals if target is Thai
  const targetText = isThaiTarget ? normalizeThaiNumerals(segment.targetText) : segment.targetText
  const targetNumbers = extractNumbers(targetText)

  // Build target number set for lookup
  const targetSet = new Set(targetNumbers.map(normalizeNumber))

  // Check each source number against target
  const missing: string[] = []
  const sourceNormalized = sourceNumbers.map(normalizeNumber)

  for (let i = 0; i < sourceNumbers.length; i++) {
    const srcNorm = sourceNormalized[i]!
    if (targetSet.has(srcNorm)) continue

    // Check Buddhist year exemption for Thai targets
    if (isThaiTarget) {
      const srcNum = parseFloat(srcNorm)
      if (!isNaN(srcNum) && hasBuddhistYearEquivalent(srcNum, targetNumbers)) continue
    }

    missing.push(sourceNumbers[i]!)
  }

  if (missing.length === 0) return null

  return {
    segmentId: segment.id,
    category: 'number_format',
    severity: 'major',
    description: `Number mismatch: source contains ${missing.join(', ')} not found in target`,
    suggestedFix: `Verify numbers ${missing.join(', ')} are correctly translated in the target`,
    sourceExcerpt: segment.sourceText.slice(0, 100),
    targetExcerpt: segment.targetText.slice(0, 100),
  }
}

/** Extract all number strings from text */
function extractNumbers(text: string): string[] {
  return Array.from(text.matchAll(NUMBER_REGEX), (m) => m[0])
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
