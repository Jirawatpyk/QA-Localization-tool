# Story 2.3 CR Round 1 — Excel Bilingual Parser

Date: 2026-02-23

## Test Count Verification (claimed vs actual)

| File                               | Claimed | Actual                    | Status                         |
| ---------------------------------- | ------- | ------------------------- | ------------------------------ |
| excelMappingSchema.test.ts         | 15      | 15                        | MATCH                          |
| excelParser.test.ts                | 39      | 39                        | MATCH                          |
| previewExcelColumns.action.test.ts | 11      | 11                        | MATCH                          |
| parseFile.action.test.ts           | 41      | 41                        | MATCH                          |
| ColumnMappingDialog.test.tsx       | 10      | 10                        | MATCH                          |
| UploadPageClient.test.tsx          | "2 new" | 6 total (2 new: 6.1, 6.2) | MATCH (claim was for new only) |

## Findings

### CRITICAL

#### C1 — batchInsertSegments ignores per-row targetLang (untested + source BUG)

- Source: `parseFile.action.ts` lines 286-314
- `batchInsertSegments` receives `targetLang` as a flat string parameter and applies it to ALL
  segments uniformly. But `ParsedSegment.targetLang` already holds the per-row override from
  `languageColumn` mapping in `parseExcelBilingual`.
- Line 304: `targetLang,` — uses the project default, NOT `seg.targetLang`
- This means the C1 (languageColumn override) feature works at the parser level but is silently
  discarded at the DB insert level.
- The test `should use project.targetLangs[0] as default targetLang` PASSES but misses that per-row
  overrides are also silently dropped.
- No test asserts that when `languageColumn` is mapped, the inserted segment rows contain the
  per-row language values.
- This is a LIKELY SOURCE BUG, not just a test gap.

#### C2 — EMPTY_SHEET path in excelParser.ts not tested

- Source: `excelParser.ts` lines 71-80
- The `worksheet === undefined || rowCount === 0` branch returns `{ error: { code: 'EMPTY_SHEET' } }`
- No test in `excelParser.test.ts` exercises this code path.
- An empty workbook (no sheets, or a sheet with rowCount=0) would silently hit this branch.
- Error code is EMPTY_SHEET but message says "Invalid Excel file" — same message as INVALID_EXCEL,
  potential consumer confusion.

### HIGH

#### H1 — previewExcelColumns: empty worksheet path not tested

- Source: `previewExcelColumns.action.ts` lines 95-102 (`if (!worksheet)` → PARSE_ERROR)
- No test exercises the "workbook loads successfully but has no worksheets" path.
- Different from corrupted file — a valid XLSX with zero sheets would reach this branch.

#### H2 — parseFile Excel branch: project NOT_FOUND not tested

- Source: `parseFile.action.ts` lines 159-167
- When project lookup returns empty for an xlsx file, returns `{ code: 'NOT_FOUND' }` and calls
  `markFileFailed`.
- No test covers this branch.
- The `buildSelectChainMulti` helper is defined and used but never with `[mockExcelFile], []` to
  simulate missing project.

#### H3 — ColumnMappingDialog: preview load failure path not tested

- Source: `ColumnMappingDialog.tsx` lines 86-88
- When `previewExcelColumns` returns `{ success: false }`, a toast.error is shown and `preview`
  stays null (no column selectors rendered).
- No test covers this path. The "Confirm & Parse" button should remain disabled (no columns to
  select), which is a key AC#1 behavioral guard.

#### H4 — ColumnMappingDialog: canConfirm guard (same column) not tested

- Source: `ColumnMappingDialog.tsx` line 99
  `const canConfirm = sourceColumn.length > 0 && targetColumn.length > 0 && sourceColumn !== targetColumn`
- The `sourceColumn !== targetColumn` part of canConfirm is never exercised in tests.
- The schema-level C7 test exists in excelMappingSchema.test.ts but the UI-level guard is separate
  and untested. A user selecting the same column for both source and target should see "Confirm &
  Parse" disabled.

#### H5 — ColumnMappingDialog: isParsing state (button disabled during parse) not tested

- Source: `ColumnMappingDialog.tsx` lines 104, 152, 153 (setIsParsing, disabled={isParsing})
- No test verifies the button becomes disabled while parsing is in progress (loading state).
- This is a UX contract: double-submit prevention.

### MEDIUM

#### M1 — excelParser.test.ts: autoDetectColumns ambiguous same-column test is soft

- Lines 97-106 in excelParser.test.ts
- The test body contains a conditional: `if (suggestedSourceColumn !== null && ...)`.
  If the implementation returns `{ null, null }` for `['source-target']`, the inner assertion
  is skipped entirely. The test passes whether null is returned OR separate non-null columns are
  returned. This is effectively a vacuous test for the ambiguity case.
- A firmer assertion would be: when a single header matches both keywords, BOTH suggestions must
  be null.

#### M2 — excelParser.test.ts: merged cells assertion is weak

- Lines 337-343
- `expect(result.data.segments.length).toBeGreaterThanOrEqual(1)` — passes for any count >= 1.
- Does not verify WHICH rows were treated as empty vs included. The test does not confirm that
  merged continuation cells (which ExcelJS returns as empty) are correctly treated as empty.
- Should assert the exact expected segment count and that no merged-cell rows produce duplicate
  source text.

#### M3 — excelParser.test.ts: CJK word count assertion is weak

- Lines 365-369
- `expect(seg.wordCount).toBeGreaterThanOrEqual(0)` — passes even if wordCount=0 for all CJK.
- The Thai test at line 355 uses `toBeGreaterThan(0)` (stronger), but CJK test uses `>= 0`.
- Should assert specific minimum counts using known CJK strings in the fixture.

#### M4 — parseFile.action.test.ts: batchInsertSegments uses project-level targetLang for all rows

- Lines 845-853: test only asserts `targetLang: 'th-TH'` which is `mockProject.targetLangs[0]`.
- This test PASSES even though per-row language overrides are silently discarded (see C1 above).
- If C1 is ever fixed, this test would need updating to verify per-row lang is used.

#### M5 — UploadPageClient.test.tsx: onSuccess/onCancel dismissal logic not tested

- Source: `UploadPageClient.tsx` lines 57-68 (`handleColumnMappingSuccess`, `handleColumnMappingCancel`)
- After confirming or cancelling the dialog, `dismissedFileIds` is updated so the dialog does not
  re-appear for the same file.
- No test verifies the dialog disappears after `onSuccess` callback.
- No test verifies a `toast.success` is shown with the segment count after confirm.
- No test verifies the file stays in 'uploaded' status after cancel (described in comment).

#### M6 — ColumnMappingDialog: hasHeader checkbox toggle not tested

- Source: `ColumnMappingDialog.tsx` line 152 (`onCheckedChange`)
- No test verifies toggling "First row is header" changes behavior (e.g., triggers reload, or
  changes which columns are offered).
- The `useEffect` only re-triggers on `[open, fileId]` — hasHeader toggle does NOT re-fetch.
  This means column names remain header-based even when hasHeader=false. Potential UX gap.

#### M7 — previewExcelColumns.action.test.ts: previewRows length not strictly checked

- Line 160: `expect(result.data.previewRows.length).toBeLessThanOrEqual(5)`
- The fixture has 10 rows. This should be `toBe(5)` since EXCEL_PREVIEW_ROWS=5 and the fixture
  has enough rows to fill all 5. LessThanOrEqual(5) also passes for 0, 1, 2, 3, 4.

#### M8 — parseFile.action.test.ts: Excel audit log fields not asserted

- The Excel branch calls `markFileFailed` in multiple places (missing columnMapping, arrayBuffer
  failure, project not found, parse failure), but no test asserts the audit log `fileName` and
  `reason` fields for the Excel-specific failure paths.
- The `blob.arrayBuffer() fails (E7)` test only asserts `action: 'file.parse_failed'` without
  checking `fileName` or `reason` (line 875).

### LOW

#### L1 — excelMappingSchema.test.ts: optional string fields accept empty string

- No test verifies that optional columns (segmentIdColumn, contextColumn, languageColumn) reject
  empty string `""`. Zod `.optional()` without `.min(1)` would accept `""` — if a user
  passes `segmentIdColumn: ""`, it would be treated as a valid mapping pointing to no column.

#### L2 — excelParser.test.ts: no-header mode with optional columns not tested

- `parseExcelBilingual` with `hasHeader: false` + segmentIdColumn / contextColumn specified
  uses numeric indices for those columns too. No test covers this combination.

#### L3 — excelParser.test.ts: formula with Error result not tested

- `extractCellValue` handles `{ result: undefined }` via `?? ''` (line 237). But what if
  `result` is an Error object? `String(errorObject)` would give `"[object Error]"`.
  Not a critical path but untested.

#### L4 — ColumnMappingDialog.test.tsx: weak `.toBeTruthy()` assertions

- Lines 59, 67, 74, 75, 84, 91, 100, 149 use `.toBeTruthy()` or `.not.toBeNull()`.
- These pass for any truthy value. Should use `.toBeInTheDocument()` or `.toHaveTextContent()`.

#### L5 — ColumnMappingDialog.test.tsx: previewRows count not checked

- The dialog shows up to 5 preview rows (AC#1). No test asserts exactly 5 rows are shown in
  the table body when the fixture has >= 5 rows.

## Summary

- Total: 2 CRITICAL · 3 HIGH · 8 MEDIUM · 5 LOW
- Most critical issue is C1 (likely source BUG: per-row language override discarded in
  batchInsertSegments because targetLang is passed as flat project default, not seg.targetLang)
- C2 is a pure test gap: EMPTY_SHEET code path with zero coverage
- H2 (project NOT_FOUND for Excel) is the most impactful untested error path
