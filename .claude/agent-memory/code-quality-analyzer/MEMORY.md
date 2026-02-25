# Code Quality Analyzer Memory

## Index of Topic Files

- `story-2-4-findings.md` — Story 2.4 Rule Engine CR Round 1 + Round 2 + Round 3 findings
- `story-2-5-findings.md` — Story 2.5 MQM Score Calculation CR Round 1 + Round 2 findings
- `story-2-6-findings.md` — Story 2.6 Inngest Pipeline Foundation CR Round 1 + Round 2 + Round 3 (adversarial) findings

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
- Story 2.6: runL1ForFile audit log missing userId (M1 → upgraded to C4 in R2)

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
- Story 2.6 R3 M2: `inserted!` after .returning() in scoreFile.ts — same pattern
- Always add guard: `if (rows.length === 0) throw new Error('...')` before array[0]!
- Check in every query result that uses `[0]!` AND every `.returning()` destructure

### Duplicate Array Input Validation — NEW pattern (Story 2.6 R3)

- Zod z.array(z.string().uuid()) does NOT deduplicate
- SQL `inArray(col, [dup1, dup1])` returns unique rows → length mismatch
- Fix: always add .refine(ids => new Set(ids).size === ids.length) for ID arrays
- Also: deduplicate before fan-out to prevent double-processing

### Asymmetric Query Filters — RECURRING pattern

- Story 2.5 R2 C1: scoreFile findings query missing projectId (fixed), segments had it
- Story 2.6 R3 H2: runL1ForFile segments query missing projectId, scoreFile has it
- Pattern: when one query gets a defense-in-depth filter, ALL sibling queries across ALL helper files need audit
- Check: segments, findings, scores queries in EVERY helper function

## Story 2.4 Rule Engine — Key Patterns (see story-2-4-findings.md for details)

- Pipeline engine at `src/features/pipeline/engine/`; pure functions `(segment, ctx) → RuleCheckResult[]`
- Key patterns: Server Action atomicity (findings+status in same tx), ReDoS protection (safe-regex2 or timeout)

## Cross-Story Patterns

- Path traversal: sanitizeFileName needs fallback for empty/dot results
- FormData type safety: `as File[]` unsafe, need instanceof guard
- Unhandled promises in hooks: `void promise.then()` without `.catch()`
- NFKC: NOT before Intl.Segmenter (Thai sara am U+0E33 decomposes)
- NFKC: YES before text comparison (glossary, consistency)

## Story 2.5 MQM Score — Key Patterns (see story-2-5-findings.md for details)

- Pure calculator importable from Inngest; penaltyWeightLoader intentional withTenant() exception
- Defense-in-depth asymmetry: when fixing one query's filters, audit ALL sibling queries
- Graduation dedup missing projectId in JSONB containment query (still open R3-post L3)

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

### NEW Pattern: TOCTOU in Server Actions (Story 2.6 R2 C1)

- SELECT + validate + dispatch is NOT atomic — concurrent requests can pass validation simultaneously
- Fix: use CAS UPDATE (SET status='queued' WHERE status='parsed' RETURNING) as the validation step
- Applies to: any Server Action that validates state then triggers async work

### NEW Pattern: Inngest Event Type Duplication

- client.ts inline Events type vs types.ts canonical types must stay in sync
- ALWAYS import from canonical source (types.ts) into client.ts
- Drift causes: correct event schema in handler but wrong validation at send time

### NEW Pattern: Inngest processBatch Needs Failure Handling (Story 2.6 R3 M3) — FIXED

- processBatch now has retries:3 + onFailureBatchFn
- BUT: onFailureBatchFn not exposed via Object.assign for testing (R3-post H2)
- ALL Inngest functions that trigger downstream work MUST have onFailure

### NEW Pattern: PROCESSING_MODES SSOT Propagation (Story 2.6 R3 L2) — PARTIALLY FIXED

- PROCESSING_MODES const at @/types/pipeline — used by pipelineSchema.ts
- STILL HARDCODED in: projectSchemas.ts:12,18 + db/validation/index.ts:19
- Check in every review: any z.enum(['economy', 'thorough']) should use PROCESSING_MODES

### NEW Pattern: Object.assign Must Expose onFailure for Testing

- processFile.ts: Object.assign exposes both handler AND onFailure — correct
- processBatch.ts: Object.assign exposes only handler — MISSING onFailure
- Always verify BOTH handler + onFailure are in Object.assign exports
- Test file should have tests for onFailureFn behavior

## Project Structure Notes

- See `patterns.md` or previous file for detailed structure notes
- Test colocation inconsistent: some in `__tests__/`, some colocated
