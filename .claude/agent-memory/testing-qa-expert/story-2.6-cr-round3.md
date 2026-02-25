# Story 2.6 — CR Round 3 Adversarial Test Review

Date: 2026-02-25
Tests passing at review time: 1276
Previous rounds fixed: CR R1 (13 findings), CR R2 (10 findings = 23 total)

Summary: 1C · 5H · 7M · 2L = 15 findings

---

## CRITICAL

### C1 — startProcessing.action.test.ts: duplicate fileIds input is silently accepted

**Source file:** `src/features/pipeline/actions/startProcessing.action.ts`, line 57
**Test file:** `src/features/pipeline/actions/startProcessing.action.test.ts`

**Source logic:**

```typescript
if (foundFiles.length !== fileIds.length) {
  return { success: false, code: 'NOT_FOUND', ... }
}
```

**The gap:** When the caller sends `fileIds: [SAME_UUID, SAME_UUID]` (duplicate IDs), the DB query
`inArray(files.id, fileIds)` de-duplicates at the SQL level and returns 1 row.
`foundFiles.length (1) !== fileIds.length (2)` → returns `NOT_FOUND`.

But this is WRONG behavior — the files DO exist. The correct behavior is a `CONFLICT` or
`INVALID_INPUT` for duplicate IDs in the input, not `NOT_FOUND`. There is no test that:

1. Sends duplicate fileIds and observes which error code is returned.
2. Documents that this edge case maps to `NOT_FOUND` (even if it currently does).

This is a latent bug: a valid single file submitted as `[fileId, fileId]` will be rejected as
"not found" when it truly exists, misleading the UI and audit log.

**Missing test:**

```
it('should return NOT_FOUND when fileIds contains duplicates (SQL de-duplication makes count mismatch)')
```

Severity: CRITICAL — observable wrong behavior with no regression guard.

---

## HIGH

### H1 — startProcessing.action.test.ts: db.update(projects) throw path not covered

**Source file:** `src/features/pipeline/actions/startProcessing.action.ts`, lines 76-80
**Test file:** `src/features/pipeline/actions/startProcessing.action.test.ts`

**Source logic:**

```typescript
await db
  .update(projects)
  .set({ processingMode: mode })
  .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))
```

This is inside the outer `try { ... } catch (err) { return INTERNAL_ERROR }` block.
The existing INTERNAL_ERROR test (added in CR R2) only covers `inngest.send()` throwing.
If `db.update(projects)` throws (e.g., DB connection lost between file validation and mode persist),
the outer catch correctly returns `INTERNAL_ERROR` — but there is no test for this specific path.
The `inngest.send` never gets called in this case, but there is no assertion verifying it.

**Missing test:**

```
it('should return INTERNAL_ERROR when db.update(projects) throws, and inngest.send is NOT called')
```

---

### H2 — startProcessing.action.test.ts: mixed-status files (some parsed, some not) not tested

**Source file:** `src/features/pipeline/actions/startProcessing.action.ts`, lines 66-73
**Test file:** `src/features/pipeline/actions/startProcessing.action.test.ts`

The existing CONFLICT test uses a single file with `status: 'uploaded'`. The test does not cover
the mixed-status case: `fileIds` has 3 files, 2 are `parsed`, 1 is `l1_processing`. This is the
realistic production scenario (user re-submits a batch that was partially processed). There is
no assertion that `result.error` contains useful context, nor that exactly the right code is returned.

**Missing test:**

```
it('should return CONFLICT when mixed status files (some parsed, some already processing)')
```

---

### H3 — runL1ForFile.test.ts: rollback DB call NOT asserted to use `.set({ status: 'failed' })`

**Source file:** `src/features/pipeline/helpers/runL1ForFile.ts`, lines 174-178
**Test file:** `src/features/pipeline/helpers/runL1ForFile.test.ts`, lines 462-478

The test at line 462 asserts that the promise rejects after a rule engine crash, but does NOT
assert that the rollback `.set({ status: 'failed' })` was actually called with the correct value.
The `dbState.setCaptures` array is available but is NEVER asserted in the error path tests
(only in the happy path transition test at line 161). A regression that removes the rollback
would still pass the current test (rejects.toThrow() passes regardless of rollback behavior).

**Missing assertion in existing test (line 462-478):**

```typescript
expect(dbState.setCaptures).toContainEqual({ status: 'failed' })
```

---

### H4 — scoreFile.test.ts: audit log action literal not pinned — 'score.calculated' vs 'score.auto_passed'

**Source file:** `src/features/scoring/helpers/scoreFile.ts`, line 165
**Test file:** `src/features/scoring/helpers/scoreFile.test.ts`, line 356

Current assertion:

```typescript
expect(mockWriteAuditLog).toHaveBeenCalledWith(
  expect.objectContaining({
    action: expect.stringContaining('score.'),
  }),
)
```

`expect.stringContaining('score.')` matches ANY string with "score." — it would pass if the action
were `score.failed`, `score.updated`, or any other unexpected value. The source has two distinct
audit actions: `'score.auto_passed'` (when status===auto_passed) and `'score.calculated'` (otherwise).
Neither exact value is pinned in any test. An accidental swap would go undetected.

**Missing tests:**

```
it('should write audit log with action score.calculated when not auto-passed')
it('should write audit log with action score.auto_passed when auto-passed')
```

---

### H5 — processBatch.test.ts: empty fileIds array not tested

**Source file:** `src/features/pipeline/inngest/processBatch.ts`, lines 22-35
**Test file:** `src/features/pipeline/inngest/processBatch.test.ts`

When `fileIds = []`, `fileIds.map(...)` produces `[]`, and `step.sendEvent('dispatch-files-${batchId}', [])` is called with an empty array. The function returns `{ batchId, fileCount: 0, status: 'dispatched' }`.

There is no test for this case. The `pipelineSchema` prevents empty fileIds at the action layer (min:1), but `processBatch` is also directly callable from Inngest events — its handler has NO schema validation. An empty-fileIds event reaching Inngest is a real production risk (e.g., from a buggy upstream event publisher).

**Missing test:**

```
it('should call step.sendEvent with empty array when fileIds is empty, and return fileCount 0')
```

---

## MEDIUM

### M1 — pipeline.store.test.ts: `startProcessing` does NOT clear completedAt

**Source file:** `src/features/pipeline/stores/pipeline.store.ts`, line 39
**Test file:** `src/features/pipeline/stores/pipeline.store.test.ts`

Source:

```typescript
set({ processingFiles: newMap, startedAt: Date.now(), completedAt: undefined })
```

`startProcessing` explicitly resets `completedAt: undefined`. But there is no test that:

1. Starts a batch → all files complete → completedAt is set.
2. Starts a NEW batch (re-processing) → completedAt is cleared back to undefined.

This matters for the UI: if completedAt is stale from a previous run, the "done" banner shows
immediately for the new run. No regression guard exists for this reset.

**Missing test:**

```
it('should reset completedAt to undefined when startProcessing called on completed batch')
```

---

### M2 — pipeline.store.test.ts: `setFileResult` does NOT change file status — no test

**Source file:** `src/features/pipeline/stores/pipeline.store.ts`, lines 60-68
**Test file:** `src/features/pipeline/stores/pipeline.store.test.ts`, lines 66-89

The `setFileResult` implementation uses spread: `{ ...existing, ...result }`. The `result` object
only contains `{ findingCount, mqmScore }` — no `status` field. So `status` is preserved from
`existing`. The test at line 66 only asserts `findingCount` and `mqmScore`. There is no test
verifying that calling `setFileResult` does NOT inadvertently clobber the existing `status` value.
This is a behavioral contract that could break if the spread order were accidentally reversed.

**Missing test:**

```
it('should preserve existing status when setFileResult is called (does not reset status to processing)')
```

---

### M3 — pipeline.store.test.ts: `failed` terminal state also triggers completedAt — no test

**Source file:** `src/features/pipeline/stores/pipeline.store.ts`, lines 51-57
**Test file:** `src/features/pipeline/stores/pipeline.store.test.ts`

The `updateFileStatus` logic:

```typescript
const allCompleted = [...newMap.values()].every(
  (f) => f.status === 'completed' || f.status === 'failed',
)
```

The existing `completedAt` test (line 121-136) uses `status: 'completed'`. There is no test that
sets `status: 'failed'` as the terminal state and verifies that `completedAt` is also set. A typo
changing `'failed'` to `'error'` in the source would not be caught.

**Missing test:**

```
it('should set completedAt when all files reach failed status (failed is terminal)')
it('should set completedAt when files are mixed completed/failed (both are terminal)')
```

---

### M4 — pipelineSchema.test.ts: `projectId` as non-UUID not tested

**Source file:** `src/features/pipeline/validation/pipelineSchema.ts`, line 6
**Test file:** `src/features/pipeline/validation/pipelineSchema.test.ts`

The schema is:

```typescript
projectId: z.string().uuid(),
```

All existing tests use a valid UUID for `projectId`. There is no test verifying that an invalid
`projectId` (e.g., `'not-a-uuid'`, `''`, or `12345`) causes `safeParse` to return `success: false`.
This is a sibling of the `fileIds` UUID test — surprising it was missed when the fileIds UUID test
was written.

**Missing test:**

```
it('should reject invalid projectId (non-UUID string)')
it('should reject missing projectId (undefined)')
```

---

### M5 — pipelineSchema.test.ts: exactly 100 fileIds (boundary) not tested — only 101

**Source file:** `src/features/pipeline/validation/pipelineSchema.ts`, line 6: `.max(100)`
**Test file:** `src/features/pipeline/validation/pipelineSchema.test.ts`, line 74-87

The existing test checks `length: 101` (rejected). But `length: 100` (boundary, allowed) is never
tested. With `.max(100)`, exactly 100 items MUST be accepted. An accidental `.max(99)` change
would not be caught by the existing suite.

**Missing test:**

```
it('should accept exactly 100 fileIds (max boundary)')
```

---

### M6 — ModeCard.test.tsx: keyboard activation (Enter / Space) not tested

**Source file:** `src/features/pipeline/components/ModeCard.tsx`, lines 31-36
**Test file:** `src/features/pipeline/components/ModeCard.test.tsx`

ModeCard has an explicit `onKeyDown` handler:

```typescript
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onSelect()
  }
}}
```

This is an accessibility-critical behavior (keyboard navigation for mode selection). There is no
test pressing Enter or Space on the card. A deletion of this handler would only be caught by
the click test, not by a keyboard test.

**Missing tests:**

```
it('should call onSelect when Enter key pressed')
it('should call onSelect when Space key pressed')
it('should NOT call onSelect for other keys (e.g. Tab)')
```

---

### M7 — ProcessingModeDialog.test.tsx: error toast content not verified (result.error)

**Source file:** `src/features/pipeline/components/ProcessingModeDialog.tsx`, line 62
**Test file:** `src/features/pipeline/components/ProcessingModeDialog.test.tsx`

Source:

```typescript
toast.error(result.error ?? 'Failed to start processing')
```

There is no test that:

1. `startProcessing` returns `{ success: false, error: 'Custom error message' }`.
2. Asserts `toast.error` was called with `'Custom error message'`.

The fallback `?? 'Failed to start processing'` is also untested (what happens when `result.error`
is `undefined`?). The test suite only asserts success toasts.

**Missing tests:**

```
it('should show result.error in toast when action returns error with message')
it('should show fallback toast message when result.error is undefined')
it('should show generic error toast when startProcessing throws (catch block)')
```

---

## LOW

### L1 — runRuleEngine.action.test.ts: `withTenant` not asserted on the file SELECT query

**Source file:** `src/features/pipeline/actions/runRuleEngine.action.ts`, line 48
**Test file:** `src/features/pipeline/actions/runRuleEngine.action.test.ts`

The action calls `withTenant(files.tenantId, currentUser.tenantId)` on the file lookup query.
This is the tenant isolation guard that prevents cross-tenant file access. None of the existing
tests assert that `withTenant` was called with the correct `tenantId`. An accidental removal of
`withTenant()` from this query would allow cross-tenant file resolution.

**Missing test:**

```
it('should include withTenant on file lookup query using currentUser.tenantId')
```

---

### L2 — processFile.test.ts: `mode` field NOT passed to runL1ForFile — no assertion

**Source file:** `src/features/pipeline/inngest/processFile.ts`, lines 24-26
**Test file:** `src/features/pipeline/inngest/processFile.test.ts`

The source destructures `mode` from `event.data` but does NOT pass `mode` to `runL1ForFile` or
`scoreFile`. The handler has two mode tests (lines 270-296) that only verify `step.run` call count,
not that `mode` is NOT forwarded (which is intentional — L2/L3 deferred). If a future developer
accidentally adds `mode` to the `runL1ForFile` call, the tests would still pass. There is no
explicit assertion that `runL1ForFile` is called WITHOUT a `mode` argument.

This is LOW because the deferred-mode contract is documented in comments; it only matters for
catching accidental regressions during the L2/L3 implementation story.

**Missing test:**

```
it('should NOT pass mode to runL1ForFile (mode is deferred — L2/L3 not yet implemented)')
```

---

## Summary Table

| ID  | Severity | File                           | Description                                                                             |
| --- | -------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| C1  | CRITICAL | startProcessing.action.test.ts | Duplicate fileIds input maps to wrong NOT_FOUND error                                   |
| H1  | HIGH     | startProcessing.action.test.ts | db.update(projects) throw path → INTERNAL_ERROR, inngest.send NOT called                |
| H2  | HIGH     | startProcessing.action.test.ts | Mixed-status files (some parsed, some not) → CONFLICT not tested                        |
| H3  | HIGH     | runL1ForFile.test.ts           | Error path rollback `.set({ status: 'failed' })` never asserted in setCaptures          |
| H4  | HIGH     | scoreFile.test.ts              | Audit log `action` literal not pinned — both 'score.calculated' and 'score.auto_passed' |
| H5  | HIGH     | processBatch.test.ts           | Empty fileIds array — sendEvent called with [] and fileCount:0 not tested               |
| M1  | MEDIUM   | pipeline.store.test.ts         | startProcessing on re-run does not assert completedAt reset to undefined                |
| M2  | MEDIUM   | pipeline.store.test.ts         | setFileResult preserves existing status — no regression guard                           |
| M3  | MEDIUM   | pipeline.store.test.ts         | failed terminal state triggers completedAt — only 'completed' tested                    |
| M4  | MEDIUM   | pipelineSchema.test.ts         | Invalid projectId (non-UUID) not tested                                                 |
| M5  | MEDIUM   | pipelineSchema.test.ts         | Exactly 100 fileIds (max boundary allowed) not tested                                   |
| M6  | MEDIUM   | ModeCard.test.tsx              | Keyboard activation (Enter / Space) not tested                                          |
| M7  | MEDIUM   | ProcessingModeDialog.test.tsx  | Error toast content (result.error / fallback) not verified                              |
| L1  | LOW      | runRuleEngine.action.test.ts   | withTenant not asserted on file SELECT query                                            |
| L2  | LOW      | processFile.test.ts            | mode NOT forwarded to runL1ForFile — absence not asserted                               |
