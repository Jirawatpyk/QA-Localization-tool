# Story 2.9 — Xbench Report Multi-format Support CR R1 (Updated)

**Date:** 2026-02-26 (updated after pre-CR fixes)
**Files reviewed:** 3 (xbenchReportParser.ts, xbenchReportParser.test.ts, parity-helpers-real-data.test.ts)
**Scope:** Pure parser refactor — no DB, no UI, no Inngest
**Tests:** 16/16 pass, type-check clean

## Pre-CR Fixes Applied (before this review)

- H1 (old): XbenchFinding renamed to XbenchReportFinding — FIXED
- H2 (old): FILE_REF_REGEX extended to .sdlxliff|.xlf|.xliff — FIXED (capture groups shifted)
- S1 (old): LI sentinel restructured — guard on file-ref creation only, section markers always update — FIXED

## R1 Summary (post pre-CR fixes): 0C / 4H / 4M / 3L

### HIGH (must fix)

- **H1:** parseSectioned section marker matching inconsistency — 3 markers use strict `===` (Tag Mismatch, Numeric Mismatch, Repeated Word) while 3 use `.includes()`/`.startsWith()`. "Tag Mismatch (3 entries)" won't match strict equality.
- **H2:** Unrecognized Xbench categories (Double Space, Untranslated, Target same as Source, Spell Check, Double Blank) silently ignored — findings inherit previous section's category. xbenchCategoryMapper supports these but parseSectioned doesn't recognize them.
- **H3:** `severity: string` bare type on XbenchReportFinding — pre-existing Guardrail #3 violation
- **H4:** `category: string` bare type — acceptable for forward-compatibility but noted

### MEDIUM

- **M1:** `_activeRows` shared mutable state in test file — acceptable for now
- **M2:** Mock `getWorksheet()` never returns undefined — error path untested
- **M3:** `detectXbenchFormat` iterates all rows despite needing only row 1 — eachRow can't break early (documented constraint)
- **M4:** Magic number 12 for preamble rows — should be named constant

### LOW

- **L1:** Stale "TDD RED PHASE" comment in test file
- **L2:** `parseTabular` doesn't use `getCellText()` — richText cells in tabular format would produce "[object Object]"
- **L3:** `process.cwd()` in integration test — acceptable for fs paths

### Positive Highlights

- Strategy Pattern as internal functions — clean, no breaking API change
- LI filtering design fixed from spec (guard on file-ref creation, not early return)
- ATDD 11/11 compliance
- Integration test cleanup removed workaround correctly
- @ts-expect-error pattern correct per Guardrail #15
- Named exports only, @/ imports, logger usage

### Key Pattern: XbenchFinding Type Fragmentation (pre-existing)

Three separate `XbenchFinding` types with different schemas:

1. `xbenchReportParser.ts` — `XbenchReportFinding`: fileName, segmentNumber, category, authority?
2. `parityComparator.ts` — `XbenchFinding`: fileName, segmentNumber, category (no authority)
3. `types.ts` — `XbenchFinding`: file, segment(string), checkType, description (completely different!)
   --> Add to tech debt tracker: consolidate to single SSOT
