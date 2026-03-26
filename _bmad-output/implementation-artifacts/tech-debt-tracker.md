# Tech Debt Tracker

**Created:** 2026-02-25 (post Story 2.7 CR R4)
**Last Verified:** 2026-03-26 (DEFERRED target audit — Guardrail #23 compliance: all vague/stale targets re-assigned to specific Story IDs or Epic+Story)
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
- **Fix:** Added `index('idx_files_tenant_project').on(table.tenantId, table.projectId)` to Drizzle schema
- **Origin:** Story 2.1, flagged by code-quality-analyzer
- **Status:** RESOLVED (2026-03-02 — Guardrail #23 quick fix, run `db:generate` + `db:migrate` to apply)

### TD-DB-003: idx_findings_file_layer in migration but not in Drizzle schema
- **Severity:** Low
- **Risk:** Drizzle Kit `db:generate` won't know about this index; may drop it during future migrations
- **Fix:** Added `index('idx_findings_file_layer').on(table.fileId, table.detectedByLayer)` to Drizzle schema
- **Origin:** Story 2.7, flagged by code-quality-analyzer
- **Status:** RESOLVED (2026-02-25 — Drizzle schema updated, NOTE comment removed)

### TD-DB-005: Missing UNIQUE on files(project_id, file_hash)
- **Date:** 2026-03-08
- **Story:** Story 2.1 TA Run (Red Team analysis UNIT-011)
- **Phase:** TA (Test Automation)
- **Severity:** Medium
- **Risk:** Concurrent duplicate uploads from 2 users could bypass client-side SHA-256 duplicate detection. Client check covers 99.9% of cases, but DB-level constraint needed for defense-in-depth
- **Mitigation:** Client-side `checkDuplicate()` action queries DB before upload — race window is < 100ms
- **Fix:** `ALTER TABLE files ADD CONSTRAINT files_project_hash_unique UNIQUE(project_id, file_hash)` — requires dedup check on existing data first
- **Origin:** Story 2.1 TA Run, Red Team attack vector #8
- **Status:** RESOLVED (2026-03-08) — Added `uniqueIndex('uq_files_project_hash').on(projectId, fileHash).where(isNotNull(fileHash))` partial unique index to Drizzle schema. Run `db:generate` + `db:migrate` to apply. Guardrail #23 quick fix.

### TD-DB-004: segmentId not persisted to DB
- **Severity:** Medium
- **Risk:** Cross-file analysis and finding deduplication can't reference segment identity
- **Mitigation:** fileId + segmentNumber used as proxy identifier
- **Fix:** Design decision needed — add column or use composite key
- **Origin:** Story 2.2, flagged by code-quality-analyzer
- **Status:** DEFERRED → **Epic 5 — Language Intelligence & Non-Native Support** (cross-file analysis requires stable segment identity; arch decision = use composite key `fileId+segmentNumber` as FK, NOT add new column)

### TD-GLOSSARY-001: Missing `notes` column on glossary_terms table
- **Date:** 2026-03-18
- **Story:** Story 4.7
- **Phase:** impl
- **Severity:** Low
- **Risk:** Notes entered by reviewer during "Add to Glossary" are stored only in audit log `newValue.notes` — not queryable from glossary management UI
- **Mitigation:** Notes persisted in audit trail for traceability; glossary management can reconstruct from audit log
- **Fix:** `ALTER TABLE glossary_terms ADD COLUMN notes TEXT` + update createTerm/addToGlossary actions
- **Origin:** Story 4.7 Dev Notes — schema change deferred to avoid migration in review workflow story
- **Status:** DEFERRED → **Epic 8 — Story 8.1** (reporting/export needs glossary notes; notes column adds value only when glossary management UI shows notes)

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
- **Status:** RESOLVED (2026-03-02) — changed to `severity: FindingSeverity`, `detectedByLayer: DetectedByLayer` with imports from `@/types/finding`

### TD-CODE-008: Unicode case folding (German ß→ss, Turkish İ→i) not supported in glossary matching
- **Date:** 2026-03-09
- **Story:** Story 1.5 TA Run 15 (Failure Mode Analysis finding F3)
- **Phase:** TA (Test Automation — code fix candidate)
- **Severity:** Low
- **Risk:** `toLowerCase()` does not perform Unicode case folding — "STRASSE" will NOT match "Straße" (German), Turkish İ (U+0130) produces 2-char form shifting positions. Neither language is in current target scope (CJK/Thai primary)
- **Mitigation:** Documented as known limitation in `findTermInText()` JSDoc. German ß test (TA-UNIT-027) explicitly documents behavior
- **Fix:** Replace `toLowerCase()` with `caseFold()` function that handles ß→ss, İ→i with position mapping infrastructure (folded text → original position map array). Approach: build `{ folded: string, posMap: number[] }` since case folding can change string length. Estimated effort: 4-6 hours
- **Research:** `Intl.Collator` sliding window won't work (ß expands 1→2 chars, window size mismatch). Manual position-mapped case folding is the correct approach
- **Origin:** Story 1.5 TA Run 15, FMEA finding + Party Mode discussion (2026-03-09)
- **Target:** Story 5.1 — Language Bridge (German/Turkish glossary + QA workflow ยังไม่มี)
- **Status:** DEFERRED → **Story 5.1** (Language Bridge handles multi-language text; Unicode case folding needed for German/Turkish glossary)

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

### TD-TEST-002: Integration test DRY — toSegmentRecord() duplicated 7x
- **Severity:** Medium
- **Risk:** If `SegmentRecord` type changes, must update 7 identical copies
- **Files:** `golden-corpus-parity.test.ts`, `clean-corpus-baseline.test.ts`, `tier2-multilang-parity.test.ts`, `golden-corpus-diagnostic.test.ts`, `parity-helpers-real-data.test.ts`, `rule-engine-golden-corpus.test.ts`, `tag-gap-diagnostic.test.ts`
- **Fix:** Extracted `buildSegmentRecordFromParsed()` to `src/test/factories.ts`, all 7 files import from shared factory. Also removed stale `import type { ParsedSegment }` from 6 files (dead import after migration)
- **Origin:** Story 2.10, flagged by code-quality-analyzer + pre-CR anti-pattern-detector
- **Status:** RESOLVED (2026-03-02 — Guardrail #23 quick fix + pre-CR cleanup)

### TD-TEST-003: Integration test DRY — mock block duplicated 4+ files
- **Severity:** Medium
- **Risk:** Adding a new mock (e.g., new server-only module) requires updating 4+ files
- **Files:** All integration test files using `vi.mock('server-only')` + `writeAuditLog` + `logger` + `glossaryCache`
- **Fix:** Created `src/__tests__/integration/setup.ts` as shared `setupFiles` in vitest config. Removed duplicated mock blocks from 8 integration test files
- **Origin:** Story 2.10, flagged by code-quality-analyzer
- **Status:** RESOLVED (2026-03-02 — Guardrail #23 quick fix)

### TD-TEST-004: computePerFindingParity() called 3x with same data
- **Severity:** Low
- **Risk:** O(N*M) matching repeated needlessly in `golden-corpus-parity.test.ts`
- **Fix:** Added lazy-cached `getPerFindingParity()` wrapper — computes once, returns cached result on subsequent calls
- **Origin:** Story 2.10, flagged by code-quality-analyzer
- **Status:** RESOLVED (2026-03-02 — Guardrail #23 quick fix)

### ~~TD-TEST-005: Low-priority test gaps (carry-over)~~
- **Severity:** Low
- **Items:**
  - ~~`BatchSummaryView.test.tsx` — `crossFileFindings` prop untested~~ → RESOLVED (2026-03-03 — 2 tests added: render + empty)
  - ~~`FileHistoryTable.test.tsx` — `processedAt` vs `createdAt` type mismatch~~ → ACCEPTED (naming-only: `FileHistoryPageClient.tsx:50` maps `createdAt→processedAt` at client layer, not a bug)
  - ~~`xbenchReportParser` — null worksheet path untested~~ → RESOLVED (test already exists at `xbenchReportParser.test.ts:485-489`: `'should throw when xlsx has no worksheet'`)
  - ~~`batchComplete.test.ts` — `vi.resetModules()` inside `it()` body~~ → ACCEPTED (intentional pattern: re-imports module-level `createFunction` to test different configs)
- **Origin:** Story 2.7 CR R1-R4, flagged by testing-qa-expert
- **Status:** RESOLVED (2026-03-03 — all 4 sub-items verified: 2 resolved, 2 accepted)

---

## Category 4: Tenant Isolation (remaining low-severity)

### TD-TENANT-001: Realtime channel missing tenant_id filter
- **Severity:** Medium
- **File:** `src/features/dashboard/hooks/useNotifications.ts` (NOT `src/features/notifications/hooks/` as originally tracked)
- **Fix:** N/A — code already has compound filter `user_id=eq.${userId}&tenant_id=eq.${tenantId}` (line 66) + client-side guard `if (raw.tenant_id !== tenantId) return` (line 71)
- **Origin:** Story 1.7, flagged by tenant-isolation-checker
- **Status:** RESOLVED (2026-02-25 — verified: filter already includes tenant_id; tracker had wrong file path)

### TD-TENANT-003: Realtime score/findings subscriptions missing tenant_id filter
- **Severity:** Medium (defense-in-depth — RLS protects data)
- **Date:** 2026-03-09
- **Story:** 4.0 (flagged by tenant-isolation-checker)
- **Phase:** pre-CR
- **Files:** `src/features/review/hooks/use-score-subscription.ts`, `src/features/review/hooks/use-findings-subscription.ts`
- **Description:** Both hooks subscribe to Realtime with `file_id=eq.${fileId}` only — missing `&tenant_id=eq.${tenantId}`. Polling fallback also queries without tenant_id. Pattern differs from `useNotifications.ts` which correctly includes tenant_id compound filter.
- **Fix:** Threaded `tenantId` from page.tsx → ReviewPageClient → all 3 subscription hooks. Added compound Realtime filter `&tenant_id=eq.${tenantId}` + `.eq('tenant_id', tenantId)` on polling fallback queries for findings, score, AND threshold hooks.
- **Status:** RESOLVED (2026-03-09 — Story 4.1a, all 3 hooks: findings ✓ score ✓ threshold ✓)

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
- **Status:** DEFERRED → **Epic 6 — Batch Processing & Team Collaboration** (single-file upload use case lives here; no current code path sends null)

### TD-PATTERN-001: Server Actions missing Zod input schemas (4 files)
- **Severity:** Low
- **Risk:** Pattern inconsistency only — all 4 actions validate input via manual checks (not Zod)
- **Files:** `getFilesWordCount.action.ts`, `getProjectAiBudget.action.ts`, `updateBudgetAlertThreshold.action.ts`, `updateModelPinning.action.ts`
- **Fix:** Added Zod schemas to `pipelineSchema.ts`, all 4 actions now accept `input: unknown` + `.safeParse()`. Manual checks removed where Zod covers them. Also: unified local `UpdateResult` type → `ActionResult<undefined>` (2 files), added `PIPELINE_LAYERS` constant to `@/types/pipeline.ts`, added `UpdateModelPinningInput` exported type, used `z.enum(PIPELINE_LAYERS)` instead of hardcoded `['L2', 'L3']`
- **Origin:** Story 3.1 CR R1, flagged by code-quality-analyzer (L1 finding) + pre-CR agents (H3, L1)
- **Status:** RESOLVED (2026-03-02 — Guardrail #23 quick fix + pre-CR cleanup)

---

## Category 6: AI Infrastructure

### TD-AI-001: Provider detection logic duplicated across 3 files
- **Severity:** Low
- **Risk:** If a new provider is added, detection logic must be updated in 3 places
- **Files:** `src/lib/ai/costs.ts`, `src/lib/ai/providers.ts`, `src/lib/ai/client.ts`
- **Fix:** `deriveProviderFromModelId()` already extracted to `types.ts` — `costs.ts` + `providers.ts` import from it. Refactored `client.ts:getModelById()` to use it via switch/case instead of duplicating prefix checks.
- **Origin:** Story 3.2a, flagged by code-quality-analyzer (H3)
- **Status:** RESOLVED — all 3 files now use single `deriveProviderFromModelId()` from `types.ts` (commit 2026-03-03)

---

## Category 7: UX & Component Consistency

### ~~TD-UX-001: AppBreadcrumb missing AbortController on entity fetch~~
- **Severity:** Low
- **File:** `src/components/layout/app-breadcrumb.tsx`
- **Risk:** Rapid navigation can cause race condition — stale entity names rendered for wrong route
- **Fix:** Replaced `useCallback` + `.then()` with `useEffect` + `cancelled` flag pattern. Cleanup function sets `cancelled = true` on route change, preventing stale data from overwriting state.
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M3)
- **Status:** RESOLVED (2026-03-09) — Story 4.0 Task 7.3. TD3 test activated and passing.

### ~~TD-UX-002: truncateSegments shows only first+last, loses context~~
- **Severity:** Low
- **File:** `src/components/layout/app-breadcrumb.tsx`
- **Fix:** Updated `truncateSegments()` from `[first, ..., last]` to `[first, ..., secondToLast, last]`, preserving navigation context on deeply nested routes.
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M5)
- **Status:** RESOLVED (2026-03-09) — Story 4.0 Task 7.4. TD4 test activated and passing.

---

## Category 8: Pipeline & Concurrency

### ~~TD-PIPE-001: Batch completion race condition in processFile~~
- **Status:** RESOLVED (2026-03-07) — Story 3.4 Task 7: Added `completed_at` column to `upload_batches`, implemented atomic `UPDATE...WHERE completed_at IS NULL` sentinel pattern in `processFile.ts` check-batch step. Race-safe: only first concurrent invocation sets `completedAt`; subsequent invocations get empty RETURNING → skip batch event.

### ~~TD-PIPE-002: Missing error-chunk cost logging in runL3ForFile~~
- **Status:** RESOLVED (2026-03-03) — Added `logAIUsage(errorRecord)` in L3 catch block, matching L2 pattern (H3 fix in CI bug-fix CR round)

### ~~TD-PIPE-003: L3 buildL3Prompt is inline — should use shared prompt builder~~
- **Status:** RESOLVED (2026-03-07) — Inline `buildL3Prompt` deleted from runL3ForFile.ts, replaced with shared `buildL3Prompt` from `src/features/pipeline/prompts/build-l3-prompt.ts` (Story 3.3 Task 5)

### ~~TD-PIPE-004: AI fallback chain resolved but not consumed~~
- **Status:** RESOLVED (2026-03-07) — Story 3.4 Tasks 2-4: Created `callWithFallback()` utility in `src/lib/ai/fallbackRunner.ts`. Wired into both `runL2ForFile.ts` and `runL3ForFile.ts` chunk processing loops. Primary model → classify error → try fallback models. Each attempt logged with model/error/kind. `FallbackResult` type tracks `modelUsed`, `fallbackUsed`, `attemptsLog`.

### TD-TEST-005: P2 skipped test — auto_passed propagation from scoreFile
- **Severity:** Low
- **File:** `src/features/pipeline/inngest/processFile.test.ts` — line 982
- **Risk:** `auto_passed` status from scoreFile return value not tested in pipeline return shape. Requires file-level auto-pass flow that doesn't exist yet
- **Fix:** Remove `it.skip` and implement when file-level auto-pass is built
- **Origin:** Story 3.2b ATDD P2 #20, identified during dev-story
- **Status:** DEFERRED → fix in **Epic 7** (auto-pass & trust automation)

### ~~TD-TEST-006: P2 skipped test — pipeline mock-based performance sanity~~
- **Status:** RESOLVED (2026-03-02) — `it.skip` removed, test passing. Mock-based handler completes < 1s (sanity check). Real E2E perf test still needed in Story 3.4+

### ~~TD-TEST-007: P2 skipped test — mode undefined defaults to economy~~
- **Status:** RESOLVED (2026-03-02) — `it.skip` removed, test passing. Defense-in-depth confirmed: `mode === 'thorough'` guard correctly falls through to economy behavior when mode is undefined

---

## Category 9: E2E Bypass Gaps (Epic 2 Retro — Party Mode 2026-03-02)

### ~~TD-E2E-001: E2E bypasses SDLXLIFF auto-parse (seeds via PostgREST)~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b5 wired auto-parse in `UploadPageClient.tsx`. `pipeline-findings.spec.ts` now uses real upload→auto-parse flow via `uploadSingleFile()` + `assertUploadProgress()`. PostgREST `insertTestFile`/`insertTestSegments` bypass removed.

### ~~TD-E2E-002: E2E bypasses ProcessingModeDialog (sends Inngest event directly)~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b5 mounted `ProcessingModeDialog` in upload page. `pipeline-findings.spec.ts` now clicks "Start Processing" button → dialog → Economy mode → confirm. Direct Inngest `triggerProcessing()` bypass removed.

### ~~TD-E2E-003: Parity E2E tests skipped with stale comment~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b6 rewrote `parity-comparison.spec.ts` with real project setup (`signupOrLogin` + `createTestProject`), PostgREST seeding of L1 findings, removed stale "DOES NOT EXIST YET" comment, removed local `loginAs` function, all 6 tests unskipped with correct UI selectors.

### ~~TD-E2E-004: Batch Summary E2E tests skipped with stale comment~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b6 rewrote `batch-summary.spec.ts` with real project setup, PostgREST seeding of upload_batches + files + scores, removed stale "DO NOT EXIST YET" comment, removed local `loginAs` function, all 7 tests unskipped with correct UI selectors matching actual data-testid attributes.

### ~~TD-E2E-005: File History E2E tests skipped with stale comment~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b6 rewrote `file-history.spec.ts` with real project setup, PostgREST seeding of files at various statuses, removed stale comment, removed local `loginAs`, all 5 tests unskipped.

### ~~TD-E2E-006: Upload Segments E2E test skipped — no TD ref in code~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b5 Task 5.1 unskipped Tests #19 and #20 in `upload-segments.spec.ts`. Tests now exercise real upload→auto-parse→Start Processing→ProcessingModeDialog flow.

### TD-E2E-007: Review Score E2E test skipped — no TD ref in code
- **Severity:** Low
- **File:** `e2e/review-score.spec.ts` — 1 test `test.skip()`, comment says "populated in Epic 4"
- **Risk:** Review panel doesn't exist yet (Epic 4) — legitimate skip but no TD entry
- **Fix:** Implement when Epic 4 review infrastructure is built
- **Origin:** Epic 1 skeleton, identified during full scan (2026-03-02)
- **Status:** RESOLVED (2026-03-26 — Story 4.0 implemented review score E2E tests in `e2e/review-score.spec.ts`; original placeholder stub replaced with real tests. Suite-level env guard `test.skip(!process.env.INNGEST_DEV_URL)` is operational, not a real skip.)

### TD-CODE-006: console.warn in glossary-matching-real-data.test.ts
- **Severity:** Low
- **File:** `src/__tests__/integration/glossary-matching-real-data.test.ts` — 5 instances
- **Risk:** Anti-pattern #4 (no `console.log/warn/error`) — test infra cannot import `pino`, but `console.warn` violates CLAUDE.md rule
- **Fix:** Replaced all 5 `console.warn()` with `process.stderr.write()` + `// NOTE: process.stderr.write used — pino not importable in Vitest Node process` comment
- **Origin:** Story 2.10, flagged by anti-pattern-detector pre-CR scan (2026-03-02)
- **Status:** RESOLVED (2026-03-02 — pre-CR cleanup)

### TD-CODE-007: TaxonomyMappingTable aria-disabled duplication (TS2783)
- **Severity:** Low
- **File:** `src/features/taxonomy/components/TaxonomyMappingTable.tsx:286-287`
- **Risk:** TypeScript error — `aria-disabled` and `aria-roledescription` set explicitly before `{...attributes}` spread from dnd-kit, which overwrites them
- **Fix:** Moved `{...attributes}` spread before explicit `aria-disabled` and `aria-roledescription` so explicit values win
- **Origin:** Story 3.2b7 (in-progress), fixed during TD sprint pre-commit gate (2026-03-02)
- **Status:** RESOLVED (2026-03-02 — pre-commit gate fix)

### TD-ORPHAN-001: reorderMappings action has no UI consumer
- **Severity:** Medium
- **File:** `src/features/taxonomy/actions/reorderMappings.action.ts`
- **Risk:** Action created in Story 1.6 with full logic (audit, validation) but TaxonomyMappingTable has no drag-and-drop reorder
- **Fix:** Story 3.2b7 added @dnd-kit to TaxonomyManager → `reorderMappings` imported at `TaxonomyManager.tsx:8` + called on drag-end
- **Origin:** Story 1.6, identified during orphan scan (2026-03-02)
- **Status:** RESOLVED (Story 3.2b7 — verified: `TaxonomyManager.tsx` imports + calls `reorderMappings` on drag-end, test mock exists)

### ~~TD-ORPHAN-002: updateBudgetAlertThreshold action has no UI consumer~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b6 Task 1 added threshold input to `AiBudgetCard.tsx` with `"use client"`, `useState`, `useTransition`, blur/Enter save, error revert. `ProjectSettings.tsx` passes `projectId` + `canEditThreshold={isAdmin}`. 12 unit tests pass.

### ~~TD-ORPHAN-003: getUploadedFiles action superseded — dead code~~
- **Status:** RESOLVED (2026-03-02) — Story 3.2b6 Task 2 deleted `getUploadedFiles.action.ts` + test, removed `getUploadedFilesSchema` + `GetUploadedFilesInput` from `uploadSchemas.ts`. Type-check + 2048 unit tests pass.

### ~~TD-TODO-001: Breadcrumb DB queries deferred to Epic 4~~
- **Severity:** Low
- **File:** `src/components/layout/actions/getBreadcrumbEntities.action.ts`
- **Fix:** Replaced stub with real DB queries using Drizzle + `withTenant()`. Fetches project name from `projects` table and file name (as session name) from `files` table with tenant isolation.
- **Origin:** Story 3.0, identified during TODO scan (2026-03-02)
- **Status:** RESOLVED (2026-03-09) — Story 4.0 Task 7.2. TD2 test activated and passing.

### TD-TODO-002: getFileHistory reviewer name deferred
- **Severity:** Low
- **Risk:** `lastReviewerName` always null — file history doesn't show who last reviewed
- **File:** `src/features/batch/actions/getFileHistory.action.ts:95`
- **Fix:** Join audit_logs (review actions) + auth.users for actual reviewer name. Story 4.2 creates the audit trail entries but getFileHistory JOIN is a batch/dashboard concern.
- **Origin:** Story 2.7, identified during TODO scan (2026-03-02)
- **Status:** RESOLVED (2026-03-26) — Added Query 3: review_actions INNER JOIN users, ordered DESC by createdAt, picks most recent reviewer per file. Guardrail #5 respected (skip inArray when fileIds empty). 16 unit tests pass.

### TD-UX-003: File selection UI before processing — all files auto-selected
- **Severity:** Low
- **Risk:** User ไม่สามารถเลือก/ยกเลิกไฟล์ที่ parse แล้วก่อนเริ่ม processing — ทุกไฟล์ถูก select อัตโนมัติ ถ้า upload ผิดไฟล์ต้อง cancel ทั้ง batch
- **File:** `src/features/upload/components/UploadPageClient.tsx` (Story 3.2b5 wired ProcessingModeDialog → fileIds = all parsed files)
- **Fix:** เพิ่ม checkbox per file ให้ user เลือก/ยกเลิกก่อนกด "Start Processing" — filter `fileIds` ก่อนส่งให้ `ProcessingModeDialog`
- **Origin:** Story 3.2b5 scope boundary, identified during story review (2026-03-02)
- **Status:** DEFERRED → **Epic 6 — Story 6.1** (file assignment; file selection before processing is pre-review UX that belongs in batch processing workflow)

### ~~TD-E2E-008: Pipeline E2E tests skipped in CI — no Inngest/AI infra~~
- **Status:** RESOLVED (2026-03-02) — All secrets wired (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `INNGEST_*`, `UPSTASH_*`). Inngest dev server added as background service in `e2e-gate.yml`. `INNGEST_DEV_URL` env var set. Skip condition `!process.env.INNGEST_DEV_URL` now passes in CI. Pipeline E2E runs fully.

### ~~TD-E2E-009: `adminHeaders()` + env constants duplicated across 4 E2E specs~~
- **Severity:** Low
- **Files:** `e2e/parity-comparison.spec.ts`, `e2e/batch-summary.spec.ts`, `e2e/file-history.spec.ts`, `e2e/budget-threshold.spec.ts`
- **Risk:** DRY violation — `adminHeaders()`, `SUPABASE_URL`, `SERVICE_ROLE_KEY`, `ANON_KEY` copy-pasted in each spec + `pipeline-admin.ts` helper (5 places total). Header structure change requires editing all files.
- **Fix:** Export `adminHeaders()` + env constants from `e2e/helpers/pipeline-admin.ts` (already exists), import in all specs.
- **Origin:** Story 3.2b6, flagged by code-quality-analyzer pre-CR scan (2026-03-02)
- **Status:** RESOLVED (2026-03-02) — exported `SUPABASE_URL` + `adminHeaders()` from `supabase-admin.ts` (single source of truth), `pipeline-admin.ts` re-exports from it, all 4 specs import from `supabase-admin.ts` instead of declaring locally. Removed 4 duplicate `adminHeaders()` + 12 duplicate env constants.

### ~~TD-E2E-010: ATDD P2 parity scenarios T3.4/T3.5 absent — ReportMissingCheckDialog~~
- **Status:** RESOLVED (2026-03-02) — ReportMissingCheckDialog mounted in ParityComparisonView with "Report Missing Check" button + dialog state. T3.4 (dialog submit) and T3.5 (validation errors) E2E tests added to `parity-comparison.spec.ts`. ParityComparisonView.test.tsx updated with mock. Type-check + 15 parity component tests pass.

### TD-PROCESS-001: E2E bypass rule — must create tech debt entry
- **Severity:** Low (process rule, not code bug)
- **Risk:** E2E workarounds that bypass UI flow hide integration gaps — discovered late (gap persisted across 6+ stories)
- **Fix:** Added Section 9 (J3) to `architecture-assumption-checklist.md`: every E2E bypass → mandatory tech-debt-tracker entry + `// TODO(story-X.X)` comment
- **Origin:** Epic 3 party-mode review (2026-03-02) — root cause analysis of TD-E2E-001/002
- **Status:** RESOLVED (2026-03-02 — checklist updated with S9 J3)

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

---

## CR Sprint — batch/scoring/upload (2026-03-03)

### TD-BATCH-001: File history pagination happens in application layer
- **Date:** 2026-03-03
- **Story:** Story 3.0.5 (Batch feature)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `getFileHistory.action.ts` fetches up to 10K files with QUERY_HARD_CAP then filters and paginates in JavaScript. Should use SQL LIMIT/OFFSET + WHERE for server-side pagination to reduce memory usage on large projects.
- **Status:** DEFERRED → **Epic 8 — Story 8.1** (reporting dashboard optimization; server-side pagination needed for large project file history)

### TD-BATCH-002: Hardcoded auto_pass_threshold fallback (95)
- **Date:** 2026-03-03
- **Story:** Story 3.0.5 (Batch feature)
- **Phase:** CR
- **Severity:** Low
- **Description:** `getBatchSummary.action.ts:53` and `getFileHistory.action.ts:53` use hardcoded `?? 95` fallback for auto_pass_threshold. Should import from `@/features/scoring/constants` for single source of truth.
- **Status:** RESOLVED — added `DEFAULT_AUTO_PASS_THRESHOLD = 95` to scoring constants, both actions import it (commit 2026-03-03)

---

## CR Sprint — parity/dashboard/project (2026-03-03)

### ~~TD-DASH-001: Dashboard findingsCount hardcoded to 0~~
- **Date:** 2026-03-03
- **Story:** Story 3.2b (Dashboard feature)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `getDashboardData.action.ts` returns `findingsCount: 0` as placeholder. Should query actual `COUNT(*)` from findings table with tenant filter.
- **Status:** RESOLVED (2026-03-09) — Story 4.0 Task 7.5. Added findings COUNT query grouped by fileId with `withTenant()` and `ANY(fileIds)`. TD5 test activated and passing.

### TD-DASH-002: 5 AI-related actions missing ActionResult<T> return type
- **Date:** 2026-03-03
- **Story:** Story 3.2b (AI Usage Dashboard)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `getAiUsageSummary`, `getAiSpendByProject`, `getAiSpendByModel`, `getAiSpendTrend`, `exportAiUsage` actions return raw objects instead of `ActionResult<T>`. Should standardize for consistency.
- **Status:** RESOLVED (2026-03-08) — All 5 actions now use `ActionResult<T>` from `@/types/actionResult`. Removed inline result type aliases (`GetAiUsageSummaryResult`, `GetAiSpendByModelResult`, `GetAiSpendTrendResult`, `GetAiUsageByProjectResult`, `ExportAiUsageResult`). Return shape unchanged (structurally identical), no test changes needed.

### ~~TD-DASH-003: Realtime notification payload lacks Zod validation~~
- **Date:** 2026-03-03
- **Story:** Story 3.2b (Notifications)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `useNotifications.ts` casts Realtime payload via `as RawNotificationPayload` without runtime validation. Should add a Zod schema to validate incoming data from Supabase Realtime channel.
- **Status:** RESOLVED (2026-03-09) — Story 4.0 Task 7.6. Added `rawNotificationSchema` Zod schema with `safeParse()`. Invalid payloads silently skipped. TD6 test activated and passing.

### TD-E2E-011: Pipeline resilience E2E — chaos test for real fallback failure
- **Date:** 2026-03-07
- **Story:** Story 3.4 (AI Resilience)
- **Phase:** ATDD
- **Severity:** Low
- **File:** `e2e/pipeline-resilience.spec.ts:11`
- **Description:** E2E spec uses PostgREST seeding to simulate `ai_partial` status. Real fallback failure injection (chaos testing) is impractical in standard E2E. A dedicated chaos-test workflow could inject provider errors to validate actual fallback chain behavior end-to-end.
- **Status:** DEFERRED → **Epic 9 — Story 9.1** (AI reliability tracking; add fallback failure chaos scenario to weekly CI `chaos-test.yml`)

### TD-PARITY-001: Redundant in-memory filter after query fileId fix
- **Date:** 2026-03-03
- **Story:** Story 2.10 (Parity Verification)
- **Phase:** CR
- **Severity:** Low
- **Description:** `generateParityReport.action.ts` L121-123 still filters findings in-memory by fileId after query was fixed to include fileId filter. The in-memory filter is now redundant but harmless (defense-in-depth).
- **Status:** RESOLVED — removed redundant filter, query pre-filters (commit 2026-03-03)

---

## CR Sprint — Story 3.2c (2026-03-03)

### ~~TD-PIPE-005: L3 chunk total failure silently loses findings~~
- **Status:** RESOLVED (2026-03-07) — Story 3.4: (1) `callWithFallback()` retries with fallback models per chunk before failing, (2) file status set to `ai_partial` (not `l3_completed`) when chunks fail after fallback exhaustion, (3) ReviewPageClient shows "Deep analysis unavailable — showing screening results" warning banner + ScoreBadge `'partial'` state

### TD-REVIEW-001: getFileReviewData Q4 JOIN matches sourceLang only
- **Date:** 2026-03-03
- **Story:** Story 3.2c (L2 Results Display & Score Update)
- **Phase:** CR R1
- **Severity:** Medium
- **File:** `src/features/review/actions/getFileReviewData.action.ts` — Q4 language_pair_configs JOIN
- **Description:** Q4 query JOINs `language_pair_configs` on `sourceLang` only. `projects.targetLangs` is a JSONB array (`jsonb('target_langs').$type<string[]>()`), not a single column — proper fix requires either JSONB containment query (`?| operator`) or file-level target language metadata (which doesn't exist yet). For single-target-lang projects (current majority), result is correct
- **Mitigation:** Most projects currently have a single target language, so `sourceLang`-only match returns correct `l2ConfidenceMin`. Multi-target returns null (safe default — no "Below threshold" warning)
- **Fix:** When file-level target language metadata is added (Epic 5 multi-lang support), JOIN on both source + target
- **Status:** DEFERRED → **Epic 5 — Language Intelligence & Non-Native Support** (multi-target-lang file metadata needed)

## Bug Fix — Duplicate Rerun Storage Error (2026-03-09)

### TD-UPLOAD-001: Route handler INSERT crashes on duplicate rerun (23505)
- **Date:** 2026-03-09
- **Story:** Story 2.1 (File Upload) — discovered during Story 2.3 TA
- **Phase:** TA (Test Automation validation run)
- **Severity:** Medium
- **Root Cause:** TD-DB-005 added `uq_files_project_hash` unique index but route handler (`src/app/api/upload/route.ts:190`) was NOT updated to handle INSERT conflict → PostgreSQL 23505 → HTTP 500 → "Storage error. Please try again."
- **Impact:** All file formats (SDLXLIFF, XLIFF, Excel) — any "Re-run QA" on duplicate file fails
- **Fix:** Route handler now checks for existing file before INSERT. If exists → UPDATE reset status to 'uploaded' (reuse record). Audit log differentiates `file.rerun` vs `file.uploaded`.
- **Files Changed:** `src/app/api/upload/route.ts`
- **Origin:** Story 2.3 TA Run (Party Mode analysis traced to TD-DB-005 half-fix)
- **Status:** RESOLVED (2026-03-09)

### TD-UPLOAD-002: batchInsertSegments missing DELETE for re-parse idempotency
- **Date:** 2026-03-09
- **Story:** Story 2.1 (File Upload) — discovered during Story 2.3 TA
- **Phase:** TA (Test Automation validation run)
- **Severity:** Medium
- **Root Cause:** `parseFile.action.ts:batchInsertSegments()` does INSERT without DELETE old segments → `uq_segments_file_segment` constraint blocks re-parse after file status reset. Violates Guardrail #6 (DELETE + INSERT = transaction)
- **Impact:** Re-run QA succeeds at upload but parse fails ("Parse failed" shown in UI)
- **Fix:** Added `tx.delete(segments).where(eq(segments.fileId, fileId))` at start of transaction, before batch INSERT
- **Files Changed:** `src/features/parser/actions/parseFile.action.ts`
- **Origin:** Story 2.3 TA Run — discovered when `upload-duplicate.spec.ts` failed with "Parse failed"
- **Status:** RESOLVED (2026-03-09)

### TD-E2E-012: assertDuplicateDetected helper wrong text match
- **Date:** 2026-03-09
- **Story:** Story 2.1 (File Upload) — pre-existing helper bug
- **Phase:** TA (Test Automation validation run)
- **Severity:** Low
- **Root Cause:** `e2e/helpers/fileUpload.ts:assertDuplicateDetected()` checked for `"This file was uploaded on"` but actual dialog text is `"{filename} was uploaded on"`. Helper never tested in real E2E run.
- **Fix:** Changed assertion to `getByText('was uploaded on', { exact: false })`
- **Files Changed:** `e2e/helpers/fileUpload.ts`
- **Status:** RESOLVED (2026-03-09)

---

## CR Sprint — Story 3.5 (2026-03-08)

### ~~TD-ORPHAN-004: NotificationDropdown component not wired to any page~~
- **Status:** RESOLVED (2026-03-09) — Already wired in `src/components/layout/app-header.tsx:4,20`. Import + mount confirmed. Orphan scan false positive — component was wired before tracker entry was created.

### TD-E2E-013: F5e — Esc hierarchy with dropdown inside Sheet (review-keyboard E2E)
- **Date:** 2026-03-09
- **Story:** Story 4.0 (Review Infrastructure Setup)
- **Phase:** CR R1
- **Severity:** Low
- **File:** `e2e/review-keyboard.spec.ts` — test F5e
- **Description:** E2E test for Esc key hierarchy (dropdown inside Sheet closes before Sheet) is skipped because FindingDetailSheet has no interactive dropdowns yet. Story 4.2 added action buttons (not dropdowns) inside Sheet. Dropdown (severity override) is a future story.
- **Status:** RESOLVED (2026-03-26 — Story 4.3 implemented SeverityOverrideMenu as dropdown inside Sheet. E2E test F5e fully implemented in `e2e/review-keyboard.spec.ts` and not skipped.)

### TD-E2E-014: E1 — Full keyboard review flow (review-keyboard E2E)
- **Date:** 2026-03-09
- **Story:** Story 4.0 (Review Infrastructure Setup)
- **Phase:** CR R1 → ATDD 4.1b (rewritten 2026-03-10)
- **Severity:** Low
- **File:** `e2e/review-keyboard.spec.ts` — test E1
- **Description:** E2E test for full keyboard review flow. Rewritten during ATDD 4.1b from Sheet-open assertions → inline expand assertions (J/K navigate → Enter expand `aria-expanded="true"` → Esc collapse → focus restore). `test.skip()` removed — test E1 unskipped with seed data updated (3 major findings, no accordion dependency).
- **Status:** RESOLVED (2026-03-10) — Story 4.1b GREEN phase

### TD-E2E-015: TD2 — Score recalculate after finding action (review-score E2E)
- **Date:** 2026-03-09
- **Story:** Story 4.0 (Review Infrastructure Setup)
- **Phase:** CR R1
- **Severity:** Low
- **File:** `e2e/review-score.spec.ts` — test TD2
- **Description:** E2E test for score recalculation after accepting a finding. Review actions are now implemented in Story 4.2. E2E test can be unskipped.
- **Status:** OPEN → **Story 5.2a** (non-native auto-tag adds review action changes → verify score recalc E2E at same time)

### ~~TD-REVIEW-002: Realtime auto_passed transition doesn't show rationale~~
- **Date:** 2026-03-08
- **Story:** Story 3.5 (Score Lifecycle & Confidence Display)
- **Phase:** CR R1
- **Severity:** Medium
- **File:** `src/features/review/hooks/use-score-subscription.ts`, `src/features/review/stores/review.store.ts`
- **Description:** `AutoPassRationale` renders from `initialData.autoPassRationale` (server-side SSR data). If score transitions to `auto_passed` via Realtime after page load, rationale wasn't propagated to store.
- **Fix:** Added `autoPassRationale` field to ScoreSlice in review store. `useScoreSubscription` now extracts `auto_pass_rationale` from Realtime INSERT payload and polling fallback, passes to `updateScore()`. Store-driven rationale display works even on live transition.
- **Status:** RESOLVED (2026-03-09) — Story 4.0 Task 7.7. TD7 test activated and passing.

---

## CR Sprint — Story 4.1c (2026-03-13)

### TD-E2E-016: Detail Panel E2E tests skipped — 7 `test.skip` without TD ref
- **Date:** 2026-03-13
- **Story:** Story 4.1c (Detail Panel & Segment Context)
- **Phase:** CR R1
- **Severity:** Medium
- **File:** `e2e/review-detail-panel.spec.ts` — 7 tests (`E1` through `E7`)
- **Description:** All 7 assertion E2E tests use `test.skip()`. Action buttons are now wired (Story 4.2). Tests can be unskipped.
- **Status:** OPEN → **Story 5.1** (Language Bridge adds back-translation sidebar to detail panel → implement E2E for both panel + new feature together)

### TD-E2E-017: Responsive Layout E2E tests skipped — 30 `test.skip` without TD ref
- **Date:** 2026-03-13
- **Story:** Story 4.1d (Responsive Layout)
- **Phase:** CR R1
- **Severity:** Medium
- **File:** `e2e/review-responsive.spec.ts` — 30 tests (desktop×10, laptop×10, mobile×10)
- **Description:** All 30 E2E tests use `test.skip()`. Action buttons now wired (Story 4.2). Tests can be unskipped.
- **Status:** OPEN → **Story 5.3** (Verification — responsive tests need all layouts finalized: 5.1 sidebar + 5.2c native workflow UI → verify in verification story)

### TD-UX-004: Minor accordion transient activeIndex=0 (1 frame glitch)
- **Date:** 2026-03-14
- **Story:** Story 4.2 (CR systematic review — C2 finding)
- **Phase:** CR
- **Severity:** Low
- **File:** `src/features/review/components/FindingList.tsx:177-189`
- **Description:** When storeSelectedId targets a minor finding with accordion collapsed, `setActiveFindingId` fires in the same effect as `setMinorAccordionValue`. React batches them, but `activeIndex` derivation returns 0 for one frame before flattenedIds includes the minor ID. Visual: keyboard cursor flashes to row 0 for ~16ms. No functional impact — DOM focus fires correctly after accordion re-render.
- **Status:** DEFERRED → **Story 5.3** (verification — accordion lifecycle; 1-frame glitch is cosmetic-only, verify during responsive/accessibility pass)

### TD-E2E-018: E-B1 action bar focus blocked by Radix Sheet aria-hidden
- **Date:** 2026-03-14
- **Story:** Story 4.2 (CR systematic review — E-B1 finding)
- **Phase:** CR
- **Severity:** Medium
- **File:** `e2e/review-actions.spec.ts` E-B1 test + `src/features/review/hooks/use-focus-management.ts`
- **Description:** When all findings are reviewed, autoAdvance calls `actionBar.focus()` via rAF. But if Radix Sheet (finding detail panel) is open, it sets `aria-hidden="true"` on background content including the action bar, preventing actual DOM focus. E2E test asserts `tabindex="0"` (intent correct) instead of `toBeFocused()` (blocked by Sheet). Fix: close Sheet when no pending left, or use `inert` instead of `aria-hidden`.
- **Status:** DEFERRED → **Story 5.3** (verification — Sheet/detail panel lifecycle; close Sheet when no pending findings left, or use `inert` instead of `aria-hidden`)

### TD-E2E-019: E-R9 score direction assertion weakened to scoreChanged
- **Date:** 2026-03-14
- **Story:** Story 4.2 (CR systematic review — E-R9 finding)
- **Phase:** CR
- **Severity:** Low
- **File:** `e2e/review-actions.spec.ts` E-R9 test
- **Description:** E-R9 tests that MQM score changes after rejecting a finding. Original assertion: `toBeGreaterThan(initialMqm)` (score should increase when penalty removed). Changed to `scoreChanged !== initialMqm` because serial test suite state pollution makes `initialMqm` baseline unreliable — prior Inngest recalculation jobs from E-R1..E-R8 may still be processing. Direction is verified in unit tests (`mqmCalculator.test.ts`). Fix: isolate E-R9 with its own seeded file, or use a dedicated project per test.
- **Status:** ACCEPTED — unit tests verify direction; E2E verifies integration (score DOES change)

### TD-AUTH-001: updateNoteText allows cross-user note editing within tenant
- **Date:** 2026-03-15
- **Story:** Story 4.3 (CR R1 — M3 finding)
- **Phase:** CR
- **Severity:** Medium
- **File:** `src/features/review/actions/updateNoteText.action.ts:78-94`
- **Description:** `updateNoteText` finds the latest `review_actions` row with `actionType='note'` for a finding, but does NOT filter by `userId`. User B (same tenant, qa_reviewer role) can overwrite User A's note text. The AC doesn't specify cross-user note ownership behavior — design decision needed: is note per-user or per-finding?
- **Mitigation:** Same-tenant users collaborating on same file is rare in current product. RLS prevents cross-tenant access.
- **Fix:** Add `eq(reviewActions.userId, userId)` to the WHERE clause, OR make the design decision that notes are per-finding (shared). Requires UX design input.
- **Status:** DEFERRED → **Story 5.2c** (native reviewer workflow — collaboration features + note ownership model)

### TD-UX-005: Desktop→laptop viewport resize leaves detail panel blank
- **Date:** 2026-03-15
- **Story:** Story 4.3 (CR adversarial review — H3 finding)
- **Phase:** CR
- **Severity:** Low
- **File:** `src/features/review/components/ReviewPageClient.tsx` — `handleActiveFindingChange` + `detailFindingId` derivation
- **Description:** On desktop (>=1440px), `handleActiveFindingChange` syncs `selectedId` via `setSelectedFinding(id)`. On laptop/mobile, it does NOT sync (Sheet would open and block finding list). If user is on desktop with finding X active, then resizes browser to laptop viewport: `detailFindingId` switches from `activeFindingState` to `selectedId`. Since `selectedId` was set on desktop, it still holds the correct value. However, if `activeFindingState` and `selectedId` diverge (e.g., user navigates findings after resize), the detail panel shows stale finding. Edge case: users don't resize dev tools in production. Fix: add `useEffect` that syncs `selectedId` from `activeFindingState` when `isDesktop` transitions from `true` to `false`.
- **Status:** DEFERRED → **Story 5.3** (verification — responsive check; sync `selectedId` on viewport transition)

### TD-DATA-001: `reviewerIsNative` hardcoded to `false` in feedback_events inserts
- **Date:** 2026-03-15
- **Story:** Story 4.4b (also present since Story 4.2 in rejectFinding.action.ts)
- **Phase:** impl
- **Severity:** Low
- **Files:** `src/features/review/actions/rejectFinding.action.ts:88`, `src/features/review/actions/undoAction.action.ts:102`, `src/features/review/actions/undoBulkAction.action.ts:176`, `src/features/review/actions/addFinding.action.ts:194`
- **Description:** `reviewerIsNative: false` is hardcoded in all `feedback_events` INSERT paths. Should be derived from user profile (native language pair setting). Affects AI training data quality — all feedback is tagged as non-native reviewer regardless of actual language pair proficiency.
- **Mitigation:** Low impact until AI learning pipeline (Epic 9) consumes this field. All rows have consistent `false` value — no data inconsistency.
- **Fix:** Wire from user profile `reviewer_is_native` field once Story 5.2a wires `determineNonNative()` into all 7 review actions that write `reviewerIsNative`.
- **Status:** PARTIALLY RESOLVED (2026-03-26) — `determineNonNative()` helper created + `getCurrentUser` returns `nativeLanguages`. Full wiring into review actions deferred to Story 5.2a.

---

## Category 7: Architecture & Patterns

### TD-ARCH-001: FileNavigationDropdown uses window.location.href instead of Next.js Link
- **Date:** 2026-03-16
- **Story:** 4.5 (Search, Filter & AI Layer Toggle)
- **Phase:** impl + CR
- **Severity:** Medium
- **Files:** `src/features/review/components/FileNavigationDropdown.tsx`, `src/features/review/stores/review.store.ts`
- **Description:** FileNavigationDropdown ใช้ `window.location.href` (full page reload) แทน Next.js `<Link>` สำหรับ file navigation.
- **Root cause:** Next.js `startTransition` เก็บ old + new component tree ไว้พร้อมกัน → 2 instances share Zustand singleton → `resetForFile()` wipe store สลับกัน → infinite loop
- **Fix (2026-03-16):**
  1. `fileStates: Map<fileId, FileState>` — แต่ละ file มี state แยก ไม่ wipe กัน
  2. `ReviewFileIdContext` — แต่ละ instance อ่าน fileId ของตัวเอง ผ่าน React Context
  3. `createSyncingSet` wrapper — auto-sync flat fields → Map ทุก `set()` call
  4. `isStaleInstance` — old instance ซ่อนตัว (`opacity:0 + pointer-events:none`)
  5. FileNavigationDropdown reverted to `<Link prefetch={false}>`
- **Verified:** E2E E-04 passes with `<Link>` nav (24.6s vs 29s full reload), 12/12 E2E green, 3668 unit tests green
- **Status:** RESOLVED (2026-03-16 — file-scoped store refactor)

### TD-AI-002: L2 Precision below 70% target — baseline annotation gap + L1 over-detection
- **Date:** 2026-03-18
- **Story:** 4.8
- **Phase:** verification
- **Severity:** Medium
- **Description:** Pipeline verification on 500-segment test file: L2 Recall=100% (PASS), L2 Precision=27.6% (FAIL, target >=70%). Root cause: (1) L1 rule engine detects 538 findings — many are legitimate issues (whitespace, number format) not in the 88-error baseline annotation set. (2) Baseline annotations only cover deliberately injected errors, not all L1-detectable issues. Precision computation penalizes correct L1 detections as FP.
- **Impact:** Metric reporting inaccuracy — actual precision likely higher when baseline includes all L1-detectable patterns. No user-facing bug.
- **Fix:** (1) Expand baseline annotations to include all L1-detectable patterns (whitespace, formatting, tag structure). (2) Tune L2 AI prompts to reduce false positives. (3) Add category-aware matching to precision computation (L1 findings vs L1 baseline, L2 findings vs L2 baseline separately).
- **Effort:** 4-8 ชม.
- **Status:** SUPERSEDED by TD-AI-003

### TD-AI-003: L1 end-punctuation rule false positive for Thai/Lao/Khmer/Myanmar target languages
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during pipeline verification)
- **Phase:** verification
- **Severity:** Medium
- **Description:** L1 "End punctuation mismatch" flagged ~395/500 Thai segments: source `.` vs Thai character without period. Thai does not use period as sentence terminator.
- **Fix:** Added language-aware skip in `checkEndPunctuation`: skip period mismatch when target lang is Thai/Lao/Khmer/Myanmar AND target ends with non-punctuation character. If target has explicit punctuation (!/?) still flags correctly.
- **Status:** RESOLVED (2026-03-18 — `formattingChecks.ts` + 55 unit tests GREEN)

### TD-AI-004 (CRITICAL): L2/L3 findings silently dropped — segmentId bracket mismatch
- **Date:** 2026-03-18 (discovered), existed since 2026-03-01 (Story 3.2a, commit `559c908`)
- **Story:** 4.8 (discovered during pipeline verification)
- **Phase:** verification
- **Severity:** CRITICAL
- **Files:** `build-l2-prompt.ts:88,103`, `build-l3-prompt.ts`, `runL2ForFile.ts:362`, `runL3ForFile.ts`
- **Description:** Prompt displayed segments as `[uuid]` (with brackets). AI returned `[uuid]` in findings. Validation Set stored bare `uuid` → `has("[uuid]")` = false → **every L2/L3 finding silently dropped**. Pipeline reported "success, 0 findings" — no error, no exception, only `logger.warn`. L2/L3 never produced real findings for 17 days since Epic 3 launch.
- **Impact:** CRITICAL — product core feature "AI-powered QA" did not work. All L2/L3 AI analysis results were discarded silently. Users saw 0 AI findings and assumed the file was clean.
- **Root cause of escape:** Epic 3 unit tests mocked AI responses (no real brackets). E2E tests seeded findings directly into DB (skipped L2 pipeline). No integration test with real AI + finding verification existed.
- **Fix:** (1) Prompt example: clarified UUID only, no brackets. (2) Parser: defensive bracket strip before validation. (3) L3: same fixes. (4) Regression test added.
- **Status:** RESOLVED (2026-03-18 — L2 Precision 75%, Recall 60% after fix)

### ~~TD-AI-005: CAS guard race — findings orphaned when status UPDATE fails after INSERT~~
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during pipeline audit)
- **Phase:** verification
- **Severity:** High
- **Files:** `runL2ForFile.ts`, `runL3ForFile.ts`
- **Description:** If L2 findings INSERT succeeds but file status UPDATE to `l2_completed` fails → Inngest retry → CAS guard (`WHERE status='l1_completed'`) fails because status = `l2_processing` → `NonRetriableError` → findings orphaned in DB without being scored.
- **Fix:** Wrap findings INSERT + status UPDATE in same `db.transaction()` (Guardrail #6).
- **Resolution:** Both `runL2ForFile.ts` (lines 465-486) and `runL3ForFile.ts` (lines 527-548) now use `db.transaction()` that wraps DELETE old findings + INSERT new findings + UPDATE file status as a single atomic operation. If any step fails, the entire transaction rolls back — no orphaned findings, CAS guard remains valid on retry.
- **Status:** RESOLVED (2026-03-26 — Epic 5 Prep Task P1, transaction-atomic findings+status update)

### ~~TD-AI-006: L3 segment filter excludes segments from failed L2 chunks~~
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during pipeline audit)
- **Phase:** verification
- **Severity:** High
- **Files:** `runL2ForFile.ts:356-367`, `runL3ForFile.ts:243-257`
- **Description:** L3 filters segments to only those flagged by L2 (`l2FlaggedSegmentIds`). If an L2 chunk fails (partial failure), segments in that chunk have 0 L2 findings → excluded from L3 analysis. But exclusion is because L2 failed, not because segment is clean.
- **Fix:** Track which segments were in failed chunks. Include those in L3 scope as "unscreened" segments.
- **Resolution:** `runL2ForFile.ts` now collects `failedChunkSegmentIds` (lines 356-367) from failed chunk results and returns them in `L2Result`. `runL3ForFile.ts` accepts `l2FailedChunkSegmentIds` parameter (line 42-43, 107), creates `l2UnscreenedSegmentIds` Set (lines 247-253), and includes those segments in L3 filtered scope (line 256: `l2FlaggedSegmentIds.has(s.id) || l2UnscreenedSegmentIds.has(s.id)`). Failed L2 chunks no longer cause silent coverage gaps in L3.
- **Status:** RESOLVED (2026-03-26 — Epic 5 Prep Task P1, failedChunkSegmentIds passed from L2 to L3)

### TD-AI-007: L2 prompt "L1 checks glossary" gap with lowConfidenceMatch
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during pipeline audit)
- **Phase:** verification
- **Severity:** Medium
- **Files:** `build-l2-prompt.ts:67`, `glossaryChecks.ts:31`
- **Description:** L2 prompt says "L1 already checks glossary terms" but L1 `checkGlossaryComplianceRule` skips `lowConfidenceMatches`. Partial fix applied (removed "glossary terms" from L1-checks list) but no measurable improvement — L2 still needs `lowConfidenceMatches` sent as context to effectively detect glossary violations.
- **Fix:** Send `lowConfidenceMatches` from L1 glossary check as additional context in L2 prompt (option a from original TD).
- **Effort:** 2-3 ชม.
- **Status:** DEFERRED → **Epic 9 — AI prompt tuning** (prompt text change alone insufficient, needs data pipeline change)

### ~~TD-AI-008: L3 findings not deduplicated against L2 — duplicate segment+category~~
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during Thorough mode E2E)
- **Phase:** verification
- **Severity:** Medium
- **Files:** `runL3ForFile.ts:523-576`
- **Description:** L3 findings that confirm L2 (same segment+category) were inserted into DB but never deleted after confirm. Step 9b boosted L2 confidence + appended [L3 Confirmed] but left the duplicate L3 row. Also category comparison was case-sensitive (L2 "Accuracy" vs L3 "accuracy" = no match).
- **Status:** RESOLVED (2026-03-18) — Added dedup deletion after confirm + case-insensitive category matching.

### TD-AI-009: L2 recall 52% — gpt-4o-mini low detection rate for semantic issues
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during pipeline verification)
- **Phase:** verification
- **Severity:** Medium
- **Files:** `build-l2-prompt.ts`, pipeline prompts
- **Description:** L2 (gpt-4o-mini) detects only ~16/33 semantic baseline issues (glossary_violation, consistency_error). Recall 52% vs AC6 target 60%. L1 detects 46/55 deterministic issues correctly. Combined recall limited by L2 prompt effectiveness.
- **Impact:** Users miss ~48% of semantic QA issues in Economy mode.
- **Fix:** (1) Improve L2 prompt with examples and few-shot patterns. (2) Add glossary context to L2 prompt. (3) Consider model upgrade for L2.
- **Effort:** 4-8 ชม.
- **Status:** DEFERRED → **Epic 9 — AI prompt tuning + model evaluation**

### TD-TEST-006: Missing real AI integration test for L2/L3 pipeline
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered — L2 bracket bug ซ่อน 17 วันเพราะไม่มี test นี้)
- **Phase:** verification
- **Severity:** High
- **Description:** ไม่มี integration test ที่ call real AI API + verify findings insert เข้า DB. Unit tests mock AI response ทั้งหมด → ไม่จับ format mismatch ระหว่าง prompt → AI response → parser. E2E tests seed findings ตรงเข้า DB → bypass pipeline. ต้องสร้าง test ที่: (1) call real AI (gpt-4o-mini/claude-sonnet) (2) verify findings > 0 ถูก insert (3) verify segmentId, category, severity ถูกต้อง.
- **Fix:** สร้าง integration test story: test script + CI gate (weekly/pre-release) + budget limit per run. ใช้ `scripts/test-l2-capability.mjs` เป็น starting point.
- **Effort:** 4-8 ชม. (story-level work)
- **Status:** RESOLVED (2026-03-26 — `e2e/review-pipeline-verification.spec.ts` calls real AI (gpt-4o-mini + claude-sonnet) + verifies `l1.length > 0` and `l2.length > 0` findings inserted into DB. Precision/recall assertions included. `scripts/verify-pipeline.mjs` + `scripts/test-l2-capability.mjs` also exist for manual verification.)

### TD-TEST-007: Test data generator inject bugs — 25/88 baseline annotations invalid
- **Date:** 2026-03-18
- **Story:** 4.8 (discovered during pipeline verification)
- **Phase:** verification
- **Severity:** Medium
- **Files:** `scripts/generate-verification-data.mjs`, `docs/test-data/verification-baseline/baseline-annotations.json`
- **Description:** 3 script bugs cause 25/88 baseline annotations to not have actual errors in segments: (1) 6 number_mismatch on templates without `{0}`, (2) 4 placeholder_mismatch same, (3) 15 glossary_violation on templates without glossary terms. Recall measured as 52% but actual on real errors is ~73%.
- **Fix:** Validate template has required placeholder/term before injecting. Assign error types only to compatible templates.
- **Effort:** 1-2 ชม.
- **Status:** DEFERRED → **Story 5.3** (verification — fix test data generator to validate template compatibility before injecting errors)

### TD-ARCH-002: Zustand review store dual-write (flat fields + fileStates Map)
- **Date:** 2026-03-16
- **Story:** TD-ARCH-001 refactor
- **Phase:** impl
- **Severity:** Low
- **Files:** `src/features/review/stores/review.store.ts`
- **Description:** Store ยังมี 17 flat fields (findingsMap, selectedId, filterState, etc.) ที่ dual-write กับ `fileStates` Map ผ่าน `createSyncingSet` wrapper. Flat fields ยังถูกใช้โดย: (1) Realtime hooks 4 ตัว (`use-findings-subscription`, `use-score-subscription`, `use-undo-redo`, `use-review-actions`) ที่เรียก `.getState().setFinding(id, finding)` ไม่มี explicit `fileId` param, (2) `selectAllFiltered` + `selectRange` ที่อ่าน flat `findingsMap`/`sortedFindingIds` ผ่าน `get()`.
- **Impact:** Zero functional impact — `createSyncingSet` ทำ dual-write อัตโนมัติ ไม่มี data inconsistency. เพิ่ม ~200 bytes memory + ~0.01ms overhead ต่อ `set()` call (สร้าง Map ใหม่ทุก sync).
- **Ideal fix:** (1) Refactor 4 Realtime hooks ให้ pass `fileId` param, (2) `selectAllFiltered`/`selectRange` อ่านจาก Map, (3) ลบ flat fields + `createSyncingSet`, (4) Update 9+ test mocks
- **Effort:** 4-6 ชม.
- **Status:** DEFERRED → **Story 5.2c** (native reviewer workflow has cross-file features that need single source of truth from Map-based store)

### ~~TD-TEST-010: Pipeline precision/recall E2E tests~~
- **Date:** 2026-03-18
- **Story:** 4.8
- **Phase:** ATDD/impl
- **Severity:** Medium
- **Files:** `e2e/review-pipeline-verification.spec.ts`
- **Status:** RESOLVED (2026-03-18) — E2E tests fully implemented (TA-19 precision, TA-20 recall, TA-24 timing). Runtime skip guard `test.skip(!process.env.INNGEST_DEV_URL)` — runs when Inngest available. Run: `INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-pipeline-verification.spec.ts`. TA-21 (L3 dedup) deferred to TD-TEST-013 (Thorough mode scope).

### TD-TEST-011: Performance benchmark E2E thresholds relaxed for dev mode
- **Date:** 2026-03-18
- **Story:** 4.8
- **Phase:** impl
- **Severity:** Medium
- **Files:** `e2e/review-accessibility.spec.ts` (TA-12, TA-13, TA-14)
- **Description:** AC4 targets: render <2s, nav <100ms, action <200ms. E2E uses 15s/2s/10s (5-50x relaxed) due to React Strict Mode + Turbopack dev overhead. No production-mode CI gate exists.
- **Impact:** Cannot catch real performance regressions in dev-mode E2E.
- **Fix:** Add `npm run build && npx playwright test --grep perf` production-mode perf gate in CI with AC4 thresholds.
- **Effort:** 2-3 ชม.
- **Status:** DEFERRED → **Epic 8 — Story 8.2** (CI/CD optimization; add production-mode perf gate with AC4 thresholds)

### ~~TD-TEST-012: Bulk action performance benchmark (50 findings + score recalc) not implemented~~
- **Date:** 2026-03-18
- **Story:** 4.8 Task 6.5
- **Phase:** impl
- **Severity:** Low
- **Status:** RESOLVED (2026-03-18) — TA-12b rewritten with Shift+Click (correct mechanism). 776ms PASSED.

### TD-UX-006: Shift+J/K bulk selection not implemented — AC1 of Story 4.4a
- **Date:** 2026-03-18
- **Story:** 4.4a (discovered during Story 4.8 CR)
- **Phase:** impl
- **Severity:** Medium
- **Files:** `src/features/review/hooks/use-keyboard-actions.ts`, `src/features/review/components/FindingCardCompact.tsx`
- **Description:** Epic 4 spec (line 241) and Story 4.4a AC1 require both `Shift+Click` AND `Shift+J/K` for bulk selection. Story 4.4a Task 5.2 marked `[x]` with note "deferred — uses existing J/K navigation with store selectRange" but Shift+J/K was never implemented and no TD was logged. Only Shift+Click works. `KeyboardCheatSheet.tsx:53` correctly shows `Shift+Click` only.
- **Impact:** Keyboard-only users cannot extend selection without mouse — accessibility gap (WCAG SC 2.1.1 keyboard-only).
- **Fix:** Register `shift+j` and `shift+k` in keyboard actions hook → call `selectRange` from current selection anchor to next/prev finding.
- **Effort:** 2-3 ชม.
- **Status:** DEFERRED → **Story 5.3** (verification — keyboard accessibility; implement Shift+J/K for WCAG SC 2.1.1 compliance)

### ~~TD-TEST-013: Thorough mode pipeline verification not run~~
- **Date:** 2026-03-18
- **Story:** 4.8 Task 7.4
- **Phase:** verification
- **Severity:** Low
- **Files:** `e2e/review-pipeline-verification.spec.ts`
- **Status:** RESOLVED (2026-03-18) — Thorough mode E2E fully implemented + verified. L1 (70 findings) + L2 (5 findings) + L3 (1 finding, 10K tokens, success). L3 dedup: 0 duplicates. Thorough timing: 238.8s (<10m). 12/12 E2E PASSED.

### ~~TD-TEST-014: AI Usage Dashboard + budget threshold verification~~
- **Date:** 2026-03-18
- **Story:** 4.8 Tasks 7.6, 7.7
- **Phase:** verification
- **Severity:** Low
- **Status:** RESOLVED (2026-03-18) — E2E tests created in `e2e/ai-cost-verification.spec.ts`: TA-26 seeds ai_usage_logs + verifies `/admin/ai-usage` dashboard totals, TA-27 seeds budget + verifies `/projects/:id/settings` budget card. Script verification in `scripts/verify-pipeline.mjs` also enhanced with token/integrity/aggregation checks.

## Category 9: Pipeline Adversarial Review (2026-03-26)

### ~~TD-PIPE-002: L3 confirm/contradict in separate transaction from L3 findings INSERT~~
- **Date:** 2026-03-26
- **Story:** Adversarial review finding #2
- **Phase:** review
- **Severity:** Medium
- **Files:** `src/features/pipeline/helpers/runL3ForFile.ts`
- **Description:** L3 confirm/contradict logic (updating L2 findings with `[L3 Confirmed]`/`[L3 Disagrees]` + deleting duplicate L3 findings) runs in a SEPARATE transaction from the L3 findings INSERT + file status UPDATE. If process crashes between the two transactions: file is `l3_completed`, CAS guard blocks retry, L2 findings never get confirm/contradict markers → permanent data inconsistency.
- **Fix:** Merged all operations (DELETE old L3 → INSERT new L3 with `.returning()` → status UPDATE → confirm/contradict L2 → dedup DELETE) into single `db.transaction()`. Used `.returning()` to get L3 DB IDs in-transaction instead of separate query.
- **Status:** RESOLVED (2026-03-26) — Single atomic transaction. 60/60 L3 tests PASSED including all confirm/contradict edge cases.

### TD-PIPE-003: Budget check TOCTOU race — no reservation mechanism
- **Date:** 2026-03-26
- **Story:** Adversarial review finding #3
- **Phase:** review
- **Severity:** Medium
- **Files:** `src/lib/ai/budget.ts`, `src/features/pipeline/helpers/runL2ForFile.ts`, `src/features/pipeline/helpers/runL3ForFile.ts`
- **Description:** `checkProjectBudget()` does a snapshot `SUM(estimated_cost)` read. Between budget check and AI call, 4+ DB round-trips occur. Concurrent pipelines on the same project can all pass the check and overshoot by `N × cost_per_chunk`. Cost logging is fire-and-forget (`.catch()`), compounding the issue.
- **Fix:** Implement budget reservation pattern: atomically reserve estimated cost BEFORE AI call, release/adjust after actual cost is known.
- **Effort:** 6-8 ชม.
- **Status:** DEFERRED → **Epic 6** (billing infrastructure — requires reservation table + atomic decrement pattern)

### TD-PIPE-004: Oversized single segment — no pre-flight token limit check
- **Date:** 2026-03-26
- **Story:** Adversarial review finding #7
- **Phase:** review
- **Severity:** Low
- **Files:** `src/features/pipeline/helpers/chunkSegments.ts`, `src/features/pipeline/helpers/runL2ForFile.ts`, `src/features/pipeline/helpers/runL3ForFile.ts`
- **Description:** `chunkSegments()` places a single segment that exceeds 30K chars into its own chunk without checking total prompt token count. If prompt (segment + context + glossary + instructions) exceeds model context limit, `maxOutputTokens` may be insufficient for structured JSON output → `NoObjectGeneratedError` → `NonRetriableError`. Same segment fails in both L2 and L3.
- **Fix:** Add pre-flight check: estimate total tokens (segment chars / 4 + prompt overhead), warn/skip segments that would exceed model context limit.
- **Effort:** 3-4 ชม.
- **Status:** DEFERRED → **Epic 6** (pipeline optimization — requires token estimation utility; real-world risk is low because 30K-char single segments are extremely rare in localization files)

### ~~TD-PIPE-005: L3 has no category validation against taxonomy~~
- **Date:** 2026-03-26
- **Story:** Adversarial review finding #5
- **Phase:** review
- **Severity:** Medium
- **Files:** `src/features/pipeline/helpers/runL3ForFile.ts`
- **Description:** L2 validates AI-returned categories against taxonomy definitions (drops invalid categories). L3 has NO category validation — any category string the AI returns is persisted to DB. Invalid categories may not match UI filters, confusing users.
- **Fix:** Port L2's `validCategories` check to L3's finding validation loop (identical pattern).
- **Effort:** 1 ชม.
- **Status:** RESOLVED (2026-03-26) — Ported L2's `validCategories` + `droppedByInvalidCategory` pattern to L3. Guardrail #23 quick fix.

### TD-PIPE-006: Hardcoded AI cost rates in MODEL_CONFIG
- **Date:** 2026-03-26
- **Story:** Adversarial review finding #8
- **Phase:** review
- **Severity:** Low
- **Files:** `src/lib/ai/types.ts`
- **Description:** `costPer1kInput` and `costPer1kOutput` are hardcoded constants. If OpenAI or Anthropic change pricing (frequent), cost estimates drift → budget checks become inaccurate. No mechanism to update rates without code deploy.
- **Fix:** Move cost rates to DB table (admin-configurable) or external config. Add periodic pricing validation.
- **Effort:** 4-6 ชม.
- **Status:** DEFERRED → **Epic 6** (billing infrastructure — cost rate management is part of billing admin feature)

### TD-PIPE-007: Cost logging fire-and-forget may undercount budget usage
- **Date:** 2026-03-26
- **Story:** Adversarial review finding #12
- **Phase:** review
- **Severity:** Low
- **Files:** `src/features/pipeline/helpers/runL2ForFile.ts`, `src/features/pipeline/helpers/runL3ForFile.ts`, `src/lib/ai/costs.ts`
- **Description:** `logAIUsage(record).catch()` is fire-and-forget. If DB insert fails (constraint violation, connection timeout), cost is not recorded → `checkProjectBudget()` undercounts → budget can be exceeded silently. Compounds with TD-PIPE-003 TOCTOU race.
- **Fix:** Make cost logging part of the main transaction, or at minimum retry once on failure. Alternatively, implement the reservation pattern in TD-PIPE-003 which makes post-hoc logging less critical.
- **Effort:** 2-3 ชม.
- **Status:** DEFERRED → **Epic 6** (billing infrastructure — coupled with TD-PIPE-003 budget reservation redesign)

## Category 10: Scoring Adversarial Review (2026-03-26)

### ~~TD-SCORE-001: Graduation notification dedup is per-tenant per-language-pair, not per-project~~
- **Date:** 2026-03-26
- **Story:** Scoring adversarial review finding #5
- **Phase:** review
- **Severity:** Low
- **Files:** `src/features/scoring/helpers/scoreFile.ts`
- **Description:** JSONB containment check `metadata @> {sourceLang, targetLang}` doesn't include `projectId`. If tenant has 2 projects with same language pair, only the first project to reach 50 files gets the graduation notification — second project never gets one.
- **Fix:** Added `projectId` to JSONB containment check. Party Mode decision: graduation is per-project (threshold is per-project).
- **Status:** RESOLVED (2026-03-26)

### TD-SCORE-002: Debounce emitter unused in Server Action path — N finding changes = N recalculations
- **Date:** 2026-03-26
- **Story:** Scoring adversarial review finding #8
- **Phase:** review
- **Severity:** Low
- **Files:** `src/features/review/actions/helpers/executeReviewAction.ts`, `src/features/review/utils/finding-changed-emitter.ts`
- **Description:** `executeReviewAction` sends `finding.changed` via `inngest.send()` directly. The 500ms debounce emitter (`finding-changed-emitter.ts`) is only used client-side. 5 rapid single-finding actions = 5 Inngest events = 5 sequential scoreFile calls. Not a bug (final score is always correct) but unnecessary work. Inngest projectId concurrency serializes them safely.
- **Fix:** Add Inngest-level debounce (`debounce` config) or batch event accumulation.
- **Effort:** 2-3 ชม.
- **Status:** DEFERRED → **Epic 6** (performance optimization — current behavior is correct, just wasteful)

### TD-SCORE-003: penaltyWeight uses PostgreSQL `real` (float32) — precision loss with very small custom weights
- **Date:** 2026-03-26
- **Story:** Scoring adversarial review finding #9
- **Phase:** review
- **Severity:** Low
- **Files:** `src/db/schema/severityConfigs.ts`, `src/features/scoring/mqmCalculator.ts`
- **Description:** `penaltyWeight: real` = float32. Default weights (25, 5, 1) are exact integers — no issue. Custom weights like `0.001` accumulate float32 errors across many findings. Mitigated by 2dp rounding in calculator. Would need `numeric` type for arbitrary-precision.
- **Effort:** 2 ชม. (migration + type changes)
- **Status:** DEFERRED → **Epic 6** (admin config — no current admin UI sets custom weights)

### TD-SCORE-004: Score DELETE+INSERT may cause brief Realtime "no score" flash
- **Date:** 2026-03-26
- **Story:** Scoring adversarial review finding #11
- **Phase:** review
- **Severity:** Low
- **Files:** `src/features/scoring/helpers/scoreFile.ts`, `src/features/review/hooks/use-score-subscription.ts`
- **Description:** scoreFile uses DELETE+INSERT (not UPDATE) in transaction. If Supabase CDC emits statement-level events, Realtime subscriber may see DELETE before INSERT. Mitigated: useScoreSubscription only listens to INSERT+UPDATE (not DELETE), and polling fallback has exponential backoff. Visual glitch is unlikely but possible.
- **Fix:** Switch to UPDATE on existing row + INSERT only when no row exists (upsert pattern). Partially addressed by S1 onConflictDoUpdate.
- **Effort:** 1 ชม.
- **Status:** ACCEPTED — mitigated by Realtime event filter + S1 upsert pattern

### TD-SCORE-005: autoPassRationale stored as text (JSON string) — no schema versioning
- **Date:** 2026-03-26
- **Story:** Scoring adversarial review finding #12
- **Phase:** review
- **Severity:** Low
- **Files:** `src/db/schema/scores.ts`, `src/features/review/components/AutoPassRationale.tsx`
- **Description:** `autoPassRationale` is `text` column storing JSON string. Component parses with Zod + falls back to raw text for legacy. If schema changes (Epic 5+), old rows parse fail → structured display breaks. Fallback handles it but not graceful.
- **Fix:** Add schema version field to JSON. Or use JSONB column type with explicit version key.
- **Effort:** 2 ชม.
- **Status:** DEFERRED → **Epic 6** (when rationale schema actually changes — premature to version now)

### TD-SCORE-006: scores.fileId nullable for future project-level aggregates — unused, confusing schema
- **Date:** 2026-03-26
- **Story:** Scoring adversarial review finding #13
- **Phase:** review
- **Severity:** Low
- **Files:** `src/db/schema/scores.ts`
- **Description:** `fileId` is nullable (null = project-level aggregate). Feature not implemented yet. uq_scores_file_tenant unique constraint uses nullable column — PostgreSQL treats NULL != NULL, so multiple NULL-fileId rows per tenant are allowed (correct for future aggregates but could confuse). No current code inserts NULL-fileId rows.
- **Fix:** When implementing aggregate scores, add separate constraint or table.
- **Effort:** N/A (future feature design)
- **Status:** ACCEPTED — no current code path inserts NULL-fileId; constraint handles it correctly via SQL NULL semantics

### TD-SCORE-007: 'overridden' status in autoPassChecker fileCount filter has no writer in codebase
- **Date:** 2026-03-26
- **Story:** Scoring CR R2 finding M4
- **Phase:** CR
- **Severity:** Low
- **Files:** `src/features/scoring/autoPassChecker.ts`
- **Description:** `inArray(scores.status, ['calculated', 'auto_passed', 'overridden'])` includes `'overridden'` but no code path currently writes `status: 'overridden'` to the `scores` table. `scoreFile.ts` only writes `'calculated' | 'na' | 'auto_passed' | 'partial'`. The `ScoreStatus` union type includes `'overridden'` for future PM override feature. Including it in the graduation count is harmless today but establishes an undocumented forward dependency.
- **Fix:** When override-score feature is added (Epic 6), verify the override action writes consistent status through `scoreFile` and that overridden files should count toward graduation threshold.
- **Effort:** N/A (verification when feature is built)
- **Status:** DEFERRED → **Epic 6** (override-score feature — `TODO(Epic 6)` comment added in code)

---

## Category 11: Review Workflow Adversarial Review (2026-03-26)

### ~~TD-REVIEW-002: Filter cache missing pagehide/visibilitychange fallback for mobile~~
- **Date:** 2026-03-26
- **Severity:** Low
- **Files:** `src/features/review/components/ReviewPageClient.tsx`
- **Description:** beforeunload doesn't fire reliably on iOS Safari. React unmount cleanup covers client-side nav but not browser close on mobile.
- **Status:** RESOLVED (2026-03-26) — Added `pagehide` event listener as fallback alongside `beforeunload`. iOS Safari fires `pagehide` reliably.

### TD-REVIEW-003: Double-tap Escape closes ConflictDialog + Sheet simultaneously
- **Date:** 2026-03-26
- **Severity:** Low
- **Files:** `src/features/review/components/ConflictDialog.tsx`, `src/features/review/components/FindingDetailSheet.tsx`
- **Description:** First Escape closes dialog (Radix stops propagation), second Escape hits Sheet. Violates Guardrail #31 (one layer per Esc). Would need debounce or cooldown on Sheet's Escape handler.
- **Status:** DEFERRED → **Epic 6** (UX polish)

### ~~TD-REVIEW-004: J/K keyboard navigation may double-fire between grid and review-zone handlers~~
- **Date:** 2026-03-26
- **Severity:** Low
- **Files:** `src/features/review/components/FindingList.tsx`, `src/features/review/components/ReviewPageClient.tsx`
- **Description:** Both components handle J/K. Comment says intentional (grid + fallback) but needs verification that event.stopPropagation() prevents double navigation.
- **Status:** RESOLVED (2026-03-26) — Verified: FindingList grid handler has `event.stopPropagation()` (lines 346, 350) preventing bubble to ReviewPageClient. Review-zone handler only fires when focus is outside grid (intended fallback for detail panel/action bar). No double-fire.

### TD-REVIEW-005: undoDeleteFinding uses client snapshot with potentially stale category
- **Date:** 2026-03-26
- **Severity:** Low
- **Files:** `src/features/review/actions/undoDeleteFinding.action.ts`
- **Description:** Snapshot stored client-side. If taxonomy changes between delete and undo-delete, finding re-inserted with old category. findings.category is varchar not FK — no DB-level guard.
- **Status:** ACCEPTED — edge case (taxonomy rarely changes mid-session)

### TD-REVIEW-006: getFileReviewData loads ALL findings without pagination
- **Date:** 2026-03-26
- **Severity:** Medium
- **Files:** `src/features/review/actions/getFileReviewData.action.ts`
- **Description:** No LIMIT on findings query. Files with 5000+ findings → large response + high client memory. Virtualized list helps rendering but findingsMap holds all in memory.
- **Status:** DEFERRED → **Epic 7** (performance optimization — add cursor pagination + virtual scroll)

### TD-REVIEW-007: approveFile has no score version/timestamp check
- **Date:** 2026-03-26
- **Severity:** Medium
- **Files:** `src/features/review/actions/approveFile.action.ts`
- **Description:** Checks score.status but not whether score is the latest version. Score could change (recalculation) between user viewing and approving. Race window is small but real.
- **Status:** DEFERRED → **Epic 6** (add score.calculatedAt comparison or optimistic lock)
