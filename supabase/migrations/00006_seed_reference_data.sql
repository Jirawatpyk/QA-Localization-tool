-- Seed: Default severity_configs (system-level, tenant_id = NULL)
-- Per Architecture Decision 3.6: MQM penalty weights
INSERT INTO severity_configs (id, tenant_id, severity, penalty_weight, created_at)
VALUES
  (gen_random_uuid(), NULL, 'critical', 25.0, now()),
  (gen_random_uuid(), NULL, 'major', 5.0, now()),
  (gen_random_uuid(), NULL, 'minor', 1.0, now())
ON CONFLICT DO NOTHING;

-- Seed: Default taxonomy_definitions (MQM standard categories)
-- Top-level MQM categories per ISO 21999
INSERT INTO taxonomy_definitions (id, category, parent_category, description, is_custom, created_at)
VALUES
  (gen_random_uuid(), 'Accuracy', NULL, 'Translation does not accurately represent the source text', false, now()),
  (gen_random_uuid(), 'Fluency', NULL, 'Translation has issues with target language fluency', false, now()),
  (gen_random_uuid(), 'Terminology', NULL, 'Incorrect or inconsistent terminology usage', false, now()),
  (gen_random_uuid(), 'Style', NULL, 'Translation does not follow style guidelines', false, now()),
  (gen_random_uuid(), 'Design', NULL, 'Issues with text formatting, markup, or layout', false, now()),
  (gen_random_uuid(), 'Locale Convention', NULL, 'Issues with locale-specific conventions', false, now()),
  (gen_random_uuid(), 'Verity', NULL, 'Issues with real-world factual accuracy', false, now()),
  -- Accuracy subcategories
  (gen_random_uuid(), 'Mistranslation', 'Accuracy', 'Content incorrectly translated', false, now()),
  (gen_random_uuid(), 'Omission', 'Accuracy', 'Content present in source but missing in target', false, now()),
  (gen_random_uuid(), 'Addition', 'Accuracy', 'Content in target not present in source', false, now()),
  (gen_random_uuid(), 'Untranslated', 'Accuracy', 'Source text left untranslated', false, now()),
  (gen_random_uuid(), 'Over-translation', 'Accuracy', 'Translation adds unwarranted specificity', false, now()),
  (gen_random_uuid(), 'Under-translation', 'Accuracy', 'Translation loses specificity of the source', false, now()),
  -- Fluency subcategories
  (gen_random_uuid(), 'Grammar', 'Fluency', 'Grammatical errors in target text', false, now()),
  (gen_random_uuid(), 'Spelling', 'Fluency', 'Spelling errors in target text', false, now()),
  (gen_random_uuid(), 'Punctuation', 'Fluency', 'Punctuation errors in target text', false, now()),
  (gen_random_uuid(), 'Typography', 'Fluency', 'Typographic errors (wrong characters, encoding)', false, now()),
  (gen_random_uuid(), 'Register', 'Fluency', 'Wrong level of formality', false, now()),
  -- Terminology subcategories
  (gen_random_uuid(), 'Inconsistent with glossary', 'Terminology', 'Term does not match glossary entry', false, now()),
  (gen_random_uuid(), 'Inconsistent use of terminology', 'Terminology', 'Same term translated differently in context', false, now()),
  -- Style subcategories
  (gen_random_uuid(), 'Awkward', 'Style', 'Translation is grammatically correct but sounds unnatural', false, now()),
  (gen_random_uuid(), 'Company style', 'Style', 'Does not follow company style guide', false, now()),
  (gen_random_uuid(), 'Inconsistent style', 'Style', 'Style varies within the same document', false, now()),
  -- Design subcategories
  (gen_random_uuid(), 'Tag issues', 'Design', 'Inline markup or tags are incorrect', false, now()),
  (gen_random_uuid(), 'Truncation/overlap', 'Design', 'Text does not fit allocated space', false, now()),
  (gen_random_uuid(), 'Character encoding', 'Design', 'Incorrect character encoding or mojibake', false, now()),
  -- Locale Convention subcategories
  (gen_random_uuid(), 'Number format', 'Locale Convention', 'Number formatting does not match locale', false, now()),
  (gen_random_uuid(), 'Date format', 'Locale Convention', 'Date formatting does not match locale', false, now()),
  (gen_random_uuid(), 'Currency format', 'Locale Convention', 'Currency formatting does not match locale', false, now()),
  (gen_random_uuid(), 'Measurement format', 'Locale Convention', 'Measurement units not localized', false, now())
ON CONFLICT DO NOTHING;

-- NOTE: language_pair_configs are tenant-scoped (require tenant_id FK).
-- Default configs are seeded per-tenant at tenant creation time in:
--   src/features/admin/actions/setupNewUser.action.ts
-- Provisional thresholds per Architecture Decision 3.6:
--   EN→TH: 93, EN→JA: 93, EN→KO: 94, EN→ZH-CN: 94, default: 95
