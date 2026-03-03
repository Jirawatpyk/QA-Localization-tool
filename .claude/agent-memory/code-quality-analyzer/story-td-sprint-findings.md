# Tech Debt Quick-Fix Sprint — Code Quality Analysis

## CR R1 — Date: 2026-03-02

## Scope: 4 Server Actions + 1 Zod schema + factory refactor + integration test infra + DB schema

## R1 Findings Summary: 0C / 3H / 5M / 4L = 12 total

### HIGH (3)

- **H1** `getFilesWordCount.action.ts` L49: `inArray()` missing empty array guard (defense-in-depth — Zod `.min(1)` covers but guardrail #5 requires explicit)
- **H2** `pipelineSchema.ts` L48: `updateModelPinningSchema` model field accepts empty string `""` and unlimited length
- **H3** `updateBudgetAlertThreshold` + `updateModelPinning`: inline `UpdateResult` type instead of project standard `ActionResult<T>`

### MEDIUM (5)

- **M1** Unused `ParsedSegment` import in 5 integration test files (leftover from buildSegmentRecordFromParsed refactor)
- **M2** `console.warn` in glossary-matching-real-data.test.ts (should use `process.stderr.write()` per integration test convention)
- **M3** Duplicated `getCellText` + `readXbenchReport` across 4 integration test files (should extract like TD-TEST-002)
- **M4** `SDLXLIFF_FILES` array duplicated across 4 integration test files
- **M5** `files.ts` composite index doesn't cover `status` column — may miss query optimization

### LOW (4)

- **L1** `sql<string>` type annotation on SUM aggregate — technically correct (PG returns string) but confusing
- **L2** `tag-gap-diagnostic.test.ts` still uses inline segment mapping instead of `buildSegmentRecordFromParsed`
- **L3** `fileIds` + `projectId` validation duplicated between `startProcessingSchema` and `getFilesWordCountSchema`
- **L4** Audit log in update actions missing `oldValue` — only logs `newValue`

### Positive

- All 4 Server Actions follow golden example pattern correctly
- Audit log non-fatal pattern correct in both mutation actions
- `buildSegmentRecordFromParsed()` refactor well-done (TD-TEST-002)
- Shared integration test setup.ts (TD-TEST-003)
- `ALL_AVAILABLE_MODELS` SSOT in models.ts
- `checkProjectBudget` uses UTC correctly (previously flagged in memory #27)

---

## CR R2 — Adversarial Review — Date: 2026-03-02

## Focus: Zod schema completeness, ActionResult callers, index order, factory typing, regression safety

## R2 Findings Summary: 0C / 3H / 5M / 4L = 12 total

### R1 Status

- **H3 FIXED** — both actions now return `ActionResult<undefined>` (verified in code)
- **H1** — still valid concern but defense-in-depth: Zod `.min(1)` + `inArray` never hit with empty array
- **H2** — still valid: `model: z.string().nullable()` has no `.min(1)` or `.max()`

### R2 HIGH (3)

- **H1** `pipelineSchema.ts:48` — `model: z.string().nullable()` no `.min(1).max(100).trim()` — empty string/whitespace/huge strings pass Zod, caught only by runtime allowlist
- **H2** `files.ts:29` — composite index `(tenantId, projectId)` column order may not be optimal; `(projectId, tenantId)` has better selectivity for most query patterns
- **H3** `factories.ts:462` — `buildSegmentRecordFromParsed` ignores `ParsedSegment.segmentId`, generates random UUID for `id`. Misleading for a "from parsed" converter

### R2 MEDIUM (5)

- **M1** `pipeline.ts:7` — `PIPELINE_LAYERS = ['L2', 'L3']` name implies exhaustive but excludes L1
- **M2** `getFilesWordCount.action.ts` — no project existence check (asymmetric with getProjectAiBudget)
- **M3** `setup.ts:17-19` — global mock for `getCachedGlossaryTerms` OK now but fragile if transitive deps change
- **M4** `updateModelPinning.action.ts:65-77` — audit log try-catch in happy path deviates from Memory #2 convention (acceptable but not documented)
- **M5** `getFilesWordCount.action.ts:42` — `sql<string>` on SUM aggregate correct but no explanatory comment

### R2 LOW (4)

- **L1** `updateBudgetAlertThreshold.action.ts:19,32` — comment says "Admin/PM only" but code enforces admin-only
- **L2** `updateModelPinning.action.test.ts:60-65` — `_reviewerUser` declared but never used
- **L3** `setup.ts` — global mock may silently cover future audit log calls in tested modules
- **L4** `sql<string>` aggregate pattern needs comment for developer guidance

### R2 Positive

- ActionResult<undefined> callers (AiBudgetCard, ModelPinningSettings) verified — no breakage
- TaxonomyMappingTable aria-disabled fix correct: explicit prop after spread override
- Integration test dedup successful — 6 copies reduced to 1 factory + 8 copies reduced to 1 setup
- Zod schema extraction to pipelineSchema.ts well-structured with proper types export
