import 'server-only'

/**
 * Determine if a reviewer is non-native for a given target language.
 *
 * Compares the user's native_languages (BCP-47 array from profile) against
 * the file's target language. Uses primary subtag matching (e.g., 'th' matches 'th-TH').
 *
 * Exception: Chinese script subtag matters — zh-Hans ≠ zh-Hant (Guardrail #66/D4).
 *
 * Empty native_languages = non-native for ALL languages (conservative default).
 *
 * @returns true if reviewer is non-native for the target language
 *
 * TD-DATA-001: Replaces hardcoded `reviewerIsNative: false` across all review actions.
 * Story 5.2a will wire this into every action that writes to feedback_events.
 */
export function determineNonNative(userNativeLanguages: string[], targetLanguage: string): boolean {
  if (userNativeLanguages.length === 0) return true

  const targetPrimary = extractPrimarySubtag(targetLanguage)
  const targetScript = extractScriptSubtag(targetLanguage)

  return !userNativeLanguages.some((nativeLang) => {
    const nativePrimary = extractPrimarySubtag(nativeLang)

    // Chinese: script subtag matters (zh-Hans ≠ zh-Hant)
    if (nativePrimary === 'zh' && targetPrimary === 'zh') {
      const nativeScript = extractScriptSubtag(nativeLang)
      // If both have script subtag, they must match
      if (nativeScript && targetScript) {
        return nativeScript === targetScript
      }
      // If either lacks script, match on primary only (permissive)
      return true
    }

    // All other languages: match on primary subtag only
    return nativePrimary === targetPrimary
  })
}

/** Extract primary subtag from BCP-47 (e.g., 'th' from 'th-TH') */
function extractPrimarySubtag(bcp47: string): string {
  return bcp47.split('-')[0]!.toLowerCase()
}

/** Extract script subtag from BCP-47 (e.g., 'Hans' from 'zh-Hans-CN') */
function extractScriptSubtag(bcp47: string): string | undefined {
  const parts = bcp47.split('-')
  // Script subtag is 4 chars, appears after primary (e.g., zh-Hans, zh-Hant)
  const script = parts.find((p, i) => i > 0 && p.length === 4)
  return script?.toLowerCase()
}
