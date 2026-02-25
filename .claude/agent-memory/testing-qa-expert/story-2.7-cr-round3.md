# Story 2.7 — CR Round 3 (Adversarial Review of Round 2 Fixes)

Date: 2026-02-25
All tests passing: 121 unit tests across 20 files (same count as R2 — no new tests added).

## Summary: 2C · 3H · 6M · 3L = 14 findings

---

## STATUS OF CR ROUND 2 GAPS

Before listing new findings, status of each R2 gap:

| R2 Finding                                                                       | Status                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| C1: crossFileConsistency — scope/segmentId/relatedFileIds not asserted           | FIXED — lines 224–236 now assert all three fields                            |
| C2: paritySchemas tests dead export (generateParityReportSchema)                 | STILL OPEN — test still validates dead export, action uses Uint8Array schema |
| H1: getBatchSummary VALIDATION_ERROR gap                                         | FIXED — lines 456–462                                                        |
| H2: getBatchSummary INTERNAL_ERROR gap                                           | FIXED — lines 464–474                                                        |
| H3: processFile.batch-completion — loose event ID + uploadBatchId=undefined path | STILL OPEN (both sub-issues)                                                 |
| H4: reportMissingCheck — NOT_FOUND + INSERT empty path                           | STILL OPEN                                                                   |
| M1: getBatchSummary partial-terminal null processingTimeMs                       | FIXED — lines 476–490                                                        |
| M2: getFileHistory page 2 totalCount                                             | FIXED — lines 371–386                                                        |
| M3: BatchSummaryView crossFileFindings prop zero tests                           | STILL OPEN                                                                   |
| M4: FileHistoryTable processedAt vs createdAt type mismatch                      | STILL OPEN                                                                   |
| M5: parityComparator substring containment branch                                | STILL OPEN                                                                   |
| M6: xbenchCategoryMapper 'Repeated Word' singular                                | FIXED — 'Repeated Word' (singular) added to mapXbenchToToolCategory test     |
| M7: batchComplete empty batch path                                               | STILL OPEN                                                                   |
| L1: xbenchReportParser null worksheet branch                                     | STILL OPEN                                                                   |
| L2: compareWithXbench fileId propagation to compareFindings                      | STILL OPEN                                                                   |
| L3: generateParityReport storage upload non-fatal                                | STILL OPEN                                                                   |

8 of 16 R2 gaps were fixed. 8 remain open.

---

## CRITICAL

### C1: `paritySchemas.test.ts` tests `generateParityReportSchema` (dead export) — action uses local `Uint8Array` schema not tested

**File:** `src/features/parity/validation/paritySchemas.test.ts:16–58` vs `src/features/parity/actions/generateParityReport.action.ts:43–62`

**Issue (R2 C2 — still open):** `paritySchemas.ts` exports `generateParityReportSchema` with field `xbenchReportBuffer: z.instanceof(Uint8Array)`. The action imports THIS schema from `@/features/parity/validation/paritySchemas` (confirmed in action import at line 16). The schema IS now correctly tested. However, `generateParityReport.action.test.ts` has ZERO validation-error tests passing a non-Uint8Array `xbenchReportBuffer`. The schema guard (`parsed.success === false` → `VALIDATION_ERROR`) is never exercised in the ACTION test. If someone replaces `z.instanceof(Uint8Array)` with `z.string()`, the action test suite would not catch it.

**Note:** Re-reading the source, `generateParityReport.action.ts` line 16 DOES import `generateParityReportSchema` from the validation module. So C2 from R2 was based on incorrect reading — the import exists. But the ACTION test still has no VALIDATION_ERROR test covering the `Uint8Array` type enforcement.

**Required test in `generateParityReport.action.test.ts`:**

```typescript
it('[P2] should return VALIDATION_ERROR when xbenchReportBuffer is not Uint8Array', async () => {
  const { generateParityReport } = await import('./generateParityReport.action')
  const result = await generateParityReport({
    projectId: VALID_PROJECT_ID,
    xbenchReportBuffer: 'string-not-a-buffer',
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('VALIDATION_ERROR')
})
```

---

### C2: `getBatchSummary.action.test.ts` — `crossFileFindings` query (third DB call) has NO tests at all

**File:** `src/features/batch/actions/getBatchSummary.action.ts:125–151` vs `src/features/batch/actions/getBatchSummary.action.test.ts`

**Issue (NEW):** `getBatchSummary.action.ts` has a THIRD database query (lines 126–144) that fetches cross-file findings for the batch. This query:

1. Is guarded by `if (fileIds.length > 0)` (empty batch skips it)
2. Filters by `scope: 'cross-file'` and `inArray(findings.fileId, fileIds)`
3. Returns `crossFileFindings` in the result

All existing tests only mock TWO return values (`returnValues = [[project], [files]]`). The third call falls through the Proxy mock and resolves to `[]` (empty array default). This means:

- `crossFileFindings` in every test result is silently `[]`
- The non-empty `crossFileFindings` path is NEVER tested
- When `fileIds.length === 0` (empty batch), the guard that skips the query is also never tested
- `result.data.crossFileFindings` is never asserted in ANY test

**Required tests:**

```typescript
it('[P0] should include crossFileFindings in result when present', async () => {
  const fileId = faker.string.uuid()
  dbState.returnValues = [
    [{ autoPassThreshold: 95 }],
    [buildFileWithScore({ fileId })],
    [
      {
        id: faker.string.uuid(),
        description: 'Cross-file inconsistency',
        sourceTextExcerpt: 'Submit',
        relatedFileIds: [fileId],
      },
    ],
  ]
  const { getBatchSummary } = await import('./getBatchSummary.action')
  const result = await getBatchSummary({ batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.crossFileFindings).toHaveLength(1)
  expect(result.data.crossFileFindings[0]!.description).toBe('Cross-file inconsistency')
})

it('[P0] should skip crossFileFindings query for empty batch', async () => {
  dbState.returnValues = [[{ autoPassThreshold: 95 }], []]
  const { getBatchSummary } = await import('./getBatchSummary.action')
  const result = await getBatchSummary({ batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.crossFileFindings).toEqual([])
})
```

---

## HIGH

### H1: `processFile.batch-completion.test.ts` — event step ID too loose AND `uploadBatchId=undefined` path never tested

**File:** `src/features/pipeline/inngest/processFile.batch-completion.test.ts:188–198`

**Issue (R2 H3 — still open):** Two sub-issues both remain:

**Sub-issue 1 (loose step ID):** Line 190 uses `expect.stringContaining('batch-completed')`. This does NOT include the batchId suffix. If the step ID is `batch-completed-${uploadBatchId}`, a bug that drops the batchId would pass this assertion. Should be:

```typescript
expect.stringContaining('batch-completed-' + VALID_UPLOAD_BATCH_ID)
```

**Sub-issue 2 (missing uploadBatchId=undefined path):** When `uploadBatchId` is absent from the event data, the entire batch-completion step should be skipped. No test covers this. If `uploadBatchId` is undefined in the event, `step.sendEvent` must NOT be called.

**Required test:**

```typescript
it('[P0] should NOT emit batch-completed when uploadBatchId is absent', async () => {
  const mockStep = createMockStep()
  const eventData = buildPipelineEvent()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (eventData as any).uploadBatchId

  const { processFilePipeline } = await import('./processFile')
  await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
    event: { data: eventData },
    step: mockStep,
  })

  expect(mockStep.sendEvent).not.toHaveBeenCalled()
})
```

---

### H2: `reportMissingCheck.action.test.ts` — NOT_FOUND guard AND empty INSERT returning path never tested

**File:** `src/features/parity/actions/reportMissingCheck.action.test.ts`

**Issue (R2 H4 — still open):** Both error paths remain untested:

1. When project query returns `[]` → `{ success: false, code: 'NOT_FOUND' }` (line 53–55 of action)
2. When INSERT `.returning()` returns `[]` → `{ success: false, code: 'INTERNAL_ERROR' }` (line 74–76 of action)

`grep NOT_FOUND|INTERNAL_ERROR` in the test file returns no matches.

**Required tests:**

```typescript
it('[P2] should return NOT_FOUND when project does not belong to tenant', async () => {
  dbState.returnValues = [[]] // empty project result
  const { reportMissingCheck } = await import('./reportMissingCheck.action')
  const result = await reportMissingCheck({
    projectId: VALID_PROJECT_ID,
    fileReference: 'test.sdlxliff',
    segmentNumber: 1,
    expectedDescription: 'missing check',
    xbenchCheckType: 'number',
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('NOT_FOUND')
})

it('[P2] should return INTERNAL_ERROR when INSERT returning is empty', async () => {
  dbState.returnValues = [
    [{ id: VALID_PROJECT_ID }], // project found
    // INSERT .returning() handled by 'returning' prop — override needed
  ]
  // Use throwAtCallIndex to trigger DB failure on returning() call
  dbState.throwAtCallIndex = 1
  const { reportMissingCheck } = await import('./reportMissingCheck.action')
  const result = await reportMissingCheck({
    projectId: VALID_PROJECT_ID,
    fileReference: 'test.sdlxliff',
    segmentNumber: 1,
    expectedDescription: 'missing check',
    xbenchCheckType: 'number',
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('INTERNAL_ERROR')
})
```

---

### H3: `batchComplete.test.ts` — empty batch early-return path not tested; `crossFileConsistency` incorrectly called

**File:** `src/features/pipeline/inngest/batchComplete.test.ts`

**Issue (R2 M7 — promoted to HIGH):** `batchComplete.ts:34–37` has:

```typescript
if (batchFiles.length === 0) {
  logger.info({ batchId }, 'Batch has no files — skipping cross-file analysis')
  return { status: 'completed', findingCount: 0 }
}
```

Zero tests cover this path. `mockCrossFileConsistency` should NOT be called when the batch is empty. If the early-return guard is accidentally removed, `crossFileConsistency` would be called with `fileIds: []`, which would hit the `inArray([])` guard in `crossFileConsistency.ts:32` and return `{ findingCount: 0 }` — making the bug invisible. Only a test asserting `mockCrossFileConsistency` is NOT called can catch the missing guard.

**Required test:**

```typescript
it('[P1] should return findingCount=0 and NOT call crossFileConsistency for empty batch', async () => {
  const mockStep = createMockStep()
  dbState.returnValues = [[]] // resolve-batch-files returns empty array

  const { batchComplete } = await import('./batchComplete')
  const result = await (batchComplete as { handler: (...args: unknown[]) => unknown }).handler({
    event: {
      data: { batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID, tenantId: VALID_TENANT_ID },
    },
    step: mockStep,
  })

  expect(mockCrossFileConsistency).not.toHaveBeenCalled()
  expect(result).toEqual({ status: 'completed', findingCount: 0 })
})
```

---

## MEDIUM

### M1: `BatchSummaryView.test.tsx` — `crossFileFindings` prop has ZERO tests (entire AC#7 section)

**File:** `src/features/batch/components/BatchSummaryView.test.tsx`

**Issue (R2 M3 — still open):** Zero tests pass the `crossFileFindings` prop. The conditional rendering of the cross-file issues section (`crossFileFindings.length > 0`) is never exercised. AC#7 in the story spec explicitly calls for this section.

**Required tests:**

1. Non-empty `crossFileFindings` → `data-testid="cross-file-issues"` section renders with count
2. Empty `crossFileFindings` (or omitted) → section does NOT render

---

### M2: `FileHistoryTable.test.tsx` — `processedAt: string` field vs action returning `createdAt: Date` — type mismatch not caught by tests

**File:** `src/features/batch/components/FileHistoryTable.test.tsx:21` vs `src/features/batch/actions/getFileHistory.action.ts:56–63`

**Issue (R2 M4 — still open):** Component type uses `processedAt: string` (ISO 8601 string). Action returns `createdAt: Date` (native Date object). These are different field names AND different types. No test passes both simultaneously and verifies the mapped field name. The test builds rows with `processedAt: new Date().toISOString()` in factory — this sidesteps the mapping gap entirely.

If `FileHistoryPageClient.tsx` passes action result directly to `FileHistoryTable` without mapping `createdAt → processedAt`, every row shows "Invalid Date" at runtime. No test would catch this.

---

### M3: `parityComparator.test.ts` — substring containment branch (`includes`) never tested

**File:** `src/features/parity/helpers/parityComparator.test.ts`

**Issue (R2 M5 — still open):** The match condition has:

```typescript
const sourceMatch =
  xSource === tSource ||
  (xSource.length > 0 &&
    tSource.length > 0 &&
    (xSource.includes(tSource) || tSource.includes(xSource)))
```

The `xSource.includes(tSource)` and `tSource.includes(xSource)` branches are NEVER tested. All P0/P1 tests only hit the exact-match path (`xSource === tSource`). If the substring fallback is removed in a refactor, no test catches the regression.

**Required test:**

```typescript
it('[P1] should match when xbench source text contains tool source text as substring', async () => {
  const xbenchFindings = [
    buildXbenchFinding({
      sourceText: 'The quick brown fox jumps',
      category: 'accuracy',
      severity: 'major',
    }),
  ]
  const toolFindings = [
    buildToolFinding({
      sourceTextExcerpt: 'quick brown fox', // substring of xbench source
      category: 'accuracy',
      severity: 'major',
    }),
  ]
  const { compareFindings } = await import('./parityComparator')
  const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')
  expect(result.matched).toHaveLength(1)
  expect(result.xbenchOnly).toHaveLength(0)
})
```

---

### M4: `generateParityReport.action.test.ts` — NOT_FOUND path (project not in tenant) never tested

**File:** `src/features/parity/actions/generateParityReport.action.ts:64–71`

**Issue:** The action checks project ownership (lines 64–71):

```typescript
const [project] = await db.select(...).where(and(withTenant(...), eq(...)))
if (!project) {
  return { success: false, error: 'Project not found', code: 'NOT_FOUND' }
}
```

Zero tests in `generateParityReport.action.test.ts` cover this path. The P0 test [P0] withTenant assertion passes `[{ id: VALID_PROJECT_ID }]` for the project query — the `!project` branch is never exercised.

**Required test:**

```typescript
it('[P0] should return NOT_FOUND when project does not belong to tenant', async () => {
  // parseXbenchReport succeeds, project query returns empty
  dbState.returnValues = [
    [], // empty project result = not found in this tenant
  ]
  const { generateParityReport } = await import('./generateParityReport.action')
  const result = await generateParityReport({
    projectId: VALID_PROJECT_ID,
    xbenchReportBuffer: new Uint8Array([1, 2, 3]),
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('NOT_FOUND')
})
```

---

### M5: `xbenchReportParser.test.ts` — `getWorksheet` mock never returns null; `!worksheet` guard branch untested

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts`

**Issue (R2 L1 — promoted to MEDIUM because the guard is source behavior, not just a corner case):**
`xbenchReportParser.ts:37–40`:

```typescript
const worksheet = workbook.getWorksheet(1)
if (!worksheet) {
  throw new Error('No worksheet found in xlsx file')
}
```

The ExcelJS mock's `getWorksheet()` always returns a valid object. The `!worksheet` throw path is dead code in tests. If the null guard is removed, no test fails.

**Required mock override:**

```typescript
it('[P1] should throw when worksheet is null/missing', async () => {
  vi.mocked(ExcelJS.default.Workbook.prototype.getWorksheet).mockReturnValueOnce(null as never)
  const { parseXbenchReport } = await import('./xbenchReportParser')
  await expect(parseXbenchReport(Buffer.from('mock-xlsx-data'))).rejects.toThrow(
    'No worksheet found',
  )
})
```

---

### M6: `generateParityReport.action.test.ts` — storage upload non-fatal error path never tested

**File:** `src/features/parity/actions/generateParityReport.action.ts:96–114`

**Issue (R2 L3 — still open, promoted to MEDIUM):** The Supabase storage upload is wrapped in a non-fatal try-catch. Both error sub-paths are untested:

1. `upload` returns `{ error: new Error('quota exceeded') }` → action should still return success
2. `upload` throws → action should still return success

The mock always returns `{ error: null }` (happy path). This means the non-fatal error paths would only be caught in production, not in tests.

**Required test:**

```typescript
it('[P1] should return success even when storage upload returns error (non-fatal)', async () => {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  vi.mocked(createAdminClient).mockReturnValueOnce({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: new Error('quota exceeded') })),
      })),
    },
  } as unknown as ReturnType<typeof createAdminClient>)
  dbState.returnValues = [
    [{ id: VALID_PROJECT_ID }],
    [{ category: 'accuracy', severity: 'major' }],
    [{ id: faker.string.uuid() }],
  ]
  const { generateParityReport } = await import('./generateParityReport.action')
  const result = await generateParityReport({
    projectId: VALID_PROJECT_ID,
    xbenchReportBuffer: new Uint8Array([1, 2, 3]),
  })
  expect(result.success).toBe(true)
})
```

---

## LOW

### L1: `compareWithXbench.action.test.ts` — `fileId` optional arg propagation to `compareFindings` never asserted

**File:** `src/features/parity/actions/compareWithXbench.action.test.ts`

**Issue (R2 L2 — still open):** `compareWithXbench.action.ts` passes `fileId ?? ''` to `compareFindings` as the third argument. Zero tests assert that `mockCompareFindings.mock.calls[0][2]` equals the provided `fileId`. If the `fileId` propagation is dropped, no test catches it.

---

### L2: `getBatchSummary.action.test.ts` — `totalFiles`, `passedCount`, `needsReviewCount` fields never asserted against actual file counts

**File:** `src/features/batch/actions/getBatchSummary.action.test.ts:192–197`

**Issue (NEW):** The P0 partition test (lines 200–228) asserts that `passIds.length + reviewIds.length === 5`. But `result.data.totalFiles`, `result.data.passedCount`, and `result.data.needsReviewCount` are NEVER directly asserted in any test. These are returned by the action (`totalFiles: filesWithScores.length`, `passedCount: recommendedPass.length`, `needsReviewCount: needsReview.length`). A bug where `passedCount` is off-by-one would be invisible to the test suite.

**Required assertions in the existing partition test or a dedicated test:**

```typescript
expect(result.data.totalFiles).toBe(5)
expect(result.data.passedCount).toBe(3)
expect(result.data.needsReviewCount).toBe(2)
```

---

### L3: `batchComplete.test.ts` — Inngest function registration test (`createFunction` mock call) is fragile — `vi.resetModules()` inside an `it()` can pollute module cache for subsequent tests

**File:** `src/features/pipeline/inngest/batchComplete.test.ts:158–175`

**Issue (NEW):** The test at line 158 calls `vi.resetModules()` inside an `it()` block, then does a fresh `await import('./batchComplete')` to verify `createFunction` was called. This pattern is dangerous:

1. `vi.resetModules()` inside a test body (not in `beforeEach`) can leave the module registry in an unpredictable state for tests that run AFTER this one
2. The test relies on `createFunctionMock` being captured BEFORE `resetModules()` clears it, then calling `import` after reset — the mock registry state after reset is undefined

**Fix:** Either move this to a separate test file that isolates module-level side effects, or use `vi.doMock` instead of `vi.resetModules()` inside a test body.

---

## Test Architecture Observations

1. **`crossFileConsistency.test.ts` — single-file batch never tested:**
   `fileIds: [FILE_ID_1]` (one file) cannot have cross-file inconsistencies. The `targetToFileIds.size < 2` guard returns early. No test verifies `findingCount: 0` when only one file is in the batch. This should be a P2 test.

2. **`compareWithXbench.action.test.ts` — `mockCompareFindings` return value is never varied:**
   All tests that reach the comparison step return the same mock result `{ matched: [1 item], xbenchOnly: [], toolOnly: [] }`. No test exercises the `bothFound`, `toolOnly`, `xbenchOnly` count fields in the action result shape. The counts (`toolFindingCount`, `xbenchFindingCount`) are also never asserted.

3. **`paritySchemas.test.ts` — `compareWithXbenchSchema` missing rejection test for invalid `projectId`:**
   The schema test at line 62–71 validates success but never tests that invalid `projectId` (non-UUID) rejects. Only `generateParityReportSchema` has a rejection test. `compareWithXbenchSchema` should have symmetric rejection tests.
