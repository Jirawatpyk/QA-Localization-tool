# Story 2.7 Test Review — CR Round 1 Findings (2026-02-25)

Summary: 2C · 6H · 9M · 4L

---

## CRITICAL

### C1: `processFile.batch-completion.test.ts` — 3 P0 tests fully skipped with feature NOT implemented

File: `src/features/pipeline/inngest/processFile.batch-completion.test.ts`

All 3 tests are `it.skip`. Critically, reading `processFile.ts` shows the batch-completion
signalling logic does NOT exist in the source file at all — there is no sibling-files query,
no batch-completed event dispatch, and no `step.sendEvent` call for batch completion.
The tests are skipped because the feature was deferred, but:

- The tests are labeled `[P0]` (highest priority)
- AC#7 (cross-file consistency) depends on `pipeline.batch-completed` event
- No tracking comment explains what's blocking or when these will be unskipped

Fix: Add a tracking comment with the JIRA/story reference that gates these. If the feature is
deferred to a later story, move these tests to that story's file with a `@deferred` tag.
If not deferred, implement the batch-completion signalling in `processFile.ts` and unskip.

### C2: `generateParityReport.action.test.ts` — `project not found` path never tested

File: `src/features/parity/actions/generateParityReport.action.test.ts`

The action has an explicit NOT_FOUND guard (line 56-58 of the source):

```ts
if (!project) {
  return { success: false, error: 'Project not found', code: 'NOT_FOUND' }
}
```

Zero tests cover this path. The test for "invalid xlsx" tests the parse failure path
(before the project query) but NOT the project-not-found path (after a successful parse).

This matters because without this test, a refactor that accidentally drops or reorders
the project ownership check would go undetected.

Fix:

```ts
it('[P1] should return NOT_FOUND when project does not belong to tenant', async () => {
  mockParseXbenchReport.mockResolvedValue({ findings: [], fileGroups: {} })
  dbState.returnValues = [
    [], // project ownership SELECT → empty = not found
  ]

  const { generateParityReport } = await import('./generateParityReport.action')
  const result = await generateParityReport({
    projectId: VALID_PROJECT_ID,
    xbenchReportBuffer: Buffer.from('mock-xlsx'),
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('NOT_FOUND')
})
```

---

## HIGH

### H1: `getBatchSummary.action.test.ts` — INTERNAL_ERROR (DB throw) path not tested

File: `src/features/batch/actions/getBatchSummary.action.test.ts`

The action wraps everything in a try/catch returning `{ code: 'INTERNAL_ERROR' }`. Zero tests
verify this path. An analogous test exists for other stories (e.g., Story 2.6's `startProcessing`).

Fix:

```ts
it('[P1] should return INTERNAL_ERROR when database throws', async () => {
  dbState.throwAtCallIndex = 0 // throw on project query

  const { getBatchSummary } = await import('./getBatchSummary.action')
  const result = await getBatchSummary({
    batchId: VALID_BATCH_ID,
    projectId: VALID_PROJECT_ID,
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('INTERNAL_ERROR')
})
```

### H2: `getFileHistory.action.test.ts` — INTERNAL_ERROR path not tested + `lastReviewerName` is a PLACEHOLDER BUG

File: `src/features/batch/actions/getFileHistory.action.ts`, line 63:

```ts
lastReviewerName: scores.status, // placeholder — real impl merges review actions
```

The source code uses `scores.status` as the value for `lastReviewerName`. The tests pass
`lastReviewerName: 'Alice'` in the mock row and assert it comes back as `'Alice'` — this
appears to work because the Proxy mock returns the mock row verbatim. But the actual DB
query selects `scores.status` for that column, not a reviewer name.

This means:

1. The test for "return correct last reviewer per file" (line 298) asserts `'Alice'` / `'Bob'`
   but those values come from the mock, not from a real join with a users table.
2. In production the `lastReviewerName` field would always be a status string like `'calculated'`.
3. The placeholder comment acknowledges this but no test pins the _current_ (broken) contract
   so a future fix could silently regress if tests are not updated.

Fix: Add a test that explicitly documents the placeholder behavior and a TODO:

```ts
it('[H] PLACEHOLDER: lastReviewerName currently returns scores.status not actual reviewer name', async () => {
  // TODO: When real reviewer join is implemented, this test must be updated
  // Current impl: lastReviewerName: scores.status (placeholder)
  // Expected impl: lastReviewerName: users.name from MAX(reviewActions.createdAt) JOIN
  const file = buildFileHistoryRow({ status: 'l1_completed' })
  dbState.returnValues = [[{ autoPassThreshold: 95 }], [file]]

  const { getFileHistory } = await import('./getFileHistory.action')
  const result = await getFileHistory({ projectId: VALID_PROJECT_ID, filter: 'all' })

  expect(result.success).toBe(true)
  if (!result.success) return
  // Document placeholder: value equals the file status, not a name
  // When fixed, this test should assert result.data.files[0]!.lastReviewerName === 'ReviewerName'
  expect(result.data.files[0]!.lastReviewerName).toBeDefined()
})
```

### H3: `getBatchSummary.action.test.ts` — Unauthorized path not tested for ANY batch/parity actions

Files: `getBatchSummary.action.test.ts`, `getFileHistory.action.test.ts`,
`generateParityReport.action.test.ts`, `reportMissingCheck.action.test.ts`

None of the 4 Story 2.7 server action test files test the `requireRole` rejection path.
Established project convention (seen in Stories 2.1, 2.3, 2.6) includes:

```ts
it('[P0] should return UNAUTHORIZED when not authenticated', async () => {
  mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })
  const result = await action(validInput)
  expect(result.code).toBe('UNAUTHORIZED')
})
```

This is missing from all 4 files. An attacker who discovers that `requireRole` can be bypassed
would have no test coverage showing the action correctly gates access.

Fix: Add UNAUTHORIZED tests to all 4 action test files.

### H4: `reportMissingCheck.action.test.ts` — INSERT returning empty path not tested

File: `src/features/parity/actions/reportMissingCheck.action.ts`, line 78-80:

```ts
if (!report) {
  return { success: false, error: 'Failed to create report', code: 'INTERNAL_ERROR' }
}
```

Zero tests cover this path (Proxy `returning()` defaulting to `[]` → `report = undefined`).
The same gap was flagged as C2 in Story 2.6 CR R4 for `scoreFile.ts`.

Fix:

```ts
it('[P1] should return INTERNAL_ERROR when INSERT returns empty', async () => {
  dbState.returnValues = [
    [{ id: VALID_PROJECT_ID }], // project ownership SELECT
    [], // INSERT returning empty → report = undefined
  ]

  const { reportMissingCheck } = await import('./reportMissingCheck.action')
  const result = await reportMissingCheck({
    projectId: VALID_PROJECT_ID,
    fileId: VALID_FILE_ID,
    segmentNumber: 5,
    expectedCategory: 'accuracy',
    expectedDescription: 'Missing number check',
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('INTERNAL_ERROR')
})
```

### H5: `getBatchSummary.action.test.ts` — processingTimeMs condition: mixed batch (some not terminal) not tested

File: `src/features/batch/actions/getBatchSummary.action.ts`, lines 111-118:

```ts
const completedFiles = filesWithScores.filter(
  (f) => f.status === 'l1_completed' || f.status === 'failed',
)
if (completedFiles.length > 0 && completedFiles.length === filesWithScores.length) {
  ...processingTimeMs = maxUpdated - minCreated
}
```

The test `[P2] should return null processing time when all files still processing` covers the
case where `completedFiles.length === 0`. But the condition `completedFiles.length === filesWithScores.length`
also gates on "ALL files terminal". A mixed batch (e.g., 2 l1_completed + 1 l1_processing) should
still return `null` — this is not tested.

Fix:

```ts
it('[P2] should return null processing time when batch has mixed terminal and processing files', async () => {
  const completedFile = buildFileWithScore({
    mqmScore: 97,
    criticalCount: 0,
    status: 'l1_completed',
  })
  const processingFile = buildFileWithScore({
    mqmScore: null,
    criticalCount: 0,
    status: 'l1_processing',
  })
  dbState.returnValues = [[{ autoPassThreshold: 95 }], [completedFile, processingFile]]

  const { getBatchSummary } = await import('./getBatchSummary.action')
  const result = await getBatchSummary({ batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID })

  expect(result.success).toBe(true)
  if (!result.success) return
  // NOT all files are terminal → processingTimeMs must be null
  expect(result.data.processingTimeMs).toBeNull()
})
```

### H6: `compareWithXbench.action.ts` has NO test file at all

The `compareWithXbench.action.ts` file exists and is used by `ParityComparisonView`. It has:

- `requireRole` gate
- `parseXbenchReport` call with error handling
- `db.select` tool findings query with `withTenant`
- `compareFindings` call
- Result mapping (auto-assigns `segmentNumber: 0` for all findings — a notable lossy conversion)

None of these behaviors are unit tested. The ParityComparisonView tests mock `compareWithXbench`
completely, so the action's internal logic is fully untested.

Fix: Create `src/features/parity/actions/compareWithXbench.action.test.ts` with at minimum:

- withTenant isolation test
- parse failure path
- fileId=undefined vs fileId=specific path (the `input.fileId ?? ''` call affects which findings match)

---

## MEDIUM

### M1: `xbenchCategoryMapper.test.ts` — `xbenchReportParser.test.ts` maps `'Numeric Mismatch'` but mapper only has `'numeric mismatch'`

File: `src/features/parity/helpers/xbenchCategoryMapper.ts`, line 9:

```ts
'numeric mismatch': 'accuracy',
```

The test in `xbenchCategoryMapper.test.ts` uses `'Number Mismatch'` (line 22) and
`'NUMBER MISMATCH'` (line 41) but NOT `'Numeric Mismatch'`. The xbench report parser in
`xbenchReportParser.ts` emits the raw column value. The golden corpus reader in
`golden-corpus-parity.test.ts` uses `'Numeric Mismatch'` (line 175). This maps correctly
because both `'number mismatch'` and `'numeric mismatch'` are present in the mapper.

But the mapper test at line 22 uses `['Number Mismatch', 'accuracy']` which maps to
`'number mismatch'` key — this works. The `'Numeric Mismatch'` alias is not tested in
the mapper test. If someone removes the alias, it would silently fail in the golden corpus.

Fix: Add to the known mappings in the mapper test:

```ts
['Numeric Mismatch', 'accuracy'],  // Alias used in golden corpus reader
```

### M2: `parityComparator.test.ts` — Matching logic only tests category-match; `_sourceMatch` variable is dead code in source

File: `src/features/parity/helpers/parityComparator.ts`, lines 80-84:

```ts
const _sourceMatch =
  xSource === tSource ||
  (xSource.length > 0 && tSource.length > 0 && xSource.includes(tSource))
const severityMatch = severityWithinTolerance(xf.severity, tf.severity, 1)

if (categoryMatch && severityMatch) {  // _sourceMatch is NEVER USED!
```

The `_sourceMatch` variable is computed but never used in the `if` condition. The match
is purely `categoryMatch && severityMatch`. This means two findings with completely different
source texts but same category and severity will match — which may or may not be intentional.

The test `[P0] should NFKC normalize and trim source text before matching` (line 76) passes
even with the dead code because it relies on `categoryMatch && severityMatch` (both match).

No test exists that would FAIL if `_sourceMatch` were incorrectly included:

- A test where `categoryMatch=true`, `severityMatch=true`, `_sourceMatch=false` would expose this.

Fix: Either add `_sourceMatch` to the condition and add tests, or document the intentional
omission. Add a test that verifies the current contract:

```ts
it('[P1] should match by category+severity regardless of source text difference', async () => {
  // Current contract: _sourceMatch is computed but not used in match decision
  const xbenchFindings = [
    buildXbenchFinding({ category: 'accuracy', severity: 'major', sourceText: 'Apple' }),
  ]
  const toolFindings = [
    buildToolFinding({
      category: 'accuracy',
      severity: 'major',
      sourceTextExcerpt: 'Completely Different Text',
    }),
  ]

  const { compareFindings } = await import('./parityComparator')
  const result = compareFindings(xbenchFindings, toolFindings, 'test-file-id')

  // Matches because category+severity both match (sourceMatch is unused)
  expect(result.matched).toHaveLength(1)
})
```

### M3: `batchSchemas.test.ts` — Missing validation tests: invalid UUID format, missing projectId in getBatchSummary

The schema test covers missing `batchId` but not missing `projectId` in `getBatchSummarySchema`.
Also missing: invalid UUID format rejection (both fields). Convention from other schema tests
in the project tests both fields.

Fix:

```ts
it('should reject getBatchSummary with missing projectId', () => {
  const result = getBatchSummarySchema.safeParse({ batchId: VALID_BATCH_ID })
  expect(result.success).toBe(false)
})

it('should reject getBatchSummary with non-UUID batchId', () => {
  const result = getBatchSummarySchema.safeParse({
    batchId: 'not-a-uuid',
    projectId: VALID_PROJECT_ID,
  })
  expect(result.success).toBe(false)
})

it('should reject getFileHistory with non-UUID projectId', () => {
  const result = getFileHistorySchema.safeParse({ projectId: 'not-a-uuid', filter: 'all' })
  expect(result.success).toBe(false)
})
```

### M4: `paritySchemas.test.ts` — Schema field names differ from action field names (type mismatch between schema and action)

The `reportMissingCheckSchema` in `paritySchemas.ts` has `fileReference` and `xbenchCheckType`
fields. But `reportMissingCheck.action.ts` uses its own internal Zod schema with `fileId`,
`segmentNumber`, `expectedCategory`, `expectedDescription` (no `fileReference` / `xbenchCheckType`).

The `paritySchemas.ts` schema is NOT used by the action. The test in `paritySchemas.test.ts`
tests a schema that is imported but not actually driving any server action.

This is a schema/action mismatch. Either:

1. The action should use the exported schema from `paritySchemas.ts`
2. Or the exported schema is for a different purpose (e.g., UI validation) — document it

Fix: Add a comment to `paritySchemas.test.ts` noting this is UI-level schema, not the action schema.
Also add a test for the action's actual validation in `reportMissingCheck.action.test.ts`:

```ts
it('[P2] should return VALIDATION_ERROR for non-UUID projectId', async () => {
  const { reportMissingCheck } = await import('./reportMissingCheck.action')
  const result = await reportMissingCheck({
    projectId: 'not-a-uuid',
    fileId: VALID_FILE_ID,
    segmentNumber: 5,
    expectedCategory: 'accuracy',
    expectedDescription: 'Test',
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.code).toBe('INVALID_INPUT')
})
```

### M5: `getBatchSummary.action.test.ts` — `needReview` key name conflicts with `BatchSummaryData` type

Source `getBatchSummary.action.ts` returns `{ needReview: [...] }` (no 's').
`src/features/batch/types.ts` defines `BatchSummaryData` with `needsReview: FileInBatch[]` (with 's').

The tests correctly assert `result.data.needReview` (matching the action return) but the
canonical type is `needsReview`. This naming inconsistency between the action and the type
suggests a bug or drift. No test pins the `needsReview` vs `needReview` contract in the type system.

Fix: Verify which name is correct, fix the inconsistency in source, and add a typed assertion:

```ts
// After fixing naming, use typed access:
const data: BatchSummaryData = result.data // Will fail if key name mismatches
expect(data.needsReview).toHaveLength(0)
```

### M6: `crossFileConsistency.test.ts` — NFKC test only checks `findingCount > 0` not the inserted finding content

The `[P1] should NFKC normalize and trim source text before comparing` test (line 237) asserts
`result.findingCount > 0` but doesn't verify the inserted finding's `description` or `sourceText`.
If NFKC normalization is accidentally removed but the finding is inserted for a different reason,
this test would still pass.

Fix: Assert the finding content directly via `dbState.valuesCaptures`.

### M7: `batchComplete.test.ts` — `crossFileConsistency` error path not tested

If `crossFileConsistency` throws, the `batchComplete` function's error handling (if any) is untested.
The current tests only mock happy paths (3 findings). No test verifies graceful degradation.

Fix:

```ts
it('[P1] should handle crossFileConsistency throwing without crashing', async () => {
  mockCrossFileConsistency.mockRejectedValue(new Error('DB connection failed'))
  const mockStep = createMockStep()

  const { batchComplete } = await import('./batchComplete')
  // Should not throw — either catches internally or propagates to Inngest retry
  await expect(
    (batchComplete as { handler: (...args: unknown[]) => unknown }).handler({
      event: {
        data: {
          batchId: VALID_BATCH_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
          fileIds: ['f1'],
        },
      },
      step: mockStep,
    }),
  ).resolves.not.toThrow()
})
```

### M8: `xbenchReportParser.test.ts` — Empty worksheet not tested; missing worksheet (null) path not tested

The parser throws `new Error('No worksheet found in xlsx file')` if `workbook.getWorksheet(1)`
returns falsy. The mock always returns a worksheet. No test covers the null worksheet path.

Also, no test covers an xlsx where all rows are empty (0 findings produced).

Fix: Add a mock key for empty/null worksheet and test both paths.

### M9: `FileStatusCard.test.tsx` — `tabindex` assertion is vacuous (line 134)

```ts
expect(link.getAttribute('tabindex')).not.toBe('-1')
```

This assertion passes if `tabindex` is `null` (attribute absent), `'0'`, or any other value.
A link without `tabindex` is naturally focusable, so this test always passes regardless of
whether the developer intentionally set `tabindex="-1"` to make it unfocusable. Weak assertion.

Fix:

```ts
// Prefer: link is natively focusable (no tabindex=-1)
expect(link).not.toHaveAttribute('tabindex', '-1')
// Or if you want to verify it IS explicitly focusable:
// expect(link.getAttribute('tabindex')).toBe('0')
```

---

## LOW

### L1: `RLS tests` — UPDATE and DELETE operations not tested for either table

Files: `parity-reports.rls.test.ts`, `missing-check-reports.rls.test.ts`

Both RLS test files test SELECT + INSERT for both tenants but not UPDATE or DELETE.
Project convention (see `files.rls.test.ts`, `findings.rls.test.ts`) tests all 4 operations.

Specifically untested:

- Can Tenant B UPDATE a parity_report they don't own? (should fail)
- Can Tenant B DELETE a missing_check_report they don't own? (should fail)

Fix: Add UPDATE and DELETE cross-tenant rejection tests to both files.

### L2: `BatchSummaryView.test.tsx` — Responsive layout tests use `.toBeTruthy()` on className

Lines 156-157:

```ts
const container = screen.getByTestId('batch-summary-grid')
expect(container.className).toMatch(/grid/)
```

`toMatch(/grid/)` on className is reasonable but it's checking for a substring of the class
string. If the class is `"no-grid"` or `"unagrid"`, this would also match. Prefer
`toContain('grid')` on the classList array or use `toHaveClass('grid')` from RTL.

### L3: `parityComparator.test.ts` — No test for `trivial` severity (4th SEVERITY_LEVEL)

The `SEVERITY_LEVELS` map has `trivial: 0` but no test exercises the `trivial` boundary:

- `trivial → minor` (level diff = 1) should match
- `trivial → major` (level diff = 2) should NOT match
- Unknown severity (`''`, `null`) returning `-1` should return false from `severityWithinTolerance`

### L4: `golden-corpus-parity.test.ts` — Threshold `<= 200` for `nonFluencyXbenchOnly` is very loose

Line 311: `expect(nonFluencyXbenchOnly).toBeLessThanOrEqual(200)`

This threshold is so large it would pass even if the engine found 0 non-fluency matches for
an entire corpus. The intent is "engine has parity with Xbench for non-fluency categories"
but 200 gap is not parity — it's near-failure tolerance.

Recommend tightening to a concrete baseline after running on the golden corpus, e.g.:
`expect(nonFluencyXbenchOnly).toBeLessThanOrEqual(15)` if the real gap is small.
