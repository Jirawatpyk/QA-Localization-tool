# Story 2.4: Rule-based QA Engine & Language Rules

Status: ready-for-dev

<!-- Validated: 2026-02-24 — validate-create-story applied 23 improvements (8C + 7E + 4O + 4L) -->

## Story

As a QA Reviewer,
I want rule-based QA checks that catch everything Xbench catches,
so that I can trust this tool to replace Xbench with 100% parity.

## Acceptance Criteria

1. **Given** a file has been parsed into segments
   **When** the rule-based engine (Layer 1) processes the segments
   **Then** the following 17 check types are executed (12 MVP + 5 Bonus):

   **Content Checks (2):**
   - **Untranslated segments:** Empty target detected — severity: Critical, category: `completeness`
   - **Target identical to source:** Target === Source (with language-pair exceptions for proper nouns, numbers-only, brand names) — severity: Major, category: `completeness`

   **Formal/Structural Checks (8):**
   - **Tag integrity:** Missing, extra, or misordered inline tags between source and target — severity: Critical (missing/extra), Minor (order), category: `tag_integrity`
   - **Number consistency:** Numbers in source must appear in target (locale formatting: `1,000.00` vs `1.000,00`, Thai numerals ๐-๙) — severity: Major, category: `number_format`
   - **Placeholder consistency:** Placeholders (`{0}`, `%s`, `%d`, `{{var}}`, `%@`, `${name}`) in source must appear in target — severity: Critical, category: `placeholder_integrity`
   - **Double spaces:** Multiple consecutive spaces in target — severity: Minor, category: `spacing`
   - **Leading/trailing spaces:** Mismatch between source and target leading/trailing whitespace — severity: Minor, category: `spacing`
   - **Unpaired quotes/brackets (Bonus):** Unbalanced `""`, `''`, `()`, `[]`, `{}`, `「」`, `【】` — severity: Minor, category: `punctuation`
   - **URL mismatches (Bonus):** URLs in source not matching target — severity: Major, category: `url_integrity`
   - **End punctuation mismatch (Bonus):** Last-character punctuation differs between source and target — severity: Minor, category: `punctuation`

   **Consistency Checks (3):**
   - **Same source → different target:** Cross-segment: identical source text has different translations within file — severity: Minor, category: `consistency`
   - **Same target → different source:** Cross-segment: identical target text from different source texts — severity: Minor, category: `consistency`
   - **Key term inconsistency:** Cross-segment term usage tracking (glossary terms used inconsistently) — severity: Major, category: `consistency`

   **Terminology Checks (2):**
   - **Glossary compliance:** Target text must use approved glossary terms (using glossary matching engine from Story 1.5) — severity: Major, category: `glossary_compliance`
   - **Custom checklist rules (Bonus):** Regex-based custom rules (extensible, per-project) — severity: Configurable, category: `custom_rule`

   **Capitalization Checks (2):**
   - **UPPERCASE word matching:** UPPERCASE words (2+ chars) in source must appear in target — severity: Minor, category: `capitalization`
   - **CamelCase word matching (Bonus):** CamelCase words in source must appear in target — severity: Minor, category: `capitalization`

   **And** segments with `confirmationState === 'ApprovedSignOff'` are SKIPPED (no QA checks applied)
   **And** processing completes within 5 seconds for 5,000 segments (NFR2)

2. **Given** the rule engine processes Thai (TH) segments
   **When** checking glossary compliance, spacing, and consistency
   **Then** Thai-specific rules apply:
   - No word-boundary regex — use Hybrid glossary matching from Story 1.5 (Intl.Segmenter boundary validation)
   - Thai numeral (๐-๙) ↔ Arabic (0-9) mapping for number consistency
   - Thai Buddhist year offset (+543) exemption for year numbers
   - Politeness particles (ครับ/ค่ะ/นะ/ไหม/เถอะ/จ้า/ค่า/ครับผม) NOT flagged as errors in consistency checks
   **And** findings DO NOT include segments with particle-only differences — verified by negative test case: `{ source: "Thank you", target: "ขอบคุณครับ", target_alt: "ขอบคุณค่ะ" }` must NOT produce a consistency finding

3. **Given** the rule engine processes Chinese (ZH) segments
   **When** checking punctuation and glossary
   **Then** fullwidth punctuation (。，！？：；「」【】) is recognized as valid (not flagged as punctuation mismatch)
   **And** Intl.Segmenter('zh') used for glossary matching boundary validation

4. **Given** the rule engine processes Japanese (JA) segments
   **When** checking scripts and glossary
   **Then** mixed scripts (hiragana/katakana/kanji) handled correctly
   **And** katakana loan words not flagged as mistranslation
   **And** Intl.Segmenter('ja') used for glossary matching boundary validation
   **And** NFKC normalization applied before text comparison (halfwidth ↔ fullwidth katakana)

5. **Given** a finding is detected by the rule engine
   **When** the finding is created
   **Then** the findings table entry includes: id, fileId, segmentId, projectId, tenantId, category, severity (critical/major/minor), sourceTextExcerpt, targetTextExcerpt, description, suggestedFix, detectedByLayer ('L1'), aiConfidence (null for rule-based), status ('pending'), segmentCount (1), reviewSessionId (null), createdAt, updatedAt
   **And** `fileId` is denormalized from the segment's file for query performance
   **And** `sourceTextExcerpt` and `targetTextExcerpt` are truncated to 500 chars max

6. **Given** a file with 5,000 segments
   **When** the rule engine runs
   **Then** it completes within 5 seconds (NFR2)

7. **Given** the rule engine is invoked via Server Action
   **When** `runRuleEngine(fileId)` is called
   **Then** segments are loaded from DB for the file
   **And** glossary terms are loaded via `getCachedGlossaryTerms()`
   **And** suppression rules are checked — suppressed categories are skipped
   **And** findings are batch-inserted into DB within a transaction
   **And** audit log records `file.l1_completed` with finding count summary
   **And** returns `ActionResult<{ findingCount: number; fileId: string; duration: number }>`

8. **Given** the Xbench Parity Specification golden test corpus is available
   **When** the rule engine is tested against the corpus
   **Then** every issue in the Xbench output is also found by the rule engine (0 misses per file)
   **And** a parity test can be generated showing side-by-side comparison
   **Golden corpus:** ✅ Available — 695 SDLXLIFF files across 8 languages, 19 Xbench reports (xlsx batch format), 19 glossary files. See `docs/test-data/golden-corpus/manifest.yaml` for complete file→report mapping and tiered testing strategy. Dev starts with Tier 1 (BT Barista Trainer EN→TH: 14 clean + 8 with-issues + 1 batch report), then Tier 2 (NCR TH: 32 files + 4 reports), then Tier 3 (NCR multi-lang: 7 languages).

## Tasks / Subtasks

- [ ] Task 1: DB Schema Migration — ALTER TABLE `findings` + Supabase migration (AC: #5)
  - [ ] 1.1 Update `src/db/schema/findings.ts` — add 3 columns: `fileId` (uuid, FK → files.id, ON DELETE CASCADE), `sourceTextExcerpt` (text, nullable), `targetTextExcerpt` (text, nullable)
  - [ ] 1.2 Run `npm run db:generate` — generates ALTER TABLE migration SQL
  - [ ] 1.2b Review Drizzle-generated SQL in `src/db/migrations/` — verify it matches the Supabase migration DDL exactly
  - [ ] 1.3 Create `supabase/migrations/00014_story_2_4_findings_columns.sql` — DDL for local Supabase (ALTER TABLE add 3 columns + index on `file_id, detected_by_layer`)
  - [ ] 1.4 Run `npm run db:migrate` — apply migration
  - [ ] 1.5 Create `buildDbFinding()` factory in `src/test/factories.ts` using `typeof findings.$inferInsert` from Drizzle schema (do NOT modify existing `buildFinding()` — it uses the `Finding` type from `src/types/finding.ts` and is used by 26+ existing tests)
  - [ ] 1.6 Verify existing findings RLS tests still pass with new columns

- [ ] Task 2: Rule Engine Types & Constants (AC: #1, #5)
  - [ ] 2.1 Create `src/features/pipeline/engine/types.ts`:
    - `Severity = 'critical' | 'major' | 'minor'`
    - `RuleCategory` — union of all L1 categories + `'spelling'` (for L3 compatibility — L1 won't produce it but L3 writes to the same findings table)
    - `RuleCheckResult` — segmentId, category, severity, description, suggestedFix, sourceExcerpt, targetExcerpt
    - `SegmentCheckContext` — sourceLang, targetLang (BCP-47)
    - `FileCheckContext` — segments (`typeof segments.$inferSelect[]`), glossaryTerms (`InferSelectModel<typeof glossaryTerms>[]`), targetLang
    - Import `segments` from `@/db/schema/segments`, `glossaryTerms` from `@/db/schema/glossaryTerms`
  - [ ] 2.2 Create `src/features/pipeline/engine/constants.ts` — `RULE_CATEGORIES`, `MAX_EXCERPT_LENGTH = 500`, `FINDING_BATCH_SIZE = 100`, severity defaults per check type, `PLACEHOLDER_PATTERNS` regex array, `URL_REGEX`, `THAI_PARTICLES` set, `THAI_NUMERAL_MAP`, `FULLWIDTH_PUNCTUATION_MAP`, `BUDDHIST_YEAR_OFFSET = 543`
  - [ ] 2.3 Unit tests for constants and type guards — **8 tests**

- [ ] Task 3: Content Checks — Untranslated + Target=Source (AC: #1)
  - [ ] 3.1 Create `src/features/pipeline/engine/checks/contentChecks.ts` — `checkUntranslated(segment, ctx)`, `checkTargetIdenticalToSource(segment, ctx)`. Both take `(segment: SegmentRecord, ctx: SegmentCheckContext)`.
  - [ ] 3.2 Target=Source exceptions: numbers-only segments (regex `^[\d\s.,]+$`), single-word proper nouns (uppercase first letter, < 30 chars), known brand patterns. Use NFKC normalization before comparison for CJK.
  - [ ] 3.3 Unit tests — **20 tests** (empty target, whitespace-only target, source=target exact, source=target with case diff, numbers-only exception, brand name exception, CJK identical, Thai identical, normal mismatch, edge cases)

- [ ] Task 4: Tag Integrity Check (AC: #1)
  - [ ] 4.1 Create `src/features/pipeline/engine/checks/tagChecks.ts` — `checkTagIntegrity(segment, ctx): RuleCheckResult[]`. Import `InlineTag` from `@/features/parser/types`.
  - [ ] 4.2 Compare `segment.inlineTags` (jsonb from parser): count source vs target tags by type+id, detect missing/extra (Critical) and reordered (Minor)
  - [ ] 4.3 Handle null `inlineTags` (Excel segments) — skip check, return empty
  - [ ] 4.4 Unit tests — **20 tests** (matching tags, missing tag, extra tag, reordered tags, nested tags, null inlineTags, empty arrays, multiple missing, mixed severity findings)

- [ ] Task 5: Number & Placeholder Checks (AC: #1, #2, #3, #4)
  - [ ] 5.1 Create `src/features/pipeline/engine/checks/numberChecks.ts` — `checkNumberConsistency(segment, ctx): RuleCheckResult | null`. Uses `ctx.targetLang` for Thai numeral mapping.
  - [ ] 5.2 Number extraction regex: handle `1,000.00`, `1.000,00`, negative numbers, percentages, decimals. Thai numeral (๐-๙) ↔ Arabic (0-9) bidirectional mapping. Buddhist year offset (+543) exemption: if source has year N and target has N+543, do NOT flag.
  - [ ] 5.3 Create `src/features/pipeline/engine/checks/placeholderChecks.ts` — `checkPlaceholderConsistency(segment, ctx): RuleCheckResult | null`
  - [ ] 5.4 Placeholder patterns: `{0}`, `{1}`, `%s`, `%d`, `%f`, `%@`, `{{varName}}`, `${name}`, `%1$s`, `%2$d`. Extract from both source and target, compare as sets.
  - [ ] 5.5 Unit tests — **30 tests** (numbers 15: locale formats, Thai numerals, Buddhist year, phone numbers, missing number, extra number, percentage. Placeholders 15: each pattern type, mixed patterns, missing placeholder, extra placeholder, correct match)

- [ ] Task 6: Formatting Checks — Spacing, Punctuation, URLs (AC: #1, #3)
  - [ ] 6.1 Create `src/features/pipeline/engine/checks/formattingChecks.ts` — all functions take `(segment, ctx)`: `checkDoubleSpaces()`, `checkLeadingTrailingSpaces()`, `checkUnpairedBrackets()`, `checkUrlMismatches()`, `checkEndPunctuation()`
  - [ ] 6.2 Double spaces: regex `/ {2,}/` on target text only
  - [ ] 6.3 Leading/trailing: compare `source.match(/^\s+/)` vs `target.match(/^\s+/)` and trailing similarly. Mismatch = finding.
  - [ ] 6.4 Unpaired brackets: check balanced pairs for `""`, `''`, `()`, `[]`, `{}`, `「」`, `【】`. For CJK targets, include fullwidth variants. (Scope aligned to Xbench Parity Spec check #8 + AC #1)
  - [ ] 6.5 URL extraction: regex for http(s) URLs. Compare source URL set vs target URL set.
  - [ ] 6.6 End punctuation: compare last non-whitespace character. Skip if both are alphanumeric. Map CJK fullwidth terminal punctuation (。！？) as equivalent to halfwidth (.!?).
  - [ ] 6.7 Unit tests — **35 tests** (double spaces x4, leading/trailing x6, brackets x12 covering all pair types + CJK, URLs x5, end punctuation x8 incl. CJK equivalences)

- [ ] Task 7: Consistency Checks — S→T, T→S, Key Terms (AC: #1, #2)
  - [ ] 7.1 Create `src/features/pipeline/engine/checks/consistencyChecks.ts` — `checkSameSourceDiffTarget(ctx: FileCheckContext)`, `checkSameTargetDiffSource(ctx)`, `checkKeyTermConsistency(ctx)`
  - [ ] 7.2 Same Source → Different Target: build `Map<normalizedSource, Set<normalizedTarget>>`. If a source maps to 2+ different targets, create finding for each variant after the first. NFKC-normalize before comparison.
  - [ ] 7.3 Same Target → Different Source: reverse of 7.2.
  - [ ] 7.4 Key term inconsistency: for each glossary term that appears in multiple source segments, verify the same translation is used consistently across target segments.
  - [ ] 7.5 Thai particle exemption: before consistency comparison, strip trailing particles using `stripThaiParticles()` from `thaiRules.ts`. Loop until stable to handle compound particles (e.g., "นะครับ" → strip "ครับ" → strip "นะ"). "ขอบคุณครับ" and "ขอบคุณค่ะ" normalize to "ขอบคุณ" — no consistency finding.
  - [ ] 7.6 Unit tests — **30 tests** (S→T: same source 2 targets, 3+ targets, single occurrence no finding, case-sensitive, NFKC normalized. T→S: reverse cases. Key terms: consistent usage, inconsistent usage, no glossary terms. Thai particles: particle-only difference no finding, compound particle "นะครับ" no finding, real difference with particle = finding)

- [ ] Task 8: Glossary Compliance + Custom Rules (AC: #1, #2, #3, #4)
  - [ ] 8.1 Create `src/features/pipeline/engine/checks/glossaryChecks.ts` — `checkGlossaryComplianceRule(segment, glossaryTerms, ctx): Promise<RuleCheckResult[]>`. Calls `checkGlossaryCompliance(targetText, filteredTerms, targetLang, segmentContext)` from `@/features/glossary/matching/glossaryMatcher.ts`. **CRITICAL:** build `SegmentContext` from segment: `{ segmentId: segment.id, projectId: segment.projectId, tenantId: segment.tenantId }`. The return type `GlossaryCheckResult` has `missingTerms: string[]` (term UUIDs) — convert each to `RuleCheckResult` by looking up the term in the pre-filtered array: `description: "Glossary term '{sourceTerm}' not translated as '{targetTerm}'"`, `suggestedFix: term.targetTerm`. `lowConfidenceMatches` do NOT generate findings (boundary ambiguity, match exists).
  - [ ] 8.2 Pre-filter glossary terms: only pass terms whose `sourceTerm` appears in segment's `sourceText`. Use case-insensitive substring for pre-filter (intentionally over-inclusive — the matcher itself handles `term.caseSensitive` precisely; pre-filter is a performance optimization, never under-inclusive).
  - [ ] 8.3 Create `src/features/pipeline/engine/checks/customRuleChecks.ts` — `checkCustomRules(segment, customRules, ctx): RuleCheckResult[]`. Custom rules are stored in `suppressionRules` table with `category = 'custom_rule'` — the `pattern` field is the regex to CHECK against target text, `reason` is the finding description. These entries are NOT treated as suppressions — they are active checks loaded separately from suppression rules.
  - [ ] 8.4 Invalid regex handling: wrap `new RegExp(pattern)` in try/catch. Log warning via pino, skip rule. Do NOT crash the engine.
  - [ ] 8.5 Unit tests — **20 tests** (glossary: term found no finding, term missing = finding, multiple terms, no terms, CJK boundary, SegmentContext building, GlossaryCheckResult conversion, lowConfidenceMatches ignored. Custom rules: regex match, no match, invalid regex skip, case sensitivity, configurable severity)

- [ ] Task 9: Capitalization Checks — UPPERCASE + CamelCase (AC: #1)
  - [ ] 9.1 Create `src/features/pipeline/engine/checks/capitalizationChecks.ts` — `checkUppercaseWords(segment, ctx)`, `checkCamelCaseWords(segment, ctx)`
  - [ ] 9.2 UPPERCASE: regex `/\b[A-Z]{2,}\b/g` on source. Each match must appear in target (exact case). For Thai/CJK targets: do NOT skip entirely — only skip if target contains zero Latin characters (`/[a-zA-Z]/` test). Mixed targets like "ใช้งาน API ได้" should still check for "API".
  - [ ] 9.3 CamelCase: regex `/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g` on source. Must appear in target. Same Latin-presence check as UPPERCASE.
  - [ ] 9.4 Unit tests — **15 tests** (UPPERCASE: found in both, missing in target, multiple words, CJK target with no Latin = skip, Thai target with "API" = check. CamelCase: found, missing, multiple, edge cases like "iPhone" pattern)

- [ ] Task 10: Language-Specific Rule Adapters (AC: #2, #3, #4)
  - [ ] 10.1 Create `src/features/pipeline/engine/language/thaiRules.ts` — `normalizeThaiNumerals(text): string`, `stripThaiParticles(text): string` (loop until no further changes to handle compound particles like "นะครับ"), `isBuddhistYearEquivalent(sourceYear, targetYear): boolean`, `THAI_PARTICLES: ReadonlySet<string>`
  - [ ] 10.2 Create `src/features/pipeline/engine/language/cjkRules.ts` — `normalizeFullwidthPunctuation(char): string`, `isFullwidthEquivalent(source, target): boolean`, `applyCjkNfkcNormalization(text): string`. NFKC normalization is for text comparison ONLY — NOT before Intl.Segmenter (breaks Thai sara am U+0E33).
  - [ ] 10.3 Unit tests — **25 tests** (Thai: numeral mapping each digit, particle stripping single, particle stripping compound "นะครับ", Buddhist year calc, composite cases. CJK: fullwidth→halfwidth mapping, NFKC normalization, mixed scripts)

- [ ] Task 11: Rule Engine Orchestrator (AC: #1, #6)
  - [ ] 11.1 Create `src/features/pipeline/engine/ruleEngine.ts` — main function: `processFile(segments, glossaryTerms, suppressedCategories, customRules): Promise<RuleCheckResult[]>`. Derive `targetLang` from `segments[0]?.targetLang ?? 'und'` and `sourceLang` from `segments[0]?.sourceLang ?? 'und'` internally — callers pass segments only.
  - [ ] 11.2 Flow — **ordering is authoritative** (do NOT reorder):
    1. Filter out ApprovedSignOff segments via `SKIP_QA_STATES`
    2. Build `SegmentCheckContext` from derived `sourceLang` + `targetLang`
    3. Per-segment sync checks: content, tags, numbers, placeholders, formatting, capitalization
    4. Per-segment async glossary compliance (batch with `Promise.all()`)
    5. File-level cross-segment consistency checks (S→T, T→S, key terms)
    6. Per-segment custom rules
    7. Filter out findings with suppressed categories
    8. Truncate excerpts to `MAX_EXCERPT_LENGTH` → return combined findings
  - [ ] 11.3 Performance: sync checks in tight loop, glossary batched async. No cloning.
  - [ ] 11.4 Unit tests — **25 tests** (all checks run, ApprovedSignOff skipped, suppressed categories filtered, empty segments list, single segment, performance test with 5000 generated segments < 5s, mixed severity aggregation, null inlineTags handled). **Performance test MUST mock all I/O**: `checkGlossaryCompliance`, `writeAuditLog` — pure computation only.

- [ ] Task 12: Server Action — runRuleEngine (AC: #7)
  - [ ] 12.1 Create `src/features/pipeline/actions/runRuleEngine.action.ts` — file starts with `'use server'` + `import 'server-only'`. Function: `runRuleEngine(input: { fileId: string }): Promise<ActionResult<{ findingCount: number; fileId: string; duration: number }>>`
  - [ ] 12.2 Auth: `requireRole('qa_reviewer', 'write')`, `getCurrentUser()` → `currentUser`
  - [ ] 12.3 Load file with CAS guard: atomically verify `file.status === 'parsed'` — use `db.update(files).set({ status: 'l1_processing' }).where(and(withTenant(files.tenantId, currentUser.tenantId), eq(files.id, fileId), eq(files.status, 'parsed'))).returning()`. If 0 rows returned → file not found or already processing → return `{ success: false, code: 'CONFLICT', error: '...' }`
  - [ ] 12.4 Load segments: `db.select().from(segments).where(and(withTenant(...), eq(segments.fileId, fileId))).orderBy(segments.segmentNumber)`. Derive `targetLang = segments[0]?.targetLang ?? 'und'`.
  - [ ] 12.5 Load glossary terms: `getCachedGlossaryTerms(file.projectId, currentUser.tenantId)`
  - [ ] 12.6 Load suppression rules: `db.select().from(suppressionRules).where(and(withTenant(...), eq(isActive, true), eq(projectId, ...)))`. Split into: `suppressedCategories` (where `category !== 'custom_rule'`) and `customRules` (where `category === 'custom_rule'`).
  - [ ] 12.7 `const startTime = performance.now()` → call `processFile()` → `const duration = performance.now() - startTime`
  - [ ] 12.8 Map `RuleCheckResult[]` to findings DB inserts: `{ fileId, segmentId: result.segmentId, projectId: file.projectId, tenantId: currentUser.tenantId, category: result.category, severity: result.severity, description: result.description, suggestedFix: result.suggestedFix, sourceTextExcerpt: result.sourceExcerpt, targetTextExcerpt: result.targetExcerpt, detectedByLayer: 'L1', aiModel: null, aiConfidence: null, reviewSessionId: null, status: 'pending', segmentCount: 1 }`. Drizzle handles `createdAt` and `updatedAt` via `defaultNow()`.
  - [ ] 12.9 Batch-insert findings (100 per INSERT) within `db.transaction()` — if any batch fails, all findings roll back for clean retry
  - [ ] 12.10 Write audit log: `writeAuditLog({ tenantId: currentUser.tenantId, userId: currentUser.id, entityType: 'file', entityId: fileId, action: 'file.l1_completed', newValue: { findingCount, criticalCount, majorCount, minorCount, duration } })`
  - [ ] 12.11 Update `file.status` to `'l1_completed'` — **NOT** back to `'parsed'` (returning to `parsed` would let CAS guard allow re-run → duplicate findings). Current schema uses `varchar(20)` (not pgEnum) so new value works without DDL migration. Update schema comment in `src/db/schema/files.ts` line 21: `// 'uploaded' | 'parsing' | 'parsed' | 'l1_processing' | 'l1_completed' | 'failed'`
  - [ ] 12.12 Return `ActionResult<{ findingCount, fileId, duration }>`
  - [ ] 12.13 Unit tests — **20 tests** (auth failure, file NOT_FOUND, CAS CONFLICT on concurrent run, tenant isolation, successful run with findings, empty findings, batch insert within transaction, audit log with tenantId+userId, performance measurement, error handling with status rollback)

- [ ] Task 13: Integration Testing, Parity Verification & Regression Check (AC: all, #8)
  - [ ] 13.1 Verify all existing tests still pass — 0 regressions
  - [ ] 13.2 `npm run type-check` — 0 errors
  - [ ] 13.3 `npm run lint` — 0 errors, 0 warnings
  - [ ] 13.4 RLS tests — verify new findings columns don't break existing policies
  - [ ] 13.5 Performance benchmark: generate 5000 segments via factory, run `processFile()` with mocked I/O, verify < 5s
  - [ ] 13.6 Bootstrap data smoke test (supplementary — primary parity testing uses golden corpus in 13.7): parse a SAP XLIFF file (from `docs/test-data/sap-xliff/`) → run rule engine → verify findings are reasonable (manual spot check)
  - [ ] 13.7 **Golden Corpus Parity Testing** — tiered progression using `docs/test-data/golden-corpus/manifest.yaml`:
    - [ ] 13.7a **Xlsx Report Parser:** Create utility to read Xbench xlsx reports (e.g., using `xlsx` or `exceljs` npm package). Reports are `.xlsx` NOT `.csv`. Extract columns: filename, source, target, check_type, severity. Group findings by filename column (batch report = 1 report → N files).
    - [ ] 13.7b **Tier 1 — BT Barista Trainer (MVP):** Parse 8 with-issues SDLXLIFF through Story 2.2 parser → run rule engine → compare against `Xbench_QA_Report.xlsx`. Parse 14 clean SDLXLIFF → verify 0 findings. Target: 0 `[Xbench Only]` findings.
    - [ ] 13.7c **Tier 2 — NCR TH:** Parse 32 NCR Thai SDLXLIFF → run rule engine → compare against 4 TH reports (use Original as ground truth — matches raw SDLXLIFF files; Updated = post-fix re-scan with fewer findings; LI = byte-identical copy of Original — ignore). Target: 0 `[Xbench Only]` findings.
    - [ ] 13.7d **Tier 3 — NCR Multi-lang:** Run rule engine on ESLA, FR, IT, PL, PTBR, DE, TR files → compare against respective reports. Validates cross-language rule correctness.
    - [ ] 13.7e **Parity Report Generator:** Output `[Both Found] / [Tool Only] / [Xbench Only]` per file. Pass criteria: `[Xbench Only] = 0` for all files in each tier.
  - [ ] 13.8 **Target: ~250 new tests total** (content 20 + tags 20 + numbers 15 + placeholders 15 + formatting 35 + consistency 30 + glossary 12 + custom rules 8 + capitalization 15 + language 25 + orchestrator 25 + action 20 + types 8 + misc 2)

## Dev Notes

### Golden Corpus — Key Facts for Dev

15. **Xbench reports are xlsx format (NOT CSV):** All 19 Xbench reports in the golden corpus are `.xlsx` files. Dev needs an xlsx parser (e.g., `xlsx` or `exceljs` npm package) to read them for parity testing. This is a **test-time** dependency only — not required in production rule engine code.

16. **Batch report format — group by filename column:** Each Xbench report covers multiple SDLXLIFF files (1 report → N files). The report contains a filename column — Dev must group findings by this column before comparing against tool output per file.

17. **Report authority rules (when multiple reports exist for same files):**
    - Original > `Updated_*` (Original matches the raw SDLXLIFF files in corpus — use as ground truth)
    - `Updated_*` = post-fix re-scan (translator fixed issues between scans → fewer findings). Use for post-fix verification only.
    - `LI/` copies are byte-identical to Original — ignore duplicates
    - `From-translator` reports = informational only, NOT authoritative
    - For automated parity testing: use the report marked `authority: primary` in manifest.yaml
    - Analysis basis: TH Original=115 findings vs Updated=95 (20 resolved); ESLA Original=163 vs Updated=151 (12 resolved)

18. **Tiered testing progression:** Tier 1 (BT EN→TH: 14 clean + 8 with-issues + 1 report) → Tier 2 (NCR TH: 32 files + 4 reports) → Tier 3 (NCR multi-lang: 7 languages). Start with Tier 1, do NOT jump ahead.

19. **Reference:** `docs/test-data/golden-corpus/manifest.yaml` — complete file→report mapping, tiered strategy, glossary file listing, and dev quick-start guide.

20. **Testing strategy — Pragmatic TDD (3 levels):**
    **"Red = test ต้อง FAIL ด้วยเหตุผลที่ถูกต้อง"** — function not found หรือ assertion failed เพราะ logic ยังไม่มี ไม่ใช่ fail เพราะ syntax error หรือ import ผิด
    - **Level 1 — TDD (write tests BEFORE code):** Tasks 3, 5, 10, 7, 8-glossary — pure functions with complex language logic or type conversion. Well-defined inputs/outputs + critical negative test cases. Write failing tests first (Red), implement to pass (Green), then refactor.
      - Task 3: Content Checks (20 tests) — start here, simple, builds TDD rhythm
      - Task 5: Number + Placeholder (30 tests) — Thai numerals, Buddhist year offset
      - Task 10: Language Rules (25 tests) — Thai particle stripping, CJK NFKC — **do before Task 7** (Task 7 depends on `stripThaiParticles()`)
      - Task 7: Consistency Checks (30 tests) — negative tests critical (particle-only diff must NOT flag)
      - Task 8 glossary part (12 tests) — GlossaryCheckResult→RuleCheckResult[] type conversion is P0 risk; `lowConfidenceMatches` must NOT generate findings (negative test)
    - **Level 2 — Code + Test alongside:** Tasks 4, 6, 8-custom-rules, 9 — straightforward checks, write code and tests in parallel.
      - Task 4: Tag Checks (20 tests) — need to understand inlineTags JSONB structure first
      - Task 6: Formatting (35 tests) — many small functions, test as you go
      - Task 8 custom rules part (8 tests) — simple regex matching, low risk
      - Task 9: Capitalization (15 tests) — simple regex + Latin-presence check
    - **Level 3 — Test after code:** Tasks 11, 12, 13 — integration code that depends on all checks being implemented first.
      - Task 11: Orchestrator (25 tests) — needs all check functions to exist
      - Task 12: Server Action (20 tests) — integration with DB, auth, audit
      - Task 13: Parity Testing — golden corpus comparison (integration, not unit)

### Key Gotchas — Read Before Starting

1. **Rule engine is PURE FUNCTIONS, NOT a Route Handler**: The engine at `src/features/pipeline/engine/` is a collection of pure functions. The Server Action (`runRuleEngine.action.ts`) is the entry point with `'use server'` + `import 'server-only'`. Story 2.6 (Inngest) will call the pure `processFile()` function directly — NOT through the Server Action. Design the engine to be framework-agnostic.

2. **`findings` table NEEDS ALTER TABLE — 3 new columns**: The existing schema at `src/db/schema/findings.ts` is MISSING: `fileId`, `sourceTextExcerpt`, `targetTextExcerpt`. Add via ALTER TABLE migration BEFORE any other task. Create matching Supabase migration `00014_story_2_4_findings_columns.sql`. Verify Drizzle-generated SQL matches. [Source: src/db/schema/findings.ts]

3. **`Finding` type vs DB schema MISMATCH — create `buildDbFinding()` factory**: `src/types/finding.ts` has `source: string` and `sessionId: string` while DB uses `detectedByLayer` and `reviewSessionId`. For DB inserts use `typeof findings.$inferInsert` from Drizzle. Do NOT modify existing `buildFinding()` (used by 26+ tests). Create a NEW `buildDbFinding()` factory using the Drizzle insert type.

4. **Glossary matcher requires `SegmentContext` — build it from segment**: `checkGlossaryCompliance(targetText, terms, targetLang, ctx)` requires a 4th parameter `SegmentContext = { segmentId, projectId, tenantId }`. Build from the segment record: `{ segmentId: segment.id, projectId: segment.projectId, tenantId: segment.tenantId }`. Returns `GlossaryCheckResult` (not `RuleCheckResult[]`) — convert: for each UUID in `missingTerms`, look up the term in the pre-filtered array, build `RuleCheckResult` with `description: "Glossary term '{sourceTerm}' not translated as '{targetTerm}'"`. `lowConfidenceMatches` do NOT generate findings.

5. **Pre-filter glossary terms PER SEGMENT with performance note**: Filter to terms whose `sourceTerm` appears in segment's `sourceText` (case-insensitive substring). This is intentionally over-inclusive — the real `caseSensitive` check happens inside the matcher. The pre-filter is a performance optimization to avoid O(n×m) cost.

6. **Cross-segment checks are FILE-LEVEL — build maps once**: Consistency checks process ALL non-skipped segments together. Build `Map<normalized, Set<variants>>` once, then detect. The architecture diagram ordering (step 5 = consistency AFTER step 4 = glossary) is authoritative — do NOT reorder.

7. **Thai particle stripping MUST loop until stable**: Compound particles like "นะครับ" require multiple passes. After stripping "ครับ" yielding "...นะ", re-check all particles again. Loop until no further changes. Apply ONLY in consistency checks.

8. **Buddhist year offset is ±543, bidirectional**: EN→TH: +543. TH→EN: -543. If `|targetNum - sourceNum| === 543`, do NOT flag.

9. **CJK fullwidth punctuation equivalence**: End punctuation: `。`=`.`, `！`=`!`, `？`=`?`. Brackets: `「」`=`""`, `【】`=`[]`. Do NOT flag "Hello!" vs "你好！" as mismatch.

10. **Tag integrity uses `inlineTags` JSONB from parser**: Compare tag arrays by type+id. Import `InlineTag` from `@/features/parser/types.ts` — do NOT create a new definition. For Excel segments (`inlineTags` is null), skip the check.

11. **Suppression rules vs Custom rules — dual-purpose table**: `suppressionRules` entries where `category !== 'custom_rule'` are suppressions (skip findings). Entries where `category === 'custom_rule'` are active regex checks — `pattern` is the regex to test against target, `reason` becomes the finding description. Load and split them in the Server Action.

12. **L1 findings insert fields**: `reviewSessionId: null` (populated later by reviewer), `segmentCount: 1` (default), `aiModel: null`, `aiConfidence: null`. Drizzle `defaultNow()` handles `createdAt` and `updatedAt` automatically.

13. **UPPERCASE/CamelCase — do NOT blindly skip for Thai/CJK**: Only skip if target has zero Latin characters. Mixed targets like "ใช้งาน API ได้" should still check for "API" presence.

14. **All per-segment checkers use consistent signature**: `(segment: SegmentRecord, ctx: SegmentCheckContext) → RuleCheckResult | RuleCheckResult[] | null`. Extract `targetLang`/`sourceLang` from `ctx`, never as separate parameters.

---

### Critical Architecture Patterns & Constraints

#### DB Schema: `findings` Table Update (REQUIRED — Do First)

```typescript
// src/db/schema/findings.ts — ADD these 3 columns (do NOT recreate table)

fileId: uuid('file_id').references(() => files.id, { onDelete: 'cascade' }),
// Denormalized from segment's file for query performance
// nullable initially (existing rows have null) — new findings always populate

sourceTextExcerpt: text('source_text_excerpt'),
// Truncated to 500 chars — for display in finding list without JOIN to segments

targetTextExcerpt: text('target_text_excerpt'),
// Truncated to 500 chars — same purpose
```

**Supabase migration (`00014_story_2_4_findings_columns.sql`):**
```sql
ALTER TABLE findings ADD COLUMN file_id UUID REFERENCES files(id) ON DELETE CASCADE;
ALTER TABLE findings ADD COLUMN source_text_excerpt TEXT;
ALTER TABLE findings ADD COLUMN target_text_excerpt TEXT;
CREATE INDEX idx_findings_file_layer ON findings(file_id, detected_by_layer);
```

#### Rule Engine Architecture

```
processFile(segments, glossaryTerms, suppressedCategories, customRules)
  │
  ├── 1. Filter: remove segments where confirmationState ∈ SKIP_QA_STATES
  ├── 2. Derive sourceLang/targetLang from segments[0]
  ├── 3. Build SegmentCheckContext { sourceLang, targetLang }
  │
  ├── 4. Per-segment checks (sync loop) — each takes (segment, ctx):
  │   ├── checkUntranslated()
  │   ├── checkTargetIdenticalToSource()
  │   ├── checkTagIntegrity()
  │   ├── checkNumberConsistency()
  │   ├── checkPlaceholderConsistency()
  │   ├── checkDoubleSpaces()
  │   ├── checkLeadingTrailingSpaces()
  │   ├── checkUnpairedBrackets()
  │   ├── checkUrlMismatches()
  │   ├── checkEndPunctuation()
  │   ├── checkUppercaseWords()
  │   └── checkCamelCaseWords()
  │
  ├── 5. Per-segment glossary check (async, batched via Promise.all):
  │   └── checkGlossaryComplianceRule(segment, filteredTerms, ctx)
  │       → builds SegmentContext, calls Story 1.5 matcher
  │       → converts GlossaryCheckResult.missingTerms → RuleCheckResult[]
  │
  ├── 6. File-level cross-segment consistency checks:
  │   ├── checkSameSourceDiffTarget(fileCtx)
  │   ├── checkSameTargetDiffSource(fileCtx)
  │   └── checkKeyTermConsistency(fileCtx)
  │
  ├── 7. Per-segment custom rules:
  │   └── checkCustomRules(segment, customRules, ctx)
  │
  ├── 8. Filter: remove findings with suppressed categories
  │
  └── 9. Truncate excerpts → return RuleCheckResult[]
```

#### Type Definitions

```typescript
// src/features/pipeline/engine/types.ts
import type { InferSelectModel } from 'drizzle-orm'
import type { segments } from '@/db/schema/segments'
import type { glossaryTerms } from '@/db/schema/glossaryTerms'

export type Severity = 'critical' | 'major' | 'minor'

export type RuleCategory =
  | 'completeness' | 'tag_integrity' | 'number_format'
  | 'placeholder_integrity' | 'spacing' | 'punctuation'
  | 'url_integrity' | 'consistency' | 'glossary_compliance'
  | 'custom_rule' | 'capitalization'
  | 'spelling'  // L3 only — included for findings table compatibility

export type SegmentRecord = InferSelectModel<typeof segments>
export type GlossaryTermRecord = InferSelectModel<typeof glossaryTerms>

export type RuleCheckResult = {
  segmentId: string
  category: RuleCategory
  severity: Severity
  description: string
  suggestedFix: string | null
  sourceExcerpt: string
  targetExcerpt: string
}

export type SegmentCheckContext = {
  sourceLang: string         // BCP-47
  targetLang: string
}

export type FileCheckContext = {
  segments: SegmentRecord[]
  glossaryTerms: GlossaryTermRecord[]
  targetLang: string
}
```

#### Checker Function Signature Convention

All per-segment checkers use consistent `(segment, ctx)` signature:
```typescript
export function checkXxx(
  segment: SegmentRecord,
  ctx: SegmentCheckContext,
): RuleCheckResult | RuleCheckResult[] | null
```

File-level checkers:
```typescript
export function checkXxx(
  ctx: FileCheckContext,
): RuleCheckResult[]
```

Glossary checker (async + SegmentContext):
```typescript
export async function checkGlossaryComplianceRule(
  segment: SegmentRecord,
  glossaryTerms: GlossaryTermRecord[],
  ctx: SegmentCheckContext,
): Promise<RuleCheckResult[]>
// Internally builds SegmentContext { segmentId, projectId, tenantId } from segment
// Calls checkGlossaryCompliance(targetText, filteredTerms, targetLang, segmentContext)
// Converts GlossaryCheckResult → RuleCheckResult[]
```

#### Server Action Flow

```
runRuleEngine({ fileId })
  │
  ├── 1. requireRole('qa_reviewer', 'write')
  ├── 2. getCurrentUser() → currentUser (tenantId, id)
  ├── 3. CAS guard: atomically UPDATE files SET status='l1_processing'
  │      WHERE id=fileId AND status='parsed' AND tenant_id=tenantId
  │      → if 0 rows: return CONFLICT
  ├── 4. Load segments (ordered by segmentNumber, withTenant)
  │      → derive targetLang from segments[0]?.targetLang ?? 'und'
  ├── 5. getCachedGlossaryTerms(projectId, tenantId)
  ├── 6. Load suppressionRules → split: suppressedCategories + customRules
  │
  ├── 7. startTime = performance.now()
  ├── 8. results = await processFile(segments, glossaryTerms, suppressedCategories, customRules)
  ├── 9. duration = performance.now() - startTime
  │
  ├── 10. Map results → findings inserts (add fileId, tenantId, projectId, detectedByLayer='L1',
  │       reviewSessionId=null, segmentCount=1, aiModel=null, aiConfidence=null)
  ├── 11. db.transaction() → batch insert findings (100 per batch)
  ├── 12. writeAuditLog({ tenantId, userId, action: 'file.l1_completed', ... })
  ├── 13. Update file status to 'l1_completed' (NOT 'parsed' — prevents duplicate re-runs)
  │
  └── 14. Return { success: true, data: { findingCount, fileId, duration } }
```

#### Number Consistency — Thai Numeral Mapping

```typescript
const THAI_NUMERAL_MAP: Record<string, string> = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
}

function normalizeThaiNumerals(text: string): string {
  return text.replace(/[๐-๙]/g, (ch) => THAI_NUMERAL_MAP[ch] ?? ch)
}

function isBuddhistYearEquivalent(sourceNum: number, targetNum: number): boolean {
  return Math.abs(targetNum - sourceNum) === BUDDHIST_YEAR_OFFSET
}
```

#### Consistency Check — Thai Particle Stripping

```typescript
const THAI_PARTICLES = new Set([
  'ครับ', 'ค่ะ', 'นะ', 'ไหม', 'เถอะ', 'จ้า', 'ค่า', 'ครับผม',
])

// Loop until stable — handles compound particles like "นะครับ"
function stripThaiParticles(text: string): string {
  let result = text
  let changed = true
  while (changed) {
    changed = false
    for (const particle of THAI_PARTICLES) {
      if (result.endsWith(particle)) {
        result = result.slice(0, -particle.length).trimEnd()
        changed = true
        break  // restart loop from beginning after each strip
      }
    }
  }
  return result
}
```

#### Testing Standards

- `vi.mock('server-only', () => ({}))` FIRST in every server-side test file
- Mock `@/features/glossary/matching/glossaryMatcher` for glossary check tests
- Mock `@/lib/cache/glossaryCache` for Server Action tests
- Use `buildSegment()` from `@/test/factories` and `buildDbFinding()` (new) for test data
- Consistent checker signatures: every test calls `checkXxx(segment, ctx)` where `ctx = { sourceLang: 'en-US', targetLang: 'th-TH' }`
- **Negative test cases are CRITICAL**: every check must have tests proving it does NOT flag valid segments
- **Thai negative test (mandatory)**: `{ source: "Thank you", targets: ["ขอบคุณครับ", "ขอบคุณค่ะ"] }` → consistency check must NOT flag
- **Performance test MUST mock all I/O**: mock `checkGlossaryCompliance`, `writeAuditLog`, `getCachedGlossaryTerms` — benchmark pure computation only
- **Cross-segment tests**: consistency checks need arrays of 10+ segments with specific overlap patterns

#### Security Checklist

| Check | Implementation |
|-------|---------------|
| Auth required | `requireRole('qa_reviewer', 'write')` in Server Action |
| Tenant isolation | `withTenant()` on ALL queries (file, segments, suppression rules, findings insert) |
| No content in logs | Only log metadata (fileId, segmentCount, findingCount, duration) via pino |
| Audit trail | `writeAuditLog({ tenantId, userId, ... })` for `file.l1_completed` |
| Cross-tenant guard | CAS update verifies tenantId atomically |
| Input validation | Zod validation on `{ fileId: z.string().uuid() }` |
| Regex DoS prevention | Custom rule regex: wrap in try/catch, skip on error |

#### Existing Patterns to Follow

| Pattern | Reference File | What to Reuse |
|---------|---------------|--------------|
| Glossary matching | `src/features/glossary/matching/glossaryMatcher.ts` | `checkGlossaryCompliance()`, `findTermInText()`, `SegmentContext` type |
| Glossary cache | `src/lib/cache/glossaryCache.ts` | `getCachedGlossaryTerms(projectId, tenantId)` |
| Segmenter cache | `src/lib/language/segmenterCache.ts` | `getSegmenter()`, `isNoSpaceLanguage()` |
| Markup stripping | `src/lib/language/markupStripper.ts` | `stripMarkup()`, `chunkText()` |
| Parser constants | `src/features/parser/constants.ts` | `SKIP_QA_STATES` |
| Parser types | `src/features/parser/types.ts` | `InlineTag`, `ConfirmationState` |
| Server Action | `src/features/parser/actions/parseFile.action.ts` | Auth + CAS + batch insert + audit + `'use server'` + `import 'server-only'` |
| withTenant | `src/db/helpers/withTenant.ts` | `withTenant(col, tenantId)` |
| Audit log | `src/features/audit/actions/writeAuditLog.ts` | `writeAuditLog({ tenantId, userId, entityType, entityId, action, newValue })` |
| ActionResult | `src/types/actionResult.ts` | `ActionResult<T>` |
| Test factories | `src/test/factories.ts` | `buildSegment()`, new `buildDbFinding()` |

### Project Structure Notes

**New files to create:**
```
src/features/pipeline/
  engine/
    types.ts                              # RuleCheckResult, SegmentCheckContext, RuleCategory
    types.test.ts                         # Type guard tests (8)
    constants.ts                          # RULE_CATEGORIES, patterns, thresholds
    ruleEngine.ts                         # Main orchestrator: processFile()
    ruleEngine.test.ts                    # Orchestrator tests (25)
    checks/
      contentChecks.ts                    # checkUntranslated, checkTargetIdenticalToSource
      contentChecks.test.ts               # 20 tests
      tagChecks.ts                        # checkTagIntegrity
      tagChecks.test.ts                   # 20 tests
      numberChecks.ts                     # checkNumberConsistency
      numberChecks.test.ts                # 15 tests
      placeholderChecks.ts                # checkPlaceholderConsistency
      placeholderChecks.test.ts           # 15 tests
      formattingChecks.ts                 # spacing, brackets, URLs, end punct
      formattingChecks.test.ts            # 35 tests
      consistencyChecks.ts                # S→T, T→S, key terms (file-level)
      consistencyChecks.test.ts           # 30 tests
      glossaryChecks.ts                   # glossary compliance wrapper
      glossaryChecks.test.ts              # 12 tests
      customRuleChecks.ts                 # regex-based custom rules
      customRuleChecks.test.ts            # 8 tests
      capitalizationChecks.ts             # UPPERCASE + CamelCase
      capitalizationChecks.test.ts        # 15 tests
    language/
      thaiRules.ts                        # Thai numerals, particles, Buddhist year
      thaiRules.test.ts                   # 15 tests
      cjkRules.ts                         # Fullwidth punct, NFKC normalization
      cjkRules.test.ts                    # 10 tests
  actions/
    runRuleEngine.action.ts               # Server Action entry point
    runRuleEngine.action.test.ts          # 20 tests
  __tests__/
    helpers/
      xbenchReportParser.ts              # Test-time utility: read Xbench xlsx reports (devDependency: xlsx/exceljs)
    parity/
      tier1.parity.test.ts               # Tier 1 BT parity tests
      tier2.parity.test.ts               # Tier 2 NCR TH parity tests
      tier3.parity.test.ts               # Tier 3 NCR multi-lang parity tests
```

**Files to modify:**
```
src/db/schema/findings.ts                 # ADD 3 columns: fileId, sourceTextExcerpt, targetTextExcerpt
src/test/factories.ts                     # ADD buildDbFinding() using Drizzle insert type
supabase/migrations/00014_story_2_4_findings_columns.sql  # DDL migration
```

**Golden corpus test data (read-only — do NOT modify):**
```
docs/test-data/
├── golden-corpus/
│   └── manifest.yaml                     # File→report mapping + tiered testing strategy
└── Golden-Test-Mona/                     # Raw corpus from Mona
    ├── 2026-02-24_Studio_No_issues_Mona/ # Tier 1 clean: 14 SDLXLIFF (EN→TH)
    ├── 2026-02-24_With_Issues_Mona/      # Tier 1 with-issues: 8 SDLXLIFF + 1 Xbench report
    └── JOS24-00585 NCR.../               # Tier 2+3: QA'd files + reports (7 langs) + glossaries
```

### References

- [Source: docs/xbench-parity-spec.md — 18 frozen check types (17 rule-based + 1 AI), category mapping, language exceptions]
- [Source: _bmad-output/planning-artifacts/epics/epic-2-file-processing-rule-based-qa-engine.md#Story 2.4]
- [Source: _bmad-output/planning-artifacts/prd.md#FR8, FR19, FR21, NFR2]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Decision 2.1]
- [Source: _bmad-output/project-context.md#CJK/Thai Language Edge Cases, Testing Rules]
- [Source: src/features/glossary/matching/glossaryMatcher.ts — checkGlossaryCompliance() signature + SegmentContext requirement]
- [Source: src/features/glossary/matching/matchingTypes.ts — SegmentContext, GlossaryCheckResult types]
- [Source: src/lib/cache/glossaryCache.ts — getCachedGlossaryTerms()]
- [Source: src/lib/language/segmenterCache.ts — getSegmenter(), isNoSpaceLanguage()]
- [Source: src/features/parser/constants.ts — SKIP_QA_STATES]
- [Source: src/features/parser/types.ts — InlineTag, ConfirmationState]
- [Source: src/db/schema/findings.ts — existing findings table (needs 3 new columns)]
- [Source: src/db/schema/segments.ts — segments with confirmationState, inlineTags, sourceLang, targetLang]
- [Source: src/db/schema/suppressionRules.ts — pattern, category, isActive]
- [Source: src/features/parser/actions/parseFile.action.ts — Server Action + CAS pattern]
- [Source: src/features/audit/actions/writeAuditLog.ts — requires tenantId, userId]
- [Source: src/types/actionResult.ts — ActionResult<T>]
- [Source: _bmad-output/implementation-artifacts/2-2-sdlxliff-xliff-unified-parser.md]
- [Source: _bmad-output/implementation-artifacts/2-3-excel-bilingual-parser.md]
- [Source: docs/test-data/golden-corpus/manifest.yaml — Golden test corpus file→report mapping, tiered testing strategy, glossary listing]
- [Source: docs/xbench-parity-spec.md — Updated §5.2-5.5 (golden corpus structure, statistics, parity test process, report authority rules) + §8 sign-off]
- [Source: docs/test-data/README.md — Section 3 rewritten with golden corpus details]

### Previous Story Intelligence (Stories 2.2 + 2.3)

1. **Pure function + Server Action pattern — proven**: Both stories followed this successfully. `processFile()` is the pure function, `runRuleEngine.action.ts` is the Server Action entry. Inngest wiring deferred to Story 2.6.

2. **Audit log requires `tenantId` + `userId`**: Every `writeAuditLog()` call must include both. Primary status transitions MUST throw on failure. Error recovery paths wrap in try/catch.

3. **Batch insert + transaction pattern**: Story 2.2 batch-inserts segments in groups of 100. Use `FINDING_BATCH_SIZE = 100` within `db.transaction()` for findings.

4. **CAS idempotency guard**: Story 2.2 CR found race conditions. Use atomic UPDATE with WHERE clause on `file.status` to prevent concurrent L1 runs.

5. **Mock pattern**: Use `vi.fn((..._args: unknown[]) => ...)` for mocks whose `.calls` are accessed. Always `vi.mock('server-only', () => ({}))` first.

6. **Test count**: Running total before Story 2.4 = ~764 tests. Target ~250 new → ~1014 total.

7. **Performance test pattern**: `performance.now()` before/after, assert < threshold. Mock all I/O.

### Git Intelligence Summary

- Conventional Commits: use `feat(story-2.4):` or `feat(rule-engine):` scope
- 2 CR rounds on Stories 2.2 and 2.3 — anticipate similar rigor
- Running test count: ~764 tests before this story
- Sub-agent scanning (anti-pattern + tenant isolation) integrated into CR

### Architecture Assumption Checklist — Sign-off

```
Story: 2.4 — Rule-based QA Engine & Language Rules
Date:  2026-02-24
Reviewed by: Bob (SM) + Mona (Project Lead)

Sections passed:  [x] 1  [x] 2  [x] 3  [x] 4  [x] 5  [x] 6  [x] 7  [x] 8
Issues found: D2 — ALTER TABLE findings (3 new columns) → Task 1
AC revised: [x] Yes — AC #5 updated to include fileId, excerpts  [x] AC LOCKED
```

**Section details:**
- S1 Routes: No new routes needed — rule engine is a pure function + Server Action.
- S2 DB Schema: ALTER TABLE findings add 3 columns. Migration task included (Task 1). `withTenant()` in all queries.
- S3 Components: No UI components. Server-side only.
- S4 API: Server Action with `'use server'` + `import 'server-only'`. Returns `ActionResult<T>`.
- S5 Libraries: No new **production** libraries. Reuses glossary matcher, segmenter cache, markup stripper, pino. **Test-time:** xlsx parser (`xlsx` or `exceljs` npm package) needed for reading Xbench reports during parity testing — devDependency only.
- S6 Dependencies: Story 2.2 (parser) = done. Story 2.3 (Excel) = done. Story 1.5 (glossary) = done.
- S7 Testing: Factory functions for fixtures. RLS tests verify new columns. Target: ~250 tests.
- S8 Scope: No UI. No Inngest. No MQM score (Story 2.5). No review panel (Epic 4). Pure L1 engine + findings persistence.

## Definition of Done — Verification

```bash
# 1. Apply DB migration
npm run db:generate
npm run db:migrate

# 2. Verify Supabase migration
# Check supabase/migrations/00014_story_2_4_findings_columns.sql exists
# Verify Drizzle-generated SQL matches Supabase DDL

# 3. Run rule engine tests
npx vitest run src/features/pipeline

# 4. Run full test suite (check for regressions)
npm run test:unit -- --pool=forks --maxWorkers=1

# 5. Type check
npm run type-check

# 6. Lint check
npm run lint

# 7. RLS tests (if Supabase running)
npm run test:rls

# 8. Performance benchmark (within test suite)
# Verify "should process 5000 segments within 5 seconds" passes

# 9. Golden Corpus parity test (Tier 1 minimum — Tier 2/3 stretch)
npx vitest run src/features/pipeline/__tests__/parity/tier1.parity.test.ts
# Verify: 0 [Xbench Only] findings for all 8 with-issues files
# Verify: 0 findings for all 14 clean files

# 10. If all pass → story is done
```

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
