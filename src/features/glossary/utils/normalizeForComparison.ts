/**
 * Normalize text for case-insensitive comparison with Unicode case folding support.
 *
 * Handles:
 * - NFKC normalization (compatibility chars like ﬁ → fi)
 * - Locale-aware lowercasing via toLocaleLowerCase(locale)
 * - German ß → ss folding (ß.toLowerCase() stays ß, but case-insensitive
 *   comparison should treat "Straße" == "STRASSE")
 * - Turkish İ/ı handled by toLocaleLowerCase('tr') (İ→i, I→ı)
 *
 * IMPORTANT: Do NOT use before Intl.Segmenter — Thai sara am (U+0E33)
 * decomposes under NFKC, breaking ICU tokenization. Use ONLY for comparison.
 */
export function normalizeForComparison(text: string, locale?: string): string {
  // Step 1: NFKC normalize (compatibility decomposition + canonical composition)
  let result = text.normalize('NFKC')

  // Step 2: Locale-aware lowercasing
  // Turkish locale handles İ (U+0130) → i and I → ı (U+0131) correctly
  const effectiveLocale = locale ?? undefined
  result = effectiveLocale ? result.toLocaleLowerCase(effectiveLocale) : result.toLowerCase()

  // Step 3: German ß → ss folding
  // toLocaleLowerCase('de') keeps ß as ß (it's already lowercase).
  // But case-insensitive matching requires ß == ss (Unicode case folding).
  // We normalize ß → ss so "Straße" and "STRASSE" both become "strasse".
  if (!locale || locale.startsWith('de')) {
    result = result.replace(/ß/g, 'ss')
  }

  return result
}
