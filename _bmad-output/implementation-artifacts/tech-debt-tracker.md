# Tech Debt Tracker

**Created:** 2026-02-25 (post Story 2.7 CR R4)
**Last Verified:** 2026-03-02 (Guardrail #23 compliance sweep)
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

### TD-DB-004: segmentId not persisted to DB
- **Severity:** Medium
- **Risk:** Cross-file analysis and finding deduplication can't reference segment identity
- **Mitigation:** fileId + segmentNumber used as proxy identifier
- **Fix:** Design decision needed — add column or use composite key
- **Origin:** Story 2.2, flagged by code-quality-analyzer
- **Status:** DEFERRED → **Epic 5 — Language Intelligence & Non-Native Support** (cross-file analysis requires stable segment identity; arch decision = use composite key `fileId+segmentNumber` as FK, NOT add new column)

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

### TD-UX-001: AppBreadcrumb missing AbortController on entity fetch
- **Severity:** Low
- **File:** `src/components/layout/app-breadcrumb.tsx`
- **Risk:** Rapid navigation can cause race condition — stale entity names rendered for wrong route
- **Mitigation:** Render-time state reset (`if (pathname !== prevPathname) setEntities({})`) clears stale data on route change, but in-flight fetch can still resolve after
- **Fix:** Add `AbortController` to `fetchEntities()` with cleanup in `useEffect` return
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M3)
- **Status:** DEFERRED → **Epic 4 — Review & Decision Workflow** (breadcrumb entity queries needed when review routes `projects/[id]/review/[sessionId]` add real DB lookups)

### TD-UX-002: truncateSegments shows only first+last, loses context
- **Severity:** Low
- **File:** `src/components/layout/app-breadcrumb.tsx`
- **Risk:** UX only — deeply nested routes (5+ segments) lose the second-to-last segment which provides navigation context
- **Current:** `[first, ellipsis, last]`
- **Better:** `[first, ellipsis, secondToLast, last]`
- **Origin:** Story 3.0.5 CR R1, flagged by code-quality-analyzer (M5)
- **Status:** DEFERRED → **Epic 4 — Review & Decision Workflow** (review routes `projects/[id]/review/[sessionId]/findings/[findingId]` create 5+ segment paths that trigger this issue)

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
- **Status:** DEFERRED → fix in **Epic 4** (review infrastructure)

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

### TD-TODO-001: Breadcrumb DB queries deferred to Epic 4
- **Severity:** Low
- **Risk:** `getBreadcrumbEntities` returns hardcoded null for review session/finding names — breadcrumb shows IDs instead of names on review pages
- **File:** `src/components/layout/actions/getBreadcrumbEntities.action.ts:24`
- **Fix:** Implement DB queries with `withTenant()` when review routes are created (Epic 4)
- **Origin:** Story 3.0, identified during TODO scan (2026-03-02)
- **Status:** DEFERRED → fix in **Epic 4** (review infrastructure)

### TD-TODO-002: getFileHistory reviewer name deferred to Epic 4
- **Severity:** Low
- **Risk:** `lastReviewerName` always null — file history doesn't show who last reviewed
- **File:** `src/features/batch/actions/getFileHistory.action.ts:95`
- **Fix:** Join `reviewActions` + `users` tables for actual reviewer name
- **Origin:** Story 2.7, identified during TODO scan (2026-03-02)
- **Status:** DEFERRED → fix in **Epic 4** (review actions)

### TD-UX-003: File selection UI before processing — all files auto-selected
- **Severity:** Low
- **Risk:** User ไม่สามารถเลือก/ยกเลิกไฟล์ที่ parse แล้วก่อนเริ่ม processing — ทุกไฟล์ถูก select อัตโนมัติ ถ้า upload ผิดไฟล์ต้อง cancel ทั้ง batch
- **File:** `src/features/upload/components/UploadPageClient.tsx` (Story 3.2b5 wired ProcessingModeDialog → fileIds = all parsed files)
- **Fix:** เพิ่ม checkbox per file ให้ user เลือก/ยกเลิกก่อนกด "Start Processing" — filter `fileIds` ก่อนส่งให้ `ProcessingModeDialog`
- **Origin:** Story 3.2b5 scope boundary, identified during story review (2026-03-02)
- **Status:** DEFERRED → **Epic 4 — Review & Decision Workflow** (file selection is pre-review UX; create story "4.x: File Selection Before Processing" during Epic 4 sprint planning)

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
- **Status:** DEFERRED → Epic 5 (Dashboard & Reporting — performance optimization)

### TD-BATCH-002: Hardcoded auto_pass_threshold fallback (95)
- **Date:** 2026-03-03
- **Story:** Story 3.0.5 (Batch feature)
- **Phase:** CR
- **Severity:** Low
- **Description:** `getBatchSummary.action.ts:53` and `getFileHistory.action.ts:53` use hardcoded `?? 95` fallback for auto_pass_threshold. Should import from `@/features/scoring/constants` for single source of truth.
- **Status:** RESOLVED — added `DEFAULT_AUTO_PASS_THRESHOLD = 95` to scoring constants, both actions import it (commit 2026-03-03)

---

## CR Sprint — parity/dashboard/project (2026-03-03)

### TD-DASH-001: Dashboard findingsCount hardcoded to 0
- **Date:** 2026-03-03
- **Story:** Story 3.2b (Dashboard feature)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `getDashboardData.action.ts` returns `findingsCount: 0` as placeholder. Should query actual `COUNT(*)` from findings table with tenant filter.
- **Status:** DEFERRED → **Epic 4 — Review & Decision Workflow** (dashboard wiring requires review infrastructure)

### TD-DASH-002: 5 AI-related actions missing ActionResult<T> return type
- **Date:** 2026-03-03
- **Story:** Story 3.2b (AI Usage Dashboard)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `getAiUsageSummary`, `getAiSpendByProject`, `getAiSpendByModel`, `getAiSpendTrend`, `exportAiUsage` actions return raw objects instead of `ActionResult<T>`. Should standardize for consistency.
- **Status:** DEFERRED → **Epic 4 — Review & Decision Workflow** (AI dashboard action standardization)

### TD-DASH-003: Realtime notification payload lacks Zod validation
- **Date:** 2026-03-03
- **Story:** Story 3.2b (Notifications)
- **Phase:** CR
- **Severity:** Medium
- **Description:** `useNotifications.ts` casts Realtime payload via `as RawNotificationPayload` without runtime validation. Should add a Zod schema to validate incoming data from Supabase Realtime channel.
- **Status:** DEFERRED → Epic 4 (Review & Notification hardening)

### TD-E2E-011: Pipeline resilience E2E — chaos test for real fallback failure
- **Date:** 2026-03-07
- **Story:** Story 3.4 (AI Resilience)
- **Phase:** ATDD
- **Severity:** Low
- **File:** `e2e/pipeline-resilience.spec.ts:11`
- **Description:** E2E spec uses PostgREST seeding to simulate `ai_partial` status. Real fallback failure injection (chaos testing) is impractical in standard E2E. A dedicated chaos-test workflow could inject provider errors to validate actual fallback chain behavior end-to-end.
- **Status:** DEFERRED → **Weekly chaos-test workflow** (CI `chaos-test.yml` already runs weekly; add fallback failure scenario there)

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
- **Status:** DEFERRED → **Story 3.4 — AI Resilience, Fallback & Retry**

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

## CR Sprint — Story 3.5 (2026-03-08)

### TD-ORPHAN-004: NotificationDropdown component not wired to any page
- **Date:** 2026-03-08
- **Story:** Epic 3 sign-off orphan scan
- **Phase:** Epic sign-off
- **Severity:** Low
- **File:** `src/features/dashboard/components/NotificationDropdown.tsx`
- **Description:** Fully implemented component (bell icon + dropdown, uses `useNotifications` hook) but never imported in any `src/app/` page or layout. Created during Epic 1 but no story has wired it into the dashboard header/sidebar shell.
- **Fix:** Import and mount in `src/app/(app)/layout.tsx` header area or `AppHeader` component when notification UX is designed.
- **Status:** DEFERRED → **Epic 4 — Review & Decision Workflow** (notification UI wiring as part of review workflow infrastructure)

### TD-REVIEW-002: Realtime auto_passed transition doesn't show rationale
- **Date:** 2026-03-08
- **Story:** Story 3.5 (Score Lifecycle & Confidence Display)
- **Phase:** CR R1
- **Severity:** Medium
- **File:** `src/features/review/components/ReviewPageClient.tsx:250-252`
- **Description:** `AutoPassRationale` renders from `initialData.autoPassRationale` (server-side SSR data). If score transitions to `auto_passed` via Realtime after page load, `isAutoPassedStatus` becomes true (store-driven) but `initialData.autoPassRationale` remains null (stale). Result: Approve button correctly hidden, but no rationale shown until page refresh.
- **Mitigation:** Edge case requiring page loaded before pipeline completes AND pipeline auto-passes the file AND Realtime pushes status. User can refresh page to see rationale. Approve button behavior is correct regardless.
- **Fix:** Track `autoPassRationale` in Zustand store via `useScoreSubscription` (subscribe to `auto_pass_rationale` column changes), or trigger `getFileReviewData` re-fetch when `scoreStatus` transitions to `auto_passed`.
- **Status:** DEFERRED → **Epic 4 — Review Workflow Infrastructure** (review page data re-fetch patterns needed)
