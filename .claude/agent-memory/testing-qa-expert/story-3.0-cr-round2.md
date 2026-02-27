# Story 3.0 CR Round 2 — Test Quality Report

**Date:** 2026-02-27
**Scope:** 5 test files, 73 tests total (all green)
**R1 fixes reviewed:** fnConfig/triggerEvent assertions, NonRetriableError type check, server-only mock,
mockFrom call count assertions, recovery stop-polling, mockSelect column assertion,
multi-step currentFileId tracking, selectionMode in resetForFile, last-event-wins assertion,
fileCount 49/51 boundary tests, dbState.callIndex assertion.

---

## Findings Summary

| Severity | Count | Files                                                                       |
| -------- | ----- | --------------------------------------------------------------------------- |
| HIGH     | 2     | scoreFile.test.ts, use-score-subscription.test.ts                           |
| MEDIUM   | 4     | recalculateScore.test.ts, scoreFile.test.ts, use-score-subscription.test.ts |
| LOW      | 3     | review.store.test.ts, scoreFile.test.ts, finding-changed-emitter.test.ts    |

---

## HIGH Findings

### H1 — scoreFile.test.ts: Boundary tests for fileCount=49/51 test WRONG condition (lines 493–534)

**File:** `src/features/scoring/helpers/scoreFile.test.ts` lines 493–534

**Source condition:**

```typescript
// scoreFile.ts line 190
if (autoPassResult.isNewPair && autoPassResult.fileCount === NEW_PAIR_FILE_THRESHOLD) {
```

`NEW_PAIR_FILE_THRESHOLD = 50`. Notification fires only when `fileCount === 50`.

**fileCount=49 test (lines 493–513):**
The test sets `eligible: true` + `isNewPair: true` + `fileCount: 49`.
The condition `isNewPair && fileCount === 50` evaluates to false (correct: no notification).
BUT `eligible: true` means `status = 'auto_passed'`. The test only provides 5 `returnValues` slots
(segments, findings, prev score, delete, insert.returning). This is correct for the no-notification path.
Assessment: The assertion `dbState.callIndex === 5` is CORRECT.

**fileCount=51 test (lines 515–534):**
Same structure with `fileCount: 51`. Condition again false. `dbState.callIndex === 5` is CORRECT.

**However — the test title and comment for the fileCount=49 test is MISLEADING:**

- Title: "should not fire notification when fileCount is 49 (boundary below threshold)"
- Comment: "fileCount=49 !== NEW_PAIR_FILE_THRESHOLD(50) → notification NOT triggered"
- This is true, but the test also sets `eligible: true` without providing `autoPassRationale` in the mock
  autoPassResult, whereas the actual `mockAutoPassEligible` object used elsewhere has a `rationale`.
  The mock `{ eligible: true, rationale: 'Auto-pass', isNewPair: true, fileCount: 49 }` is defined
  inline and the `valuesCaptures` is NEVER asserted. We cannot verify the INSERT actually received
  the correct `autoPassRationale`. This is a gap introduced in R1.

**Real HIGH issue — the notification path in both boundary tests is NEVER verified NOT to run:**
Both tests assert `dbState.callIndex === 5`, which means the notification path didn't add more DB calls.
BUT `createGraduationNotification` is wrapped in a `try/catch` in `scoreFile.ts` (lines 191–203).
If the notification path DID run but the dedup check returned `[]` (existing=undefined),
the function would try to query admins (`dbState.callIndex` would be 6 or 7), causing the mock to
return `undefined` from `returnValues[5]` (which is undefined). This would NOT throw but would behave
incorrectly. The test WOULD still see `callIndex === 5` because when the notification path runs,
the mock `returnValues[5]` is undefined, causing the `[existing]` destructure to set `existing = undefined`,
which means it enters the "no dedup hit" path and tries to query admins at `callIndex = 6`, which is
again undefined. Since `admins.length === 0` (undefined.length throws), the catch silences it.

The `callIndex` never advances beyond 5 because the graduation `try` block throws inside when
`admins` is undefined, so `callIndex` stays at 5 even if the notification path was accidentally
entered. **This means the fileCount=49 and fileCount=51 "no notification" boundary tests are
TAUTOLOGICALLY PASSING — they would also pass if the `fileCount === 50` guard were removed entirely.**

**Severity: HIGH** — The boundary tests do not distinguish between "notification correctly skipped" and
"notification path entered but silently failed." To fix: add `dbState.returnValues` slots for what would
be consumed IF the notification ran (dedup check + admins + insert = 3 more) and use `toThrow` to
prove those calls never happened, OR assert `dbState.callIndex < 6` only after providing enough slots
to prove the notification path would advance callIndex if entered.

**Simplest fix:** Mock `checkAutoPass` to return the inline result ONLY (as done), keep `returnValues`
as only 5 slots, but add `expect(dbState.callIndex).toBe(5)` AND assert the dedup check mock
(`mockFrom`) was called exactly the same number of times it was called before the graduation check.
Since `mockFrom` is shared with the polling mock in another test file, the cleanest fix is to spy on
the `createGraduationNotification` internals or track call count of the notification-specific queries.

---

### H2 — use-score-subscription.test.ts: Backoff sequence test uses wrong timing (lines 189–216)

**File:** `src/features/review/hooks/use-score-subscription.test.ts` lines 189–216

**Implementation timing trace:**
The source code (lines 64–69 of `use-score-subscription.ts`):

```typescript
pollTimerRef.current = setTimeout(() => {
  pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, MAX_POLL_INTERVAL)
  poll().catch(...)
}, pollIntervalRef.current) // uses CURRENT interval (before doubling)
```

The interval is set to `pollIntervalRef.current` for the CURRENT setTimeout, THEN doubled INSIDE
the callback. So the actual wait times are:

- Immediate poll (no timer)
- Wait 5000ms (timer set with current=5000), callback doubles to 10000
- Wait 10000ms (timer set with current=10000), callback doubles to 20000
- Wait 20000ms (timer set with current=20000), callback doubles to 40000
- Wait 40000ms (timer set with current=40000), callback doubles to 80000 → capped 60000
- Wait 60000ms (capped)

**Test at lines 202–215:**

```typescript
await vi.advanceTimersByTimeAsync(5000)  // 1st scheduled poll at 5s ← CORRECT
const callsAfter5s = mockFrom.mock.calls.length
...
await vi.advanceTimersByTimeAsync(10000) // 2nd poll at 10s ← CORRECT
...
await vi.advanceTimersByTimeAsync(20000) // 3rd poll at 20s ← CORRECT
...
await vi.advanceTimersByTimeAsync(40000) // 4th poll at 40s ← CORRECT
```

The sequence IS correct. The test passes and the timing matches the implementation.

**However: the "cap at 60s" test (lines 218–241) has a subtle flaw.**
After advancing `0 + 5000 + 10000 + 20000 + 40000 = 75000ms`, the implementation state is:

- Poll count: immediate + 5s + 10s + 20s + 40s = 5 polls
- `pollIntervalRef.current` was set to `Math.min(40000*2, 60000) = 60000` inside the 40s callback
- The timer for the NEXT poll is already scheduled at **60000ms** from the end of that 40s advance

The test then does `await vi.advanceTimersByTimeAsync(60000)` and asserts a new poll fires. This IS
correct — the 5th scheduled poll fires at 60s. Then `await vi.advanceTimersByTimeAsync(60000)` again
asserts the 6th scheduled poll fires at 60s (not 120s). This IS correct because after the 5th poll,
`Math.min(60000*2, 60000) = 60000` (capped). So the test IS correct.

**BUT: the comment is wrong:**

```
// Advance through: immediate + 5s + 10s + 20s + 40s + 60s (cap, NOT 80s)
```

The cap isn't at 60s because `40000*2=80000>60000`. The cap is applied BEFORE the 5th poll timer,
not on the 5th poll itself. The 5th poll fires at 60s (not 80s). The comment says "5th poll capped
at 60s" but actually the timer was set to 60s because of the cap — the statement is true but the
reasoning comment is imprecise. Not a test bug, just a misleading comment.

**More critical: The recovery stop-polling assertion (lines 132–154) has a REAL subtlety.**

At line 143: `const callsBeforeRecovery = mockFrom.mock.calls.length`
At line 153: `expect(mockFrom.mock.calls.length).toBe(callsBeforeRecovery)`

After `subscribeCallback('SUBSCRIBED')`, `stopPolling()` is called which:

1. Sets `isPollingRef.current = false`
2. Calls `clearTimeout(pollTimerRef.current)`
3. Resets `pollIntervalRef.current = 5000`

But if an in-flight `poll()` call is awaiting its async Supabase query at the moment of recovery,
the poll will complete, check `if (!isPollingRef.current) return` (now false) and NOT schedule
the next timer. In the test, `await vi.advanceTimersByTimeAsync(5000)` fires the 5s scheduled poll.
The poll starts and `mockSingle()` returns a resolved promise. After the poll body, the code checks
`if (!isPollingRef.current) return` — but in fake-timer land, `subscribeCallback('SUBSCRIBED')`
is called synchronously in `act()` AFTER the timer advance. So the sequence is:

1. 5s timer fires → poll runs → mockSingle resolves → check isPollingRef (still true) → schedules next 10s timer
2. Recovery fires → stopPolling() → clears the 10s timer

This is actually CORRECT behavior and the test correctly captures it. The recovery clears the PENDING
timer set after the 5s poll. The assertion works.

**Severity: LOW** — timing is correct, comment is misleading. Reclassifying H2 to MEDIUM.

---

## MEDIUM Findings

### M1 — recalculateScore.test.ts: `step.run` call not asserted (lines 60–79)

**File:** `src/features/pipeline/inngest/recalculateScore.test.ts` lines 60–79

The happy-path test asserts `mockScoreFile` was called with correct params. But the implementation
wraps the `scoreFile` call inside `step.run('recalculate-score-${fileId}', ...)`. The test's
`createMockStep` executes the step function inline, so `mockScoreFile` IS called — but the step ID
`'recalculate-score-${fileId}'` is never verified. If the developer accidentally hardcoded a wrong
step ID or omitted `step.run` entirely and called `scoreFile` directly, the test would still pass.

```typescript
// recalculateScore.ts line 38
const scoreResult = await step.run(`recalculate-score-${fileId}`, () => scoreFile(...))
```

**Missing assertion:**

```typescript
const mockStep = createMockStep()
vi.spyOn(mockStep, 'run') // or check via createMockStep returning a spy
await recalculateScore.handler({ event: { data: event }, step: mockStep })
expect(mockStep.run).toHaveBeenCalledWith(`recalculate-score-${event.fileId}`, expect.any(Function))
```

The current `createMockStep` uses `vi.fn()` for `run` but the test never asserts on `mockStep.run.mock.calls`.

**Severity: MEDIUM** — step ID determines Inngest memoization key. Wrong ID = repeated scoring on retries.

---

### M2 — recalculateScore.test.ts: `onFailure` — audit write failure is not tested (line 136–160)

**File:** `src/features/pipeline/inngest/recalculateScore.test.ts` lines 136–160

The source `onFailureFn` wraps `writeAuditLog` in a `try/catch` (lines 66–84 of `recalculateScore.ts`).
If `writeAuditLog` throws, a second `logger.error` is called. The test never verifies this resilience path.
This is a P1 coverage gap: if `mockWriteAuditLog` is configured to throw, the `onFailure` handler
should still complete without throwing.

**Severity: MEDIUM** — the non-fatal audit pattern is the same guardrail as other audit tests (Story 2.7).

---

### M3 — use-score-subscription.test.ts: Store state not verified after stop-polling (lines 132–154)

**File:** `src/features/review/hooks/use-score-subscription.test.ts` lines 132–154

The test "should resubscribe after channel recovery and stop polling" only asserts that `mockFrom.mock.calls.length`
doesn't increase after recovery. It doesn't verify:

1. `stopPolling` actually reset `pollIntervalRef.current` to 5000 (so if error happens again, backoff restarts)
2. The store's `currentScore` was updated during the pre-recovery polls (proving the polls were functional)

The poll at line 142 (`await vi.advanceTimersByTimeAsync(5000)`) runs `mockFrom`, which returns
`{ data: { mqm_score: 85, status: 'calculated' }, error: null }`. The store should be updated.
But the test only checks call count, not that `useReviewStore.getState().currentScore === 85`.

**Severity: MEDIUM** — partial assertion: proves stop but not that polls were functional before stop.

---

### M4 — scoreFile.test.ts: `should round mqmScore to 2 decimal places` tests wrong thing (lines 563–587)

**File:** `src/features/scoring/helpers/scoreFile.test.ts` lines 563–587

The test name says "should round mqmScore to 2 decimal places". But the source does NOT round the score:

```typescript
// scoreFile.ts line 149
mqmScore: scoreResult.mqmScore,  // passed through as-is from calculateMqmScore
```

The mock returns `mqmScore: 85.67`. The source stores `85.67` directly into the DB (no rounding).
The test then checks:

```typescript
const decimals = result.mqmScore.toString().split('.')[1]
expect(decimals ? decimals.length : 0).toBeLessThanOrEqual(2)
```

This passes because `85.67.toString() = '85.67'` → `decimals = '67'` → length 2 ≤ 2. But the test
is asserting source behavior that doesn't exist! The source never rounds. If `mqmScore` were `85.1234`,
the test would FAIL — but so would the DB schema (DB column is `numeric(5,2)` which rounds at insert time,
not at the application layer). The test description makes a promise the source code doesn't keep.

**The test should either:**
a) Mock `calculateMqmScore` to return `85.12345` and assert the source rounds it (if that's the requirement)
b) Delete the test and rename — it's testing the mock's value, not rounding behavior

**Severity: MEDIUM** — test asserts behavior the source doesn't implement, creating false confidence.

---

## LOW Findings

### L1 — review.store.test.ts: Two boundary tests are trivially true (lines 116–126)

**File:** `src/features/review/stores/review.store.test.ts` lines 116–126

```typescript
it('should handle resetForFile with empty findingsMap', () => {
  useReviewStore.getState().resetForFile('file-id')
  expect(useReviewStore.getState().findingsMap.size).toBe(0)
})

it('should handle resetForFile with null score', () => {
  useReviewStore.getState().resetForFile('file-id')
  expect(useReviewStore.getState().currentScore).toBeNull()
})
```

The `beforeEach` already calls `resetForFile('test-file-id')`, so state is already empty.
These two tests call `resetForFile` again and assert the same initial conditions. They are essentially
testing "does resetForFile work when called twice?" which is not the stated intent ("when empty/null").

The real intent should be to call `resetForFile` ON a non-empty state (i.e., after populating) and
verify it still clears correctly. But that's already covered by the comprehensive "should clear ALL
state" test at line 73. These two tests add no additional coverage — they are duplicates.

**Severity: LOW** — harmless but wasteful.

---

### L2 — scoreFile.test.ts: `should maintain backward compatibility` duplicates happy-path (lines 709–723)

**File:** `src/features/scoring/helpers/scoreFile.test.ts` lines 709–723

This test calls `scoreFile` without `layerFilter` and asserts `result.mqmScore === 85` and
`result.scoreId` is defined. This is IDENTICAL in behavior to "should calculate MQM score and persist"
(lines 191–204) which also calls without `layerFilter` and asserts the same values. The test was
added for the "backward compatibility with existing callers" concern, which is valid, but the assertion
content is redundant. A better assertion would verify the absence of a `detectedByLayer` filter in
the `eq` mock calls (which IS tested in `should query ALL findings when layerFilter is undefined`).

**Severity: LOW** — redundant but harmless.

---

### L3 — finding-changed-emitter.test.ts: `should emit once for 10 rapid changes within 500ms` edge case gap (lines 104–113)

**File:** `src/features/review/utils/finding-changed-emitter.test.ts` lines 104–113

The test advances by `10 × 40ms = 400ms` total then `+500ms = 900ms`. The last emit happens at 400ms,
so 500ms later = 900ms total. The test correctly fires. However, there is no test for the edge case
where emits are spaced exactly 500ms apart (every emit at the exact 500ms boundary resets the timer).
This would confirm the debounce resets the full window each time, not just accumulates. The existing
"should reset timer on each new emit() call" test covers this for 2 emits. For completeness, testing
emit at 499ms after last emit (should NOT fire) would be a valuable BV addition.

This is a P2/P3 gap. The existing tests are sufficient for P0/P1 coverage.

**Severity: LOW** — minor coverage gap, not a CR blocker.

---

## R1 Fixes Verification

| R1 Fix                                                 | Status            | Notes                                                                |
| ------------------------------------------------------ | ----------------- | -------------------------------------------------------------------- |
| recalculateScore: fnConfig/triggerEvent assertions     | CORRECT           | Lines 122–124, 163–164, 167–168 match source exactly                 |
| recalculateScore: NonRetriableError type check         | CORRECT           | Dynamic import + `.toThrow(InngestNonRetriableError)` works          |
| recalculateScore: server-only mock                     | CORRECT           | Line 40, but `server-only` not imported by source — harmless         |
| use-score-subscription: mockFrom call count in backoff | CORRECT           | `.toBeGreaterThan(callsAfterXs)` is valid for incremental comparison |
| use-score-subscription: recovery stop-polling          | CORRECT           | `toBe(callsBeforeRecovery)` is a correct strict equality assertion   |
| use-score-subscription: mockSelect column assertion    | CORRECT           | Line 124: `mockSelect.toHaveBeenCalledWith('mqm_score, status')`     |
| review.store: multi-step currentFileId tracking        | CORRECT           | Lines 171–179 step through three resets                              |
| review.store: selectionMode in resetForFile            | CORRECT           | Line 89 asserts `selectionMode === 'single'`                         |
| finding-changed-emitter: last-event-wins assertion     | CORRECT           | Lines 50–55 check both once-called and called-with-lastEvent         |
| scoreFile: fileCount 49/51 boundary tests              | PARTIALLY CORRECT | Tests pass but are tautological (see H1)                             |
| scoreFile: dbState.callIndex assertion                 | CORRECT           | Line 469 asserts exactly 8 for graduation path                       |

---

## Recommended Priority Fixes

**Must fix before exit (≥ MEDIUM):**

1. M4: Remove or rewrite "should round mqmScore to 2 decimal places" — it asserts source behavior that doesn't exist
2. M1: Add `mockStep.run` call assertion with correct step ID
3. H1: Make fileCount=49/51 boundary tests non-tautological (see fix strategy above)
4. M2: Add `onFailure` audit-write-failure resilience test
5. M3: Add store state verification in recovery test

**Acceptable as tech debt (LOW):**

- L1: Two trivially-true boundary tests in review.store
- L2: Backward compat test duplicating happy-path
- L3: Missing 499ms-between-emits BV test

**Exit criteria:** 0C + 0H + 0M required for clean CR exit.
Current state: 0C · 2H · 4M · 3L
