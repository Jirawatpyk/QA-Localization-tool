# Story 2.3 — Adversarial Test Coverage CR Round 2 (2026-02-23)

**Test suite state at time of review:** 142 tests, all passing.
**Findings summary:** 2 Critical · 3 High · 6 Medium · 4 Low

---

## CRITICAL

### C1 — POTENTIAL SOURCE BUG: `segmentId` silently dropped from DB insert

**File:** `src/features/parser/actions/parseFile.action.ts` lines 295-309
**Schema:** `src/db/schema/segments.ts`
**Status:** NOT TESTED

`batchInsertSegments` maps `ParsedSegment` fields into insert values. The `segments` table has NO `segmentId` column. The `segmentId` field from `ParsedSegment` (e.g., `'TU-001'` when `segmentIdColumn` is mapped) is silently discarded on every insert.

If `segmentId` is intentionally not persisted, that is a design decision that should be documented and tested as a contract ("segmentId is used only for deduplication, not persisted"). If it SHOULD be persisted, this is a source bug — data loss.

No test verifies that the per-row `segmentId` value makes it to (or is intentionally excluded from) the DB row.

---

### C2 — POTENTIAL SOURCE BUG: `hasHeader=false` + `ColumnMappingDialog` sends header values as column names

**File:** `src/features/upload/components/ColumnMappingDialog.tsx` line 108
**Status:** NOT TESTED

When `hasHeader` is toggled to `false`, `columnOptions` still returns `preview.headers` — the header row cell values (e.g. `['Hello', 'สวัสดี', 'TU-001']`). The user selects one of these text values.

But `parseExcelBilingual` with `hasHeader=false` calls `parseColumnIndex(mapping.sourceColumn)` and expects a **1-based numeric string** like `'1'`, `'2'`, `'3'`. Passing a text value like `'Hello'` causes `parseInt('Hello', 10)` to return `NaN`, which returns `INVALID_COLUMNS`.

This means the `hasHeader=false` flow is **broken by design** in the UI layer — the dialog sends the wrong format. Yet no test exercises `hasHeader=false` end-to-end through the dialog (the existing test only resets selections, not what gets sent to `parseFile`).

---

## HIGH

### H1 — No test: INVALID_INPUT path when `columnMapping` has `sourceColumn === targetColumn` reaches the DB

**File:** `src/features/parser/actions/parseFile.action.ts` line 130
**Status:** Partially tested

The test at line 837 (`should return INVALID_INPUT when columnMapping is missing for xlsx file`) covers the `!columnMapping` case. But no test covers passing a `columnMapping` where `sourceColumn === targetColumn` — this bypasses the missing-mapping check but should fail at `parseExcelBilingual` with `INVALID_COLUMNS`. The Zod schema catches this at validation time but the action doesn't validate the columnMapping object via Zod — it uses TypeScript typing only. A caller bypassing the UI schema could pass `{sourceColumn:'A', targetColumn:'A', hasHeader:true}` and the parse will fail after the status is already set to `'parsing'`.

### H2 — Weak assertion in CAS race test

**File:** `src/features/parser/actions/parseFile.action.test.ts` line 531
**Tag:** `(H2)` — CAS race condition test

The test at line 531 verifies `result.code === 'CONFLICT'` and that `mockWriteAuditLog` is NOT called. But it uses a single `buildUpdateChain([])` which means BOTH the CAS update AND any subsequent `markFileFailed` update would be mocked by the same chain. In source code, `markFileFailed` calls `db.update()` — but the test doesn't distinguish between the two `update` calls. This creates a vacuous assertion: the test passes even if the code accidentally calls `markFileFailed` (which it should NOT on CAS failure).

The CAS failure path (line 89-94 of source) returns before calling `markFileFailed` — but the mock doesn't enforce the number of `db.update()` calls. A regression that adds `markFileFailed` on CAS failure would not be caught.

### H3 — `parseFile` Excel parse error: `markFileFailed` audit `errorCode` field not asserted

**File:** `src/features/parser/actions/parseFile.action.test.ts` line 933
**Test:** `should return PARSE_ERROR for malformed Excel file`

This test only checks `result.code === 'PARSE_ERROR'`. The source code at line 189-192 also calls `markFileFailed` with `errorCode: parseResult.error.code`. No test asserts that `mockWriteAuditLog` was called with the correct `errorCode` field for the Excel parse failure path. The XLIFF equivalent (line 402) does assert the reason string.

---

## MEDIUM

### M1 — `excelParser.ts` EMPTY_SHEET: message is misleading

**File:** `src/features/parser/excelParser.ts` lines 73-81
**Status:** Tested (line 157 of test file) but message assertion is absent

The test at line 163 checks `result.error.code === 'EMPTY_SHEET'` but does NOT assert `result.error.message`. The source uses `'Invalid Excel file — could not read spreadsheet'` for `EMPTY_SHEET` — the same message used for `INVALID_EXCEL` and `INVALID_COLUMNS`. This is misleading UX (the file is valid but empty). No test guards against this message being misrepresented to the user.

### M2 — `previewExcelColumns`: header-only file (rowCount === 1) returns `totalRows = 0` — not tested

**File:** `src/features/parser/actions/previewExcelColumns.action.ts` line 119
`totalRows = Math.max(0, worksheet.rowCount - 1)`

When a file has a header row but no data rows (`rowCount === 1`), `totalRows` becomes 0. The dialog would show "0 rows to parse" with no preview data, but no error is returned. This is a valid state but an edge case. No test covers a header-only file via `previewExcelColumns`.

### M3 — `ColumnMappingDialog`: optional columns sent as `undefined` when no option chosen — not tested

**File:** `src/features/upload/components/ColumnMappingDialog.tsx` lines 121-123
When the user leaves optional columns at `__none__`, the mapping object omits them (sets `undefined`). No test verifies that optional columns are correctly stripped from the mapping and not sent as `NONE_VALUE` string to `parseFile`.

### M4 — `parseExcelBilingual` no-header mode: segmentIdColumn / contextColumn / languageColumn as numeric indices untested

**File:** `src/features/parser/excelParser.ts` lines 180-186
Tests at lines 305-325 cover the `hasHeader=false` source/target column selection. But no test exercises optional columns (segmentIdColumn, contextColumn, languageColumn) in no-header mode — the numeric index resolution path for those three fields is never exercised.

### M5 — `autoDetectColumns`: multiple exact matches — which one wins?

**File:** `src/features/parser/excelParser.ts` line 268-271
`exactMatch === null` guard means the FIRST exact match wins. But if there are two columns both exactly matching the same keyword (e.g., two columns both named `'source'`), only the first is taken. No test covers duplicate header names.

### M6 — `ColumnMappingDialog`: dialog `onOpenChange` escape path not tested

**File:** `src/features/upload/components/ColumnMappingDialog.tsx` lines 143-147
The `onOpenChange` handler calls `onCancel()` when the dialog is closed via the escape key or overlay click (when `!isParsing`). No test exercises this path. Only explicit Cancel button click is tested.

---

## LOW

### L1 — `excelParser.test.ts` line 243: `wordCount` asserted as `> 0` — too weak

The assertion `expect(seg.wordCount).toBeGreaterThan(0)` for `'Hello'` (1 word) would still pass even if `countWords` returned 100. A stronger assertion `toBe(1)` would guard against over-counting.

### L2 — `excelMappingSchema.test.ts`: constant value tests are vacuous

**File:** `src/features/parser/validation/excelMappingSchema.test.ts` lines 121-148
The `EXCEL_PREVIEW_ROWS` and `EXCEL_AUTO_DETECT_KEYWORDS` tests just assert the current value. They will pass even if the constant is wrong. If EXCEL_PREVIEW_ROWS changes from 5 to 3, the test still passes (it tests `toBe(5)` which would fail, but the test itself doesn't validate the _behavior_ this constant drives). These are data-contract tests, not behavior tests.

### L3 — `ColumnMappingDialog.test.tsx`: 6 of 15 tests use `.toBeTruthy()` — weak

Tests at lines 59, 67, 74, 75, 91, 99 assert with `.toBeTruthy()` rather than `.toBeInTheDocument()` or specific text. A non-null empty string is truthy. These pass vacuously if the element exists with empty content.

### L4 — `parseFile.action.test.ts` line 1042: `toBeGreaterThanOrEqual(2)` is too weak for withTenant call count

`expect(mockWithTenant.mock.calls.length).toBeGreaterThanOrEqual(2)` would pass even if `withTenant` is called 100 times. The exact expected count is 3 (file lookup, project lookup, final status update). Should be `toBe(3)`.
