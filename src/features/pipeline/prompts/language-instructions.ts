/**
 * Language-specific QA instructions for AI prompt enrichment.
 *
 * Based on L1 rule engine language rules (thaiRules.ts, cjkRules.ts)
 * and common localization QA patterns per language family.
 *
 * These instructions tell the AI WHAT to look for beyond what L1 checks catch.
 * L1 handles deterministic checks (numbers, tags, placeholders).
 * These instructions guide AI on semantic/stylistic language-specific issues.
 */

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  // ── Thai ──
  th: `### Thai Language-Specific Instructions
- Check Thai numeral (๐-๙) vs Arabic numeral (0-9) consistency — follow source document style
- Verify politeness particles (ค่ะ/ครับ/นะคะ/นะครับ) match the formality register of the source
- Watch for missing/extra spaces around parentheses, brackets, and quotation marks
- Buddhist calendar year (พ.ศ.) = Gregorian + 543 — verify year conversions if present
- Thai has no spaces between words — check that inserted spaces don't break compound words
- Verify royal/honorific language (ราชาศัพท์) is used correctly for formal/government content
- Check for common mistranslations: "should" ≠ always "ควร", context matters`,

  // ── Chinese (Simplified) ──
  'zh-CN': `### Chinese (Simplified) Language-Specific Instructions
- Verify fullwidth punctuation is used (，。！？；：) not halfwidth (, . ! ? ; :)
- Check measure words (量词) — using wrong measure word is a major fluency error
- Verify no Traditional Chinese characters (繁體字) are mixed with Simplified
- Check that translated text doesn't break 4-character idiom patterns (成语) if used
- Number formatting: Chinese uses 万 (10K) and 亿 (100M) groupings
- Verify correct use of "的/地/得" — extremely common grammatical error`,

  // ── Chinese (Traditional) ──
  'zh-TW': `### Chinese (Traditional) Language-Specific Instructions
- Verify fullwidth punctuation (，。！？；：) is used consistently
- Check that no Simplified Chinese characters are mixed in
- Taiwan-specific terminology may differ from HK Traditional Chinese
- Number formatting follows Chinese conventions (萬/億)
- Verify correct use of "的/地/得" particles`,

  // ── Japanese ──
  ja: `### Japanese Language-Specific Instructions
- Verify correct use of カタカナ for loanwords and foreign terms
- Check です/ます form consistency throughout the document — mixing is a style error
- Verify honorific level (敬語) is consistent with source formality
- Fullwidth punctuation required (。、！？) — halfwidth is an error
- Long vowel marks (ー) in katakana — verify they match standard spelling
- Check for common issues: は vs が particle choice, 漢字 vs ひらがな balance`,

  // ── Korean ──
  ko: `### Korean Language-Specific Instructions
- Verify 존댓말 (formal) vs 반말 (informal) consistency matches source register
- Check proper spacing between words (Korean has specific spacing rules)
- Verify Hangul-only — no mixing with Hanja unless source explicitly uses it
- Check number formatting: Korean uses 만 (10K) and 억 (100M) groupings
- Verify correct particle usage (은/는, 이/가, 을/를) — context-dependent`,

  // ── German ──
  de: `### German Language-Specific Instructions
- Verify formal "Sie" vs informal "du" consistency matches source formality
- Check compound noun formation — German compounds are written as one word
- Verify grammatical gender (der/die/das) correctness
- Number formatting: decimal comma (3,14), thousand period (1.000)
- Date format: DD.MM.YYYY (not MM/DD/YYYY)`,

  // ── French ──
  fr: `### French Language-Specific Instructions
- Verify formal "vous" vs informal "tu" consistency matches source
- Non-breaking space before : ; ! ? (French typographic convention)
- Check accent marks accuracy (é, è, ê, ë, à, â, ù, û, ç, ï, ô)
- Number formatting: decimal comma (3,14), space as thousand separator (1 000)
- Verify gender agreement (adjectives, past participles)`,

  // ── Spanish ──
  es: `### Spanish Language-Specific Instructions
- Verify formal "usted" vs informal "tú" consistency
- Check inverted punctuation (¡...! and ¿...?) for questions and exclamations
- Verify accent marks (á, é, í, ó, ú, ñ, ü)
- Number formatting: decimal comma (3,14), period as thousand separator (1.000)
- Latin American vs European Spanish terminology differences if applicable`,

  // ── Portuguese ──
  pt: `### Portuguese Language-Specific Instructions
- Verify Brazilian (PT-BR) vs European (PT-PT) Portuguese — terminology differs significantly
- Check accent marks (á, â, ã, à, é, ê, í, ó, ô, õ, ú, ç)
- Formal "você/o senhor" vs informal "tu" register matching
- Number formatting: decimal comma (3,14), period as thousand separator (1.000)`,
}

/**
 * Get language-specific QA instructions for a target language.
 *
 * Matches by exact BCP-47 code first, then by primary language subtag.
 * Returns empty string if no specific instructions exist for the language.
 *
 * @param targetLang - BCP-47 language code (e.g., 'th', 'zh-CN', 'ja')
 */
export function getLanguageInstructions(targetLang: string): string {
  // Try exact match first (e.g., 'zh-CN')
  const exactMatch = LANGUAGE_INSTRUCTIONS[targetLang]
  if (exactMatch) return exactMatch

  // Try primary subtag (e.g., 'zh-CN' → 'zh' — no match, but 'th-TH' → 'th')
  const primary = targetLang.split('-')[0]
  if (primary) {
    const primaryMatch = LANGUAGE_INSTRUCTIONS[primary]
    if (primaryMatch) return primaryMatch
  }

  return ''
}

/**
 * List all supported language codes for testing.
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_INSTRUCTIONS)
}
