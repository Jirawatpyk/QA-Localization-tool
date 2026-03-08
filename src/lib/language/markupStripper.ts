// MAX chunk size to prevent Intl.Segmenter stack overflow on very long texts
export const MAX_SEGMENTER_CHUNK = 30_000

/**
 * Zero-width characters that break substring matching (indexOf).
 * U+200B = Zero-Width Space (Thai CMS/web editors insert for line-breaking hints)
 * U+200C = Zero-Width Non-Joiner
 * U+200D = Zero-Width Joiner
 * U+FEFF = BOM / Zero-Width No-Break Space
 */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/g

/**
 * Strips zero-width characters that cause false negatives in text matching.
 * These invisible characters break indexOf substring comparison when present
 * in source text (e.g., Thai CMS content with U+200B for line-breaking hints).
 *
 * WARNING: This changes string length — positions in stripped text differ from
 * original. Only use for comparison; do NOT mix positions across stripped/unstripped text.
 */
export function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH_RE, '')
}

/**
 * Strips inline markup from text, replacing each removed character with a SPACE.
 * Equal-length replacement preserves character positions — no offset map needed.
 *
 * Strips:
 *   - XLIFF inline tags: <x id="N"/>, <g id="N">...</g>, <ph>...</ph>, <bx/>, <ex/>
 *   - HTML tags: <b>, </b>, <i>, <span class="...">, etc. (simplified: any <...>)
 *   - Common l10n placeholders: {0}, {name}, %s, %1$s, %d
 *
 * Strategy: each tag/placeholder character is replaced with a SPACE (' ').
 * This means positions in strippedText === positions in originalText.
 *
 * Example:
 *   original: "<b>การแปล</b>"
 *   stripped: "   การแปล   "   (each '<','b','>' → ' ')
 *   indexOf(stripped, 'การแปล') → 3 (same position in original)
 */
export function stripMarkup(text: string): string {
  // Replace XML/HTML tags with equal-length spaces
  // Replace {N} / {name} placeholders with equal-length spaces
  // Replace %s, %1$s, %d, etc. with equal-length spaces
  // DO NOT change any non-markup character — preserve positions exactly
  return text
    .replace(/<[^>]*>/g, (match) => ' '.repeat(match.length))
    .replace(/\{[^}]{0,50}\}/g, (match) => ' '.repeat(match.length))
    .replace(/%(\d+\$)?[sdifgpq%]/g, (match) => ' '.repeat(match.length))
}

/**
 * Splits text into chunks of ~MAX_SEGMENTER_CHUNK chars.
 * Used before Intl.Segmenter to prevent stack overflow.
 * Returns array of { chunk, offset } where offset is the start index in original text.
 *
 * Surrogate-safe: if the last char of a chunk is a high surrogate (U+D800–U+DBFF),
 * the chunk is extended by 1 to include the low surrogate, preventing split emoji
 * or supplementary CJK characters from producing invalid strings.
 */
export function chunkText(text: string): Array<{ chunk: string; offset: number }> {
  if (text.length <= MAX_SEGMENTER_CHUNK) return [{ chunk: text, offset: 0 }]
  const result: Array<{ chunk: string; offset: number }> = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + MAX_SEGMENTER_CHUNK, text.length)
    // Avoid splitting surrogate pairs: if last char is a high surrogate, include its pair
    if (end < text.length) {
      const charCode = text.charCodeAt(end - 1)
      if (charCode >= 0xd800 && charCode <= 0xdbff) {
        end += 1
      }
    }
    result.push({ chunk: text.slice(i, end), offset: i })
    i = end
  }
  return result
}
