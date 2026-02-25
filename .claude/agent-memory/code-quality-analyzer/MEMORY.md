# Code Quality Analyzer Memory

## Index of Topic Files

- `story-2-4-findings.md` — Story 2.4 Rule Engine CR R1-R3
- `story-2-5-findings.md` — Story 2.5 MQM Score CR R1-R2
- `story-2-6-findings.md` — Story 2.6 Inngest Pipeline CR R1-R3
- `story-2-7-findings.md` — Story 2.7 Batch Summary & Parity CR R1-R4

## Recurring Anti-Patterns (check EVERY review)

### 1. withTenant() — MUST be on every DB query

- Story 1.7: raw eq() VIOLATION; Stories 2.4-2.7: all CORRECT

### 2. Audit Log Non-Fatal Pattern

- writeAuditLog: happy-path SHOULD throw; error-path MUST be try-catch+logger.error
- Stories 2.1-2.2: NOT wrapped; Stories 2.3-2.7: ALL FIXED

### 3. Bare `string` Types for Status/Severity

- FileInBatch.status, FileHistoryRow.processingStatus, XbenchFinding.severity — should be union types

### 4. Non-null Assertion on Array[0] / .returning()

- Always guard: `if (rows.length === 0) throw` before `rows[0]!`

### 5. Asymmetric Query Filters (Defense-in-Depth)

- When one query gets projectId filter, audit ALL sibling queries across all helpers

### 6. inArray() Empty Array Guard

- `inArray(col, [])` = invalid SQL; always add `if (ids.length === 0) return`

### 7. Inngest Function Requirements

- Config MUST have: retries, onFailure (in createFunction 1st arg)
- Object.assign MUST expose: handler + onFailure (for unit tests)
- MUST register in route.ts functions array

### 8. DELETE+INSERT Atomicity

- MUST use db.transaction() — Story 2.7 crossFileConsistency: FIXED in R3 (took 3 rounds)

### 9. Zod Array Uniqueness

- z.array(z.string().uuid()) does NOT deduplicate; add .refine(ids => new Set(ids).size === ids.length)

### 10. Optional Filter: Use null, NOT empty string

- `optionalId ?? ''` then filter silently matches nothing; use `fileId ? filter : noFilter`

### 11. Set Spread in Hot Loops

- `[...set].some()` inside segment/finding loops: creates array allocation per iteration
- Use `for...of` on Set directly, or cache `[...set]` once before loop

### 12. Form State Reset on Dialog Close

- Custom dialog components must reset state on re-open (useEffect on `open` prop)
- Missing reset = stale data shown to user on second open

## CAS Guard Pattern (ESTABLISHED)

- All status-transition actions: atomic `UPDATE WHERE status='expected' RETURNING`
- Confirmed in: parseFile, runRuleEngine, runL1ForFile

## Cross-Story Patterns

- Path traversal: sanitizeFileName needs fallback for empty/dot results
- FormData type safety: `as File[]` unsafe, need instanceof guard
- NFKC: NOT before Intl.Segmenter (Thai sara am); YES before text comparison
- TOCTOU in Server Actions: SELECT+validate+dispatch NOT atomic; use CAS UPDATE

## Story 2.6 Inngest Key Patterns

- Shared helpers: `runL1ForFile.ts`, `scoreFile.ts` — NO 'use server', importable from Inngest
- Object.assign testability pattern for Inngest functions
- processBatch fan-out: `step.sendEvent(id, events[])` batch form
- processFilePipeline: concurrency key on projectId limit 1
- Event types canonical at `@/types/pipeline`, re-exported via `inngest/types.ts`
- client.ts Events type imports from canonical source

## Story 2.7 Key Patterns

- R1: 31 findings (6C/9H/11M/5L) — all R1 Critical FIXED in R2
- R2: 15 findings (2C/4H/6M/3L) — C1 (fileId??''), C2 (as string nullable) FIXED in R3
- R3: 8 findings (1C/3H/3M/1L) — all R3 Critical+High FIXED in R4 code
- R4: 7 findings (0C/2H/3M/2L) — all H+M fixed in final commit
- STILL OPEN after R4: getFileHistory fetch-all (tech debt, 10K cap mitigated)
- → All security findings (Issues 1-7) verified RESOLVED on 2026-02-25

## Missing DB Constraints (accumulated — verified 2026-02-25)

- ⚠️ OPEN: No UNIQUE on segments(file_id, segment_number) — re-parse can create duplicates
- ⚠️ OPEN: No composite index on files(tenant_id, project_id) — perf only, low priority
- ℹ️ BY DESIGN: scores.fileId is nullable (project-level aggregates) — UNIQUE not appropriate
- ⚠️ OPEN: idx_findings_file_layer in migration but NOT in Drizzle schema
- ⚠️ OPEN: segmentId NOT persisted to DB (Stories 2.2-2.3, design decision needed)
- → Tracked in: `_bmad-output/implementation-artifacts/tech-debt-tracker.md`

## PROCESSING_MODES SSOT

- Canonical: `@/types/pipeline` PROCESSING_MODES const
- ✅ RESOLVED (2026-02-25): All sites now import from `@/types/pipeline` — projectSchemas.ts, pipelineSchema.ts, db/validation/index.ts

## Test Patterns

- Proxy-based chainable Drizzle mock: duplicated, should extract to shared utility
- Drizzle mock `values` handler: push to captures then return new Proxy (chainable)
- `throwAtCallIndex` in Proxy mock for DB error injection
- `vi.fn((..._args: unknown[]) => ...)` for mocks whose .calls are accessed
