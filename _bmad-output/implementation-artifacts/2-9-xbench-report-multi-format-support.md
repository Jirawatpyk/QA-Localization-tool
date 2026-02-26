# Story 2.9: Xbench Report Multi-format Support

Status: done

## Story

As a QA Reviewer,
I want the tool to parse multiple Xbench report formats,
so that parity comparison works with both standard tabular and sectioned custom report exports.

## Acceptance Criteria

### AC 1: Tabular Format — No Regression

**Given** a Xbench report in standard tabular format (header row in row 1)
**When** the parser processes it
**Then** findings are correctly extracted (existing behavior preserved — no regression)
**And** the output schema is identical to current `XbenchParseResult` type

### AC 2: Sectioned Format — New Support

**Given** a Xbench report in sectioned format (golden corpus custom report)
**When** the parser processes it
**Then** findings are correctly extracted with the **same** output schema as tabular format:
- `findings: XbenchFinding[]`
- `fileGroups: Record<string, XbenchFinding[]>`
**And** LI (Language Inspector) findings are filtered out in sectioned format too
**And** findings are grouped by filename

### AC 3: Auto-detect Format

**Given** a Xbench report of either format
**When** `parseXbenchReport()` is called
**Then** the correct parser is selected automatically (no caller API change)
**And** detection logic inspects row 1: if it contains known column headers ("Source", "Target", "Category", "Severity", "File", "Segment") → tabular; otherwise → sectioned

### AC 4: Remove Integration Test Workaround

**Given** `src/__tests__/integration/parity-helpers-real-data.test.ts` currently contains a local `readGoldenCorpusXbench()` helper as a workaround
**When** Story 2.9 is complete
**Then** `readGoldenCorpusXbench()` is removed and replaced by calling `parseXbenchReport()` directly
**And** all integration tests continue to pass with real golden corpus data

### AC 5: Malformed / Unknown Format

**Given** a malformed xlsx file (corrupted binary, not a valid xlsx)
**When** parsing is attempted
**Then** ExcelJS throws during `workbook.xlsx.load()` — let it propagate (no swallowing)

**Given** a valid xlsx that is an empty sectioned report (no section markers → 0 findings)
**When** parsing completes
**Then** return `{ findings: [], fileGroups: {} }` — empty result is valid, NOT an error

## Tasks / Subtasks

- [x] Task 1: Implement Strategy Pattern in `xbenchReportParser.ts` (AC: #1, #2, #3)
  - [x] 1.1 Extract current logic into `TabularXbenchParser` class/function
  - [x] 1.2 Implement `SectionedXbenchParser` class/function (port `readGoldenCorpusXbench` logic from integration test)
  - [x] 1.3 Implement format auto-detection: `detectXbenchFormat(worksheet): 'tabular' | 'sectioned'`
  - [x] 1.4 Update `parseXbenchReport()` to delegate to the correct parser
  - [x] 1.5 Ensure LI authority filtering applies in both parsers
  - [x] 1.6 Ensure `fileGroups` grouping is applied after both parsers return findings

- [x] Task 2: Update tests in `xbenchReportParser.test.ts` (AC: #1, #2, #3, #5)
  - [x] 2.1 Keep existing 4 tests (tabular format) — verify no regression
  - [x] 2.2 Add MOCK_WORKSHEETS entry for sectioned format
  - [x] 2.3 Add `[P0]` test: auto-detects sectioned format and extracts findings
  - [x] 2.4 Add `[P1]` test: sectioned format groups findings by filename correctly
  - [x] 2.5 Add `[P1]` test: sectioned format filters LI findings
  - [x] 2.6 Add `[P1]` test: sectioned format handles rows 1-12 as preamble (skipped)
  - [x] 2.7 Add `[P1]` test: sectioned format correctly sets `currentCategory` from section markers
  - [x] 2.8 Add `[P2]` test: malformed/empty sectioned format → throws
  - [x] 2.9 Add `[P2]` test: tabular format still auto-detected when row 1 has headers

- [x] Task 3: Remove integration test workaround (AC: #4)
  - [x] 3.1 In `parity-helpers-real-data.test.ts`: remove `readGoldenCorpusXbench()` local helper and `GoldenXbenchFinding` type
  - [x] 3.2 Replace all `readGoldenCorpusXbench(XBENCH_REPORT_PATH)` calls with `parseXbenchReport(buffer)` using `readFileSync(XBENCH_REPORT_PATH)`
  - [x] 3.3 Adapt mapping code in integration test to use `XbenchFinding` type from parser
  - [x] 3.4 Verify all integration tests still pass (run with golden corpus present)

## Dev Notes

### Current State — What Exists

**File:** `src/features/parity/helpers/xbenchReportParser.ts`

Current `parseXbenchReport()` only supports **tabular format**:
- Row 1 = header row (dynamically discovers column positions via `columnMap`)
- Rows 2+ = data rows
- Filters out `authority === 'LI'`
- Returns `{ findings, fileGroups }`

**Format gap documented** in file header comment and in integration test header comment.

### Sectioned Format Structure (from `readGoldenCorpusXbench` workaround)

```
Rows 1–12:  preamble / metadata (skip entirely)
Row 13+:    actual data rows

Row format:
  colA = section marker (e.g., "Tag Mismatch") OR file reference (e.g., "intro.sdlxliff (42)")
  colC = source text
  colD = target text

Section markers (from integration test, canonical list):
  "Inconsistency in Source" or starts with "Inconsistency in Source"
  "Inconsistency in Target"
  "Tag Mismatch"
  "Numeric Mismatch"
  "Repeated Word"
  starts with "Key Term Mismatch"
  → Update currentCategory when colA matches one of these

File reference regex: /^(.+\.sdlxliff)\s*\((\d+)\)$/
  → Match = extract fileName (group 1) and segmentNumber (group 2)
  → Create XbenchFinding with currentCategory as category
```

**Source:** `src/__tests__/integration/parity-helpers-real-data.test.ts` lines 88–126

### Format Detection Strategy

**⚠️ IMPORTANT — Mock Constraint:** The ExcelJS mock in `xbenchReportParser.test.ts` only implements `eachRow`. `worksheet.getRow(n)` is NOT mocked and will throw `TypeError` in unit tests. `detectXbenchFormat` MUST use `eachRow` with an early-stop flag — do NOT use `getRow(1)`.

Row 1 inspection using `eachRow` (mock-compatible):
```typescript
function detectXbenchFormat(worksheet: ExcelJS.Worksheet): 'tabular' | 'sectioned' {
  let result: 'tabular' | 'sectioned' = 'sectioned'
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) return  // only inspect row 1
    const headers = new Set<string>()
    for (let col = 1; col <= 20; col++) {
      const val = row.getCell(col).value
      if (val) headers.add(String(val).toLowerCase().trim())
    }
    const tabularMarkers = ['source', 'target', 'category', 'severity', 'file', 'segment']
    if (tabularMarkers.some(m => headers.has(m))) result = 'tabular'
  })
  return result
}
```

Note: `eachRow` in ExcelJS iterates in row order, so returning early after row 1 is safe. The `result` variable is set before the callback exits row 1.

### Sectioned Parser — LI Filtering + Severity Default

**LI Filtering:** The integration test workaround does NOT filter LI. For Story 2.9, LI filtering MUST apply in sectioned format too — consistent with tabular format behavior.

Sectioned format has no "Authority" column. LI findings appear under a separate section header like "Language Inspector". If no such section exists in the golden corpus, LI filtering is a no-op (acceptable).

```typescript
// Skip rows under "Language Inspector" section in sectioned format
if (colA.toLowerCase().includes('language inspector')) {
  currentCategory = 'LI' // sentinel — skip all rows in this section
  return
}
if (currentCategory === 'LI') return
```

**Severity Default — CRITICAL:** `XbenchFinding.severity` is a required `string` field. Sectioned format has **no severity column**. The `compareFindings` comparator uses `severityWithinTolerance(xf.severity, tf.severity, 1)` — if severity is `''`, `SEVERITY_LEVELS[''] = undefined → -1`, and the function returns `false` → **nothing will match**.

**Must default to `'major'`** — this matches the integration test's existing hardcode (`severity: 'major'`) and sits at `SEVERITY_LEVELS['major'] = 2` (middle of range), giving ±1 tolerance coverage of both major and critical/minor findings.

```typescript
const finding: XbenchFinding = {
  sourceText: getCellText(row.getCell(3)),
  targetText: getCellText(row.getCell(4)),
  category: currentCategory,
  severity: 'major',  // ← default: sectioned format has no severity column
  fileName: fileMatch[1]!,
  segmentNumber: parseInt(fileMatch[2] ?? '0', 10),  // ← safe fallback (see L1 note)
}
```

### `getCellText` Helper

The integration test has a `getCellText()` helper that handles richText cells:
```typescript
function getCellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText: { text: string }[] }).richText
      .map((rt) => rt.text)
      .join('')
      .trim()
  }
  return String(value).trim()
}
```

This helper MUST be ported into `xbenchReportParser.ts` (or a shared helper) — rich text cells are present in the golden corpus and cause plain `.value` reads to return `{ richText: [...] }` objects instead of strings.

### Integration Test Adaptation

**Sheet name vs index:** The existing workaround uses `workbook.getWorksheet('Xbench QA')` (by name). `parseXbenchReport` uses `workbook.getWorksheet(1)` (by index). The golden corpus xlsx has "Xbench QA" as its **first sheet**, so index 1 is safe. No change needed.

After removing `readGoldenCorpusXbench()`:

```typescript
// BEFORE (workaround — file path, sheet by name):
const goldenFindings = await readGoldenCorpusXbench(XBENCH_REPORT_PATH)

// AFTER (buffer, sheet by index — parseXbenchReport handles internals):
const buffer = readFileSync(XBENCH_REPORT_PATH)
const { findings: goldenFindings } = await parseXbenchReport(buffer)
```

**Category field — implicit bug fix:** This migration also fixes a latent bug in the individual file `compareFindings` describe block:
- **Before:** `f.mqmCategory` ("fluency") → `mapXbenchToToolCategory("fluency")` → `"other"` → never matches ← **wrong**
- **After:** `f.category` ("Tag Mismatch") → `mapXbenchToToolCategory("Tag Mismatch")` → `"tag_integrity"` → matches correctly ← **fixed**

The E2E describe block already used `f.category` correctly. After migration, both blocks will be consistent.

**Type mapping:** `GoldenXbenchFinding` had `mqmCategory` field — `XbenchFinding` does not. Replace all `f.mqmCategory` references with `mapXbenchCategory(f.category)` (already imported in the test).

```typescript
// BEFORE: f.mqmCategory
// AFTER:  mapXbenchCategory(f.category)
```

### Strategy Pattern Implementation

Keep `parseXbenchReport()` as the **sole public API** — internal strategies are implementation detail:

```typescript
// src/features/parity/helpers/xbenchReportParser.ts

// ── Internal helpers ──

function getCellText(cell: ExcelJS.Cell): string { ... }
function detectXbenchFormat(worksheet: ExcelJS.Worksheet): 'tabular' | 'sectioned' { ... }
function parseTabular(worksheet: ExcelJS.Worksheet): XbenchFinding[] { ... } // existing logic
function parseSectioned(worksheet: ExcelJS.Worksheet): XbenchFinding[] { ... } // new logic

// ── Public API (unchanged signature) ──
export async function parseXbenchReport(buffer: Uint8Array): Promise<XbenchParseResult> {
  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error ExcelJS Buffer type conflict
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.getWorksheet(1)
  if (!worksheet) throw new Error('No worksheet found in xlsx file')

  const format = detectXbenchFormat(worksheet)
  const rawFindings = format === 'tabular' ? parseTabular(worksheet) : parseSectioned(worksheet)

  // Group by filename (shared logic)
  const fileGroups: Record<string, XbenchFinding[]> = {}
  for (const finding of rawFindings) {
    const group = fileGroups[finding.fileName] ?? []
    group.push(finding)
    fileGroups[finding.fileName] = group
  }

  logger.info(`Parsed Xbench report (${format}): ${rawFindings.length} findings across ${Object.keys(fileGroups).length} files`)

  return { findings: rawFindings, fileGroups }
}
```

### No Schema / DB Changes Required

Story 2.9 is **pure parser logic** — no DB changes, no migrations, no Supabase changes, no Inngest changes. This is a self-contained helper refactor.

### Files To Touch

| File | Action | Reason |
|------|--------|--------|
| `src/features/parity/helpers/xbenchReportParser.ts` | **MODIFY** | Add Strategy Pattern, sectioned parser, format detection, getCellText |
| `src/features/parity/helpers/xbenchReportParser.test.ts` | **MODIFY** | Add sectioned format tests (keep existing 4 passing) |
| `src/__tests__/integration/parity-helpers-real-data.test.ts` | **MODIFY** | Remove `readGoldenCorpusXbench()` workaround, use `parseXbenchReport()` directly |

### Architecture Assumption Checklist (Pre-lock)

- [x] **S1 Routes:** No new routes required — parser is a pure helper function
- [x] **S2 DB Schema:** No schema changes — pure in-memory parsing
- [x] **S3 Radix/E2E:** No UI components — parser only; no E2E tests needed
- [x] **S4 Dependencies:** ExcelJS already installed (`exceljs`) — no new deps
- [x] **S5 Scope:** Story scope is narrow (3 files, no DB, no UI) — clean boundary
- [x] **S6 Type Safety:** `XbenchFinding` and `XbenchParseResult` types are unchanged — no breaking changes
- [x] **S7 Testing:** Unit tests via mock ExcelJS; integration tests require golden corpus

### Testing Approach

**Unit tests** (`xbenchReportParser.test.ts`):

Add a `'mock-xlsx-sectioned'` entry to `MOCK_WORKSHEETS`. The mock uses 1-based column indexing (`values[col]`). Structure:

```javascript
'mock-xlsx-sectioned': [
  // rows 1–12 (array indices 0–11): preamble — all columns undefined
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  [undefined],[undefined],[undefined],[undefined],[undefined],[undefined],
  // row 13 (index 12): category section header — colA (values[1]) = category name
  [undefined, 'Tag Mismatch'],
  // row 14 (index 13): file finding — colA=file ref, colC=source, colD=target
  [undefined, 'chapter1.sdlxliff (5)', undefined, 'Hello world', 'สวัสดีโลก'],
  // row 15 (index 14): new category section
  [undefined, 'Numeric Mismatch'],
  // row 16 (index 15): another file finding
  [undefined, 'intro.sdlxliff (10)', undefined, 'Total: 100', 'รวม: 200'],
],
```

Column index reference (1-based, matches `row.getCell(col)`):
- `values[1]` = colA (section marker or file reference)
- `values[3]` = colC (source text)
- `values[4]` = colD (target text)

**Integration tests** (`parity-helpers-real-data.test.ts`):
- Require golden corpus at `docs/test-data/Golden-Test-Mona/2026-02-24_With_Issues_Mona/Xbench_QA_Report.xlsx`
- Test skips automatically if corpus not present (`describe.skipIf(!hasGoldenCorpus())`)
- After removing workaround, the "should not throw when reading the real golden corpus xlsx" test becomes a positive behavior test (finds findings) not just "doesn't crash"

### Previous Story Intelligence (Story 2.8)

- **ExcelJS `@ts-expect-error`**: Pattern already established in `xbenchReportParser.ts` line 32 — use same comment for any new `workbook.xlsx.load()` calls
- **No audit log for parser changes**: Parser helpers are not state-changing server actions — no audit required
- **No `service_role` needed**: Pure xlsx parsing, no DB writes
- **Test mock pattern**: ExcelJS mock via `vi.mock('exceljs', ...)` with `MOCK_WORKSHEETS` Record and `_activeRows` module-level variable — this pattern is already set up in the test file, extend it (don't replace it)

### Git Intelligence (Recent Work)

Last 10 commits are all Story 2.8 (onboarding tour) fixes. No parity/parser files changed in recent commits. The `xbenchReportParser.ts` and test file are in their original state from Story 2.7 implementation.

### Project Structure Notes

```
src/features/parity/helpers/
├── xbenchReportParser.ts         # MODIFY — add Strategy Pattern
├── xbenchReportParser.test.ts    # MODIFY — add sectioned tests
├── xbenchCategoryMapper.ts       # NO CHANGE
└── xbenchCategoryMapper.test.ts  # NO CHANGE

src/__tests__/integration/
└── parity-helpers-real-data.test.ts  # MODIFY — remove workaround
```

**No new files needed.** Strategy Pattern is implemented as internal functions within the existing `xbenchReportParser.ts` — not as separate files (per "avoid creating helpers for one-time operations" principle from CLAUDE.md).

### References

- Current parser: `src/features/parity/helpers/xbenchReportParser.ts` (all 110 lines)
- Sectioned format workaround: `src/__tests__/integration/parity-helpers-real-data.test.ts` lines 74–126
- ExcelJS richText handling: `src/__tests__/integration/parity-helpers-real-data.test.ts` lines 74–86
- Epic context: `_bmad-output/planning-artifacts/epics/epic-2-file-processing-rule-based-qa-engine.md` Story 2.9 section
- Sprint status: `_bmad-output/implementation-artifacts/sprint-status.yaml` (status: backlog → will update to ready-for-dev)
- Architecture patterns: `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Implementation Plan

**Query Plan — Story 2.9** (pure parser logic — no DB, no actions, no helpers with DB access)
- No DB queries in any changed file — withTenant scan N/A
- No Inngest functions touched — inngest scan N/A

**Key Design Decisions:**
1. Strategy Pattern as internal functions (not classes) — keeps public API unchanged, avoids over-engineering
2. `getCellText()` ported from integration test helper — handles richText cells from golden corpus
3. `detectXbenchFormat()` uses `eachRow` with early-stop (NOT `getRow(1)`) — mock constraint from Dev Notes
4. `parseSectioned()` defaults severity to `'major'` — required for `severityWithinTolerance()` comparator to work
5. Integration test bug fix: `category: f.mqmCategory` (wrong) → `category: f.category` (raw Xbench) — `compareFindings` maps internally via `mapXbenchToToolCategory(xf.category)` at parityComparator.ts:72
6. Removed ExcelJS import from integration test — `getCellText` no longer needed there

### Completion Notes List

- Task 1 ✅: Strategy Pattern implemented in `xbenchReportParser.ts` — `getCellText`, `detectXbenchFormat`, `parseTabular` (extracted), `parseSectioned` (new), all as internal functions. Public API `parseXbenchReport()` unchanged.
- Task 2 ✅: 11 ATDD stubs activated (removed `it.skip()`). 16/16 tests pass (4 existing + 11 new + 1 count note). All MOCK_WORKSHEETS were already added by ATDD — confirmed correct.
- Task 3 ✅: `readGoldenCorpusXbench()`, `GoldenXbenchFinding` type, `getCellText`, and `ExcelJS` import removed from integration test. `parseXbenchReport(buffer)` used directly. `f.category` (raw Xbench) replaces `f.mqmCategory` in compareFindings block — fixes latent bug where `mapXbenchToToolCategory("fluency")` returned `"other"`.
- Pre-CR fixes ✅: code-quality-analyzer returned 0C/2H/3M/2L — fixed H1 (renamed local XbenchReportFinding to distinguish from parity/types.ts XbenchFinding), fixed H2 (FILE_REF_REGEX extended to .sdlxliff|.xlf|.xliff, capture group updated to [3]), fixed M2 (LI sentinel restructured: section markers always update currentCategory, LI check only guards file-ref creation). Post-fix: 16/16 tests pass, type-check clean.
- Pre-existing failures: `ProjectTour.test.tsx` (2 tests) — Story 2.8 flaky test, pre-dates Story 2.9 changes. Confirmed unchanged file.
- Type-check: ✅ no errors | Lint: ✅ no errors (2 warnings in pre-existing HelpMenu.test.tsx)

**ATDD Compliance:** P0 2/2 ✅ | P1 6/6 ✅ | P2 3/3 ✅ | Total 11/11 activated

**Pre-CR Scan Summary:**
- anti-pattern: ✅ 0C/0H/0M — 2L (test file relative import pattern, pre-existing; mock Buffer type — minor)
- tenant-isolation: ✅ CLEAN (pure parser, N/A)
- code-quality: 0C/2H/3M/2L → Fixed H1+H2+M2 → final: 0C/0H/1M/2L (M1=severity string type accepted; M3=comment clarified; L1/L2 accepted)
- rls-policy: SKIPPED (no schema changes)
- inngest-function-validator: SKIPPED (no pipeline/Inngest changes)

### CR R1 (Opus 4.6) — 0C/2H/8M/5L → ALL FIXED

**Findings & Fixes:**
- H1 FIXED: Removed stale "TDD RED PHASE" comment in test file (misleading)
- H2 FIXED: Added catch-all else for unrecognized section markers → `currentCategory = colA` (prevents silent miscategorization)
- M1 FIXED: Extracted magic `12` → `SECTIONED_PREAMBLE_ROWS` constant
- M2 FIXED: Added `.xlf`/`.xliff` file extension test (`mock-xlsx-sectioned-xlf`)
- M3 FIXED: Added `beforeEach` reset for `_activeRows` + `_hasWorksheet` shared state
- M4 FIXED: `parseTabular` now uses `getCellText()` for richText cell support
- M5 FIXED: Added `mock-xlsx-sectioned-all-categories` — all 4 untested branches now covered
- M6 FIXED: Strengthened original 5 tabular tests with exact count + value assertions
- M7 FIXED: Changed loose `toBeGreaterThan(0)` to `.toBe(1)` in P2 tabular detection
- M8 FIXED: Added `mock-xlsx-no-sheet` + `_hasWorksheet` flag + worksheet-null test
- L1 FIXED: ATDD checklist "15 tests" → "16 tests" (5 existing + 11 new)
- L2 FIXED: ATDD Phase: RED → GREEN
- L3 FIXED: Added `targetText` assertion to richText test
- L4 FIXED: Added explanatory comment to integration `toolOnly > 0` test
- L5 ACCEPTED: `severity: string` / `category: string` bare types (pre-existing tech debt, cross-file scope)

**Post-fix:** 19/19 unit tests pass | type-check ✅ | lint ✅ (0 errors)

### CR R2 (Opus 4.6) — 0C/0H/2M/3L → ALL FIXED

**R1 Fix Verification:** 14/14 FIXED + 1 ACCEPTED ✅

**Findings & Fixes:**
- M1 FIXED: Changed 3 strict `===` to `.startsWith()` for Tag Mismatch, Numeric Mismatch, Repeated Word — consistent matching strategy
- M2 FIXED: Added `mock-xlsx-sectioned-unrecognized` + catch-all branch test (`'Double Space'` → passes through)
- L1 FIXED: Removed redundant `.trim()` on `authority` (getCellText already trims)
- L2 ACCEPTED: Integration test repeated golden corpus parse — pre-existing, cross-describe scope
- L3 ACCEPTED: Module-level mutable `_activeRows`/`_hasWorksheet` — mitigated by `beforeEach`, `vi.hoisted()` refactor deferred as tech debt

**Post-fix:** 20/20 unit tests pass | type-check ✅ | lint ✅ (0 errors)

### File List

**Modified files:**
- `src/features/parity/helpers/xbenchReportParser.ts`
- `src/features/parity/helpers/xbenchReportParser.test.ts`
- `src/__tests__/integration/parity-helpers-real-data.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status: ready-for-dev → in-progress → review)
- `_bmad-output/implementation-artifacts/2-9-xbench-report-multi-format-support.md`
- `_bmad-output/test-artifacts/atdd-checklist-2-9.md` (Phase: GREEN, count fixes)
