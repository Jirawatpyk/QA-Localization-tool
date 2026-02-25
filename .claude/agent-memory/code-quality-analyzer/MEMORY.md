# Code Quality Analyzer Memory

## Index of Topic Files

- `story-2-4-findings.md` — Story 2.4 Rule Engine CR Round 1 + Round 2 + Round 3 findings
- `story-2-5-findings.md` — Story 2.5 MQM Score Calculation CR Round 1 + Round 2 findings
- `story-2-6-findings.md` — Story 2.6 Inngest Pipeline Foundation CR Round 1 findings

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
- Story 2.6: runL1ForFile, scoreFile, startProcessing — ALL wrapped correctly
- Story 2.6: runL1ForFile audit log missing userId (M1)

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
- Confirmed working in: parseFile.action.ts, runRuleEngine.action.ts, runL1ForFile.ts

### Inngest onFailure Registration — CRITICAL Pattern

- `onFailure` must be in config object (1st arg of `inngest.createFunction()`)
- Object.assign testability pattern exposes handler for tests BUT does NOT register with Inngest
- Story 2.6 C1: `processFile.ts` missing `onFailure` in config → files stuck in l1_processing
- Always verify: config arg includes `onFailure: onFailureFn` when using Object.assign pattern

### Non-null Assertion on Array[0] — RECURRING anti-pattern

- Story 2.6 C2: `segmentRows[0]!.sourceLang` crashes on empty array
- Always add guard: `if (rows.length === 0) throw new Error('...')` before array[0]!
- Check in every query result that uses `[0]!`

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
- fileId unused in AutoPassInput type (H4) — removed in CR R1

## Story 2.5 CR Round 2 — NEW Findings (see story-2-5-findings.md)

- C1: Findings query missing projectId filter (asymmetric with segments query)
- H1: Graduation notification caller still not wrapped in try-catch
- H2: CONTRIBUTING_STATUSES still ReadonlySet<string> (FindingStatus added in R1 but not applied here)
- H3: fileCount off-by-one (checkAutoPass runs before score INSERT)
- M1: Double cast `as unknown as`, M2: Graduation dedup missing projectId
- M3: JOIN performance, M4: Missing test for findings projectId

### NEW Pattern: Defense-in-depth asymmetry

- When adding projectId filter to one query, check ALL sibling queries in same function
- Story 2.5 R1 H2 fixed segments but left findings unpatched — R2 C1 caught it
- Always audit all queries when fixing one query's filters

### NEW Pattern: Query ordering vs data dependency

- checkAutoPass file count query runs BEFORE score INSERT → off-by-one
- Functions that depend on COUNT of records should run AFTER the new record is committed
- Or explicitly document the off-by-one behavior and adjust threshold accordingly

## Story 2.6 Inngest Pipeline Foundation — Key Patterns

- Shared helpers: `runL1ForFile.ts`, `scoreFile.ts` — NO 'use server', importable from Inngest
- Object.assign testability pattern for Inngest functions (expose handler + onFailure for unit tests)
- processBatch fan-out: `step.sendEvent(id, events[])` batch form (single checkpoint)
- processFilePipeline: concurrency key on projectId limit 1 (serialize per project)
- Non-cached glossary loader: `getGlossaryTerms()` at `src/lib/cache/glossaryCache.ts` (JOIN-based)
- Server Actions are thin wrappers: auth + validation + ActionResult mapping only
- Pipeline event types at `src/features/pipeline/inngest/types.ts`
- Inngest client events at `src/lib/inngest/client.ts` — DUPLICATED (should reference types.ts)

### NEW Pattern: Inngest function config vs Object.assign

- `inngest.createFunction(config, trigger, handler)` — config object is what Inngest reads
- Object.assign adds properties AFTER function creation — Inngest runtime does NOT see them
- onFailure, cancelOn, etc. MUST be in config object (1st arg)
- Object.assign is ONLY for test utilities (exposing handler, onFailure for direct unit testing)

## Project Structure Notes

- See `patterns.md` or previous file for detailed structure notes
- Test colocation inconsistent: some in `__tests__/`, some colocated
