# Testing QA Expert — Persistent Memory

## Project: qa-localization-tool

### Key Test File Locations

- Unit tests: co-located next to source (`*.test.ts` / `*.test.tsx`)
- RLS tests: `src/db/__tests__/rls/` (require `npx supabase start`)
- E2E tests: `e2e/`
- Shared factories/mocks: `src/test/factories.ts`, `src/test/drizzleMock.ts` (canonical Drizzle mock factory)
- RLS helpers: `src/db/__tests__/rls/helpers.ts`

### ATDD RED Phase — Dynamic Import + Non-existent Module (2026-02-27)

When `it.skip()` contains `await import('./module')` and the module does NOT exist yet,
Vite fails at TRANSFORM time (not runtime). Even `vi.mock('./module', ...)` does NOT prevent
the transform-time error. Fix: create a stub `.ts` file at the path with minimal exports.
Stub approach is preferred over workaround mocks — establishes API contract early.
Example: `src/lib/ai/providers.ts` stub created during Story 3.1 ATDD phase.

### Story 3.2a CR Notes (2026-03-01)

- `logAIUsage()` in `runL2ForFile.ts` is fire-and-forget: `logAIUsage(record).catch(() => {})` — tests that call `expect(mockLogAIUsage).toHaveBeenCalledWith(...)` PASS because mock resolves synchronously. This is correct behavior.
- `checkTenantBudget` mocked in `createAIMock` but `runL2ForFile.ts` only calls `checkProjectBudget` — the `mockCheckTenantBudget.mockResolvedValue(...)` in all three `beforeEach` blocks is a no-op.
- ATDD stale comments at lines 568-569 and 876-877 say "All tests use it.skip()" — misleading, these were not removed during GREEN phase.
- `// RED:` comments throughout `costs.test.ts` and `providers.test.ts` — stale ATDD remnants, not defects.
- AC4 P1 test "should log failed chunk with status error and languagePair": `runL2ForFile.ts` does NOT call `logAIUsage` for failed chunks — only successful chunks. The test assertion `expect(mockLogAIUsage).toHaveBeenCalledWith(...)` passes via the SECOND (successful) chunk's call, making it tautological.

### @dnd-kit jsdom Limitation (confirmed 3.2b7)

@dnd-kit KeyboardSensor and PointerSensor do NOT fire events in jsdom — `getBoundingClientRect`
returns zeros, sensors abort before activating. Any assertion inside `if (mock.calls.length > 0)`
after keyboard simulation is VACUOUS. DnD logic must be extracted to pure functions to be
unit-testable (e.g., `computeNewOrder(mappings, activeId, overId)`). Optimistic revert CAN be
tested without DnD: call the `onReorder` prop callback directly with test data, bypassing DnD.

### Story CR Review History (most recent first)

- **3.2c R2** → (inline in MEMORY) — 0C · 1H · 2M · 2L (118 unit tests green, 0 skipped; H1: `use-score-subscription.test.ts` line 59 original test still asserts `event: 'UPDATE'` — production hook now subscribes to BOTH INSERT+UPDATE, so test passes but is misleading stale documentation; M1: T7.4 burst batching test — `setFindingsSpy` placed on `getState()` snapshot before render, production `flushInsertBuffer` calls fresh `getState()` — spy IS on same singleton object so intercepts correctly — previous R1 vacuous concern was UNFOUNDED (test is sound); M2: `use-score-subscription.test.ts` polling mock returns `{ mqm_score, status }` without `layer_completed` field — T6.4 `toHaveBeenCalledWith(stringContaining('layer_completed'))` correctly asserts the SELECT string includes `layer_completed`, but polling store update path (`updateScore(data.mqm_score, data.status, layerCompleted)`) receives `layerCompleted=null` (since mock data has no `layer_completed` field) — layer_completed propagation via polling is NOT tested end-to-end; L1: T8.2 spinner test asserts `l2Status.innerHTML.toMatch(/animate-spin/i)` — innerHTML inspection instead of `toHaveClass('animate-spin')` — fragile but functional; L2: T11.6 "rule-only" test renders TWO components in a single `it()` — ScoreBadge and ConfidenceBadge separately — acceptable pattern but slightly unorthodox)
- **3.2c R1** → `story-3-2c-cr-round1.md` — 0C · 1H · 4M · 5L (112 unit tests green; H1: FindingListItem P0 test T9.7 "source/target excerpts in expanded state" missing; M1: ReviewProgress P0 test T8.7 "L2 pending when layerCompleted=L1" missing; M2: getFileReviewData `processingMode` field never asserted in any test — T5.6 P0 missing; M3: withTenant test uses callIndex count check only — not payload verification; M4: T7.4 burst batching test vacuous — queueMicrotask not implemented in production, test passes via individual setFinding calls; L1: ConfidenceBadge missing 10th test null-threshold; L2: LayerBadge missing 4th design-token test; L3: T7.7 INSERT+DELETE idempotency test missing; L4: E2E waitForLoadState('networkidle') on RSC+Realtime pages — flaky in CI; L5: finding-count-summary and finding-list data-testids missing from ReviewPageClient)

- **3.2b7 R2** → (inline in MEMORY) — 0C · 1H · 4M · 4L (21 unit tests green, 0 skipped; H1: revalidateTag ATDD P1 bug-fix silently abandoned — production still calls two-arg form, ATDD item dropped with no documentation; M1: optimistic revert P0 gap persists — vacuous `if (mockToast.mock.calls.length > 0)` guard never enters (same pattern as R1 H1); M2: drag-disable test asserts aria-disabled only — listener stripping unchecked (R1 M3 carry-over); M3: MOCK_MAPPINGS still duplicated across 2 files — within-file dedup fixed but cross-file copy unchanged; M4: `thirdRowName` captured in E2E but never asserted — bilateral post-reload verification incomplete; L1: Story 3.2b7 [setup] vestigial — no state carries to P0 test; L2: column .nth(1) hardcoded, comment added but no testid protection; L3: toContain partial match risk + asymmetric .trim() in E2E assertions; L4: computeNewOrder null guard tests only activeId-not-found, not overId-not-found)
- **3.2b7 R1** → `story-3-2b7-cr-round1.md` — 0C · 2H · 5M · 4L (21 unit tests green, 0 skipped; H1: "onReorder after drag end" + "keyboard reorder" vacuous — conditional `if (mock.calls.length > 0)` never enters because @dnd-kit sensors don't fire in jsdom; H2: revalidateTag test asserts two-arg form but ATDD says it should be single-arg — production code unchanged, AMBIGUOUS; M1: optimistic revert P0 ATDD test renamed/replaced with render-only test — zero coverage of revert path; M2: MOCK_MAPPINGS duplicated 3x across test files — violates factory convention; M3: drag-disable asserts aria-disabled only, not listener-stripping; M4: toBeTruthy() on HTMLElement — always true; M5: transaction test verifies call count only, no payload; L1: describe-scope vi.fn() pattern fragile; L2: E2E column index .nth(1) hardcoded; L3: E2E toContain partial match + missing trim() — false positive risk; L4: 3.2b7 E2E [setup] missing replica-sync retry loop)

- **3.2b R2** → (inline in MEMORY) — 0C · 1H · 4M · 3L (71 active tests pass, 1 skipped P2; H1: `batch-completion.test.ts:216` uses `not.toHaveBeenCalledWith(X)` — vacuous; should be `not.toHaveBeenCalled()`; M1: thorough-mode handler return shape (`l3FindingCount: number`, `layerCompleted: 'L1L2L3'`) never asserted on result; M2: batch-completion file L2/L3 mocks inline in factory — not exposed via hoisted, cannot override per-test; M3: `prev=undefined AND override=undefined AND layerFilter=undefined` → `'L1'` final fallback in layerCompleted chain never tested; M4: thorough-batch sendEvent assertion in processFile.test.ts omits `data` payload — asymmetric vs batch-completion file; L1: buildPipelineEvent+createMockStep duplicated across files (carry-over); L2: test name "fall back to prev.layerCompleted" slightly misleading but functionally correct; L3: `it.skip` TD ref only in comment above test, not in test-name string; body would be tautological if unskipped)
- **3.2b R1** → (inline in MEMORY) — 0C · 1H · 4M · 3L (69 active tests pass, 1 skipped P2; H1: `auto_passed` missing from batch terminal-state guard in `processFile.ts:86` AND from all batch tests — source bug + test gap [NOTE: FALSE POSITIVE — `auto_passed` is `scores.status` not `files.status`; terminal-state guard is correct]; M1: batch-completion file mocks `runL2ForFile` with wrong field `chunksProcessed` (real: `chunksTotal`), no `as L2Result` cast; M2: no negative test "thorough batch must NOT fire when siblings are `l2_completed`"; M3: P1 test `layerFilter: 'L1'` assertion undocumented — intent obscured by dual assertion; M4: `scoreFile` override tests all use `prev=defined` — `prev=undefined` first-score path untested with override; L1: `buildPipelineEvent`+`createMockStep` duplicated in both processFile test files; L2: P0 thorough-batch test uses bare `.toHaveBeenCalled()` — no payload assertion; L3: skipped P2 test has no `// TODO(TD-XXX)` comment, and assertion would be tautological if unskipped)

- **3.2b6 R1** → (inline in MEMORY) — 0C · 1H · 5M · 4L (22 unit tests all green; no it.skip; H1: 3 stale `// RED:` comments in lines 69/80/91 of AiBudgetCard.test.tsx never removed after GREEN phase; M1: T1.5 ATDD says "marker position updates" after success — test only asserts toast.success, marker recalculation untested; M2: `isPending` disabled state (`disabled={isPending}`) has zero coverage; M3: same-value no-op guard (`thresholdValue === savedValue`) untested; M4: T3.4/T3.5 ATDD P2 parity scenarios — Report Missing Check dialog submit and validation errors — not implemented; M5: file-history reviewer test uses positional `row.locator('td').nth(4)` fallback — brittle DOM coupling; L1: parity color test `.toHaveClass(/text-success/)` can false-positive on ancestor class; L2: file-history filter test uses `waitForLoadState('networkidle')` for likely client-side filter — vacuous assertion; L3: budget-threshold.spec.ts redundant `signupOrLogin()` in each serial test body; L4: stale comment line 116 AiBudgetCard.test.tsx says "All tests use it.skip()" — misleading after GREEN phase)

- **3.2b5 R1** → (inline in MEMORY) — 0C · 1H · 4M · 3L (26 tests all green; no it.skip; H1: Test #17 sequential-parse asserts `toHaveBeenCalledTimes(1)` mid-flight but impl uses microtask queue — brittle timing; M1: stale `// RED:` comments in 18 tests never removed after GREEN phase; M2: Test #9 uses `btn.hasAttribute('disabled')` instead of `expect(btn).toBeDisabled()` — weaker assertion; M3: `assertUploadProgress` helper checks `upload-status-success` testid which disappears once parse state replaces "Uploaded" text — E2E flake risk in test #19/#20; M4: `FIXTURE_FILES.sdlxliffMinimal` key correct but `excelBilingual` key refers to non-existent `bilingual.xlsx` (fixture is `bilingual-sample.xlsx`) — L1 in E2E helper, not test spec; L1: `act()` warning for Test #18 — `mockParseFile` never-resolving promise assigned AFTER `render()`, suppressible but indicates setup ordering concern; L2: `pipeline-findings.spec.ts` second [setup] re-calls `signupOrLogin()` unnecessarily — shared serial state already authenticated; L3: `getByText(/parsed.*segments/i)` regex in unit test #14 passes on ANY ordering of "parsed" and "segments" — would accept "segments parsed (42)" too)
- **3.2a R2** → (inline in MEMORY) — 0C · 0H · 3M · 2L (81 tests all green; no it.skip; M1: `toBe(7)` withTenant count in taxonomy test is now precise and correct — will break if a new tenanted query is added to runL2ForFile, which is the right brittleness; M2: l2OutputSchema assertion is referentially sound — both sides import real module, not mocked; no Coverage gap; L1: `deriveProviderFromModelId` mock in ai-providers.ts is correct functionally but has coverage gap for `o1-` prefix (mock includes it, production function has it, but no test exercises it); L2: AC4 P1 "failed-chunk" test passes but was previously identified as tautological in R1 — R1 fix correctly added `outputTokens: 0` but the test still does NOT verify chunkIndex:0 failure isolation uniquely — second call assertion on `chunkIndex:1` / `status:'success'` strengthens it but the original tautology concern from R1 MEMORY is now RESOLVED by the added second `expect(mockLogAIUsage).toHaveBeenCalledWith({ status:'success', chunkIndex:1 })` block)
- **3.0.5 R1** → (inline in MEMORY) — 0C · 1H · 4M · 3L (44 tests all green; no it.skip; H1: AC4 slide animation tests have implicit timer race — `classList.add` fires in useEffect but test asserts immediately after `rerender()` without fake timers; M1: test 2.12 only exercises `size="lg"` but ATDD says "lg/md show label below score" — `size="md"` path untested; M2: test 2.13 sm-tooltip test missing `screen.queryByText('Passed').toBeNull()` — only checks container has title/aria-label, doesn't assert label not in DOM; M3: `toMatch(/info/)` in rule-only test is too broad — matches ANY class containing "info" (e.g., "bg-info/10"), should assert `toMatch(/\binfo\b/)` or specific token; M4: `getBreadcrumbEntities` mock returns mock values but source stub actually uses `input.projectId` as `projectName` directly — test passes only because mock overrides; L1: test 5.1 checks `queryByText('/')` is null but separator in source uses `aria-hidden="true"` span — queryByText fails to find aria-hidden elements, making this assertion vacuous; L2: test 7.1 asserts `rawSpans.length === 0` using `document.querySelectorAll('.font-mono.text-sm')` — brittle DOM query that depends on test ordering (no cleanup between the two it() calls in same describe block using `await import()`); L3: `vi.clearAllMocks()` in `beforeEach` of ScoreBadge.test.tsx is no-op — no `vi.fn()` mocks exist in that file (only `mockReducedMotion` via `Object.defineProperty`)
- **3.1b R2** → (inline in MEMORY) — 0C · 2H · 3M · 3L (48 tests all green; H1: getBudgetStatus exact-BV at 80% missing — tests use 75.5% and 85%, never 80.0% exactly; H2: getBudgetStatus exact-BV at 100% missing — tests use 105%, never 100.0% exactly; M1: R1-M1 only partially fixed — model/provider text added but cost/token numeric values still untested (toFixed(4), toLocaleString); M2: Budget % sort ascending test only checks rows[0] — rows[1] not asserted (asymmetric); M3: AiSpendTrendChart toggle button label change still untested — 'Show L2/L3 Breakdown'→'Show Total' never verified; L1: vi.clearAllMocks() in beforeEach is no-op in 3 of 4 files (no vi.fn() mocks remain after sonner removal); L2: sort-reset test verifies aria-sort but not the actual row order after reset; L3: test name misleading — "rounded to $0.3690" but actual format is $0.37 (toFixed(2)))
- **3.1b R1** → (inline in MEMORY) — 0C · 3H · 5M · 3L (43 tests all green; no it.skip(); H1: MC-AC4-01 "Cost (USD)" Bar name untested — Bar mocked as null, assertion only checks container exists; H2: aria-sort not tested after column switch (Cost→Budget, cost becomes 'none', budget becomes 'ascending'); H3: AC1 BV table missing "filesProcessed=1 totalCostUsd=0 → NOT empty" row — only BV1 (cost=0.01) written; M1: breakdown table row values never asserted — only row existence (.toBeTruthy()); M2: sort reset on projects prop change (useEffect Guardrail #12) — not tested; M3: Budget % sort direction: initial click goes asc, no test for second click → desc cycle; M4: empty state text not verified in AiSpendByProjectTable and AiSpendByModelChart; M5: sonner mocked in all 4 tests but none of the 4 components import sonner; L1: AiSpendTrendChart toggle button label not verified after state change; L2: AiSpendByModelChart single-entry edge case not tested; L3: AiSpendByProjectTable unlimited budget projects in budget-% sort untested)
- **3.1a R2** → (inline in MEMORY) — 0C · 3H · 5M · 3L (64 tests all green; H1: getAiUsageByProject sort order untested — delete .sort() passes all tests; H2: AiSpendTrendChart "all 7 present" test asserts container not data count — tautological name; H3: exportAiUsage 90d cap BV in `if` guard — zero assertions if gte not called; M1: AiUsageSummaryCards empty state text unverified — AC2 spec ambiguity; M2: AiSpendByModelChart P1 ATDD "labels per entry" replaced with weaker container test; M3: export button click untested — carry-over H1 from R1; M4: days=365 cap test silently passes on success:false path; M5: days=7 date check uses two wall-clock new Date() calls — fragile)
- **3.1a R1** → (inline in MEMORY) — 0C · 3H · 3M · 4L (63 tests all green; H1: AiUsageDashboard onPeriodChange callback never asserted; H2: exportAiUsage withTenant dual-call security gap untested; H3: daysElapsed BV tests off by 2 from ATDD-specified boundary; M1: budgetPct dead field in test data; M2: AiSpendByModelChart P1 label test vacuous; M3: exportAiUsage 90d cap BV inside conditional if — silently skips assertions)
- **3.1 R1** → `story-3.1-cr-round1.md` — 0C · 3H · 5M · 4L (103 tests; 10 P0 skips; H1: skip stubs target wrong mock (mockCheckTenantBudget vs mockCheckProjectBudget); H2: tautological expect(true).toBe(true) placeholder; H3: commented-out mock setup in startProcessing skips)
- **3.0 R2** → `story-3.0-cr-round2.md` — 0C · 2H · 4M · 3L (73 tests green; tautological BV tests, missing step.run assertion, rounding test asserts non-existent behavior)
- **2.9 R1** → `story-2.9-cr-round1.md` — 0C · 3H · 5M · 4L (16 unit tests all passing; 15 integration tests all passing; stale comment + weak assertions + untested branches)
- **2.7 R4** → `story-2.7-cr-round4.md` — 0C · 3H · 4M · 2L (8 of 12 R3 gaps fixed; 4 remain + 2 new)
- **2.7 R3** → `story-2.7-cr-round3.md` — 2C · 3H · 6M · 3L (8 of 16 R2 gaps fixed; 8 remain)
- **2.7 R2** → `story-2.7-cr-round2.md` — 2C · 4H · 7M · 3L (16 findings)
- **2.7 R1** → `story-2.7-cr-round1.md` — 2C · 6H · 9M · 4L (111 tests, 3 skipped)
- **2.6 R4** → `story-2.6-cr-round4.md` — 2C · 3H · 6M · 3L
- **2.6 R3** → `story-2.6-cr-round3.md` — 1C · 5H · 7M · 2L (all addressed)
- **2.6 R2** → `story-2.6-cr-round2.md` — 2C · 4H · 4M
- **2.6 R1** → `story-2.6-cr-round1.md` — 3C · 4H · 5M · 1L
- **2.5 R2** → (in MEMORY) — H1: off-by-one `fileCount <= 50` → `< 50`; H2: autoPassRationale persisted wrong
- **2.4 R3** → `story-2.4-cr-round3.md` — 2C · 4H · 6M · 3L
- **2.3 R2** → `story-2.3-cr-round2.md` — 2C · 3H · 6M · 4L
- **2.2 R2** → `story-2.2-cr-round2.md` — 6H · 12M · 7L
- **2.1 R3** → `story-2.1-cr-round3.md` — 1C · 4H · 5M

### Story 2.7 — Final Status (verified 2026-02-25, post CR R4 fixes commit dc4e2f1)

All H and M from R4 **FIXED** in final commit. Remaining carry-overs (LOW priority):

**STILL OPEN (carry-over, accepted as tech debt):**

- LOW: `BatchSummaryView.test.tsx` — `crossFileFindings` prop ZERO tests
- LOW: `FileHistoryTable.test.tsx` — `processedAt` vs `createdAt` type mismatch
- LOW: `xbenchReportParser` — null worksheet path untested
- LOW: `batchComplete.test.ts` — `vi.resetModules()` inside `it()` body

**FIXED in final commit:**

- ✅ H1: `batchComplete.test.ts` — projectId added to schema mock
- ✅ H2: `batchComplete.test.ts` — empty-batch early-return test added
- ✅ H3: `processFile.batch-completion.test.ts` — `step.run` call count assertion added
- ✅ M1 (onFailureFn): `batchComplete.test.ts` — onFailure test added
- ✅ M3: `getBatchSummary.action.test.ts` — `callIndex` assertion added
- ✅ M4: `getBatchSummary.action.test.ts` — passedCount/needsReviewCount asserted
- ✅ L1: `compareWithXbench.action.test.ts` — fileId propagation test added

### Confirmed Working Patterns

- `vi.mock('server-only', () => ({}))` must be FIRST line in server action test files
- Drizzle mock: use `createDrizzleMock()` from `src/test/drizzleMock.ts` (shared via globalThis in setupFiles). Pattern: `const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())` then `vi.mock('@/db/client', () => dbMockModule)`. Features: `returnValues[callIndex]` for `.then` terminals; `valuesCaptures` for `.values()` args; `setCaptures` for `.set()` args; `throwAtCallIndex` for DB error injection; `transaction` support
- `async import()` within test body for server actions (avoids top-level import before mocks)
- `vi.fn((..._args: unknown[]) => ...)` for mocks whose `.calls` will be accessed (TS2493 fix)
- Supabase Realtime: `mockChannel.on.mockReturnValue(mockChannel)` (not `mockReturnThis()`) in jsdom

### Common Operator Gotchas

- MAX_PARSE_SIZE_BYTES guard: operator is `>` (not `>=`) — boundary value must succeed
- MAX_CUSTOM_REGEX_LENGTH (500): guard is `>` not `>=` — exactly 500 chars is ALLOWED
- `crossFileConsistency`: `fileIds.length === 0` guard returns `{ findingCount: 0 }` early — NEVER call `inArray([])` (invalid SQL)
- Proxy mock `throwAtCallIndex` covers `.then` terminals ONLY — NOT `.returning()` terminals (use `returnValues: [[]]` for empty `.returning()` test)

### RLS Test Patterns

- Always seed with admin client (service_role bypasses RLS)
- Test SELECT / INSERT / UPDATE / DELETE for each table — all four operations
- Use `cleanupTestTenant` in afterAll — never rely on DB auto-cleanup
- ON DELETE RESTRICT FK: clean child rows (parity_reports, missing_check_reports) before cleanupTestTenant

### Source Bugs Found During CR

- **Story 3.2b H1 (R1):** `processFile.ts:86` — `auto_passed` missing from batch terminal-state guard; only checks `terminalStatus | 'failed'`. Files that auto-pass cause batch to hang indefinitely.
- **Story 2.7 H2 (R1):** `getFileHistory.action.ts` line 63 — `lastReviewerName: scores.status` placeholder — fixed to `null`
- **Story 2.5 H1 (R1):** `fileCount <= 50` should be `< 50` (off-by-one in auto-pass checker)
- **Story 2.4 M5 (R3):** `isBuddhistYearEquivalent` no `Number.isInteger()` guard — float delta 543.0 fires falsely
- **Story 2.3 C2:** `ColumnMappingDialog` sends header TEXT when hasHeader=false but parser expects NUMERIC (broken flow)
- **Story 2.2 M10:** `stripped.length===0` is dead code in wordCounter.ts (stripMarkup uses spaces not empty)
