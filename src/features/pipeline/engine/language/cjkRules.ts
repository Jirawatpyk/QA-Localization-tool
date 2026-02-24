import { FULLWIDTH_PUNCTUATION_MAP } from '../constants'

/**
 * Map a fullwidth CJK punctuation character to its halfwidth equivalent.
 * Returns the original character if no mapping exists.
 */
export function normalizeFullwidthPunctuation(char: string): string {
  return FULLWIDTH_PUNCTUATION_MAP[char] ?? char
}

/**
 * Check if two punctuation characters are fullwidth ↔ halfwidth equivalents.
 * e.g., '。' === '.', '！' === '!', '？' === '?'
 */
export function isFullwidthEquivalent(source: string, target: string): boolean {
  if (source === target) return true
  const normalizedSource = normalizeFullwidthPunctuation(source)
  const normalizedTarget = normalizeFullwidthPunctuation(target)
  return normalizedSource === normalizedTarget
}

/**
 * Apply NFKC normalization for text comparison.
 * CRITICAL: Do NOT use before Intl.Segmenter — Thai sara am U+0E33 decomposes,
 * breaking ICU tokenization. Use ONLY for text comparison operations.
 */
export function applyCjkNfkcNormalization(text: string): string {
  return text.normalize('NFKC')
}
