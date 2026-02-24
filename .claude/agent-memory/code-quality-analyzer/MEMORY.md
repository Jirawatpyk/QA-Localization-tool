# Code Quality Analyzer Memory

## Index of Topic Files

- `story-2-4-findings.md` — Story 2.4 Rule Engine CR Round 1 + Round 2 + Round 3 findings
- `story-2-5-findings.md` — Story 2.5 MQM Score Calculation CR Round 1 findings

## Recurring Patterns Found

### withTenant() Usage

- Story 1.7: raw `eq(table.tenantId, tenantId)` instead of `withTenant()` — VIOLATION
- Story 2.4: CORRECT on all 5 DB operations
- Always check in every review

### Audit Log Error Handling — RECURRING anti-pattern

- writeAuditLog throws on failure (by design)
- Happy-path: SHOULD throw — correct
- Error-path: MUST be non-fatal (try-catch + logger.error)
- Story 2.1: createBatch — NOT wrapped
- Story 2.2: markFileFailed — NOT wrapped
- Story 2.3: markFileFailed — FIXED
- Story 2.4: runRuleEngine — FIXED (both happy + error path)
- Story 2.5: calculateScore — FIXED (audit log wrapped correctly)
- Story 2.5: graduation notification — NOT wrapped at caller level (C1)

### Supabase Realtime Payload Mismatch

- snake_case DB → camelCase TypeScript cast without mapping → runtime undefined fields

### Type Safety: Bare `string` types

- RecentFileRow.status, AppNotification.type, UploadFileResult.status/fileType — all bare strings
- Story 2.5: ContributingFinding.status, ScoreResult.status — bare strings (H2, H6)
- Should be union types for compile-time safety

### Test Pattern: Chainable Drizzle Mock

- Proxy-based `createChainMock(resolvedValue)` — duplicated across test files
- Should be extracted to shared test utility

### Missing DB Constraints

- No unique constraint on `segments(file_id, segment_number)` — allows duplicates
- No composite indexes on files table for (tenant_id, project_id)
- idx_findings_file_layer in Supabase migration but NOT in Drizzle schema
- Story 2.5: No UNIQUE constraint on `scores(file_id, tenant_id)` — concurrent DELETE+INSERT can create duplicates (C2)

### segmentId NOT persisted to DB

- ParsedSegment.segmentId (mrk mid / trans-unit @id / TU-001) extracted but not stored
- DB schema segments has no segment_id column
- Flagged in Stories 2.2, 2.3 — still open

### CAS Guard Pattern (ESTABLISHED)

- All status-transition actions MUST use atomic `UPDATE ... WHERE status='expected'` + `.returning()`
- Confirmed working in: parseFile.action.ts, runRuleEngine.action.ts

## Story 2.4 Rule Engine — Key Patterns

- Pipeline engine at `src/features/pipeline/engine/`
- Check functions: pure functions `(segment, ctx) → RuleCheckResult[]`
- Language rules at `engine/language/` (engine-internal, not `src/lib/language/`)
- Glossary check: dependency injection (GlossaryCheckFn type) for testability
- Constants centralized in `engine/constants.ts`
- InlineTagsData: `{ source: InlineTag[], target: InlineTag[] }` split

## Story 2.4 CR Round 2 — NEW Findings (see story-2-4-findings.md)

- C1: placeholderChecks Set loses duplicate count → false negatives
- C2: getLastNonWhitespace returns lone surrogate for emoji
- H1: normalizeNumber precision loss for 16+ digit numbers
- H2: Thai numeral source normalization missing (TH→EN)
- H3: checkKeyTermConsistency O(G\*S) performance risk
- H4: Drizzle schema missing index definition
- L1-L4: minor naming/guard issues

## Story 2.4 CR Round 3 — NEW Findings (see story-2-4-findings.md)

- C1: NUMBER_REGEX captures hyphen as sign (false positives for ranges like "1-10")
- C2: No stale findings cleanup on re-run → duplicate findings on re-parse
- H1: ReDoS incomplete (length-only, no pattern complexity check)
- H2: URL_REGEX case mismatch + missing parenthesis exclude
- H3: End punctuation EN→TH flooding (still unfixed from R2-L2)
- H4: Empty targets in checkSameSourceDiffTarget not skipped
- H5: Findings insert + status update not in same transaction
- M1-M4: PROPER_NOUN_RE, apostrophe false positive, CJK quotes, ctx unused
- L1-L3: European number ambiguity, Buddhist year range, NUMBERS_ONLY_RE scope

### NEW Pattern: Server Action atomicity

- Findings INSERT + file status UPDATE must be in SAME transaction
- Otherwise partial failure = inconsistent state (findings exist, status=failed)
- Check this pattern in ALL future pipeline server actions (L2, L3)

### NEW Pattern: Regex safety for user-provided patterns

- Length check alone insufficient for ReDoS prevention
- Need safe-regex2 or execution timeout for any `new RegExp(userInput)`
- Applies to: customRuleChecks, any future user-defined patterns

## Cross-Story Patterns

- Path traversal: sanitizeFileName needs fallback for empty/dot results
- FormData type safety: `as File[]` unsafe, need instanceof guard
- Unhandled promises in hooks: `void promise.then()` without `.catch()`
- NFKC: NOT before Intl.Segmenter (Thai sara am U+0E33 decomposes)
- NFKC: YES before text comparison (glossary, consistency)

## Story 2.5 MQM Score Calculation — Key Patterns

- Pure calculator at `src/features/scoring/mqmCalculator.ts` — NO server deps, importable from Inngest
- 3-level penalty weight fallback: tenant DB → system DB (NULL tenant) → hardcoded constant
- penaltyWeightLoader: INTENTIONAL exception to withTenant() — documented with comment
- Auto-pass: 3-path logic (lang pair config → new pair <=50 files → new pair >50 files + project threshold)
- Graduation notification: file 51 for new pair, JSONB dedup, per-admin insert
- DELETE+INSERT idempotent pattern (no UNIQUE constraint yet — C2)
- fileId unused in AutoPassInput type (H4) — MEMORY says removed but still present

## Project Structure Notes

- See `patterns.md` or previous file for detailed structure notes
- Test colocation inconsistent: some in `__tests__/`, some colocated
