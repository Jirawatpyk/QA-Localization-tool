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

  // NOTE: NFKC normalization is intentionally NOT applied here.
  // Thai sara am (ำ = U+0E33) canonically decomposes under NFKC to nikhahit + sara aa
  // (U+0E4D + U+0E32). This breaks Intl.Segmenter tokenization for Thai, changing token
  // counts unpredictably. NFKC normalization is applied in text-comparison contexts
  // (glossary matching, finding comparison) where it is safe. Word counting must operate
  // on the original codepoints as the Intl.Segmenter ICU data expects them.
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
