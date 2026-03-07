# Story 3.4 CR Round 1 — Test Quality Review Notes

## Summary

- 11 test files reviewed (10 unit + 1 E2E)
- 0 it.skip() remaining (all GREEN)
- Total declared: 92 active tests across unit files + 5 E2E
- Severity: 0C · 3H · 6M · 5L

## H1 — T04 assertion semantics diverge from production behavior (fallbackRunner.test.ts)

**Test:** T04 — "should throw NonRetriableError when all models fail with auth error"
**Code:** `await expect(callWithFallback(chain, modelFn)).rejects.toThrow(MockNonRetriableError)`
**Problem:** `auth` is in FALLBACK_ELIGIBLE (production code will try the fallback model first). With `chain = { primary: 'gpt-4o-mini', fallbacks: ['gemini-2.0-flash'] }` and modelFn always rejecting with auth error, the function will try PRIMARY → FALLBACK (both fail) → NonRetriableError. This is correct behavior — but the test name says "Primary fails with auth error — fallback succeeds, then all fail" per ATDD. The modelFn always rejects, so fallback also fails. The test DOES produce NonRetriableError correctly, but `expect(modelFn).toHaveBeenCalledTimes(2)` is NOT asserted — the test cannot verify that auth errors actually trigger fallback attempt before throwing NonRetriableError. A production bug where auth immediately throws NonRetriableError (skipping fallback) would pass this test.

## H2 — T05 semantics wrong: empty chain throws retriable error, not NonRetriableError (fallbackRunner.test.ts)

**Test:** T05 — "should throw directly when primary fails and fallbacks array is empty"
**Code:** `await expect(callWithFallback(chain, modelFn)).rejects.toThrow(rateLimitErr)`
**Problem:** With `fallbacks: []`, primary fails with rate_limit (429). rate_limit IS in FALLBACK_ELIGIBLE. The code loops once (only primary), hits `isLast=true`, checks RETRIABLE_ON_EXHAUST (rate_limit IS in it), and re-throws the original error. So the test passes. BUT — T05 per ATDD is "Empty fallback chain — primary fails — throw directly." The assertion `rejects.toThrow(rateLimitErr)` does NOT verify the throw is immediate (no fallback attempted). `expect(modelFn).toHaveBeenCalledTimes(1)` IS asserted — so this is actually sound. Low concern, but test name matches ATDD P0 BV boundary (chain=0). HOWEVER: if error is `auth` (non-retriable on exhaust), with empty fallback array, it would throw `NonRetriableError`, NOT the original error. T05 only tests rate_limit. The empty-chain + auth error path is untested.

## H3 — retryFailedLayers concurrency config assertion passes vacuously (retryFailedLayers.test.ts)

**Test:** "[P0] should have concurrency limit=1 per projectId"
**Code:**

```ts
expect(retryFailedLayersConfig).toEqual(
  expect.objectContaining({
    concurrency: expect.objectContaining({
      limit: 1,
      key: expect.stringContaining('projectId'),
    }),
  }),
)
```

**Problem:** Production `retryFailedLayersConfig.concurrency` is `{ limit: 1, key: 'event.data.projectId' }` — this is correct and test passes. BUT the _actual createFunction call_ wraps this in an array: `concurrency: [{ key: ..., limit: ... }]`. The test checks `retryFailedLayersConfig` (the plain object), NOT the actual Inngest registration. A bug where `createFunction` is called with `concurrency: retryFailedLayersConfig.concurrency` (unwrapped, not array-wrapped) would break Inngest concurrency silently but this test would still pass. The "createFunction registration" test below catches the event name/id but does NOT verify the concurrency parameter structure.

## M1 — T40 "server action must not reset status" assertion uses stale/wrong capture mechanism (retryAiAnalysis.action.test.ts)

**Test:** T40 — "should NOT reset file status in server action"
**Code:**

```ts
const statusChange = (dbState.setCaptures as Record<string, unknown>[])?.find(
  (s) => s.status !== undefined,
)
expect(statusChange).toBeUndefined()
```

**Problem:** `dbState.setCaptures` captures `.set()` arguments. The production server action does NOT call `.update().set()` on files at all (confirmed: no status reset in action). So `setCaptures` will be empty and test passes — BUT this test will also pass if the production code sets any unrelated `.set()` call without a `status` field. More critically, the assertion only checks `setCaptures` — it doesn't verify that `dbState.callIndex` advanced only for SELECT queries (file, score, project) and the Inngest send. A future developer adding a `.update(...).set({ updatedAt: new Date() })` without `status` would not be caught. **Low-confidence assertion for a P0 security guardrail (RT-6).**

## M2 — T25 (DbFileStatus union type test) is a tautological compile-time assertion (processFile.story34.test.ts)

**Test:** T25 — "should use ai_partial as valid DbFileStatus value"
**Code:**

```ts
type DbFileStatus = 'uploaded' | ... | 'ai_partial' | 'failed'
const status: DbFileStatus = 'ai_partial'
expect(status).toBe('ai_partial')
```

**Problem:** This is a LOCAL type alias declared inside the test — it does NOT import from `@/types/pipeline`. If the production `DbFileStatus` type was never updated to include `'ai_partial'`, this test would still pass because the test defines its own type. The intent (verify the production type includes `ai_partial`) is not achieved. Should be:

```ts
import type { DbFileStatus } from '@/types/pipeline'
const status: DbFileStatus = 'ai_partial'
```

## M3 — T21 (L1 findings preserved) does not verify L1 findings remain — only that L1 ran (processFile.story34.test.ts)

**Test:** T21 — "should preserve L1 findings intact when L2 fails"
**Code:**

```ts
expect(mockRunL1ForFile).toHaveBeenCalled()
expect(mockScoreFile).toHaveBeenCalledWith(expect.objectContaining({ layerFilter: 'L1' }))
```

**Problem:** PM-D says "Retry L2 MUST NOT delete L1 findings. Verify `WHERE layer = 'L2'` scoped delete." This test only verifies L1 RAN — it does NOT verify that L1 findings were not deleted. The actual protection is in `runL2ForFile` (DELETE with layer filter), but the processFile test should assert that no DELETE-all-findings call was made. This is a **data integrity gap** — the pre-mortem scenario PM-D is the highest-priority concern and this test only validates the symptom (scoreFile called) not the root cause protection (scoped delete).

## M4 — retryAiAnalysis audit log action assertion uses wrong action name (retryAiAnalysis.action.test.ts)

**Test:** "[P1] should write audit log for retry action"
**Code:**

```ts
expect(mockWriteAuditLog).toHaveBeenCalledWith(
  expect.objectContaining({
    action: expect.stringContaining('retry'),
    ...
  }),
)
```

**Production code:** `action: 'retry_ai_analysis'`
**Problem:** `expect.stringContaining('retry')` matches any string containing "retry" — e.g., `'retrying'`, `'do_retry_now'`, etc. This should be `action: 'retry_ai_analysis'` (exact match) per the actual production value. The test is correct in spirit but too loose — it would accept any audit action name with "retry" in it.

## M5 — T51 (double failure) asserts `.resolves.not.toThrow()` which is always true (processFile.story34.test.ts)

**Test:** T51 — "should handle double failure (partial-set step also throws)"
**Code:**

```ts
dbState.throwAtCallIndex = 0
await expect(
  processFilePipeline.onFailure({ event: onFailureEvent, error: new Error('failed') }),
).resolves.not.toThrow()
```

**Problem:** `.resolves.not.toThrow()` is a vacuous assertion — a Promise that resolves NEVER throws. The correct pattern is `await expect(promise).resolves.toBeUndefined()` or just `await promise` with no throw (asserting the function survives gracefully). The test was meant to verify that even when the first DB call inside `onFailure` throws, the function catches it and returns without propagating. The production code DOES have a try-catch in `onFailure` for `dbErr`, so the intent is valid — but the assertion form is wrong. Should check that `onFailure` resolves (returns undefined/void) without rethrowing.

## L1 — T59 (atomic batch completion) — `isNull` assertion is module-level, not call-specific (processFile.story34.test.ts)

**Test:** T59 — "should use atomic UPDATE...WHERE completed_at IS NULL pattern"
**Code:**

```ts
const { isNull } = await import('drizzle-orm')
expect(isNull).toHaveBeenCalled()
```

**Problem:** This asserts `isNull` was called at some point — but `isNull` is a mock of the drizzle-orm module-level function. If any OTHER query in the handler calls `isNull` for a different purpose, this assertion would pass vacuously. More critically: `isNull` is mocked at module level via `vi.mock('drizzle-orm', ...)` — the import inside the test body gets the already-resolved mock. The assertion is structurally sound (confirms isNull was invoked), but cannot discriminate between correct usage and incidental usage.

## L2 — createFunction test uses vi.resetModules() which may not re-import cleanly (retryFailedLayers.test.ts)

**Test:** "[P0] should be registered with correct event in createFunction"
**Code:**

```ts
vi.resetModules()
await import('./retryFailedLayers')
expect(createFunctionMock).toHaveBeenCalledWith(...)
```

**Problem:** `vi.resetModules()` inside a test body (not in `beforeEach`) creates module isolation issues in Vitest — the module cache is cleared but hoisted mocks may not re-apply correctly for the re-imported module. This is the same anti-pattern flagged in Story 2.7 CR R4 (noted in MEMORY.md). Additionally, `createFunctionMock` was captured BEFORE `vi.resetModules()`, so it may not be the same mock reference after module reset. The test passing is not guaranteed to be deterministic across test run orders.

## L3 — T80 (E2E fallback badge) is vacuous — conditional check always passes (pipeline-resilience.spec.ts)

**Test:** T80 — "[P2] fallback badge visible on finding with non-primary model"
**Code:**

```ts
const count = await fallbackBadge.count()
if (count > 0) {
  await expect(fallbackBadge.first()).toContainText(/fallback/i)
}
```

**Problem:** If no fallback findings are seeded (seeded data has only L1 findings — no AI model), `count === 0` and the `if` block never executes. The test always passes regardless of whether fallback badges work. This was already noted as P2 in the ATDD, but the conditional guard makes it completely non-assertive. Should at minimum seed a finding with a fallback aiModel value, or mark the test as genuinely informational.

## L4 — E2E T79 asserts score badge transitions away from "Partial" which depends on real Inngest pipeline (pipeline-resilience.spec.ts)

**Test:** T79 — "clicking retry disables button and triggers score update"
**Code:**

```ts
await expect(scoreBadge).not.toContainText(/partial/i, { timeout: 120_000 })
```

**Problem:** This E2E test depends on the full Inngest retry pipeline completing within 120 seconds — including L2 AI call to a real AI provider. If the AI provider is slow or unavailable in CI, this test will time out. The ATDD noted this was seed-based strategy with TD-E2E-011 for real failure path, but T79 actually triggers a REAL Inngest pipeline. There is no `pollScoreLayer()` helper call between the click and the badge assertion — the test relies on Realtime propagation rather than DB polling. This is the same flakiness pattern identified in the Story 3.2c CR (race condition between Inngest completion and Realtime delivery).

## L5 — T30 warning text test is placed under "retry button" describe block, not "L3 failure handling" (ReviewPageClient.story34.test.tsx)

**Test:** T30 — "[P1] should show warning text for L3 failure: 'Deep analysis unavailable'"
**Problem:** Minor organization issue — this test (and the subsequent L2 warning test) are inside `describe('retry button')` but they test banner/warning text display, not button behavior. The L2 warning text test is an unlabeled extra (not mapped to any T-ID in ATDD). The T30 ATDD entry is correctly covered, but the organize mismatch makes the test suite harder to navigate.

## Coverage Gaps Not Addressed

### P0 Gaps (must fix before sign-off):

- **T26 (P1 carried to attention):** `RecentFilesTable` handling of `ai_partial` status variant — no test found anywhere. The ATDD file plan shows this was not assigned to a test file. The `RecentFilesTable.test.tsx` file does not contain any `ai_partial` status test.

### P1 Gaps (should fix):

- **T08 (PM-F cost tracking):** `fallbackRunner.test.ts` T08 tests `result.modelUsed` is correct, but does NOT test that `logAIUsage()` inside `runL2ForFile` is called with `model: fbResult.modelUsed`. The `runL2ForFile.story34.test.ts` DOES cover this (T08 equivalent test 3), but the `fallbackRunner.test.ts` T08 tests only that `modelUsed` field is returned — not the cost tracking downstream. Low risk since runL2ForFile test covers it, but there is a gap in the fallbackRunner test itself.
- **T64/T65 (audit log for fallback):** Coverage exists in `runL2ForFile.story34.test.ts` and `runL3ForFile.story34.test.ts`, but `callWithFallback` itself has NO audit log call — audit is written by the callers. Tests correctly verify the callers write the audit log. No gap in behavior, but `fallbackRunner.ts` has no `writeAuditLog` call — if it was expected to have one, it's missing from production code too.

## Key Positive Observations

- No `it.skip()` remaining — all 107 ATDD tests reached GREEN phase
- Mock isolation is excellent — `vi.hoisted` + `createDrizzleMock()` used correctly throughout
- `vi.fn((..._args: unknown[]) => ...)` pattern used consistently for `.calls` access safety
- Factory functions (buildRetryEvent, buildPipelineEvent, buildFbResult) avoid hardcoded data
- `beforeEach(() => { vi.clearAllMocks(); dbState.callIndex = 0 })` pattern is consistent
- T67/T68/T69 boundary value tests (scoreStatus=partial overrides score) are well-formed
- E2E tour suppression (setUserMetadata) correctly applied
- TD-E2E-011 TODO comment correctly formatted with TD reference
