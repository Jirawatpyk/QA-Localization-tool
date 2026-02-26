---
stepsCompleted: ['step-01-preflight-and-context','step-02-generation-mode','step-03-test-strategy','step-04-generate-tests','step-04c-aggregate','step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-26'
Phase: GREEN
---

# ATDD Checklist — Story 2.9: Xbench Report Multi-format Support

**Date:** 2026-02-26
**Author:** Mona (via Murat — Master Test Architect)
**Primary Test Level:** Unit (Vitest)
**Story ID:** 2.9

---

## Story Summary

The `parseXbenchReport()` function currently supports only standard tabular xlsx format (header in row 1). This story adds support for sectioned format (category section markers + file references, preamble rows 1–12), using auto-detection via row 1 inspection. The integration test workaround (`readGoldenCorpusXbench`) is removed.

**As a** QA Reviewer
**I want** the tool to parse multiple Xbench report formats
**So that** parity comparison works with both standard tabular and sectioned custom report exports

---

## Acceptance Criteria

1. **AC1** — Tabular format: existing behavior preserved (no regression)
2. **AC2** — Sectioned format: parsed correctly with same `XbenchParseResult` schema
3. **AC3** — Auto-detect: correct parser selected automatically based on row 1 inspection
4. **AC4** — Integration test workaround removed; `parseXbenchReport()` used directly
5. **AC5** — Malformed xlsx: ExcelJS throw propagates; empty sectioned result is valid (not error)

---

## Test Level Decision

| Level | Decision | Reason |
|-------|----------|--------|
| E2E (Playwright) | **NONE** | No UI, no routes, pure parser helper |
| API (Playwright) | **NONE** | No HTTP endpoints added |
| Unit (Vitest) | **PRIMARY** | Pure function refactor — unit coverage is ideal |
| Integration (Vitest) | **SECONDARY** | Golden corpus test cleanup (skip if corpus absent) |

---

## Failing Tests — RED Phase

### Unit Tests (Vitest) — `src/features/parity/helpers/xbenchReportParser.test.ts`

All new tests added as `it.skip()` stubs — will fail until `parseSectioned()` + `detectXbenchFormat()` are implemented.

| # | Test | Priority | AC |
|---|------|---------|-----|
| 1 | `[P0] should auto-detect sectioned format and extract findings` | P0 | AC2, AC3 |
| 2 | `[P0] should still parse tabular format after Strategy Pattern refactor` | P0 | AC1, AC3 |
| 3 | `[P1] should group sectioned findings by filename` | P1 | AC2 |
| 4 | `[P1] should filter LI findings in sectioned format` | P1 | AC2 |
| 5 | `[P1] should default severity to 'major' in sectioned format` | P1 | AC2 |
| 6 | `[P1] should skip preamble rows 1–12 in sectioned format` | P1 | AC2 |
| 7 | `[P1] should set currentCategory from section markers in sectioned format` | P1 | AC2 |
| 8 | `[P1] should propagate ExcelJS throw on malformed xlsx` | P1 | AC5 |
| 9 | `[P2] should return empty result for valid xlsx with no section markers` | P2 | AC5 |
| 10 | `[P2] should handle richText cell values in sectioned format` | P2 | AC2 |
| 11 | `[P2] should detect tabular format when row 1 has column headers` | P2 | AC3 |

**Existing 5 tests** (must keep passing — no `it.skip()`):
- `[P0] should discover column names dynamically from header row`
- `[P1] should group findings by filename`
- `[P1] should apply authority rules: Original > Updated, ignore LI`
- `[P1] should handle malformed xlsx with graceful error`
- `[P1] should parse correctly even with reordered columns`

---

## Generated Test Stubs

### File: `src/features/parity/helpers/xbenchReportParser.test.ts` (additions only)

Add the following to the existing `MOCK_WORKSHEETS` and `describe` block:

```typescript
// ── ADD to MOCK_WORKSHEETS (after 'mock-xlsx-reordered') ──

'mock-xlsx-sectioned': [
  // rows 1–12 (indices 0–11): preamble — skip entirely
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  // row 13 (index 12): category section header — colA (values[1])
  [undefined, 'Tag Mismatch'],
  // row 14 (index 13): file finding — colA=ref, colC=source, colD=target
  [undefined, 'chapter1.sdlxliff (5)', undefined, 'Hello world', 'สวัสดีโลก'],
  // row 15 (index 14): second category
  [undefined, 'Numeric Mismatch'],
  // row 16 (index 15): second finding (different file)
  [undefined, 'intro.sdlxliff (10)', undefined, 'Total: 100', 'รวม: 200'],
],

'mock-xlsx-sectioned-li': [
  // rows 1–12: preamble
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  // row 13: normal category
  [undefined, 'Tag Mismatch'],
  [undefined, 'chapter1.sdlxliff (5)', undefined, 'Hello', 'สวัสดี'],
  // row 15: LI section header — should be skipped
  [undefined, 'Language Inspector'],
  [undefined, 'intro.sdlxliff (1)', undefined, 'LI source', 'LI target'],
],

'mock-xlsx-sectioned-richtext': [
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  [undefined, 'Tag Mismatch'],
  // colC is richText object instead of plain string
  [undefined, 'chapter1.sdlxliff (3)', undefined,
    { richText: [{ text: 'Rich ' }, { text: 'source' }] }, 'Rich target'],
],

'mock-xlsx-sectioned-empty': [
  // rows 1–12: preamble
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  // row 13+: no section markers, no findings
  [undefined, 'Some other content'],
  [undefined, 'No file references here'],
],
```

```typescript
// ── ADD to describe('xbenchReportParser') block ──

describe('sectioned format (Strategy Pattern)', () => {
  // ── P0: Auto-detection ──

  it.skip('[P0] should auto-detect sectioned format and extract findings', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // Should successfully extract findings from sectioned format
    expect(result.findings.length).toBe(2)
    expect(result.findings[0]?.category).toBe('Tag Mismatch')
    expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
    expect(result.findings[0]?.segmentNumber).toBe(5)
    expect(result.findings[1]?.category).toBe('Numeric Mismatch')
    expect(result.findings[1]?.fileName).toBe('intro.sdlxliff')
  })

  it.skip('[P0] should still parse tabular format after Strategy Pattern refactor', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    // Uses existing 'mock-xlsx-data' — tabular format must still work
    const mockBuffer = Buffer.from('mock-xlsx-data')
    const result = await parseXbenchReport(mockBuffer)

    // Tabular: 3 rows - 1 LI = 2 findings
    expect(result.findings.length).toBe(2)
    expect(result.findings[0]?.sourceText).toBe('Test source')
    expect(result.findings[0]?.category).toBe('Key Term Mismatch')
  })

  // ── P1: Sectioned format behavior ──

  it.skip('[P1] should group sectioned findings by filename', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    expect(Object.keys(result.fileGroups)).toContain('chapter1.sdlxliff')
    expect(Object.keys(result.fileGroups)).toContain('intro.sdlxliff')
    expect(result.fileGroups['chapter1.sdlxliff']?.length).toBe(1)
    expect(result.fileGroups['intro.sdlxliff']?.length).toBe(1)
  })

  it.skip('[P1] should filter LI (Language Inspector) findings in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-li')
    const result = await parseXbenchReport(mockBuffer)

    // Only 1 finding (Tag Mismatch); LI section findings are filtered
    expect(result.findings.length).toBe(1)
    expect(result.findings[0]?.category).toBe('Tag Mismatch')
    // No finding with LI source text
    const liFindings = result.findings.filter(f => f.sourceText === 'LI source')
    expect(liFindings.length).toBe(0)
  })

  it.skip('[P1] should default severity to "major" for sectioned format findings', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // All sectioned findings must have severity 'major' (no severity column in sectioned format)
    for (const finding of result.findings) {
      expect(finding.severity).toBe('major')
    }
  })

  it.skip('[P1] should skip preamble rows 1–12 in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // If preamble rows were NOT skipped, parser might try to match row 1-12 as file references
    // and produce wrong findings or crash. Correct: exactly 2 findings from rows 14 and 16.
    expect(result.findings.length).toBe(2)
    // None of the findings should have empty/undefined fileName
    for (const finding of result.findings) {
      expect(finding.fileName).toBeTruthy()
      expect(finding.segmentNumber).toBeGreaterThan(0)
    }
  })

  it.skip('[P1] should set currentCategory from section markers in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // Row 13 = "Tag Mismatch" → finding at row 14 gets category "Tag Mismatch"
    // Row 15 = "Numeric Mismatch" → finding at row 16 gets category "Numeric Mismatch"
    expect(result.findings[0]?.category).toBe('Tag Mismatch')
    expect(result.findings[1]?.category).toBe('Numeric Mismatch')
  })

  it.skip('[P1] should propagate ExcelJS throw on malformed xlsx in sectioned parse path', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    // 'this is not xlsx data' triggers ExcelJS load error
    const malformedBuffer = Buffer.from('this is not xlsx data')
    await expect(parseXbenchReport(malformedBuffer)).rejects.toThrow()
  })

  // ── P2: Edge cases ──

  it.skip('[P2] should return empty result for valid xlsx with no section markers', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-empty')
    const result = await parseXbenchReport(mockBuffer)

    // Empty sectioned format → valid, not an error
    expect(result.findings).toEqual([])
    expect(result.fileGroups).toEqual({})
  })

  it.skip('[P2] should handle richText cell values in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-richtext')
    const result = await parseXbenchReport(mockBuffer)

    // richText { richText: [{text:'Rich '},{text:'source'}] } → 'Rich source'
    expect(result.findings[0]?.sourceText).toBe('Rich source')
  })

  it.skip('[P2] should detect tabular format when row 1 contains column headers', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    // 'mock-xlsx-reordered' has row 1 with "File", "Category", "Source", "Target", "Severity"
    const mockBuffer = Buffer.from('mock-xlsx-reordered')
    const result = await parseXbenchReport(mockBuffer)

    // Should parse via tabular path → find findings (not treat as sectioned with preamble)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.findings[0]?.sourceText).toBe('Apple text')
  })
})
```

---

## Integration Test Documentation

### File: `src/__tests__/integration/parity-helpers-real-data.test.ts`

No new `it.skip()` stubs needed in the integration test file — Task 3 is a **refactor** of the existing test (remove `readGoldenCorpusXbench` workaround), not addition of new tests.

The existing integration tests will continue to pass after Task 3 because:
- `parseXbenchReport(buffer)` now correctly parses sectioned format (via Task 1)
- All `compareFindings` calls now use `f.category` (raw Xbench) — which is the correct input to `mapXbenchToToolCategory`

**Verification command** (requires golden corpus at `docs/test-data/Golden-Test-Mona/`):
```bash
npx vitest run src/__tests__/integration/parity-helpers-real-data.test.ts
```

---

## Priority Coverage Summary

| Priority | Count | AC Coverage |
|---------|-------|------------|
| P0 | 2 | AC1, AC2, AC3 |
| P1 | 6 | AC2, AC3, AC5 |
| P2 | 3 | AC2, AC3, AC5 |
| **Total new stubs** | **11** | All ACs covered |

---

## Implementation Checklist (TDD Green Phase)

Remove `it.skip()` as you implement each task:

### Task 1 (AC: #1, #2, #3) → Makes P0 + P1 tests pass

- [ ] 1.1 Extract tabular logic → `parseTabular(worksheet): XbenchFinding[]`
- [ ] 1.2 Port `readGoldenCorpusXbench` → `parseSectioned(worksheet): XbenchFinding[]`
  - Skip rows 1–12 (`if (rowNumber <= 12) return`)
  - Detect section markers → `currentCategory`
  - Detect LI section → `currentCategory = 'LI'`; skip while `currentCategory === 'LI'`
  - File reference regex: `/^(.+\.sdlxliff)\s*\((\d+)\)$/`
  - Default `severity: 'major'` for all sectioned findings
  - Use `getCellText(cell)` for colC (source) and colD (target)
- [ ] 1.3 Implement `detectXbenchFormat(worksheet): 'tabular' | 'sectioned'`
  - **MUST use `eachRow` with early-stop** (NOT `getRow(1)` — not in ExcelJS mock)
  - Check row 1 for tabular markers: `['source','target','category','severity','file','segment']`
- [ ] 1.4 Add `getCellText(cell)` helper to handle richText cells
- [ ] 1.5 Update `parseXbenchReport()` to delegate to detected format
- [ ] 1.6 Verify `fileGroups` grouping is shared logic applied after both parsers

**Run to verify after Task 1:**
```bash
npx vitest run src/features/parity/helpers/xbenchReportParser.test.ts
```

Expected: All 16 tests pass (5 existing + 11 new)

---

### Task 2 (AC: #1, #2, #3, #5) → Activate `it.skip()` stubs

- [ ] 2.1 Add `MOCK_WORKSHEETS` entries: `mock-xlsx-sectioned`, `mock-xlsx-sectioned-li`, `mock-xlsx-sectioned-richtext`, `mock-xlsx-sectioned-empty`
- [ ] 2.2–2.9 Remove `it.skip()` from each test and verify pass

---

### Task 3 (AC: #4) → Integration test refactor

- [ ] 3.1 Remove `readGoldenCorpusXbench()` and `GoldenXbenchFinding` from integration test
- [ ] 3.2 Replace with `readFileSync(XBENCH_REPORT_PATH)` + `parseXbenchReport(buffer)`
- [ ] 3.3 Replace `f.mqmCategory` with `mapXbenchCategory(f.category)` in individual file test
- [ ] 3.4 Verify `parseXbenchReport(buffer)` correctly parses golden corpus sectioned format

**Run to verify after Task 3 (requires golden corpus):**
```bash
npx vitest run src/__tests__/integration/parity-helpers-real-data.test.ts
```

---

## Running Tests

```bash
# Run unit tests for this story
npx vitest run src/features/parity/helpers/xbenchReportParser.test.ts

# Run all unit tests (regression check)
npm run test:unit

# Run integration test (requires golden corpus)
npx vitest run src/__tests__/integration/parity-helpers-real-data.test.ts

# Watch mode during development
npx vitest --project unit src/features/parity/helpers/xbenchReportParser.test.ts
```

---

## RED Phase Verification

**Current state** (before implementation):
- Existing 4 tests: ✅ PASS (tabular format)
- New 11 stubs: ⏭️ SKIP (intentionally — TDD red phase)

**After implementation** (green phase):
- All 15 tests: ✅ PASS

---

## Failure Mode Analysis (Pre-mortem)

| Risk | Mitigation |
|------|-----------|
| `detectXbenchFormat` uses `getRow(1)` → TypeError in unit tests | Story notes explicitly say use `eachRow` |
| `severity` left empty → `compareFindings` never matches | Story notes say default `'major'` |
| `parseInt(fileMatch[2]!, 10)` → NaN on undefined | Story notes say `?? '0'` fallback |
| richText cells return `{ richText: [...] }` not string | `getCellText()` helper required |
| `readGoldenCorpusXbench` still remains after Task 3 | Task 3 explicitly removes it |
| `f.mqmCategory` used after switch → category mismatch | Story notes explicit fix: use `f.category` |

---

**Generated by Murat (TEA Agent)** — 2026-02-26
**Story:** 2.9 | **Phase:** RED → GREEN (after implementation)
