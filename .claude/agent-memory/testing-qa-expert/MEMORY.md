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

### Story CR Review History (most recent first)

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

- **Story 2.7 H2 (R1):** `getFileHistory.action.ts` line 63 — `lastReviewerName: scores.status` placeholder — fixed to `null`
- **Story 2.5 H1 (R1):** `fileCount <= 50` should be `< 50` (off-by-one in auto-pass checker)
- **Story 2.4 M5 (R3):** `isBuddhistYearEquivalent` no `Number.isInteger()` guard — float delta 543.0 fires falsely
- **Story 2.3 C2:** `ColumnMappingDialog` sends header TEXT when hasHeader=false but parser expects NUMERIC (broken flow)
- **Story 2.2 M10:** `stripped.length===0` is dead code in wordCounter.ts (stripMarkup uses spaces not empty)
