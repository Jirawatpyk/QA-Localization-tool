# Tech Debt Tracker

**Created:** 2026-02-25 (post Story 2.7 CR R4)
**Last Verified:** 2026-03-01
**Source:** Cross-referenced from agent memory (anti-pattern-detector, code-quality-analyzer, tenant-isolation-checker, testing-qa-expert, inngest-function-validator)

---

## Status Legend

- **OPEN** — Not addressed, needs work
- **ACCEPTED** — Known but accepted with mitigation
- **DEFERRED** — Will address in a specific future story/epic
- **RESOLVED** — Fixed in code

---

## Category 1: Database Schema & Constraints

### TD-DB-001: Missing UNIQUE on segments(file_id, segment_number)
- **Severity:** Medium
- **Risk:** Re-parsing a file can create duplicate segment rows
- **Mitigation:** Parser does DELETE+INSERT (idempotent), but constraint would enforce at DB level
- **Fix:** Added `unique('uq_segments_file_segment').on(table.fileId, table.segmentNumber)` to Drizzle schema
- **Origin:** Story 2.2, flagged by code-quality-analyzer
- **Status:** RESOLVED (2026-02-25 — Drizzle schema updated, run `db:generate` + `db:migrate` to apply)

### TD-DB-002: Missing composite index on files(tenant_id, project_id)
- **Severity:** Low
- **Risk:** Performance only — queries filtering by both columns use sequential scan
- **Mitigation:** Data volume is small in current phase
- **Fix:** Add migration with composite index
- **Origin:** Story 2.1, flagged by code-quality-analyzer
- **Status:** DEFERRED (address when data grows, Epic 3-4)

### TD-DB-003: idx_findings_file_layer in migration but not in Drizzle schema
- **Severity:** Low
- **Risk:** Drizzle Kit `db:generate` won't know about this index; may drop it during future migrations
- **Fix:** Added `index('idx_findings_file_layer').on(table.fileId, table.detectedByLayer)` to Drizzle schema
- **Origin:** Story 2.7, flagged by code-quality-analyzer
- **Status:** RESOLVED (2026-02-25 — Drizzle schema updated, NOTE comment removed)

### TD-DB-004: segmentId not persisted to DB
- **Severity:** Medium
- **Risk:** Cross-file analysis and finding deduplication can't reference segment identity
- **Mitigation:** fileId + segmentNumber used as proxy identifier
- **Fix:** Design decision needed — add column or use composite key
- **Origin:** Story 2.2, flagged by code-quality-analyzer
- **Status:** DEFERRED (needs design decision, arch review)

---

## Category 2: Code Quality & Anti-Patterns

### TD-CODE-001: Barrel export in pipeline/inngest/index.ts
- **Severity:** Medium (violates CLAUDE.md)
- **Risk:** CLAUDE.md explicitly forbids barrel exports in feature modules
- **Fix:** N/A — barrel export `index.ts` does not exist; `route.ts` already imports directly
- **Origin:** Story 2.6, flagged by anti-pattern-detector
- **Status:** RESOLVED (2026-02-25 — verified: `src/features/pipeline/inngest/index.ts` does not exist)

### TD-CODE-002: ExcelJS type assertion for xlsx.load()
- **Severity:** Low
- **Files:** `excelParser.ts:27`, `xbenchReportParser.ts:34`
- **Root cause:** ExcelJS declares `interface Buffer extends ArrayBuffer {}` which conflicts with Node.js `Buffer<ArrayBufferLike>` generic — no clean type-safe solution exists
- **Fix:** Replaced `as never`/`as any` with `@ts-expect-error` + explanatory comment (self-documenting, auto-flags if ExcelJS fixes types)
- **Note:** `previewExcelColumns.action.ts` does NOT have this assertion (tracker was incorrect)
- **Origin:** Story 2.3, flagged by anti-pattern-detector
- **Status:** RESOLVED (2026-02-25 — `@ts-expect-error` is the correct pattern for library type mismatches)

### TD-CODE-005: RecentFileRow.status bare `string` (Guardrail #3)
- **Severity:** Low
- **File:** `src/features/dashboard/types.ts`
- **Risk:** `RecentFileRow.status` uses `string` instead of `FileStatus` union type — violates Guardrail #3
- **Fix:** Added `DbFileStatus` union type to `@/types/pipeline`, changed `status: string` → `status: DbFileStatus`, added `as DbFileStatus` cast in `getDashboardData.action.ts`, fixed `getStatusVariant` in `RecentFilesTable.tsx` (`'error'` → `'failed'` + all pipeline statuses)
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M3)
- **Status:** RESOLVED (2026-03-01)

### TD-CODE-004: Bare `string` types in L1FindingContext (Guardrail #3)
- **Severity:** Low
- **File:** `src/features/pipeline/helpers/runL2ForFile.ts:74-81`
- **Risk:** Internal `L1FindingContext` type uses `severity: string` and `detectedByLayer: string` instead of union types — violates Guardrail #3 ("No bare `string` for status/severity")
- **Mitigation:** Internal type only (not exported); values come from DB which already constrains them
- **Fix:** Change to `severity: 'critical' | 'major' | 'minor'` and `detectedByLayer: DetectedByLayer` (import from `@/types/finding`)
- **Origin:** Story 3.2a CR R2, flagged as M1/M2 (optional fix)
- **Status:** DEFERRED (low risk — internal type, fix during next runL2ForFile touch)

### TD-CODE-003: getFileHistory fetches ALL files + JS filter/paginate
- **Severity:** Medium
- **Risk:** O(N) memory for large projects
- **Mitigation:** 10K hard cap added in Story 2.7 CR R2
- **Fix:** Move filtering to DB query (WHERE + LIMIT/OFFSET)
- **Origin:** Story 2.7, flagged by code-quality-analyzer
- **Status:** ACCEPTED (10K cap mitigates for current scale)

---

## Category 3: Test Infrastructure

### TD-TEST-001: Proxy-based Drizzle mock duplicated in 15 test files
- **Severity:** Medium
- **Impact:** Root cause of "schema mock drift" — when new columns are added, each mock must be updated independently. This caused ~20% of CR findings across Stories 2.6-2.7.
- **Fix:** Extracted shared `createDrizzleMock()` utility:
  - `src/test/drizzleMock.ts` — canonical factory function with all features (returning, then, set, values, transaction, throwAtCallIndex)
  - `src/test/globals.d.ts` — TypeScript type declaration for global `createDrizzleMock()`
  - `src/test/setup.ts` — attaches factory to `globalThis` (setupFiles run before `vi.hoisted()`)
  - All 15 Proxy-based test files migrated: `vi.mock('@/db/client', () => dbMockModule)` (1 line)
- **Origin:** Story 2.4, flagged by code-quality-analyzer + testing-qa-expert
- **Status:** RESOLVED (2026-02-25 — all 15 files migrated, 1457 tests pass)

### TD-TEST-002: Integration test DRY — toSegmentRecord() duplicated 6x
- **Severity:** Medium
- **Risk:** If `SegmentRecord` type changes, must update 6 identical copies
- **Files:** `golden-corpus-parity.test.ts`, `clean-corpus-baseline.test.ts`, `tier2-multilang-parity.test.ts`, `golden-corpus-diagnostic.test.ts`, `parity-helpers-real-data.test.ts`, `rule-engine-golden-corpus.test.ts`
- **Fix:** Extract `buildSegmentRecordFromParsed()` to `src/test/factories.ts`
- **Origin:** Story 2.10, flagged by code-quality-analyzer
- **Status:** DEFERRED (fix when creating shared integration test infrastructure, early Epic 3)

### TD-TEST-003: Integration test DRY — mock block duplicated 4+ files
- **Severity:** Medium
- **Risk:** Adding a new mock (e.g., new server-only module) requires updating 4+ files
- **Files:** All integration test files using `vi.mock('server-only')` + `writeAuditLog` + `logger` + `glossaryCache`
- **Fix:** Create `src/__tests__/integration/setup.ts` as shared `setupFiles` in vitest config
- **Origin:** Story 2.10, flagged by code-quality-analyzer
- **Status:** DEFERRED (fix when creating shared integration test infrastructure, early Epic 3)

### TD-TEST-004: computePerFindingParity() called 3x with same data
- **Severity:** Low
- **Risk:** O(N*M) matching repeated needlessly in `golden-corpus-parity.test.ts`
- **Fix:** Compute once in `beforeAll`, store in suite-level variable
- **Origin:** Story 2.10, flagged by code-quality-analyzer
- **Status:** DEFERRED (quick refactor, do with TD-TEST-002/003)

### TD-TEST-005: Low-priority test gaps (carry-over)
- **Severity:** Low
- **Items:**
  - `BatchSummaryView.test.tsx` — `crossFileFindings` prop untested
  - `FileHistoryTable.test.tsx` — `processedAt` vs `createdAt` type mismatch
  - `xbenchReportParser` — null worksheet path untested
  - `batchComplete.test.ts` — `vi.resetModules()` inside `it()` body
- **Origin:** Story 2.7 CR R1-R4, flagged by testing-qa-expert
- **Status:** ACCEPTED (low priority, no production risk)

---

## Category 4: Tenant Isolation (remaining low-severity)

### TD-TENANT-001: Realtime channel missing tenant_id filter
- **Severity:** Medium
- **File:** `src/features/dashboard/hooks/useNotifications.ts` (NOT `src/features/notifications/hooks/` as originally tracked)
- **Fix:** N/A — code already has compound filter `user_id=eq.${userId}&tenant_id=eq.${tenantId}` (line 66) + client-side guard `if (raw.tenant_id !== tenantId) return` (line 71)
- **Origin:** Story 1.7, flagged by tenant-isolation-checker
- **Status:** RESOLVED (2026-02-25 — verified: filter already includes tenant_id; tracker had wrong file path)

### TD-TENANT-002: glossary_terms duplicate-check by glossaryId only
- **Severity:** Low
- **Files:** `createTerm.action.ts`, `updateTerm.action.ts`
- **Mitigation:** glossaryId verified via withTenant() in same request; FK chain is safe
- **Origin:** Story 1.4, flagged by tenant-isolation-checker
- **Status:** ACCEPTED (safe via FK chain)

---

## Category 5: Pattern Consistency

### TD-PATTERN-002: uploadBatchId type should be `string | null`
- **Severity:** Low
- **File:** `src/types/pipeline.ts` — `PipelineFileEventData.uploadBatchId: string`
- **Risk:** Files uploaded without a batch (future single-file upload) would need a dummy batchId or fail type check. DB schema `files.batchId` is already nullable
- **Mitigation:** Current upload flow always creates a batch, so value is always populated
- **Fix:** Change `uploadBatchId: string` → `uploadBatchId: string | null` in `PipelineFileEventData`, update all consumers to handle null
- **Origin:** Story 2.6, identified during Story 3.2b validation
- **Status:** DEFERRED (no current code path sends null; fix when adding single-file upload, Epic 4+)

### TD-PATTERN-001: Server Actions missing Zod input schemas (4 files)
- **Severity:** Low
- **Risk:** Pattern inconsistency only — all 4 actions validate input via manual checks (not Zod)
- **Files:** `getFilesWordCount.action.ts`, `getProjectAiBudget.action.ts`, `updateBudgetAlertThreshold.action.ts`, `updateModelPinning.action.ts`
- **Fix:** Add Zod schemas + `.safeParse()` to match `startProcessing.action.ts` pattern — do all 4 together as batch chore
- **Origin:** Story 3.1 CR R1, flagged by code-quality-analyzer (L1 finding)
- **Status:** DEFERRED (batch chore, Epic 4 — no correctness or security risk)

---

## Category 6: AI Infrastructure

### TD-AI-001: Provider detection logic duplicated across 3 files
- **Severity:** Low
- **Risk:** If a new provider is added, detection logic must be updated in 3 places
- **Files:** `src/lib/ai/costs.ts`, `src/lib/ai/providers.ts`, `src/lib/ai/client.ts`
- **Fix:** Extract shared `detectProvider(modelId): string` to `src/lib/ai/models.ts` and import from all 3 files
- **Origin:** Story 3.2a, flagged by code-quality-analyzer (H3)
- **Status:** DEFERRED (refactor scope, Epic 3 cleanup or Story 3.4)

---

## Category 7: UX & Component Consistency

### TD-UX-001: AppBreadcrumb missing AbortController on entity fetch
- **Severity:** Low
- **File:** `src/components/layout/app-breadcrumb.tsx`
- **Risk:** Rapid navigation can cause race condition — stale entity names rendered for wrong route
- **Mitigation:** Render-time state reset (`if (pathname !== prevPathname) setEntities({})`) clears stale data on route change, but in-flight fetch can still resolve after
- **Fix:** Add `AbortController` to `fetchEntities()` with cleanup in `useEffect` return
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M3)
- **Status:** DEFERRED (low risk — breadcrumb is non-critical UI, Epic 4 when review routes add real DB queries)

### TD-UX-002: truncateSegments shows only first+last, loses context
- **Severity:** Low
- **File:** `src/components/layout/app-breadcrumb.tsx`
- **Risk:** UX only — deeply nested routes (5+ segments) lose the second-to-last segment which provides navigation context
- **Current:** `[first, ellipsis, last]`
- **Better:** `[first, ellipsis, secondToLast, last]`
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M5)
- **Status:** DEFERRED (UX refinement, Epic 4 when review routes create 5+ segment paths)

---

## Category 8: Pipeline & Concurrency

### TD-PIPE-001: Batch completion race condition in processFile
- **Severity:** Medium
- **File:** `src/features/pipeline/inngest/processFile.ts` — batch completion check step
- **Risk:** Two concurrent `processFilePipeline` invocations finishing simultaneously can both query batch status before either writes terminal status, causing both to miss the "all completed" condition → `pipeline.batch-ready` event never fires
- **Mitigation:** Inngest `concurrency: { key: projectId, limit: 5 }` reduces (but doesn't eliminate) window. Batch completion is also eventually caught by polling/manual trigger
- **Fix:** Use DB-level atomic check: `UPDATE upload_batches SET status='completed' WHERE id=? AND (SELECT count(*) FROM files WHERE batch_id=? AND status NOT IN ('l2_completed','l3_completed','failed')) = 0 RETURNING *` — if RETURNING is empty, another invocation already completed the batch
- **Origin:** Story 2.6 design, identified during Story 3.2b validation (mode-aware terminal status makes race window wider)
- **Status:** DEFERRED (low probability with current concurrency limits; fix in Story 3.4 resilience or Epic 4)

---

## Resolved Items (for historical reference)

These were flagged by agent memory but verified as **FIXED** on 2026-02-25:

| Item | Story | Resolution |
|------|-------|------------|
| crossFileConsistency DELETE over-broad | 2.7 | Scoped to scope='cross-file' + detectedByLayer='L1' |
| runRuleEngine withTenant missing | 2.4→2.6 | Moved to runL1ForFile.ts, all UPDATEs have withTenant() |
| route.ts batchId/projectId unverified | 2.1 | Ownership SELECT + withTenant() added |
| reportMissingCheck detached withTenant() | 2.7 | Removed; proper project SELECT added |
| generateParityReport unverified FK | 2.7 | Project ownership SELECT added |
| step.sendEvent wrong API | 2.6 | Corrected to `(stringId, events[])` batch form |
| PROCESSING_MODES hardcoded | 2.6 | All sites import from `@/types/pipeline` |
| TD-DB-001: segments UNIQUE | 2.2 | Added `.unique()` to Drizzle schema |
| TD-DB-003: findings index | 2.7 | Added `.index()` to Drizzle schema |
| TD-CODE-001: barrel export | 2.6 | Verified: index.ts does not exist |
| TD-CODE-002: ExcelJS type assertion | 2.3 | `@ts-expect-error` replaces `as never`/`as any` |
| TD-TEST-001: Drizzle mock DRY | 2.4 | `createDrizzleMock()` shared utility, 15 files migrated |
| TD-TENANT-001: Realtime tenant filter | 1.7 | Already implemented at `useNotifications.ts:66` |
| TD-CODE-005: RecentFileRow.status bare string | 3.0.5 | `DbFileStatus` union type, `status: DbFileStatus`, cast in action, `getStatusVariant` fixed |
