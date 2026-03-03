# Story 3.2c CR Round 1 — L2 Results Display & Score Update

**Date:** 2026-03-03
**Total unit tests:** 112 (all green)
**E2E tests:** 7 active + INNGEST_DEV_URL gate skip + afterAll cleanup
**Verdict:** 0C · 1H · 4M · 5L

---

## HIGH (1)

### H1: FindingListItem P0 ATDD test "source/target excerpts in expanded state" missing

**File:** `src/features/review/components/FindingListItem.test.tsx`
**ATDD Ref:** T9.7 (P0) — "should show source/target excerpts in expanded state"

The ATDD checklist (line 275) specifies 7 tests for FindingListItem: 2×P0, 4×P1, 1×P2.
The file implements only 6 tests (1×P0, 4×P1, 1×P2). The P0 test for T9.7 — verifying
that sourceTextExcerpt and targetTextExcerpt appear in the expanded detail area — is
entirely absent. The source component (`FindingListItem.tsx` lines 103-110) renders these
fields conditionally in the expanded state, so the behavior exists but no P0 test
guards it.

**Risk:** If someone refactors the conditional rendering in the detail block, no test fails.

---

## MEDIUM (4)

### M1: ReviewProgress P0 test "L2 pending when layerCompleted is L1 only" missing

**File:** `src/features/review/components/ReviewProgress.test.tsx`
**ATDD Ref:** T8.7 (P0) — "should show L2 pending when layerCompleted is L1 only"

The ATDD checklist (line 265) specifies 7 tests (4×P0, 3×P1). The file implements 6 tests.
The missing P0 test covers the `layerCompleted='L1'` + not `l2_processing` → `pending`
path in `getL2Status()`. The "pending" state renders a circle indicator (not a checkmark,
not a spinner). This branch in production code is untested.

### M2: getFileReviewData T5.6 "processingMode from projects table" test missing

**File:** `src/features/review/actions/getFileReviewData.action.test.ts`
**ATDD Ref:** T5.6 (P0) — "should load processingMode from projects table"

The ATDD specifies 6 tests (4×P0, 2×P1). The file implements only 5 tests. The missing
P0 test specifically asserts that `result.data.processingMode` equals the value returned
from the projects join (e.g., `'economy'`). T5.1 (happy path) does not assert
`processingMode` — the `expect` block only checks `file`, `findings`, `score`, and
`l2ConfidenceMin`. The processingMode field is never asserted in any test.

**Root cause:** The happy-path test (T5.1) at line 95-102 asserts only:

```
expect(result.data.file).toBeDefined()
expect(result.data.findings).toHaveLength(2)
expect(result.data.score).toBeDefined()
expect(result.data.score.mqmScore).toBe(85.5)
expect(result.data.l2ConfidenceMin).toBe(70)
```

`processingMode` is never checked anywhere.

### M3: withTenant test is a callIndex count check, not a payload verification

**File:** `src/features/review/actions/getFileReviewData.action.test.ts`
**ATDD Ref:** T5.2 (P0)

T5.2 ("should use withTenant() on all queries") only asserts
`expect(dbState.callIndex).toBeGreaterThanOrEqual(3)`. This verifies DB was called but
does NOT verify that the tenantId was actually included in the WHERE clause of each query.
A developer who removes `withTenant()` from one query would NOT fail this test if the
query still runs (callIndex still advances). The correct approach would be to inspect
`dbState.setCaptures` or mock `withTenant` and assert it was called with `mockTenantId`
N times. This is the same pattern identified as M2 in Story 3.0 R1.

### M4: T7.4 burst batching test does not verify "single state update" semantics

**File:** `src/features/review/hooks/use-findings-subscription.test.ts`
**ATDD Ref:** T7.4 (P0) — "Burst INSERT: N events batched into single state update"

The test fires 5 INSERT events and asserts `map.size >= 5`. This verifies that all findings
are in the store after the burst, which is correct — but it does NOT verify the "single
state update" (i.e., `queueMicrotask` batching) behavior. The production implementation
(`use-findings-subscription.ts`) does NOT implement `queueMicrotask` batching — each INSERT
calls `setFinding()` individually. The ATDD specifies burst batching via `queueMicrotask`,
but neither the implementation nor the test actually tests this. The test passes because
individual `setFinding()` calls are equivalent in result, but the specified behavior
(single state update) is neither implemented nor verified.

**Implication:** Production code diverges from ATDD design (queueMicrotask batching not
implemented). Test is vacuously satisfied by the simpler implementation.

---

## LOW (5)

### L1: ConfidenceBadge 10th ATDD test (null threshold) not implemented

**File:** `src/features/review/components/ConfidenceBadge.test.tsx`
**ATDD Ref:** P1 — "should not render l2ConfidenceMin warning when threshold is null"

The ATDD checklist specifies 10 tests for ConfidenceBadge (line 237-248). The file
implements only 9. The missing test verifies that when `l2ConfidenceMin=null` (no
threshold configured), no warning icon appears even if confidence is below a typical
threshold. The behavior is correct in production code (`ConfidenceBadge.tsx` guards with
`l2ConfidenceMin !== null`), but it has no test.

### L2: LayerBadge 4th ATDD test (design token color) not implemented

**File:** `src/features/review/components/LayerBadge.test.tsx`
**ATDD Ref:** P1 — "should use design token color"

The ATDD specifies 4 tests. The file implements only 3. The missing test would verify the
AI badge uses `--color-status-ai-screened` token (purple) for L2/L3. The existing L2/L3
tests only check `className.toMatch(/purple|ai/i)`, which is a partial match.

### L3: T7.7 "INSERT+DELETE idempotency" test missing

**File:** `src/features/review/hooks/use-findings-subscription.test.ts`
**ATDD Ref:** T7.7 (P0) — "should handle INSERT+DELETE for re-process idempotency"

The ATDD checklist (line 304) lists a P0 test: "should handle INSERT+DELETE for
re-process idempotency". This test is missing. It covers the scenario where a finding
is inserted, then deleted (re-process clears findings), then re-inserted — verifying
the store ends up with the correct final state. This is the same DELETE+INSERT cycle
that Guardrail #6 protects at DB level.

Note: T7.3 (DELETE) is implemented, but the combined INSERT→DELETE→INSERT cycle for
re-process idempotency is not.

### L4: E2E uses waitForLoadState('networkidle') for RSC review page — potential flakiness

**File:** `e2e/review-findings.spec.ts` (lines 140, 168, 188, 210, 241, 265)

All 6 assertion tests use `waitForLoadState('networkidle')` before asserting. For RSC
pages with Realtime subscriptions that establish WebSocket connections, `networkidle`
may never fully settle (WebSocket keeps network "busy"). This is a known E2E pattern
weakness noted in `_bmad-output/e2e-testing-gotchas.md`. The safer pattern is to wait
for a specific element: `await expect(page.getByTestId('score-badge')).toBeVisible()`.
Using both `waitForLoadState` + element wait is redundant and potentially causes race
conditions in CI.

### L5: E2E `data-testid="finding-count-summary"` specified in ATDD but missing from ReviewPageClient

**File:** `src/features/review/components/ReviewPageClient.tsx`
**ATDD Ref:** Required data-testid attributes (line 370)

The ATDD specifies `finding-count-summary` as a required data-testid on the severity
count summary (lines 108-115 of ReviewPageClient.tsx). The finding count summary is
rendered without this data-testid. The E2E spec does not test this attribute directly
(T4.5 "Finding count summary per severity visible" was not included in the spec either),
but the ATDD document explicitly requires it. This creates a gap between ATDD specification
and implementation.

Similarly, `score-badge`, `review-progress`, and `finding-list` data-testids are specified.
`score-badge` is on ScoreBadge.tsx (correct). `review-progress` is on ReviewProgress.tsx
(correct). But `finding-list` is not added to the findings container `<div>` in
ReviewPageClient.tsx. E2E tests navigate by individual item (`finding-list-item`) rather
than the container, so this is not currently causing test failures.

---

## Stale Comments (Not Counted as Findings)

All 6 test files have stale RED phase header comments ("TDD RED PHASE — all tests are
`it.skip()`.") that were not removed after GREEN phase. Consistent with prior stories —
same pattern noted in 3.2b6 R1 L4. Not counted since it's been consistently accepted.

---

## Test Count vs ATDD Summary

| File                              | ATDD Spec | Actual | Missing                                |
| --------------------------------- | --------- | ------ | -------------------------------------- |
| ConfidenceBadge.test.tsx          | 10        | 9      | T2.10 (null threshold, P1)             |
| LayerBadge.test.tsx               | 4         | 3      | T design-token (P1)                    |
| ReviewProgress.test.tsx           | 7         | 6      | T8.7 (L2 pending, P0) → M1             |
| FindingListItem.test.tsx          | 7         | 6      | T9.7 (source/target expanded, P0) → H1 |
| ScoreBadge.boundary.test.tsx      | 7         | 6      | T11.7 counted in ScoreBadge.test.tsx   |
| getFileReviewData.action.test.ts  | 6         | 5      | T5.6 (processingMode, P0) → M2         |
| use-findings-subscription.test.ts | 7         | 6      | T7.7 (idempotency, P0) → L3            |
| use-score-subscription.test.ts    | +3        | +3     | All present                            |
| review.store.test.ts              | +3        | +3     | All present                            |
| ScoreBadge.test.tsx               | +3        | +3     | All present                            |
