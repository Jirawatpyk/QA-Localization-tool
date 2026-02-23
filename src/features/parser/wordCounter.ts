import { chunkText, stripMarkup } from '@/lib/language/markupStripper'
import { getSegmenter, isNoSpaceLanguage } from '@/lib/language/segmenterCache'

/**
 * Count words in text for the given locale.
 *
 * - CJK/Thai: strip markup → chunk → Intl.Segmenter with isWordLike filter
 * - Space-separated: strip markup → split on whitespace
 *
 * Returns 0 for empty strings or tag-only strings.
 */
export function countWords(text: string, locale: string): number {
  if (!text || text.trim().length === 0) return 0

  const stripped = stripMarkup(text).trim()
  if (stripped.length === 0) return 0

  if (isNoSpaceLanguage(locale)) {
    return countCjkThaiWords(stripped, locale)
  }

  return stripped.split(/\s+/).filter(Boolean).length
}

function countCjkThaiWords(stripped: string, locale: string): number {
  const segmenter = getSegmenter(locale)
  let count = 0
  for (const { chunk } of chunkText(stripped)) {
    for (const segment of segmenter.segment(chunk)) {
      if (segment.isWordLike) count++
    }
  }
  return count
}
