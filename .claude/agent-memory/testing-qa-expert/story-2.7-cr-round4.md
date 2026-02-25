# Story 2.7 — CR Round 4 (Adversarial Review of Round 3 Fixes)

Date: 2026-02-25
All tests in changed files pass: 18 + 7 + 6 + 8 + 5 = 44 tests across 5 changed test files.

## Summary: 0C · 3H · 4M · 2L = 9 findings

---

## STATUS OF CR ROUND 3 GAPS (12 total open going into R4)

| R3 Finding                                                                      | Status                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C1: generateParityReport — ZERO VALIDATION_ERROR test for Uint8Array schema     | FIXED — 2 new tests: string input → VALIDATION_ERROR, oversized Uint8Array → VALIDATION_ERROR                        |
| C2: getBatchSummary — third DB query untested                                   | FIXED — 2 new tests: crossFileFindings non-empty, empty batch skips query                                            |
| H1: processFile.batch-completion — loose step ID + uploadBatchId=undefined path | FIXED — deterministic step ID `batch-completed-${VALID_UPLOAD_BATCH_ID}` asserted; undefined path test added         |
| H2: reportMissingCheck — NOT_FOUND + INSERT empty returning                     | FIXED — both paths now tested                                                                                        |
| H3: batchComplete — empty batch early-return path                               | STILL OPEN (batchComplete.test.ts unchanged in this commit)                                                          |
| M1: BatchSummaryView crossFileFindings prop                                     | STILL OPEN                                                                                                           |
| M2: FileHistoryTable processedAt vs createdAt type mismatch                     | STILL OPEN                                                                                                           |
| M3: parityComparator substring containment                                      | FIXED — 2 new tests: xbench→tool and tool→xbench containment                                                         |
| M4: generateParityReport NOT_FOUND path                                         | FIXED — test added                                                                                                   |
| M5: xbenchReportParser null worksheet                                           | STILL OPEN                                                                                                           |
| M6: generateParityReport storage upload non-fatal                               | STILL OPEN                                                                                                           |
| L1: compareWithXbench fileId propagation                                        | STILL OPEN                                                                                                           |
| L2: getBatchSummary totalFiles/passedCount/needsReviewCount fields              | PARTIALLY OPEN — totalFiles asserted in empty-batch test (line 453); passedCount/needsReviewCount still not asserted |
| L3: batchComplete vi.resetModules() inside it()                                 | STILL OPEN                                                                                                           |

7 of 12 R3 gaps fixed. 5 remain open. 2 new findings.

---

## HIGH

### H1: `batchComplete.test.ts` schema mock missing `projectId` — production `projectId` filter invisible to tests

**File:** `src/features/pipeline/inngest/batchComplete.test.ts:58–64` vs `src/features/pipeline/inngest/batchComplete.ts:34`

**Issue (NEW):** `batchComplete.ts` was updated in this commit to add `eq(files.projectId, projectId)` as a defense-in-depth filter (H4 from R3). The production code now references `files.projectId` in its DB query. However, `batchComplete.test.ts` mock for the files schema at lines 58–64 does NOT include `projectId`:

```typescript
vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    batchId: 'batch_id',
    status: 'status',
    // projectId MISSING
  },
}))
```

Because the Proxy mock accepts any arguments regardless of their values, `eq(undefined, projectId)` is passed silently and the test still passes. This means:

1. If the `projectId` filter is removed from the production code, tests still pass
2. The mock cannot detect that `files.projectId` is `undefined` at test runtime
3. The H4 fix is tested for its existence in source code but not for its correctness

**Fix:** Add `projectId: 'project_id'` to the files schema mock in `batchComplete.test.ts`. Then add an assertion that `eq` was called with `files.projectId` (i.e. `'project_id'`) and the event's `projectId`:

```typescript
vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    batchId: 'batch_id',
    status: 'status',
  },
}))
// In test body:
const { eq } = await import('drizzle-orm')
expect(eq).toHaveBeenCalledWith('project_id', VALID_PROJECT_ID)
```

---

### H2: `batchComplete.test.ts` — empty batch early-return path (H3 from R3) still untested after production changes

**File:** `src/features/pipeline/inngest/batchComplete.test.ts` vs `src/features/pipeline/inngest/batchComplete.ts:41–44`

**Issue (R3 H3 — still open):** `batchComplete.ts` was updated in this commit to add:

```typescript
if (batchFiles.length === 0) {
  logger.info({ batchId }, 'Batch has no files — skipping cross-file analysis')
  return { status: 'completed' as const, findingCount: 0 }
}
```

This is a new code path in `batchComplete.ts` (the production change committed this round). However `batchComplete.test.ts` was NOT updated in this commit — no test covers this early-return path. The existing "duplicate event" test always passes a non-empty fileIds list.

**Required test:**

```typescript
it('[P1] should return early with findingCount 0 when batch has no files', async () => {
  const mockStep = createMockStep()
  dbState.returnValues = [[]] // resolve-batch-files returns no rows

  const { batchComplete } = await import('./batchComplete')
  const result = await (
    batchComplete as { handler: (...args: unknown[]) => Promise<unknown> }
  ).handler({
    event: {
      data: { batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID, tenantId: VALID_TENANT_ID },
    },
    step: mockStep,
  })

  expect(result).toMatchObject({ status: 'completed', findingCount: 0 })
  expect(mockCrossFileConsistency).not.toHaveBeenCalled()
})
```

---

### H3: `processFile.batch-completion.test.ts` — `uploadBatchId=undefined` test does not assert `step.run` call count

**File:** `src/features/pipeline/inngest/processFile.batch-completion.test.ts:227–251`

**Issue (NEW — weaker fix than required):** The new test for `uploadBatchId=undefined` (lines 227–251) asserts `expect(mockStep.sendEvent).not.toHaveBeenCalled()`. This correctly verifies that `pipeline.batch-completed` is not emitted. However, the test does NOT assert `expect(mockStep.run).toHaveBeenCalledTimes(2)`.

The production handler calls `step.run` three times when `uploadBatchId` is present:

1. `l1-rules-${fileId}`
2. `score-${fileId}`
3. `check-batch-${fileId}` (the batch completion check)

When `uploadBatchId` is absent, only calls 1 and 2 should occur. If the guard `if (uploadBatchId)` is removed (regression), the handler would call `step.run` 3 times (the batch check step would run), and since all batch files return terminal states by default... `sendEvent` might still not be called if `batchComplete.allCompleted` is false. But with `dbState.returnValues = []`, the DB mock returns `[]` for the sibling files query, `allCompleted` would be `true` (all 0 files are terminal), and `sendEvent` WOULD be called.

Wait — in this test `dbState.returnValues` is `[]` (not set), so the third `step.run` call would query the DB → `then` handler fires → `returnValues[0] ?? [] = []` → `batchFiles = []` → `allCompleted = [].every(...)` = `true` → `sendEvent` IS called → the `not.toHaveBeenCalled()` assertion FAILS.

So the test IS detecting the regression in this specific edge case. However, the assertion `step.run called exactly 2 times` is a more direct expression of intent and makes the test self-documenting.

**Severity note:** The current assertion accidentally protects correctly because of the empty-array truthy `every()` behavior. Severity downgraded to H because the protection is real but fragile.

**Fix:** Add `expect(mockStep.run).toHaveBeenCalledTimes(2)` after the `sendEvent` assertion to explicitly verify the batch-check step was skipped.

---

## MEDIUM

### M1: `batchComplete.test.ts` — `onFailureFn` never tested (new production behavior from this commit)

**File:** `src/features/pipeline/inngest/batchComplete.test.ts` vs `src/features/pipeline/inngest/batchComplete.ts:61–70`

**Issue (NEW):** `batchComplete.ts` was updated in this commit to add `onFailureFn` registered as the `onFailure` handler. The function is exposed via `Object.assign` (`batchComplete.onFailure`). No test exercises it. If the `onFailureFn` has a bug (e.g., reads wrong nested path), it would be silent.

**Required test:**

```typescript
it('[P1] should log error in onFailure handler with batchId', async () => {
  const { logger } = await import('@/lib/logger')
  const { batchComplete } = await import('./batchComplete')

  await (batchComplete as { onFailure: (...args: unknown[]) => unknown }).onFailure({
    event: {
      data: {
        event: {
          data: { batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID, tenantId: VALID_TENANT_ID },
        },
      },
    },
    error: new Error('test failure'),
  })

  expect(logger.error).toHaveBeenCalledWith(
    expect.objectContaining({ batchId: VALID_BATCH_ID }),
    expect.stringContaining('batchComplete'),
  )
})
```

---

### M2: `getBatchSummary.action.test.ts` — `crossFileFindings` empty-batch test cannot detect missing guard

**File:** `src/features/batch/actions/getBatchSummary.action.test.ts:550–565`

**Issue (NEW — partial fix):** The new test `'[P2] should return empty crossFileFindings when no files in batch'` (lines 550–565) asserts `result.data.crossFileFindings` equals `[]`. This passes whether or not the `if (fileIds.length > 0)` guard exists, because even without the guard, `inArray(findings.fileId, [])` would call the DB mock which returns `[]` (default Proxy fallback). The guard exists to prevent invalid SQL (`inArray` with empty array) — but the test cannot detect its absence.

**Fix:** Assert `dbState.callIndex` equals `2` after the action call, proving the third DB query was NOT made:

```typescript
expect(dbState.callIndex).toBe(2) // project + files queries only; cross-file query skipped
```

---

### M3: `getBatchSummary.action.test.ts` — `passedCount` and `needsReviewCount` fields still not asserted

**File:** `src/features/batch/actions/getBatchSummary.action.test.ts`

**Issue (R3 L2 — partially fixed):** `totalFiles` is now asserted in the empty-batch test (line 453). However `passedCount` and `needsReviewCount` are never asserted in any test. These are derived fields (length of the two arrays) and a mapping bug (e.g., swapped assignment) would be invisible.

**Fix:** In the existing partition test at lines 200–228, add:

```typescript
expect(result.data.passedCount).toBe(3) // 3 files with score 97
expect(result.data.needsReviewCount).toBe(2) // 2 files with score 80
```

---

### M4: `parityComparator.test.ts` — substring containment tests share the same `fileId='test-file-id'` default

**File:** `src/features/parity/helpers/parityComparator.test.ts:145–190`

**Issue (NEW):** The two new substring containment tests (lines 145–168 and 170–190) both use `buildToolFinding()` without specifying `fileId`, which defaults to `'test-file-id'`. The `compareFindings` call also passes `'test-file-id'` as the third argument. This means the fileId filtering path (`toolFindings.filter(f => f.fileId === fileId)`) is exercised, but it works by coincidence — both the tool finding and the comparison target share the same hardcoded string.

If `buildToolFinding` were changed to use `faker.string.uuid()` for `fileId`, the test would fail because the random UUID would not match `'test-file-id'`. This fragility is minor but could cause false failures during test refactoring.

**Fix:** Be explicit about the fileId used:

```typescript
const FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const toolFindings = [
  buildToolFinding({
    sourceTextExcerpt: 'The quick brown fox jumps over',
    category: 'accuracy',
    severity: 'major',
    fileId: FILE_ID,
  }),
]
const result = compareFindings(xbenchFindings, toolFindings, FILE_ID)
```

---

## LOW

### L1: `compareWithXbench.action.test.ts` — `fileId` optional arg propagation to `compareFindings` still untested

**File:** `src/features/parity/actions/compareWithXbench.action.test.ts` vs `src/features/parity/actions/compareWithXbench.action.ts:69–79`

**Issue (R3 L1 — still open, no change from R3):** `compareWithXbench.ts` passes the optional `fileId` from the request to `compareFindings(xbenchResult.findings, toolFindings, fileId)`. No test verifies that when `fileId` is provided, `compareFindings` is called with that specific value as the third argument.

**Required assertion in P1 test:**

```typescript
const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
await compareWithXbench({
  projectId: VALID_PROJECT_ID,
  fileId: VALID_FILE_ID,
  xbenchReportBuffer: new Uint8Array([1, 2, 3]),
})
expect(mockCompareFindings).toHaveBeenCalledWith(
  expect.any(Array),
  expect.any(Array),
  VALID_FILE_ID,
)
```

---

### L2: `batchComplete.test.ts` — `vi.resetModules()` inside `it()` body still present (R3 L3)

**File:** `src/features/pipeline/inngest/batchComplete.test.ts:162`

**Issue (R3 L3 — still open):** Line 162 calls `vi.resetModules()` inside the `it()` body titled `'should be registered in Inngest serve function list'`. This clears all module caches mid-suite, potentially causing subsequent tests in the same file to re-import modules with fresh state. In a small 3-test file this is low risk, but it is an anti-pattern that makes test ordering significant.

**Fix:** Move the registration assertion to a separate `describe('registration')` block that uses `vi.resetModules()` in `beforeEach` scoped to that block, OR remove the `vi.resetModules()` call if the mock captures survive without it (the `createFunctionMock` reference would still be the same vi.fn after `clearAllMocks`).

---

## VERDICT

9 findings total: 0C · 3H · 4M · 2L.

**8 of 14 R3 open gaps were closed in this commit.** The 5 gaps that remain open (M1 BatchSummaryView, M2 FileHistoryTable, M5 xbenchReportParser null worksheet, M6 storage upload non-fatal, L1 compareWithXbench fileId) are all carry-overs from earlier rounds.

**2 new findings introduced in R4 work:**

- H1: batchComplete schema mock missing `projectId` (production H4 fix is tested but not verified for correctness)
- H2: batchComplete empty-batch path still untested despite the guard being added to production this commit

**Most actionable fixes (highest ROI):**

1. H2: Add the empty-batch early-return test to `batchComplete.test.ts` (5 lines)
2. H1: Add `projectId: 'project_id'` to `batchComplete.test.ts` schema mock (1 line)
3. M2: Add `expect(dbState.callIndex).toBe(2)` to the empty-crossFileFindings test (1 line)
4. H3: Add `expect(mockStep.run).toHaveBeenCalledTimes(2)` to uploadBatchId=undefined test (1 line)
