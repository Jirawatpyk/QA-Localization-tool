// MAX chunk size to prevent Intl.Segmenter stack overflow on very long texts
export const MAX_SEGMENTER_CHUNK = 30_000

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
 * Splits text into chunks of MAX_SEGMENTER_CHUNK chars.
 * Used before Intl.Segmenter to prevent stack overflow.
 * Returns array of { chunk, offset } where offset is the start index in original text.
 */
export function chunkText(text: string): Array<{ chunk: string; offset: number }> {
  if (text.length <= MAX_SEGMENTER_CHUNK) return [{ chunk: text, offset: 0 }]
  const result: Array<{ chunk: string; offset: number }> = []
  for (let i = 0; i < text.length; i += MAX_SEGMENTER_CHUNK) {
    result.push({ chunk: text.slice(i, i + MAX_SEGMENTER_CHUNK), offset: i })
  }
  return result
}
