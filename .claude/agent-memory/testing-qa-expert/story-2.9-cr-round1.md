# Story 2.9 CR Round 1 — Test Quality Analysis

**Date:** 2026-02-26
**Files Reviewed:**

- `src/features/parity/helpers/xbenchReportParser.test.ts` (16 tests)
- `src/__tests__/integration/parity-helpers-real-data.test.ts` (15 tests)

**Test Run Result:** 16/16 unit + 15/15 integration = ALL PASSING

## Summary: 0C · 3H · 5M · 4L

---

## HIGH Findings

### H1: Stale/Misleading Comment Contradicts Test State

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts:196-198`

```
// All tests below are it.skip() — TDD RED PHASE
// Remove it.skip() after implementing parseSectioned() + detectXbenchFormat()
```

These comments are **factually wrong** — all 11 tests are now active (it.skip removed). A future reader will be confused about whether the tests were intentionally left in RED or if there's a mistake. Misleads maintainers and violates the living-documentation principle.

### H2: Original 5 Tabular Tests Have Structurally Weak Assertions

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts:124-193`

- **Test P0 (line 124):** Asserts only `toHaveProperty('findings')` + `toBeInstanceOf(Array)` — does NOT verify `findings.length == 2` or any actual data values. Can pass even if parser returns 0 findings.
- **Test P1 grouping (line 142):** Asserts `groupKeys.length >= 1` — too loose. `mock-xlsx-data` has findings across `intro.sdlxliff` and `chapter1.xlf` (2 files). Should be `>= 2` or `== 2`.
- **Test P1 reordered columns (line 178):** Asserts only shape (`toHaveProperty`) — does NOT verify VALUES. Passes even if all fields are empty strings. Should check `sourceText === 'Apple text'`, `category === 'accuracy'`, etc.

These tests were written in ATDD pre-impl (stub style) and were never strengthened. They cannot catch a regression where the parser silently returns empty or malformed findings.

### H3: `worksheet === null` Branch Completely Untested

**File:** `src/features/parity/helpers/xbenchReportParser.ts:185-188`

```typescript
const worksheet = workbook.getWorksheet(1)
if (!worksheet) {
  throw new Error('No worksheet found in xlsx file')
}
```

The ExcelJS mock's `getWorksheet()` always returns a valid object — it never returns `null`. This throw branch (which handles an xlsx with 0 sheets — real-world possibility) is never exercised by any test. A refactor that removes this guard would go undetected.

---

## MEDIUM Findings

### M1: Untested Category Marker Branches in `parseSectioned`

**File:** `src/features/parity/helpers/xbenchReportParser.ts:159-171` / `xbenchReportParser.test.ts`

`parseSectioned` handles 7 category markers. The MOCK_WORKSHEETS only exercise 2 of them:

- `Tag Mismatch` — tested
- `Numeric Mismatch` — tested
- `Inconsistency in Source` — **UNTESTED** (case: `colA.includes('Inconsistency in Source')`)
- `Inconsistency in Target` — **UNTESTED**
- `Repeated Word` — **UNTESTED**
- `Key Term Mismatch` variants (startsWith) — **UNTESTED** (e.g. `'Key Term Mismatch (EN)'`)

The startsWith branch for `Key Term Mismatch` is particularly important because the ATDD/story notes call it out as a special case in the golden corpus. A regression in that branch would silently produce `category: ''` findings.

### M2: File Reference Extensions `.xlf` / `.xliff` Not Unit-Tested

**File:** `src/features/parity/helpers/xbenchReportParser.ts:130` / test file MOCK_WORKSHEETS

After CR pre-fix (H2), `FILE_REF_REGEX` was extended to support `.xlf` and `.xliff`:

```typescript
const FILE_REF_REGEX = /^(.+\.(sdlxliff|xlf|xliff))\s*\((\d+)\)$/
```

All MOCK_WORKSHEETS use only `.sdlxliff` references. If the `.xlf`/`.xliff` alternation was accidentally broken (wrong group index, typo), no unit test would catch it.

### M3: Shared Mutable `_activeRows` Without `beforeEach` Reset — Flakiness Risk

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts:85`

```typescript
let _activeRows: unknown[][] = []
```

This module-level variable is set in `xlsx.load()` and read by `getWorksheet().eachRow()`. If a test fails BEFORE its `load()` completes (e.g., the `parseXbenchReport` call itself throws before setting `_activeRows`), the variable retains the previous test's state. Subsequent tests reading `eachRow` would see stale data. No `beforeEach(() => { _activeRows = [] })` reset guards against this. Currently masked by test ordering, but fragile.

### M4: P2 `should detect tabular format` Uses Weak Count Assertion

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts:323`

```typescript
expect(result.findings.length).toBeGreaterThan(0)
```

`mock-xlsx-reordered` has exactly 1 data row. The assertion should be `.toBe(1)`. `toBeGreaterThan(0)` would pass even if the reordered column mock accidentally produced 5 duplicate findings due to a parsing bug.

### M5: Integration Test `toolOnly > 0` Assertion is Potentially Fragile

**File:** `src/__tests__/integration/parity-helpers-real-data.test.ts:224`

```typescript
it('should have engine producing additional findings (toolOnly)', () => {
  expect(comparisonResult.toolOnly.length).toBeGreaterThan(0)
})
```

This test asserts the engine finds MORE than Xbench for the single file `Activity Guide/AP BT Activity Guide.pptx.sdlxliff`. If the engine is updated (rules removed), or if the single file happens to have perfect Xbench coverage of engine findings, this test could flip to fail unexpectedly. The comment in the end-to-end block explains WHY there should be toolOnly, but the single-file block has no such explanation, making it fragile documentation.

---

## LOW Findings

### L1: ATDD Checklist Has Arithmetic Error in Test Count

**File:** `_bmad-output/test-artifacts/atdd-checklist-2-9.md:323`

```
Expected: All 15 tests pass
```

The checklist correctly lists 5 original tests (lines 68-73) + 11 new stubs = 16 total. But the verification command comment says "All 15 tests pass". The story completion notes correctly state 16/16. The discrepancy is a documentation bug — does not affect code quality.

### L2: Stale Phase Header in ATDD Checklist

**File:** `_bmad-output/test-artifacts/atdd-checklist-2-9.md:5-6`

```yaml
Phase: RED
```

All stubs are now active (GREEN phase). The ATDD checklist front-matter was never updated to reflect completion.

### L3: richText Test Does Not Verify `targetText`

**File:** `src/features/parity/helpers/xbenchReportParser.test.ts:307-313`

```typescript
expect(result.findings[0]?.sourceText).toBe('Rich source')
// targetText ('Rich target') is NOT asserted
```

The richText mock has `targetText: 'Rich target'` (plain string). The `getCellText()` helper handles both richText and plain strings. The test verifies only `sourceText` richText parsing — missing the opportunity to verify `targetText` is also correctly read. Low priority since plain-string targetText is covered implicitly by other tests.

### L4: Integration Test Redundancy — Two Tests Assert Same `findings.length > 0`

**File:** `src/__tests__/integration/parity-helpers-real-data.test.ts:90-98` and `121-123`

Test 1 (`should parse the real golden corpus xlsx`) asserts `findings.length > 0`.
Test 2 (`should parse > 0 findings from golden corpus`) in the beforeAll-shared block also asserts `goldenFindings.length > 0`.
These overlap. The second test exists for isolation (runs after beforeAll), but is logically redundant and could be merged with a category-validation test.

---

## AC Coverage Assessment

| AC                          | Coverage                                                                                  | Status                                                |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| AC1 (tabular no regression) | P0+P1 tests pass with mock-xlsx-data                                                      | COVERED — but assertions are weak (H2)                |
| AC2 (sectioned format)      | P0+P1+P2 tests cover sectioned parsing                                                    | MOSTLY COVERED — missing 4 of 7 category markers (M1) |
| AC3 (auto-detect format)    | Tested via behavioral outcome (sectioned produces 2 findings, tabular via reordered mock) | ADEQUATELY COVERED                                    |
| AC4 (workaround removed)    | `readGoldenCorpusXbench` not found in integration test file                               | FULLY COVERED                                         |
| AC5 (malformed/empty)       | P1 malformed throws test + P2 empty-sectioned returns `[]`                                | FULLY COVERED                                         |

## ATDD Compliance

- P0 (2/2): Active, passing
- P1 (6/6 new + 5 original = 11 total): Active, passing
- P2 (3/3): Active, passing
- `it.skip` remaining: 0 — GREEN phase achieved
- Comment says RED phase (H1 issue)

## Mock Correctness Assessment

MOCK_WORKSHEETS column indexing is CORRECT. The mock uses 0-indexed array but `getCell(col)` returns `values[col]` (1-based), matching ExcelJS convention. Verified:

- `values[1]` = colA (section marker or file reference)
- `values[3]` = colC (source text)
- `values[4]` = colD (target text)

FILE_REF_REGEX is correct for mock data. Capture groups: `[1]`=fileName, `[2]`=extension, `[3]`=segmentNumber. Test at line 208 correctly verifies segmentNumber extraction.

Format detection logic verified: `mock-xlsx-sectioned` row 1 = `[undefined]` → all cells null → no tabular markers → correctly returns `'sectioned'`.
