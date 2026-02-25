# Story 2.6 CR Round 2 — Adversarial Test Quality Review

Date: 2026-02-25
Reviewer: Testing QA Expert agent
Status: **10 findings — 2C · 4H · 4M**

Based on: reading current test files + source files after inline Round 1 fixes were applied.

---

## Part 1: Round 1 Resolution Status

| ID  | Severity | Description                                                | Status                                      |
| --- | -------- | ---------------------------------------------------------- | ------------------------------------------- |
| C1  | CRITICAL | getGlossaryTerms not mocked — accidental Proxy passthrough | FIXED (line 98-103 adds explicit mock)      |
| C2  | CRITICAL | onFailure callIndex assertion vacuous                      | PARTIALLY FIXED (see new C1 below)          |
| C3  | CRITICAL | Status transition callIndex assertion vacuous              | PARTIALLY FIXED (see new C2 below)          |
| H1  | HIGH     | No test for empty segmentRows in scoreFile                 | NOT FIXED — still missing                   |
| H2  | HIGH     | Step IDs verified with loose toContain                     | FIXED — lines 165-166 now use exact `toBe`  |
| H3  | HIGH     | Mode persistence assertion vacuous (callIndex >= 2)        | FIXED — assertion changed to `toBe(2)`      |
| H4  | HIGH     | Error codes accepted via regex alternatives                | FIXED — lines 232, 255 now use exact `toBe` |
| M1  | MEDIUM   | completedAt assertion behind optional if guard             | PARTIALLY FIXED (see new M1 below)          |
| M2  | MEDIUM   | uploadBatchId missing from buildPipelineBatchEvent         | NOT FIXED — still missing                   |
| M3  | MEDIUM   | onFailure withTenant isolation not verified                | FIXED — line 351 asserts withTenant called  |
| M4  | MEDIUM   | Batch insert >100 not verified via call count              | NOT FIXED — still only checks findingCount  |
| M5  | MEDIUM   | Recommended badge not pinned to correct card               | FIXED — lines 149-157 added explicit test   |
| L1  | LOW      | max(100) fileIds boundary not tested                       | FIXED — lines 74-87 added                   |

Round 1 fixes: 7 fixed, 3 partially fixed, 3 still missing.

---

## Part 2: Critical Findings

### C1 — processFile.test.ts: onFailure DB write asserts callIndex=1, but cannot distinguish WHICH db call happened (line 349)

**Severity: CRITICAL**
**File:** `src/features/pipeline/inngest/processFile.test.ts:349`

Current assertion after Round 1 fix:

```typescript
expect(dbState.callIndex).toBe(1)
expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
```

`callIndex === 1` confirms exactly ONE db call happened and `withTenant` was called. This is better than `> 0`, but still cannot prove the call set `{ status: 'failed' }`. The Proxy mock does not capture the `.set()` argument. If `onFailureFn` instead called `db.select(...)` (a read with no status write), `callIndex` would still be 1 and `withTenant` would still be called.

The key property being tested — that `status: 'failed'` is written — is NOT verified. The Inngest `onFailure` contract (AC#6) is that the file reaches a `failed` state, but the test only proves "one tenant-scoped DB call happened."

**Root cause:** The Proxy-based mock captures call counts but not the value passed to `.set()`. The fix requires either:

- Capturing the `.set()` argument via a dedicated mock wrapper around `db.update`, OR
- Injecting a spy into the Proxy for `set` calls

**Impact:** If `onFailureFn` removes the `db.update` and calls `db.select` (no-op), the test still passes. AC#6 is unverified.

---

### C2 — runL1ForFile.test.ts: Status transition test asserts callIndex=5 but that count is wrong for the code path (line 168)

**Severity: CRITICAL**
**File:** `src/features/pipeline/helpers/runL1ForFile.test.ts:168`

Current assertion after Round 1 fix:

```typescript
expect(dbState.callIndex).toBe(5)
expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
```

The comment on line 167 claims "Exactly 5 DB calls: CAS + segments + suppRules + txDelete + statusUpdate."

Cross-referencing against `runL1ForFile.ts`:

1. CAS update `.returning()` — slot 0 consumed by `.returning` handler
2. Segments select — slot 1 consumed by `.then` handler
3. `getGlossaryTerms` — called via mocked `mockGetGlossaryTerms` (now isolated) — consumes NO dbState slot
4. Suppression rules select — slot 2 consumed by `.then` handler
5. `db.transaction()` — calls the transaction callback
   - Inside tx: `tx.delete(findings).where(...)` — slot 3 consumed by `.then` handler
   - Inside tx: no insert (zero findings in this test) — 0 additional slots
6. File status update to `l1_completed` — slot 4 consumed by `.then` handler

Total `dbState.callIndex` = 5 (slots 0-4). The count of 5 is correct for zero findings.

BUT: `dbState.returnValues = [[mockFile], [], [], [], []]` has 5 entries. That is correct.

The count assertion IS correct for zero findings. The test does now correctly assert `callIndex === 5` (not `> 0`). This is better.

However, the test STILL does not verify:

- The CAS WHERE clause includes `eq(files.status, 'parsed')` — that the transition starts from `parsed`
- The final update uses `{ status: 'l1_completed' }` — not just any update

These are behavioral assertions, not count assertions. The count of 5 only verifies the number of DB calls, not their content. The test name promises `parsed → l1_processing → l1_completed` but only verifies the call count.

**Impact:** If someone changed the implementation to set `status: 'l1_failed'` instead of `l1_completed`, the callIndex would still be 5. The status transition test would pass.

**Downgrade note:** This is less severe than the Round 1 C3 (which used `> 0`). The `= 5` pin catches regressions that add or remove DB calls. But the behavioral contract (specific status values) is still unverified. Keeping as CRITICAL because the test name explicitly promises status verification that it does not provide.

---

## Part 3: High-Priority Findings

### H1 — scoreFile.test.ts: NonRetriableError for empty segments still untested (missing)

**Severity: HIGH**
**File:** `src/features/scoring/helpers/scoreFile.test.ts` — missing test

This is identical to Round 1 H1 — NOT FIXED.

`scoreFile.ts:69-71`:

```typescript
if (segmentRows.length === 0) {
  throw new NonRetriableError(`No segments found for file ${fileId} — cannot calculate score`)
}
```

The source was updated to guard against empty segments (check at line 69 shows a proper guard exists now), but there is still no test for this branch. The guard IS present in the source, which means a `NonRetriableError` is thrown — the test just does not exercise this path.

The test at line 427 (`should handle zero findings`) passes `mockSegments` (two segments) — this is NOT the zero-segments path.

**Missing test:**

```typescript
it('should throw NonRetriableError when file has no segments', async () => {
  dbState.returnValues = [[]] // empty segments
  const { scoreFile } = await import('./scoreFile')
  await expect(scoreFile({ fileId: VALID_FILE_ID, ... }))
    .rejects.toThrow(/No segments found/)
})
```

---

### H2 — runL1ForFile.test.ts: Batch insert count not verified (line 502-533)

**Severity: HIGH**
**File:** `src/features/pipeline/helpers/runL1ForFile.test.ts:502-533`

This is Round 1 M4 — NOT FIXED but promoted to HIGH because the source is verified to batch at FINDING_BATCH_SIZE=100.

Test at line 502 uses 150 findings and `dbState.returnValues` has 7 entries:

```typescript
// 150 findings = 2 insert batches: CAS, segments, suppRules, txDelete, txInsert×2, statusUpdate
dbState.returnValues = [[mockFile], [...], [], [], [], [], []]
```

The assertion only checks `result.findingCount === 150`. It does NOT verify that TWO insert calls happened inside the transaction (slots [4] and [5]).

If the implementation changed to bulk-insert >100 rows in a single call (incorrect behavior that could fail DB constraints), the test would still pass because `findingCount` only depends on the array length, not on the actual DB insert behavior.

**Fix:** Add assertion `expect(dbState.callIndex).toBe(7)` — this would fail if the batch insert collapses to a single call (callIndex would be 6 instead of 7).

---

### H3 — processBatch.test.ts: uploadBatchId propagation still not tested (line 18-37)

**Severity: HIGH** (was M2 in Round 1 — promoted because this is a required field in PipelineBatchEventData type)
**File:** `src/features/pipeline/inngest/processBatch.test.ts:18-37`

`PipelineBatchEventData` type (types.ts:14) has `uploadBatchId: string` as a REQUIRED field. `processBatch.ts:19` destructures it: `const { batchId, fileIds, ..., uploadBatchId } = event.data`. Line 30 passes it to each child event: `uploadBatchId`.

The `buildPipelineBatchEvent` helper at line 18-37 does NOT include `uploadBatchId`. This means:

- All tests pass `undefined` for `uploadBatchId` through the handler
- The child events receive `uploadBatchId: undefined`
- No test verifies that `uploadBatchId` is forwarded from batch to per-file events

The test `should include all event data fields` (lines 82-116) asserts `expect.objectContaining({ fileId, projectId, ..., mode })` but does NOT include `uploadBatchId` in the assertion.

**This is a type-unsafe hole:** `PipelineFileEventData.uploadBatchId` is `string` (required), but all test dispatches send `undefined`. If anything downstream reads `uploadBatchId`, it would be `undefined` in production too.

---

### H4 — startProcessing.action.test.ts: mode=thorough persistence count assertion is wrong

**Severity: HIGH**
**File:** `src/features/pipeline/actions/startProcessing.action.test.ts:329`

After Round 1 fix, the assertion reads:

```typescript
expect(dbState.callIndex).toBe(2)
```

The comment says:

```
// slot 0 — file validation SELECT (.then terminal)
// slot 1 — projects UPDATE for processingMode (.then terminal)
```

Cross-referencing `startProcessing.action.ts` flow for a successful request:

1. `db.select(files).where(...).from(...)` — file validation — `.then` terminal — slot 0
2. `db.update(projects).set({processingMode}).where(...)` — mode update — `.then` terminal — slot 1
3. `inngest.send(...)` — mocked, no DB slot
4. `writeAuditLog(...)` — mocked, no DB slot

Total: 2 DB calls, `callIndex === 2`. The count is correct.

BUT the `dbState.returnValues` in the test is `[validFiles, [], []]` — THREE slots provided for only TWO consumed calls. Slot [2] is never consumed. This means `dbState.returnValues[2] = []` is dead test data that was likely added as a leftover from an earlier version of the test.

This is not a bug in the assertion, but the stale `[]` in `returnValues` at index 2 is misleading — it suggests a third DB call that never happens. If a developer adds a third DB call in the future, the test would silently pass it (consuming the pre-allocated slot) rather than failing.

More importantly: the test STILL does not verify that the `mode` argument to `db.update(projects).set(...)` equals `'thorough'`. The Proxy captures call count but not the `.set()` value. **If someone changed the implementation to persist `mode: 'economy'` always, the callIndex assertion would still pass.**

**Impact:** AC#5 (mode persisted to projects.processing_mode) is still unverified at the value level.

---

## Part 4: Medium-Priority Findings

### M1 — pipeline.store.test.ts: completedAt test is still partially vacuous (line 121-136)

**Severity: MEDIUM**
**File:** `src/features/pipeline/stores/pipeline.store.test.ts:121-136`

After Round 1, the current test (line 121-136) no longer has the `if` guard — it directly asserts `completedAt`. However, the test calls `updateFileStatus(VALID_FILE_ID_1, 'completed')` — but `pipeline.store.ts:51-52` only marks `completedAt` when `f.status === 'completed' || f.status === 'failed'`. The status `'l1_completed'` is NOT in the terminal states set.

The test at line 127 calls `setFileResult(...)` before `updateFileStatus('completed')`. This works because `setFileResult` preserves existing status. The `updateFileStatus('completed')` call triggers `allCompleted === true` for a single file.

The test correctly passes. However, there is NO test for:

- A two-file scenario where only ONE file reaches terminal status — `completedAt` should NOT be set
- A mixed terminal state (one 'completed', one 'failed') — `completedAt` SHOULD be set

**Missing negative test:**

```typescript
it('should not set completedAt when only some files completed', async () => {
  usePipelineStore.getState().startProcessing([VALID_FILE_ID_1, VALID_FILE_ID_2])
  usePipelineStore.getState().updateFileStatus(VALID_FILE_ID_1, 'completed')
  expect(usePipelineStore.getState().completedAt).toBeUndefined()
})
```

---

### M2 — ProcessingModeDialog.test.tsx: specific cost values ($0.15/$0.35) never asserted (line 93-119)

**Severity: MEDIUM**
**File:** `src/features/pipeline/components/ProcessingModeDialog.test.tsx:93-119`

AC#1 specifies correct costs: Economy `$0.15/file`, Thorough `$0.35/file`. These values are hardcoded in `ProcessingModeDialog.tsx:28-31`:

```typescript
const COST_PER_FILE: Record<ProcessingMode, number> = {
  economy: 0.15,
  thorough: 0.35,
}
```

The `cost-estimate` tests at lines 93-119 only check:

- `costSection.textContent` is truthy (weak)
- The cost changes when mode switches (verifies cost is not static)

Neither test pins the specific dollar amounts. `ModeCard.test.tsx:26-31` renders `$0.02` as a generic prop — no connection to the AC values.

The `should render Economy and Thorough mode cards` test (line 58-66) checks that `'L1 + L2'` and `'L1 + L2 + L3'` appear, but does NOT check `'$0.15/file'` and `'$0.35/file'`.

**Missing test:** Assert that the Economy card shows `'$0.15/file'` and the Thorough card shows `'$0.35/file'`.

---

### M3 — ProcessingModeDialog.test.tsx: time estimates (~30s/~2min) never asserted

**Severity: MEDIUM**
**File:** `src/features/pipeline/components/ProcessingModeDialog.test.tsx`

AC#1 specifies correct times: Economy `~30s`, Thorough `~2 min`. These are hardcoded in `ProcessingModeDialog.tsx:34-37`:

```typescript
const TIME_PER_FILE: Record<ProcessingMode, string> = {
  economy: '~30s',
  thorough: '~2 min',
}
```

No test in ProcessingModeDialog.test.tsx verifies the time estimate text. The `cost-estimate` element (line 102) renders `{estimatedTime}/file` but the tests only check that the element exists and changes on mode switch — not the specific values.

**Missing test:** Assert that `'~30s/file'` appears for Economy and `'~2min/file'` appears for Thorough.

---

### M4 — startProcessing.action.test.ts: INTERNAL_ERROR catch path not tested (line 126-129)

**Severity: MEDIUM**
**File:** `src/features/pipeline/actions/startProcessing.action.ts:126-129`

`startProcessing.action.ts` has a top-level `try/catch` at line 44 that catches ALL errors and returns `{ success: false, code: 'INTERNAL_ERROR', error: 'Failed to start processing' }`. No test exercises this path.

Scenarios that would trigger it:

- `inngest.send()` throws (network failure)
- `db.update(projects)` throws (DB connection error)
- `writeAuditLog()` throws — but this is wrapped in its own try/catch and is non-fatal

A realistic case: `mockInngestSend.mockRejectedValue(new Error('Inngest down'))`. No test covers this.

**Missing test:**

```typescript
it('should return INTERNAL_ERROR when inngest.send throws', async () => {
  mockInngestSend.mockRejectedValue(new Error('Inngest down'))
  dbState.returnValues = [validFiles, []]
  const result = await startProcessing({ fileIds: [VALID_FILE_ID_1], projectId: ..., mode: 'economy' })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('INTERNAL_ERROR')
})
```

---

## Part 5: AC Coverage — After Round 2

| AC   | Description                                                           | Coverage Status                                                           |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AC#1 | Economy default, Thorough=Recommended, $0.15/$0.35, ~30s/~2min        | PARTIAL — badge is on Economy (not Thorough); cost/time values not pinned |
| AC#2 | Inngest: deterministic step IDs `l1-rules-{fileId}`, `score-{fileId}` | COVERED — fixed in Round 1 (exact toBe)                                   |
| AC#3 | parsed → l1_processing → l1_completed transitions                     | PARTIAL — callIndex=5 pins count but not status values                    |
| AC#4 | Economy = L1 only, layerCompleted='L1'                                | FULLY COVERED                                                             |
| AC#5 | Thorough = L1 only deferred, mode persisted                           | PARTIAL — callIndex=2 correct but mode value unverified                   |
| AC#6 | 3 retries, onFailure sets status=failed                               | PARTIAL — callIndex=1 correct but status='failed' unverified              |
| AC#7 | Batch fan-out, concurrency limit:1 per project                        | PARTIAL — uploadBatchId propagation untested                              |

---

## Summary Table

| ID  | Severity | File                           | Line    | Description                                                                             |
| --- | -------- | ------------------------------ | ------- | --------------------------------------------------------------------------------------- |
| C1  | CRITICAL | processFile.test.ts            | 322-415 | onFailure: callIndex=1 proves a DB call happened, not that status='failed' was written  |
| C2  | CRITICAL | runL1ForFile.test.ts           | 154-170 | Status transition: callIndex=5 proves call count, not l1_processing→l1_completed values |
| H1  | HIGH     | scoreFile.test.ts              | missing | No test for NonRetriableError when segmentRows is empty                                 |
| H2  | HIGH     | runL1ForFile.test.ts           | 502-533 | Batch insert >100: only findingCount checked, not that TWO tx.insert calls happened     |
| H3  | HIGH     | processBatch.test.ts           | 18-37   | uploadBatchId missing from buildPipelineBatchEvent — propagation silently untested      |
| H4  | HIGH     | startProcessing.action.test.ts | 308-329 | mode persistence: callIndex=2 correct but .set({mode:'thorough'}) value unverified      |
| M1  | MEDIUM   | pipeline.store.test.ts         | missing | No test that completedAt is NOT set when only some files reach terminal state           |
| M2  | MEDIUM   | ProcessingModeDialog.test.tsx  | 93-119  | AC#1 cost values $0.15/$0.35 never pinned in assertions                                 |
| M3  | MEDIUM   | ProcessingModeDialog.test.tsx  | missing | AC#1 time estimates ~30s/~2min never pinned in assertions                               |
| M4  | MEDIUM   | startProcessing.action.test.ts | missing | INTERNAL_ERROR path (inngest.send throws) not tested                                    |
