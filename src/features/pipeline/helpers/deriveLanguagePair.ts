/**
 * Derive language pair string from segment rows.
 * Returns "sourceLang→targetLang" (e.g. "en-US→th") or null if unavailable.
 *
 * Shared by runL2ForFile and runL3ForFile.
 */
export function deriveLanguagePair(
  segmentRows: ReadonlyArray<{ sourceLang: string; targetLang: string }>,
): string | null {
  if (segmentRows.length === 0) return null
  const first = segmentRows[0]!
  if (!first.sourceLang || !first.targetLang) return null
  return `${first.sourceLang}→${first.targetLang}`
}
