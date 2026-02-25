# Story 2.6 CR Round 1 — Test Coverage Review

Date: 2026-02-25
Reviewer: Testing QA Expert agent
Status: **13 findings — 3C · 4H · 5M · 1L**

---

## Part 1: Test Count Verification

| File                           | Claimed | Actual | Match |
| ------------------------------ | ------- | ------ | ----- |
| runL1ForFile.test.ts           | 18      | 18     | YES   |
| scoreFile.test.ts              | 15      | 15     | YES   |
| processFile.test.ts            | 15      | 15     | YES   |
| processBatch.test.ts           | 10      | 10     | YES   |
| startProcessing.action.test.ts | 12      | 12     | YES   |
| pipelineSchema.test.ts         | 6       | 6      | YES   |
| ProcessingModeDialog.test.tsx  | 10      | 10     | YES   |
| ModeCard.test.tsx              | 6       | 6      | YES   |
| pipeline.store.test.ts         | 8       | 8      | YES   |

All 9 files exist. No `it.skip` or stub tests found. All tests contain real assertions.

---

## Part 2: Critical Findings

### C1 — runL1ForFile: `getGlossaryTerms` mock gap (file: runL1ForFile.test.ts)

**Severity: CRITICAL**

The implementation (`runL1ForFile.ts:62`) calls `getGlossaryTerms(projectId, tenantId)` which is imported from `@/lib/cache/glossaryCache`. The test file mocks `@/db/schema/glossaries` and `@/db/schema/glossaryTerms` (the schema objects) but does NOT mock `@/lib/cache/glossaryCache` itself.

The actual flow through the Proxy db mock works in tests because the Proxy intercepts all db chain calls. However, `getGlossaryTerms` performs an `innerJoin` which is a different chain path (`db.select().from().innerJoin().where()`). The Proxy mock returns a generic chainable Proxy that may resolve to an empty array on `.then()`, but this is accidental — the dbState.returnValues index allocation comment in the test (line 133-134) documents:

```
// 0: CAS update returning, 1: segments query, 2: glossary terms, 3: suppression rules,
// 4: tx delete, 5: tx insert, 6: file status update, 7: audit log
```

`getGlossaryTerms` is a SEPARATE function call — it goes through the db Proxy but its returnValue slot (index 2) is consumed by the Proxy's generic `then` handler, NOT `returning`. This means:

- If `getGlossaryTerms` uses `.then()` path, slot [2] is consumed. OK.
- If `getGlossaryTerms` uses a different terminal (e.g., Drizzle resolves the JOIN differently), index may be off.

The test at line 276 (`should load glossary terms for project`) asserts `mockProcessFile` receives `glossaryTerms`, but `@/lib/cache/glossaryCache` is NOT mocked — meaning the actual `getGlossaryTerms` function runs against the db Proxy. This is a real call through unmocked code.

**Risk:** If `getGlossaryTerms` adds `drizzle-orm` operators (e.g., `inArray`) that are not mocked, or if its internal chain shape changes, the test will give wrong index offsets silently. Also, there's no mock for `@/lib/cache/glossaryCache` — so if Next.js caching directives ever enter `getGlossaryTerms`, the test will fail.

**Fix needed:** Add `vi.mock('@/lib/cache/glossaryCache', ...)` to isolate the glossary loading from the db Proxy chain.

```
// File: src/features/pipeline/helpers/runL1ForFile.test.ts — add after line 95
vi.mock('@/lib/cache/glossaryCache', () => ({
  getGlossaryTerms: vi.fn((..._args: unknown[]) => Promise.resolve([])),
}))
```

And update the `mockProcessFile` call assertion in the glossary test to verify the mocked return value is passed through.

---

### C2 — processFile.test.ts: concurrency key string is wrong (processFile.test.ts:448)

**Severity: CRITICAL**

At `processFile.test.ts:448-455`, the test asserts:

```typescript
expect(firstArg).toMatchObject({
  concurrency: expect.arrayContaining([
    expect.objectContaining({
      key: expect.stringContaining('projectId'),
      limit: 1,
    }),
  ]),
})
```

But `processFile.ts:66` has:

```typescript
concurrency: [{ key: 'event.data.projectId', limit: 1 }],
```

The assertion uses `expect.stringContaining('projectId')` — which does match `'event.data.projectId'`. This is technically correct but the assertion is too loose. If the key were changed to `'event.data.tenantId'` (wrong), the test would still pass because `'event.data.tenantId'` does NOT contain `'projectId'`. Wait — that would actually catch it.

More importantly: the assertion `expect.arrayContaining([ expect.objectContaining({...}) ])` is correct structurally, but `concurrency` in the implementation is NOT wrapped in an array — it's `concurrency: [{ key: '...', limit: 1 }]` — which IS an array. So the array check is correct.

However — the test uses `vi.resetModules()` before `await import('./processFile')` (lines 417-419), yet `createFunctionMock` is captured BEFORE the reset. The `vi.resetModules()` clears module registry but `inngest.createFunction` is the original mock. After reset, re-importing `./processFile` will re-execute the module top-level, calling `createFunction` again. But the mock reference was captured before the reset — this pattern is correct if the mock itself is stable (the vi.mock factory is not reset by vi.resetModules since it's hoisted). This pattern is consistent with `processFile.test.ts:412-424` and `426-437`.

Revised assessment: C2 is actually a **non-issue** — the test logic is sound. Downgrade to INFO.

---

### C2 (revised) — processFile.test.ts: `onFailure` assertions are vacuous (processFile.test.ts:322-409)

**Severity: CRITICAL** — replacing the revised C2 above.

The `onFailure` handler tests at lines 322-408 all verify `dbState.callIndex > 0` as a proxy for "the DB was updated to failed." This is **vacuous** — `dbState.callIndex` advances whenever ANY db Proxy method with `then` or `returning` is called.

The test sets `dbState.returnValues = [[]]` (one slot returning empty array). The `onFailureFn` calls `db.update(files).set({status:'failed'}).where(...)` — this goes through the Proxy chain. The chain uses `then` (no explicit `.returning()`), so `callIndex` goes from 0 to 1.

But `expect(dbState.callIndex).toBeGreaterThan(0)` only confirms the Proxy was touched — NOT that `status: 'failed'` was written. There's no assertion on:

- What value was SET (status='failed')
- That `withTenant` was called in the onFailure DB update
- The error message passed to `logger.error`

**Impact:** If `onFailureFn` is modified to skip the DB update entirely (e.g., commented out), `callIndex` would remain 0, and the test would catch it. BUT if `onFailureFn` calls any other DB method first (e.g., a read), `callIndex` becomes 1 and the assertion passes even though the status was never set to 'failed'.

**Fix:** Assert that `withTenant` was called in onFailure (verifying tenant isolation is maintained), and verify the Proxy was called with `status: 'failed'` specifically. At minimum check `dbState.callIndex` equals the expected value (not just `> 0`).

---

### C3 — runL1ForFile test: status transition at line 146-161 is a stub assertion

**Severity: CRITICAL**

`it('should transition file status from parsed to l1_processing to l1_completed', ...)` at lines 146-161:

```typescript
// Verify CAS guard was called (first DB call)
// Verify final status update to l1_completed (last DB call before audit)
expect(dbState.callIndex).toBeGreaterThan(0)
```

This assertion is completely vacuous. `dbState.callIndex > 0` confirms the Proxy was touched — not that status transitions happened. The test name promises it verifies `parsed → l1_processing → l1_completed` but there is no assertion on:

- The CAS update's WHERE clause includes `eq(files.status, 'parsed')`
- The final update uses `{ status: 'l1_completed' }`
- The correct order of transitions

The `runL1ForFile` implementation contains TWO separate `db.update(files)` calls — one CAS (line 40-47) and one for `l1_completed` (line 130-134). Neither is verified individually in this test.

**Fix:** Assert that `withTenant` was called at least twice (for CAS + final update), and that the number of DB interactions matches the expected count (e.g., `dbState.callIndex === 6` for the happy path with no findings).

---

## Part 3: High-Priority Findings

### H1 — scoreFile.test.ts: `sourceLang`/`targetLang` from empty segment array throws at runtime (scoreFile.ts:69)

**Severity: HIGH**

`scoreFile.ts:69` does:

```typescript
const sourceLang = segmentRows[0]!.sourceLang
const targetLang = segmentRows[0]!.targetLang
```

The `!` non-null assertion will throw a runtime TypeError if `segmentRows` is empty. There is **no test** for the zero-segments case in `scoreFile.test.ts`. The test at line 427 (`should handle zero findings`) passes findings as empty but segments still has two entries (`mockSegments`).

Zero-segments is a realistic scenario: a file was uploaded but parsing produced no segments (edge case in story 2.2/2.3). In production this would cause an unhandled exception.

**Missing test:**

```typescript
it('should throw when file has no segments', async () => {
  dbState.returnValues = [[], ...] // empty segments
  const { scoreFile } = await import('./scoreFile')
  await expect(scoreFile({ ... })).rejects.toThrow()
})
```

Or alternatively, the implementation should guard against this (return `status: 'na'`), and the test should verify that behavior.

---

### H2 — processFile.test.ts: `step.run` call IDs checked with loose `toContain` (processFile.test.ts:164-167)

**Severity: HIGH**

```typescript
expect(firstCall?.[0]).toContain('l1')
expect(secondCall?.[0]).toContain('score')
```

The implementation uses:

```typescript
await step.run(`l1-rules-${fileId}`, ...)
await step.run(`score-${fileId}`, ...)
```

`toContain('l1')` matches `'l1-rules-${fileId}'` — correct. But `toContain('score')` also matches any step ID containing "score" — too broad. More importantly, the test at lines 169-184 (`should use deterministic step IDs containing fileId`) verifies fileId inclusion, but does NOT verify the IDs match the exact format `l1-rules-${fileId}` and `score-${fileId}`.

If the implementation is changed to `step.run('run-l1-${fileId}', ...)`, the first assertion `toContain('l1')` still passes even though the step ID format changed (breaking Inngest's determinism guarantee, since existing function runs mid-flight would have steps with IDs that no longer match).

**Fix:** Pin exact step IDs:

```typescript
expect(firstCall?.[0]).toBe(`l1-rules-${VALID_FILE_ID}`)
expect(secondCall?.[0]).toBe(`score-${VALID_FILE_ID}`)
```

---

### H3 — startProcessing.action.test.ts: `mode` persistence assertion is vacuous (line 328)

**Severity: HIGH**

`it('should persist mode to projects.processing_mode', ...)` at lines 308-329:

```typescript
// DB should be updated with processing_mode
// Verified by checking dbState consumed an update call
expect(dbState.callIndex).toBeGreaterThanOrEqual(2)
```

This is the same vacuous pattern as C3. `callIndex >= 2` only confirms two db calls happened. It does NOT verify that `projects.processingMode` was updated. If the implementation removed the `db.update(projects)` call and made two other DB calls, the test would still pass.

**Fix:** Assert that `withTenant` was called with the tenant ID (confirming tenant isolation on the projects update), or better, verify that the specific update call consumed the correct `dbState.returnValues` slot.

---

### H4 — startProcessing.action.test.ts: `NOT_FOUND` vs `CONFLICT` error codes are accepted interchangeably

**Severity: HIGH**

At lines 232 and 255:

```typescript
expect(result.code).toMatch(/NOT_FOUND|INVALID_INPUT/) // file count mismatch
expect(result.code).toMatch(/CONFLICT|INVALID_INPUT/) // wrong status
```

The implementation returns exactly `'NOT_FOUND'` for file count mismatch (line 59) and exactly `'CONFLICT'` for wrong status (line 72). The test accepts either error code OR `'INVALID_INPUT'` for both cases. This allows the implementation to return the wrong error code (`INVALID_INPUT`) without the test catching it.

Also the regex `INVALID_INPUT` is not a realistic production error code for these two cases — including it means the test would pass even if the entire validation logic were replaced with a generic `INVALID_INPUT` return.

**Fix:** Use exact string matches:

```typescript
expect(result.code).toBe('NOT_FOUND') // file count mismatch
expect(result.code).toBe('CONFLICT') // wrong status
```

---

## Part 4: Medium-Priority Findings

### M1 — pipeline.store.test.ts: `completedAt` assertion uses optional check (line 132-136)

**Severity: MEDIUM**

```typescript
if (state.completedAt !== undefined) {
  expect(typeof state.completedAt).toBe('number')
  expect(state.completedAt).toBeGreaterThan(0)
}
```

The `if` guard makes the assertion optional — if `completedAt` is never set, the test passes vacuously. The implementation at `pipeline.store.ts:56-57` only sets `completedAt` when ALL files reach a terminal state (`completed` or `failed`).

In the test, `updateFileStatus(VALID_FILE_ID_1, 'completed')` is called on a store that has one file. Since `allCompleted` would be true, `completedAt` SHOULD be set. The `if` guard is unnecessary and hides a potential bug if the logic is wrong.

**Fix:** Remove the `if` guard — assert `completedAt` is always defined after all files complete.

---

### M2 — processBatch.test.ts: `uploadBatchId` propagation not tested

**Severity: MEDIUM**

`processBatch.ts:28` propagates `uploadBatchId` from the batch event to each per-file event:

```typescript
data: {
  ;(fileId, projectId, tenantId, userId, mode, uploadBatchId)
}
```

No test in `processBatch.test.ts` verifies that `uploadBatchId` is included in the dispatched events. The `buildPipelineBatchEvent` helper at line 18-37 does NOT include an `uploadBatchId` field (it's omitted), meaning the handler receives `undefined` for `uploadBatchId` and propagates `undefined` to child events. This is a silent data loss in test setup.

**Fix:** Add `uploadBatchId` to `buildPipelineBatchEvent` and add an assertion:

```typescript
expect(event.data.uploadBatchId).toBe(VALID_BATCH_ID)
```

---

### M3 — processFile.test.ts: `onFailure` withTenant isolation not verified

**Severity: MEDIUM**

The `onFailure` handler (`processFile.ts:54-57`) does a DB update with `withTenant()`. The three onFailure tests (lines 322-408) none verify that `withTenant` was called in the failure path. Tenant isolation in the failure handler is not tested.

---

### M4 — runL1ForFile.test.ts: `FINDING_BATCH_SIZE` boundary not pinned

**Severity: MEDIUM**

`runL1ForFile.ts:118` loops: `for (let i = 0; i < findingInserts.length; i += FINDING_BATCH_SIZE)`. `FINDING_BATCH_SIZE = 100`. The test at line 492 uses 150 findings — which exercises TWO batches (0-99 and 100-149). This is correct.

However, the test does NOT verify that TWO separate `tx.insert(findings)` calls happened — only that `result.findingCount === 150`. If the implementation switched to a single bulk insert of >100 rows (bypassing the batch loop), the test would still pass.

**Missing test:** Assert that multiple insert calls happen for >100 findings (via the dbState callIndex pattern or by checking that the mock was called twice).

---

### M5 — ProcessingModeDialog.test.tsx: `Thorough=Recommended` AC#1 is backwards

**Severity: MEDIUM**

AC#1 states `Economy=default, Thorough=Recommended badge`. But looking at the implementation (`ProcessingModeDialog.tsx:62-70`):

- Economy card has `badge="Recommended"`
- Thorough card has no badge

The test at line 57-65 (`should render Economy and Thorough mode cards`) does NOT verify which card has the "Recommended" badge. `ModeCard.test.tsx` line 34-38 tests that a badge renders when provided, but does not test the specific positioning.

The AC claims "Thorough=Recommended" but the implementation says "Economy=Recommended." The test never distinguishes this — it just checks both cards render.

**This may be a documentation conflict between the AC wording and implementation spec.** But either way, the test should pin which mode has the badge:

```typescript
// Economy card should have the badge, not Thorough
expect(screen.getByText('Recommended').closest('[role="radio"]')).toHaveTextContent('Economy')
```

---

## Part 5: AC Coverage Analysis

### AC#1 — ProcessingModeDialog: Economy default, Thorough=Recommended badge

- Economy default: COVERED (processFile.test.tsx:67-77)
- Mode cards render: COVERED (57-65)
- Recommended badge: WEAKLY COVERED — no test pins which card gets the badge
- File count display: COVERED (47-49)
- Cost estimate: COVERED (92-119)

**Gap: M5 above**

### AC#2 — Inngest function: deterministic step IDs, L1+score steps

- Function ID `process-file-pipeline`: COVERED (412-424)
- Retries 3: COVERED (426-437)
- Deterministic step IDs with fileId: COVERED but assertions too loose (H2)
- L1 step runs: COVERED
- Score step runs: COVERED

**Gap: H2 above**

### AC#3 — File status transitions: parsed → l1_processing → l1_completed

- CAS guard (parsed → l1_processing): COVERED (163-176)
- l1_completed transition: COVERED IN NAME ONLY — test assertion is vacuous (C3)
- Failed rollback: COVERED (441-473)

**Gap: C3 above**

### AC#4 — Economy mode L1-only

- No L2/L3 steps in economy: COVERED (261-273) — asserts exactly 2 step.run calls
- Returns `layerCompleted: 'L1'`: COVERED (234-257)

**FULLY COVERED**

### AC#5 — Thorough mode: L1-only deferred, mode persisted

- L2/L3 deferred in thorough: COVERED (275-287)
- Mode persisted to projects.processing_mode: COVERED IN NAME ONLY — vacuous assertion (H3)

**Gap: H3 above**

### AC#6 — Retry 3x with exponential backoff, onFailure → failed

- Retries 3: COVERED (426-437) — config verified
- Exponential backoff: NOT TESTABLE at unit level (Inngest handles this internally) — acceptable
- onFailure sets status=failed: COVERED IN NAME ONLY — vacuous assertion (C2 revised)
- onFailure logs error: COVERED (352-377)
- onFailure nested event structure: COVERED (379-408)

**Gap: C2 revised above**

### AC#7 — Batch fan-out, score concurrency limit:1 per project

- Fan-out sends one event per file: COVERED (59-80)
- Single sendEvent call (batch form NOT Promise.all): COVERED (77-80 — expects calledTimes(1))
- Concurrency limit:1 on projectId: COVERED (439-455)
- batchId + fileCount in response: COVERED (244-263)
- uploadBatchId propagation: NOT COVERED (M2)

**Gap: M2 above**

---

## Part 6: Low-Priority Findings

### L1 — pipelineSchema.test.ts: max fileIds (100) boundary not tested

**Severity: LOW**

`pipelineSchema.ts:6` has `.max(100)`. No test verifies that 101 fileIds is rejected. The schema test only verifies `min(1)` rejection (empty array). Add:

```typescript
it('should reject fileIds array exceeding max 100', ...)
```

---

## Summary Table

| ID  | Severity | File                           | Line      | Description                                                                                   |
| --- | -------- | ------------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| C1  | CRITICAL | runL1ForFile.test.ts           | 16-95     | `getGlossaryTerms` from `@/lib/cache/glossaryCache` not mocked — accidental Proxy passthrough |
| C2  | CRITICAL | processFile.test.ts            | 322-408   | onFailure assertions are vacuous (`callIndex > 0`) — do not verify `status: 'failed'` written |
| C3  | CRITICAL | runL1ForFile.test.ts           | 146-161   | Status transition test assertion vacuous (`callIndex > 0`)                                    |
| H1  | HIGH     | scoreFile.test.ts              | (missing) | No test for empty segmentRows — `segmentRows[0]!` throws TypeError                            |
| H2  | HIGH     | processFile.test.ts            | 164-167   | Step IDs verified with loose `toContain('l1')`/`toContain('score')` — not exact               |
| H3  | HIGH     | startProcessing.action.test.ts | 328       | Mode persistence assertion vacuous (`callIndex >= 2`)                                         |
| H4  | HIGH     | startProcessing.action.test.ts | 232, 255  | Error codes accepted as regex alternatives — hides wrong error code                           |
| M1  | MEDIUM   | pipeline.store.test.ts         | 132-136   | `completedAt` assertion hidden behind optional `if` guard                                     |
| M2  | MEDIUM   | processBatch.test.ts           | 18-37     | `uploadBatchId` not in buildPipelineBatchEvent — propagation silently broken                  |
| M3  | MEDIUM   | processFile.test.ts            | 322-408   | onFailure: withTenant isolation not verified                                                  |
| M4  | MEDIUM   | runL1ForFile.test.ts           | 492-523   | Batch insert boundary (>100) not verified via call count                                      |
| M5  | MEDIUM   | ProcessingModeDialog.test.tsx  | 57-65     | Recommended badge not pinned to Economy card specifically                                     |
| L1  | LOW      | pipelineSchema.test.ts         | (missing) | max(100) fileIds boundary not tested                                                          |
