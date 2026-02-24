import { BUDDHIST_YEAR_OFFSET, THAI_NUMERAL_MAP, THAI_PARTICLES } from '../constants'

/**
 * Convert Thai numerals (๐-๙) to Arabic digits (0-9).
 * Bidirectional: also used by number consistency check.
 */
export function normalizeThaiNumerals(text: string): string {
  return text.replace(/[๐-๙]/g, (ch) => THAI_NUMERAL_MAP[ch] ?? ch)
}

/**
 * Strip trailing Thai politeness particles from text.
 * Loops until stable to handle compound particles like "นะครับ"
 * → strip "ครับ" → "...นะ" → strip "นะ" → done.
 *
 * Used ONLY in consistency checks to avoid false positives.
 */
export function stripThaiParticles(text: string): string {
  let result = text
  let changed = true
  while (changed) {
    changed = false
    for (const particle of THAI_PARTICLES) {
      if (result.endsWith(particle)) {
        result = result.slice(0, -particle.length).trimEnd()
        changed = true
        break // restart loop from beginning after each strip
      }
    }
  }
  return result
}

/**
 * Check if two numbers are Buddhist year equivalents.
 * Thai year = Gregorian year + 543 (bidirectional: EN→TH or TH→EN).
 * Only applies to integers — decimal/float values are not years.
 */
export function isBuddhistYearEquivalent(sourceNum: number, targetNum: number): boolean {
  if (!Number.isInteger(sourceNum) || !Number.isInteger(targetNum)) return false
  return Math.abs(targetNum - sourceNum) === BUDDHIST_YEAR_OFFSET
}
