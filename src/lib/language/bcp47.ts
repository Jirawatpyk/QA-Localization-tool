import { z } from 'zod'

/**
 * Project-wide BCP-47 language tag utilities.
 *
 * **Canonical form contract**: all language tags that cross a module boundary
 * (DB, API, UI state comparison) MUST be in canonical form — lowercased, deduped,
 * sorted. Any write to `users.nativeLanguages`, `projects.sourceLang`,
 * `projects.targetLangs`, `segments.sourceLang`, `segments.targetLang`,
 * `languagePairConfigs.sourceLang`, or `languagePairConfigs.targetLang` MUST go
 * through `canonicalizeBcp47()` / `canonicalizeLanguages()` first.
 *
 * **Why this exists**: The S-FIX-14 story uncovered a class of rolling bugs
 * (R1→R4 CRs) where case-sensitive comparison vs canonical storage broke in
 * different modules each round. Each patch fixed one call site; a shared helper
 * + schema-level `.transform()` enforcement is the only way to prevent the next
 * occurrence.
 *
 * **Zod schemas SHOULD `.transform()` using these helpers** so that validation
 * automatically normalizes — no caller can accidentally skip canonicalization.
 */

/**
 * Canonicalize a single BCP-47 tag for comparison / storage.
 *
 * - Trims whitespace
 * - Lowercases the entire tag (RFC 5646 tags are case-insensitive for
 *   comparison; canonical casing for display preserves script/region casing,
 *   but we use lowercase throughout for stable positional compare).
 * - **Null-safe**: returns `''` for `null`/`undefined`/non-string input so
 *   boundaries that pass untyped values (DB JSONB, XLIFF headers, URL params)
 *   never throw at runtime. TypeScript still requires `string` input; this
 *   guard exists because type contracts can be violated by external data.
 *
 * Use before string-compare, JSONB `@>`, `.includes()`, `Set` membership.
 */
export function canonicalizeBcp47(tag: string | null | undefined): string {
  if (typeof tag !== 'string') return ''
  return tag.trim().toLowerCase()
}

/**
 * **Deprecated alias** for {@link canonicalizeBcp47}. Retained for backwards
 * compatibility with existing R1–R4 call sites that imported `normalizeBcp47`
 * from `@/features/admin/validation/userSchemas`.
 */
export const normalizeBcp47 = canonicalizeBcp47

/**
 * Canonicalize an array of BCP-47 tags for deterministic storage.
 *
 * Produces a reproducible representation: each tag lowercased via
 * {@link canonicalizeBcp47}, deduplicated, then sorted lexicographically.
 *
 * **All writes to `jsonb` language arrays MUST go through this helper** so the
 * JSONB positional compare in `IS NOT DISTINCT FROM` (used by the admin
 * optimistic-lock) agrees with the JS normalized set compare. Without a
 * canonical form on disk the two compares disagree on reorder/case, which
 * caused the R2→R3 CONFLICT-loop bug.
 */
export function canonicalizeLanguages(langs: readonly (string | null | undefined)[]): string[] {
  const normalized = langs.map(canonicalizeBcp47).filter((tag) => tag.length > 0)
  const unique = Array.from(new Set(normalized))
  return unique.sort()
}

/**
 * Set equality under canonicalization. Inputs may be in any order or casing;
 * returns true iff they represent the same set of BCP-47 tags.
 *
 * Used by the admin optimistic-lock compare BEFORE the SQL round-trip as a
 * fast early-out — the atomic conditional UPDATE is the authoritative check.
 */
export function languageSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const normalizedA = new Set(a.map(canonicalizeBcp47))
  if (normalizedA.size !== a.length) return false // internal duplicates → not a set
  for (const lang of b) {
    if (!normalizedA.has(canonicalizeBcp47(lang))) return false
  }
  return true
}

/**
 * **Single source of truth Zod schema for a BCP-47 tag.**
 *
 * Validates shape, then `.transform()` canonicalizes to lowercase. All schemas
 * that accept a language tag field should import this instead of defining a
 * local regex — otherwise the rolling-bug pattern (different validators in
 * different files) reappears.
 *
 * Accepts: `"th"`, `"th-TH"`, `"zh-Hant-CN"`, `"zh-hant-TW"`, `"es-419"`, `"yue"`, `"en-US"`.
 * Format: 2–3 letter primary subtag + optional subtags (2–8 alphanumerics each) separated by `-`.
 * Rejects: empty, single-letter primary, trailing `-`, all-digit primary.
 *
 * Output is ALWAYS in canonical form (lowercased) — downstream code cannot
 * observe the original casing.
 */
export const bcp47LanguageSchema = z
  .string()
  .min(2, 'Language tag too short')
  .max(35, 'Language tag too long')
  .regex(
    /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/,
    'Language must be a valid BCP-47 tag (e.g., "th", "th-TH", "zh-Hant-CN")',
  )
  .transform(canonicalizeBcp47)

/**
 * Array of BCP-47 tags with:
 * - `max` clamp (default 20, override per call site)
 * - case-insensitive uniqueness refinement (Guardrail #24)
 * - final array-level canonicalization (sort + dedupe as defence in depth)
 *
 * Output is ALWAYS canonical (each tag lowercased, array sorted, deduped).
 */
export function bcp47LanguageArraySchema(options: { max?: number } = {}) {
  const max = options.max ?? 20
  return z
    .array(bcp47LanguageSchema)
    .max(max, `Maximum ${max} languages`)
    .refine((langs) => new Set(langs).size === langs.length, {
      message: 'Duplicate languages are not allowed',
    })
    .transform((langs) => canonicalizeLanguages(langs))
}
