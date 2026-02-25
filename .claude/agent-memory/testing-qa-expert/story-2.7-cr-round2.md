# Story 2.7 — CR Round 2 (Adversarial Review of Round 1 Fixes)

Date: 2026-02-25
All tests passing: 121 unit tests across 20 files.

## Summary: 2C · 4H · 7M · 3L = 16 findings

---

## CRITICAL

### C1: `crossFileConsistency.test.ts` — P0 test name claims `scope=cross-file, segmentId=null, relatedFileIds` but assertion pins NONE of these three fields

**File:** `src/features/pipeline/helpers/crossFileConsistency.test.ts:191–230`
**Issue:** The test is named `[P0] should create finding with scope=cross-file, segmentId=null, relatedFileIds=[f1,f2]` but the actual assertion (lines 224–229) only pins `category` and `detectedByLayer`. The three fields in the test NAME — `scope`, `segmentId`, `relatedFileIds` — are NEVER asserted. If the source accidentally writes `scope: 'per-file'` or `segmentId: someId` or `relatedFileIds: []`, this test still passes.

**Source truth** (`crossFileConsistency.ts:168–183`):

```
scope: 'cross-file',
segmentId: null,
relatedFileIds: inconsistency.relatedFileIds,
```

**Required fix:**

```typescript
expect(insertedFindings[0]).toMatchObject(
  expect.objectContaining({
    category: 'consistency',
    detectedByLayer: 'L1',
    scope: 'cross-file',
    segmentId: null,
    severity: 'minor',
  }),
)
// relatedFileIds must contain both file IDs (not empty, not single file)
expect(insertedFindings[0]).toMatchObject(
  expect.objectContaining({
    relatedFileIds: expect.arrayContaining([FILE_ID_1, FILE_ID_2]),
  }),
)
expect(
  (insertedFindings[0] as { relatedFileIds: unknown[] }).relatedFileIds.length,
).toBeGreaterThanOrEqual(2)
```

---

### C2: `paritySchemas.test.ts` tests `generateParityReportSchema` which is NEVER used by the action — the action has its own local `inputSchema` with different fields

**File:** `src/features/parity/validation/paritySchemas.test.ts:10–36` + `src/features/parity/actions/generateParityReport.action.ts:21–25`
**Issue (CR Round 1 M4 — NOT resolved):** This was identified as M4 in Round 1 but was marked as resolved. Re-examining:

- `paritySchemas.ts` exports `generateParityReportSchema` with field `xbenchReportFile: z.string().min(1)`
- `generateParityReport.action.ts` defines its OWN local `inputSchema` (not imported) with field `xbenchReportBuffer: z.instanceof(Uint8Array)`

The schema tested by `paritySchemas.test.ts` is `generateParityReportSchema` (with `xbenchReportFile` string). This schema is NEVER imported or used in the action. Tests validate a dead export. A developer could break the actual action validation (`Uint8Array` enforcement) and `paritySchemas.test.ts` would still pass 100%.

**Evidence:** `grep -n "generateParityReportSchema"` shows it is only used in `paritySchemas.ts` and `paritySchemas.test.ts` — the action uses its own local schema.

**Required fix:** Either (a) add a VALIDATION_ERROR test to `generateParityReport.action.test.ts` that passes a non-Uint8Array `xbenchReportBuffer` and asserts `VALIDATION_ERROR`, or (b) document explicitly that `generateParityReportSchema` is a UI-layer validation export and add a note that the action has a separate server-side schema.

---

## HIGH

### H1: `getBatchSummary.action.test.ts` has NO VALIDATION_ERROR test path

**File:** `src/features/batch/actions/getBatchSummary.action.test.ts`
**Issue:** The action returns `{ success: false, error: 'Invalid input', code: 'VALIDATION_ERROR' }` when schema parse fails (line 44). Zero tests cover this path. The `getBatchSummarySchema` validates both `batchId` and `projectId` as UUIDs — passing a non-UUID or missing field would trigger this path. Similarly `getFileHistory.action.test.ts` has no VALIDATION_ERROR test.

**Evidence:** `grep -n "VALIDATION_ERROR"` in `getBatchSummary.action.test.ts` returns no matches.

**Required tests:**

```typescript
it('should return VALIDATION_ERROR for invalid input', async () => {
  const { getBatchSummary } = await import('./getBatchSummary.action')
  const result = await getBatchSummary({ batchId: 'not-a-uuid', projectId: VALID_PROJECT_ID })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('VALIDATION_ERROR')
})
```

---

### H2: `getBatchSummary.action.test.ts` has NO INTERNAL_ERROR test path (DB throw)

**File:** `src/features/batch/actions/getBatchSummary.action.test.ts`
**Issue:** The action catch block (line 147) returns `{ success: false, error: 'Failed to fetch batch summary', code: 'INTERNAL_ERROR' }`. The `dbState.throwAtCallIndex` field is declared in the mock setup (line 13) but NEVER USED in any test for this file. Zero tests verify the error handling for DB failure. Same gap exists in `getFileHistory.action.test.ts`.

**Evidence:** `grep -n "throwAtCallIndex"` in test file shows it is set in `dbState` initialization but never set to a non-null value in any test.

**Required tests:**

```typescript
it('should return INTERNAL_ERROR when DB query throws', async () => {
  dbState.throwAtCallIndex = 0
  const { getBatchSummary } = await import('./getBatchSummary.action')
  const result = await getBatchSummary({ batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('INTERNAL_ERROR')
})
```

---

### H3: `processFile.batch-completion.test.ts` — step event ID too loose; `uploadBatchId=undefined` guard path never tested

**File:** `src/features/pipeline/inngest/processFile.batch-completion.test.ts:188–198`

**Issue 1 (loose ID):** The assertion uses `expect.stringContaining('batch-completed')` for the step.sendEvent first argument. The actual step ID is `batch-completed-${uploadBatchId}`. Using `stringContaining` allows any string containing 'batch-completed' to pass. It should be `expect.stringContaining('batch-completed-' + VALID_UPLOAD_BATCH_ID)` or `toBe(`batch-completed-${VALID_UPLOAD_BATCH_ID}`)` to pin the exact ID including the batchId suffix. Without the batchId in the expected ID, a bug that drops the batchId from the step ID would go undetected.

**Issue 2 (missing guard test):** `processFile.ts:38` has `if (uploadBatchId)` — the entire batch-completion step is skipped when `uploadBatchId` is absent (single-file upload). There is NO test for this path. If a non-batch file is processed, `sendEvent` must NOT be called. The test only asserts `.not.toHaveBeenCalledWith(expect.stringContaining('batch-completed'), ...)` for the "still processing" case — not for the no-uploadBatchId case.

**Required test:**

```typescript
it('[P0] should NOT emit batch-completed when uploadBatchId is absent (non-batch upload)', async () => {
  const mockStep = createMockStep()
  const eventData = buildPipelineEvent({ uploadBatchId: undefined as unknown as string })
  // No dbState.returnValues needed for batch query — step skipped entirely

  const { processFilePipeline } = await import('./processFile')
  await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
    event: { data: eventData },
    step: mockStep,
  })

  expect(mockStep.sendEvent).not.toHaveBeenCalled()
})
```

---

### H4: `reportMissingCheck.action.test.ts` — `NOT_FOUND` guard and `INTERNAL_ERROR` paths never tested

**File:** `src/features/parity/actions/reportMissingCheck.action.test.ts`
**Issue (CR Round 1 H4 — status unclear):** The action has two important error paths:

1. `if (!project)` → `NOT_FOUND` (line 53–55) — the project query returns empty array
2. `if (!report)` INSERT returning empty → `INTERNAL_ERROR` (line 74–76) — the INSERT `.returning()` returns empty array

Zero tests for either path. CR Round 1 H4 noted the INSERT empty path. The project NOT_FOUND path was also not addressed. These are the same gaps from Round 1 that were listed but the test file was NOT updated.

**Evidence:** `grep -n "NOT_FOUND|INTERNAL_ERROR"` in test file returns no matches.

---

## MEDIUM

### M1: `getBatchSummary.action.test.ts` — `processingTimeMs` partial-terminal case missing (mixed file statuses)

**File:** `src/features/batch/actions/getBatchSummary.action.test.ts`
**Issue:** `processingTimeMs` is only computed when ALL files are terminal (`l1_completed` or `failed`). The existing tests cover: (a) all `l1_completed` → returns time, (b) `l1_processing` → returns null. But there is no test for a MIXED batch where SOME files are terminal and SOME are still processing — this is the most realistic scenario during active batch processing. The expected result is `null` (since `completedFiles.length === filesWithScores.length` is false when any file is non-terminal).

**Required test:**

```typescript
it('[P2] should return null processingTimeMs when batch is partially complete', async () => {
  const completedFile = buildFileWithScore({ status: 'l1_completed', mqmScore: 97 })
  const processingFile = buildFileWithScore({ status: 'l1_processing', mqmScore: null })
  dbState.returnValues = [[{ autoPassThreshold: 95 }], [completedFile, processingFile]]
  // ...
  expect(result.data.processingTimeMs).toBeNull()
})
```

---

### M2: `getFileHistory.action.test.ts` — pagination page 2 behavior (offset slicing) never tested

**File:** `src/features/batch/actions/getFileHistory.action.test.ts:366–381`
**Issue:** The existing pagination test (line 366) provides exactly 50 files (first page boundary) and verifies page 1 returns 50. But:

1. There is no test for page 2 returning the remainder (files 51–60)
2. There is no test for `page=2` with 60 files where page 2 should return 10 items
3. `totalCount` for paginated results is not verified (the action returns the total pre-pagination count)

The `totalCount` field is particularly important — it represents ALL matching files, not just the current page. If pagination slicing has an off-by-one, `totalCount` would still be correct while `files.length` would be wrong. Both should be asserted.

**Required additional test:**

```typescript
it('[P2] should return page 2 items with correct totalCount', async () => {
  const allFiles = Array.from({ length: 60 }, () => buildFileHistoryRow())
  dbState.returnValues = [[{ autoPassThreshold: 95 }], allFiles]
  const { getFileHistory } = await import('./getFileHistory.action')
  const result = await getFileHistory({ projectId: VALID_PROJECT_ID, filter: 'all', page: 2 })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.files).toHaveLength(10)
  expect(result.data.totalCount).toBe(60)
})
```

---

### M3: `BatchSummaryView.test.tsx` — `crossFileFindings` prop is a documented AC feature but has ZERO tests

**File:** `src/features/batch/components/BatchSummaryView.test.tsx`
**Issue:** `BatchSummaryView.tsx` has a full `crossFileFindings` section (lines 86–112) with its own `data-testid="cross-file-issues"` and count display. The `BatchSummaryViewProps` declares `crossFileFindings?: CrossFileFindingSummary[]`. But in `BatchSummaryView.test.tsx` — zero tests pass `crossFileFindings`. The section is never rendered in any test. AC#7 in the story spec explicitly calls for the Cross-file Issues section. The conditional render (`crossFileFindings.length > 0`) is dead code in tests.

**Required tests:**

1. When `crossFileFindings` is non-empty, `data-testid="cross-file-issues"` section renders
2. Finding count displays correctly (singular "inconsistency" vs plural "inconsistencies")
3. When `crossFileFindings` is empty (default), the section does NOT render

---

### M4: `FileHistoryTable.test.tsx` — `processedAt` field is in `FileHistoryRow` type but the action returns `createdAt: Date`, not `processedAt: string` — type mismatch not caught by tests

**File:** `src/features/batch/components/FileHistoryTable.test.tsx:21` vs `src/features/batch/actions/getFileHistory.action.ts:24`

**Issue:** The component type uses `processedAt: string` (ISO 8601 string), but `getFileHistory` action returns `createdAt: Date` (a JavaScript Date object). These are different field names AND types. The page component (`FileHistoryPageClient.tsx`) would need to map `createdAt → processedAt` and convert `Date → string`. No test verifies this mapping exists. No test passes a real ISO string and verifies the displayed date format. The test builds rows with `processedAt: new Date().toISOString()` which sidesteps the type gap.

This is a potential runtime bug: if the page component passes the action result directly to `FileHistoryTable`, `file.processedAt` would be `undefined` and `new Date(undefined).toLocaleDateString()` renders "Invalid Date".

---

### M5: `parityComparator.test.ts` — `sourceMatch` in comparator uses substring containment (OR condition) but test only verifies exact match case

**File:** `src/features/parity/helpers/parityComparator.test.ts` vs `src/features/parity/helpers/parityComparator.ts:80–84`

**Issue:** The match condition has two paths:

```typescript
const sourceMatch =
  xSource === tSource || // exact match
  (xSource.length > 0 &&
    tSource.length > 0 &&
    (xSource.includes(tSource) || tSource.includes(xSource))) // substring containment
```

The test at line 60 only tests exact source match (both sides have the same text). The substring containment path (xSource contains tSource, or vice versa) is NEVER tested. If this substring logic is wrong (e.g., a future refactor removes it), the test suite would not catch the regression. A test case where `xSource="The quick brown fox"` and `tSource="quick brown"` (tSource is substring of xSource) should match.

---

### M6: `xbenchCategoryMapper.test.ts` — `'Repeated Word'` (singular) tested but `'Repeated Words'` (plural) is a separate mapping; only one tested

**File:** `src/features/parity/helpers/xbenchCategoryMapper.test.ts:13–31` vs `src/features/parity/helpers/xbenchCategoryMapper.ts:13–14`

**Issue:** The source has TWO separate entries:

```typescript
'repeated word': 'fluency',
'repeated words': 'fluency',
```

The test at line 24 only tests `'Repeated Words'` (plural) in the known mappings loop. `'Repeated Word'` (singular) is NOT in the test's `knownMappings` array. If the `'repeated word'` key were accidentally removed from the source, the test would not catch it. Both variants should be in `knownMappings`.

Similarly, `'Numeric Mismatch'` maps to `'accuracy'` but `'Number Mismatch'` also maps to `'accuracy'` — only `'Number Mismatch'` appears in the knownMappings array. `'Numeric Mismatch'` is missing from the test list.

---

### M7: `batchComplete.test.ts` — empty batch (batchFiles.length === 0) early-return path never tested

**File:** `src/features/pipeline/inngest/batchComplete.test.ts`
**Issue:** `batchComplete.ts:34–37` has:

```typescript
if (batchFiles.length === 0) {
  logger.info({ batchId }, 'Batch has no files — skipping cross-file analysis')
  return { status: 'completed' as const, findingCount: 0 }
}
```

Zero tests cover the empty batch path. `crossFileConsistency` should NOT be called. The return value should be `{ status: 'completed', findingCount: 0 }`. If this early-return guard were accidentally removed, `crossFileConsistency` would be called with `fileIds: []` and would throw in `inArray()` call.

**Required test:**

```typescript
it('[P1] should return findingCount=0 and not call crossFileConsistency for empty batch', async () => {
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

## LOW

### L1: `xbenchReportParser.test.ts` — `getWorksheet` mock returns worksheet even when xlsx throws; "no worksheet found" branch never tested

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts`
**Issue:** `xbenchReportParser.ts:37–40` has:

```typescript
const worksheet = workbook.getWorksheet(1)
if (!worksheet) {
  throw new Error('No worksheet found in xlsx file')
}
```

The mock's `getWorksheet()` always returns a valid worksheet object. The `!worksheet` path is never triggered. If this null guard were removed, the test suite would not catch the regression.

---

### L2: `compareWithXbench.action.test.ts` — `fileId` optional filter propagation to `compareFindings` never asserted

**File:** `src/features/parity/actions/compareWithXbench.action.test.ts`
**Issue:** `compareWithXbench.action.ts:85` passes `fileId ?? ''` to `compareFindings` as the third argument. Zero tests verify that when `fileId` is provided, it is passed correctly to `compareFindings`. When `fileId` is omitted, `compareFindings` receives `''` (empty string). No test captures `mockCompareFindings.mock.calls[0][2]` to verify the fileId argument.

---

### L3: `generateParityReport.action.test.ts` — `storage.upload` non-fatal error path never tested

**File:** `src/features/parity/actions/generateParityReport.action.ts:111–118`
**Issue:** The Supabase storage upload is wrapped in a try-catch (non-fatal). The mock always returns `{ error: null }`. If storage returns `{ error: uploadError }` or throws, the action should log but continue. No test verifies:

1. When `supabase.storage.upload` returns `{ error: new Error('Storage quota exceeded') }`, the action still returns success
2. When `supabase.storage.upload` throws, the action still returns success

```typescript
it('[P1] should succeed even when storage upload returns error (non-fatal)', async () => {
  mockCreateAdminClient.mockReturnValue({
    storage: { from: vi.fn(() => ({
      upload: vi.fn((..._args: unknown[]) => Promise.resolve({ error: new Error('quota') })),
    })) },
  })
  // ... dbState setup ...
  const result = await generateParityReport({ ... })
  expect(result.success).toBe(true) // non-fatal
})
```

---

## Test Architecture Observations

1. **Proxy mock `throwAtCallIndex` declared but never exercised in batch action tests:**
   `dbState.throwAtCallIndex` is declared and the Proxy handler checks it, but in `getBatchSummary.action.test.ts` and `getFileHistory.action.test.ts` it is only reset to `null` in `beforeEach` — never set to a non-null value. This means `INTERNAL_ERROR` is completely uncovered despite the infrastructure being present (H2 above).

2. **`batchId` field mismatch in `processFile.batch-completion.test.ts`:**
   The DB query mock returns rows with `{ id, status, batchId }` (line 175) but `files` mock schema (line 96–99) does not include `batchId`. The test works because the Proxy mock ignores schema structure, but it's a discrepancy worth noting.

3. **Missing `scores.layerCompleted` field in DB mock schemas:**
   Both `getBatchSummary.action.test.ts:90–99` and `getFileHistory.action.test.ts:94–103` mock the `scores` schema without the `layerCompleted` field, despite the action using `eq(scores.layerCompleted, 'L1')` in the LEFT JOIN condition. The mock accepts this because `eq()` is mocked to return its args. This is not a bug but a documentation gap.
