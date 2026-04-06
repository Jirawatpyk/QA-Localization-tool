-- Migration 0025: Canonicalize all language tag columns to lowercase + sorted.
--
-- Root cause: S-FIX-14 introduced canonical-form BCP-47 storage (RC-1..RC-6)
-- via Zod schema `.transform(canonicalizeBcp47)` on all write paths. However,
-- rows written BEFORE the refactor may hold mixed-case tags (e.g., `th-TH`,
-- `ja-JP`, `zh-Hant-CN`). The application compensates with SQL-side
-- `jsonb_agg(lower(value))` subqueries at every read site, but these:
--   1. Disable GIN index usage on `users.native_languages` (TD-LANG-001)
--   2. Force per-row subquery evaluation on every file-assignment dialog open
--   3. Add complexity and latent regression surface to 3 query sites
--
-- After this migration, ALL stored language tags are canonical (lowercase).
-- The `jsonb_agg` read-side subqueries can be removed in a follow-up commit,
-- re-enabling GIN index performance and simplifying the query code.
--
-- Idempotent: re-running on already-canonical data is a no-op (lower(x) = x).

-- 1. users.native_languages (JSONB string array, nullable)
UPDATE users SET native_languages = (
  SELECT COALESCE(
    jsonb_agg(lower(value) ORDER BY lower(value)),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(native_languages) AS value
)
WHERE native_languages IS NOT NULL
  AND native_languages != '[]'::jsonb;

-- 2. projects.source_lang (varchar, not null)
UPDATE projects SET source_lang = lower(source_lang)
WHERE source_lang != lower(source_lang);

-- 3. projects.target_langs (JSONB string array, not null)
UPDATE projects SET target_langs = (
  SELECT COALESCE(
    jsonb_agg(lower(value) ORDER BY lower(value)),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(target_langs) AS value
)
WHERE target_langs != (
  SELECT COALESCE(
    jsonb_agg(lower(value) ORDER BY lower(value)),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(target_langs) AS value
);

-- 4. segments.source_lang + target_lang (varchar, not null)
UPDATE segments SET
  source_lang = lower(source_lang),
  target_lang = lower(target_lang)
WHERE source_lang != lower(source_lang)
   OR target_lang != lower(target_lang);

-- 5. language_pair_configs.source_lang + target_lang (varchar, not null)
UPDATE language_pair_configs SET
  source_lang = lower(source_lang),
  target_lang = lower(target_lang)
WHERE source_lang != lower(source_lang)
   OR target_lang != lower(target_lang);
