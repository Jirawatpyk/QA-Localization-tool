# Testing QA Expert — Persistent Memory

## Project: qa-localization-tool

### Key Test File Locations

- Unit tests: co-located next to source (`*.test.ts` / `*.test.tsx`)
- RLS tests: `src/db/__tests__/rls/` (require `npx supabase start`)
- E2E tests: `e2e/`
- Shared factories/mocks: `src/test/factories.ts`
- RLS helpers: `src/db/__tests__/rls/helpers.ts`

### Story 2.1 Test Review — Round 3 Findings (2026-02-23)

Full details in `story-2.1-cr-round3.md`. Summary:

- CRITICAL: `fileType.ts` has NO test file (9 untested behaviors)
- HIGH: route.test.ts — storage cleanup, UUID validation, formData throw, partial success
- MEDIUM: useFileUpload cancel/abort/progress, formatBytes/Eta branches, drag/drop state reset
- INFO: weak assertions (.not.toBeNull(), .toBeTruthy()) in FileUploadZone + UploadProgressList

### Story 2.4 Test Review — CR Round 3 Findings (2026-02-24)

Full details in `story-2.4-cr-round3.md`. Summary: 2C · 4H · 6M · 3L. 15 findings.

- C1: `checkUnpairedBrackets` early-break on depth<0 — interleaved mismatch ("a) (b") drops one finding
- C2: `runRuleEngine` rollback-to-`failed` DB call never asserted; "not called" audit assertion vacuous
- H1: `checkDoubleSpaces` regex `/ {2,}/` contract not pinned — tab/NBSP behavior untested
- H2: No orchestrator-level negative test for `checkEndPunctuation` alphanumeric-skip path
- H3: `checkSameSourceDiffTarget` description field never asserted; 50-char slice boundary undocumented
- H4: `+` prefix number normalization untested; 3-group European numbers (`1.234.567`) untested
- M5: Float Buddhist year false-positive — `isBuddhistYearEquivalent(2026.5, 2569.5)` returns TRUE
  (delta = 543.0 exactly). Fiscal-year notation like "FY2026.5" → "ปี 2569.5" would be exempt.
  This is a likely SOURCE BUG — no `Number.isInteger()` guard in `isBuddhistYearEquivalent`.
- M6: `segmentId` propagation verified in only 3 of 12 check functions (tagChecks, customRuleChecks,
  glossaryChecks). 9 check functions have no segmentId assertion.

### Story 2.4 Test Review — CR Round 2 Findings (2026-02-24)

Full details in `story-2.4-cr-round2.md`. Summary: 2C · 5H · 8M · 5L. 1053 tests (28 new).

- C1: Buddhist year offset coincidental false-negative — delta=543 fires for non-year pairs
  (e.g., 500 → 1043). DOCUMENTED as known limitation. Test added.
- C2: `checkUnpairedBrackets` suggestedFix direction never asserted — "opening" vs "closing"
  text was vacuous. Tests added for both directions.
- H4: `checkKeyTermConsistency` `caseSensitive: true` branch — ZERO tests prior. 3 tests added.
- H5: `processFile` language derivation from first segment — only th-TH tested. ja-JP added.
- M7 (glossary rejection): `Promise.all` rejection propagates from processFile — test added.
- M8: Thai particle stripping with whitespace before particle — `.trimEnd()` path tested.

### Story 2.4 Test Review — CR Round 1 Findings (2026-02-24)

All CR Round 1 gaps addressed. Key resolved items:

- H3 + H4 (runRuleEngine): INTERNAL_ERROR catch, batch insert >100 findings — tests added.
- H2 (placeholder test): ruleEngine.test.ts strengthened.
- M6 (SOURCE CONFIRMATION): `checkKeyTermConsistency` DID ignore `caseSensitive: true` — no
  tests existed. Fixed in CR Round 2 (3 caseSensitive tests added).

### Story 2.3 Test Review — CR Round 2 Findings (2026-02-23)

Full details in `story-2.3-cr-round2.md`. Summary: 2C · 3H · 6M · 4L. 142 tests passing.

- C1 (POSSIBLE SOURCE BUG): `segmentId` from ParsedSegment silently dropped — segments table has no
  segmentId column. Intentional design or data loss? No test verifies contract either way.
- C2 (SOURCE BUG): `ColumnMappingDialog` sends header TEXT values when hasHeader=false, but
  parseExcelBilingual expects NUMERIC strings (1-based). The hasHeader=false UI flow is broken.
- H2: CAS race condition test uses single updateChain mock — does not enforce that markFileFailed
  is NOT called on CAS failure path (vacuous mock).
- H3: Excel parse error in parseFile — markFileFailed `errorCode` field not asserted.
- M2: previewExcelColumns: header-only file (rowCount=1, totalRows=0) not tested.
- M6: ColumnMappingDialog escape-key / overlay-click `onOpenChange` path never tested.

### Story 2.2 Test Review — CR Round 2 Findings (2026-02-23)

Full details in `story-2.2-cr-round2.md`. Summary: 6 HIGH · 12 MEDIUM · 7 LOW.

Key findings:

- H1: blob.text() throw → no try/catch → status stuck 'parsing', no audit log written
- H2: FILE_TOO_LARGE from parser not tested end-to-end through action
- H3: file.fileType='xliff' branch NEVER exercised (all tests use 'sdlxliff')
- H4: audit log `reason` field not asserted in ANY of 3 file.parse_failed tests
- H5: withTenant called 4x in action, never mocked/asserted
- H6: MAX_PARSE_SIZE_BYTES exact boundary not tested (operator is `>` not `>=`)
- M4: matchPercentage clamping (-1, 150, NaN) untested
- M6: TAG_MISMATCH propagation from inlineTagExtractor through parseXliff untested
- M10 (POTENTIAL BUG): `stripped.length===0` in wordCounter.ts is dead code —
  stripMarkup replaces with spaces so length never 0. Should be `stripped.trim().length===0`
  but .trim() was already called. Investigate as possible source defect.

### Story 2.6 Test Review — CR Round 4 (Adversarial review of R3 tests) (2026-02-25)

Full details in `story-2.6-cr-round4.md`. Summary: 2C · 3H · 6M · 3L. 14 findings.

- C1: `onFailureBatchFn` NOT in `Object.assign` block → inaccessible for unit testing → zero tests
- C2: `scoreFile` INSERT guard (`if (!inserted)`) — empty `.returning()` path uncovered
- H1: `throwAtCallIndex` in Proxy mock only covers `.then` terminals, NOT `.returning()` terminals
- H2: `onFailureFn` try-catch in processFile — DB update throw inside onFailure → no test
- H3: ModeCard Space: `e.preventDefault()` not verifiable in RTL; `tabindex` only non-null checked
- M2: Zod refine message `'Duplicate file IDs are not allowed'` unpinned in pipelineSchema test
- M3: `score.auto_passed` test: persisted DB status unverified — only audit action is checked
- M4: `as never` cast in ProcessingModeDialog tests eliminates TypeScript interface protection
- M5: `withTenant` call count unpinned in runRuleEngine withTenant assertion
- M6: `startedAt` not verified as updated on re-run (only `completedAt` checked)

### Story 2.6 Test Review — CR Round 3 Findings (2026-02-25)

Full details in `story-2.6-cr-round3.md`. Summary: 1C · 5H · 7M · 2L. 15 findings. All addressed in R3.

- C1 (FIXED): duplicate fileIds → Zod refine added; INVALID_INPUT returned before DB
- H3 (FIXED): rollback setCaptures now asserted with `toContainEqual({ status: 'failed' })`
- H4 (FIXED): scoreFile audit literals pinned to exact `'score.calculated'` / `'score.auto_passed'`
- H5 (FIXED): processBatch empty fileIds test added
- M6 (FIXED): ModeCard keyboard Enter/Space tests added

### Story 2.6 Test Review — CR Round 2 Findings (2026-02-25)

Full details in `story-2.6-cr-round2.md`. Summary: 2C · 4H · 4M. 10 findings.

- C1: processFile.test.ts onFailure `callIndex=1` proves DB touched but NOT that `status='failed'` was written — Proxy mock cannot capture `.set()` argument
- C2: runL1ForFile.test.ts `callIndex=5` proves call count but NOT `l1_processing→l1_completed` values
- H1: scoreFile.test.ts — NonRetriableError for empty segmentRows still untested (Round 1 H1 NOT FIXED)
- H2: runL1ForFile.test.ts batch insert >100: only `findingCount` checked, not TWO tx.insert calls
- H3: processBatch.test.ts `uploadBatchId` missing from `buildPipelineBatchEvent` — propagation silently untested (Round 1 M2 NOT FIXED, promoted to H)
- H4: startProcessing.action.test.ts mode persistence: `callIndex=2` correct but `.set({mode:'thorough'})` value unverified
- M1: pipeline.store.test.ts — no negative test that `completedAt` is NOT set when only some files reach terminal
- M2: ProcessingModeDialog.test.tsx — AC#1 cost values $0.15/$0.35 never pinned
- M3: ProcessingModeDialog.test.tsx — AC#1 time estimates ~30s/~2min never pinned
- M4: startProcessing.action.test.ts — INTERNAL_ERROR path (inngest.send throws) not tested

### Story 2.6 Test Review — CR Round 1 Findings (2026-02-25)

Full details in `story-2.6-cr-round1.md`. Summary: 3C · 4H · 5M · 1L. 13 findings.

- C1: `getGlossaryTerms` from `@/lib/cache/glossaryCache` not mocked in runL1ForFile.test.ts —
  accidental Proxy passthrough; `dbState` index allocation works today but is fragile
- C2: `onFailure` assertions in processFile.test.ts are vacuous — `callIndex > 0` does NOT
  verify `status: 'failed'` was written; withTenant isolation also unverified
- C3: Status transition test in runL1ForFile.test.ts (line 146-161) asserts only
  `callIndex > 0` — does not verify `parsed → l1_processing → l1_completed` transitions
- H1: No test for empty `segmentRows` in scoreFile — `segmentRows[0]!.sourceLang` throws TypeError
- H2: Step IDs in processFile verified with `toContain('l1')`/`toContain('score')` — too loose;
  should be exact `toBe('l1-rules-${fileId}')` and `toBe('score-${fileId}')`
- H3: `startProcessing` mode persistence assertion vacuous (`callIndex >= 2`)
- H4: Error codes in startProcessing.action.test.ts use regex alternatives
  (`/NOT_FOUND|INVALID_INPUT/`) — hides wrong error code returns
- M1: `completedAt` assertion guarded by `if` — vacuous if set logic broken
- M2: `uploadBatchId` missing from `buildPipelineBatchEvent` helper — propagation silently untested
- M3: onFailure withTenant isolation not verified in processFile.test.ts
- M4: Batch insert >100 findings: only `findingCount` verified, not that TWO insert calls happened
- M5: `Recommended` badge not pinned to Economy card in ProcessingModeDialog tests
- L1: `pipelineSchema` max(100) fileIds boundary not tested

### Confirmed Working Patterns

- `vi.mock('server-only', () => ({}))` must be FIRST line in server action test files
- `vi.mock` hoisting: place all vi.mock() calls before imports in server action tests
- Drizzle chain mock: flat variable chain (mockSelectFn → mockFromFn → ...) works reliably
  for simple chains; Proxy needed only for deeply variable/optional chain shapes
- `async import()` within test body for server actions (avoids top-level import before mocks)
- `setupXhrMock()` pattern with class extension for XHR response simulation in jsdom
- RLS helpers use separate anonClient for sign-in to avoid polluting admin client session
- `vi.fn((..._args: unknown[]) => ...)` for mocks whose `.calls` will be accessed (TS2493 fix)

### Common Operator Gotchas

- LARGE_FILE_WARNING_BYTES: route.ts uses `>=`, hook uses `>` — inconsistency unverified
- Schema `z.string().length(N)` is exact-length, NOT max — test BOTH too-short AND too-long
- MAX_PARSE_SIZE_BYTES guard: operator is `>` (not `>=`) — boundary value must succeed
- MAX_CUSTOM_REGEX_LENGTH (500): guard is `>` not `>=` — exactly 500 chars is ALLOWED
- Boundary regex test pattern: `'MATCH' + '(?:)'.repeat(N)` — pads a working pattern to
  exact length with no-op non-capturing empty groups. Example: 4 + 4\*124 = 500 chars.

### RLS Test Patterns That Work

- Always seed with admin client (service_role bypasses RLS)
- Test SELECT / INSERT / UPDATE / DELETE for each table — all four operations
- Use `cleanupTestTenant` in afterAll — never rely on DB auto-cleanup
- Verify data with `data?.length` not error presence for silent RLS filtering
