---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-26'
---

# ATDD Checklist - Epic 2, Story 2.10: Parity Verification Sprint

**Date:** 2026-02-26
**Author:** Murat (Test Architect)
**Primary Test Level:** Integration (Vitest, node environment, 60s timeout)
**Secondary Test Level:** Unit/Performance (Vitest, node environment, 15s timeout)

---

## Story Summary

Verify the L1 rule engine against real Xbench golden corpus data with measured parity percentages, formal performance benchmarks, and all gaps fixed. This is the BLOCKER for Epic 3.

**As a** Project Lead (Mona)
**I want** the L1 rule engine verified against real Xbench golden corpus data
**So that** I can confidently sign off that our tool matches or exceeds Xbench quality

---

## Acceptance Criteria

1. **AC1:** Tier 1 Golden Corpus Parity ≥ 99.5% (8 SDLXLIFF EN→TH, 371 Xbench findings)
2. **AC2:** Tier 2 Multi-Language Parity measured (7 languages, measurement only)
3. **AC3:** NFR2 Performance Test (5,000 segments < 5 seconds, boundary tests)
4. **AC4:** Fix all genuine Xbench-only gaps (scope cap: 10 fixes)
5. **AC5:** Parity Report for Mona sign-off
6. **AC6:** False Positive Baseline (clean corpus, 14 SDLXLIFF zero-issue files)

---

## Test Strategy & Priority Matrix

| AC | Test Level | Priority | Risk | Test File |
|----|-----------|----------|------|-----------|
| AC1 | Integration | **P0** | CRITICAL — parity % unknown | `golden-corpus-parity.test.ts` (enhance existing) |
| AC3 | Unit/Perf | **P0** | HIGH — NFR2 never tested formally | `ruleEngine.perf.test.ts` (new) |
| AC6 | Integration | **P1** | MEDIUM — false positives unmeasured | `clean-corpus-baseline.test.ts` (new) |
| AC2 | Integration | **P1** | HIGH — multi-lang untested | `tier2-multilang-parity.test.ts` (new) |
| AC4 | Unit | **P1** | Conditional — only if gaps found | Rule engine check files (modify existing) |
| AC5 | N/A | **P2** | LOW — document output only | Manual verification |

---

## Failing Tests Created (RED Phase)

### Integration Tests — AC1: Tier 1 Parity (P0)

**File:** `src/__tests__/integration/golden-corpus-parity.test.ts` (enhance existing)

**New `it.skip()` stubs to ADD inside existing describe block:**

- **P0** `it.skip('should achieve ≥ 99.5% overall parity (matched/totalXbench × 100)')`
  - Status: RED — parity formula not yet asserted
  - Verifies: Overall parity % with explicit formula

- **P0** `it.skip('should produce per-check-type breakdown with parity % per category')`
  - Status: RED — per-category tracking not implemented
  - Verifies: AC1 breakdown table (6 categories)

- **P0** `it.skip('should categorize every Xbench-only finding as fixable or architectural difference')`
  - Status: RED — categorization logic not implemented
  - Verifies: AC1 + AC4 gap analysis

- **P1** `it.skip('should NOT skip when GOLDEN_CORPUS_PATH env var is set')`
  - Status: RED — env var support not implemented
  - Verifies: CI-safe execution strategy

### Unit/Performance Tests — AC3: NFR2 (P0)

**File:** `src/features/pipeline/engine/__tests__/ruleEngine.perf.test.ts` (new file)

- **P0** `it.skip('should process 5,000 segments in < 5,000ms with all 17 checks enabled')`
  - Status: RED — perf test not yet created
  - Verifies: NFR2 hard limit

- **P0** `it.skip('should warn when processing takes > 3,000ms (early regression detection)')`
  - Status: RED — warning threshold not implemented
  - Verifies: Early warning before NFR2 breach

- **P1** `it.skip('should process 0 segments without error')`
  - Status: RED — boundary test
  - Verifies: Empty input handling

- **P1** `it.skip('should process 1 segment correctly')`
  - Status: RED — boundary test
  - Verifies: Minimum input

- **P1** `it.skip('should process 4,999 segments in < 5,000ms')`
  - Status: RED — boundary test
  - Verifies: Just-under boundary

- **P1** `it.skip('should process 5,001 segments in < 5,000ms with margin')`
  - Status: RED — boundary test
  - Verifies: Just-over boundary still meets NFR2

### Integration Tests — AC6: False Positive Baseline (P1)

**File:** `src/__tests__/integration/clean-corpus-baseline.test.ts` (new file)

- **P1** `it.skip('should process 14 clean SDLXLIFF files and document finding count')`
  - Status: RED — clean corpus test not yet created
  - Verifies: False positive measurement

- **P1** `it.skip('should categorize false positives by check type')`
  - Status: RED — categorization not implemented
  - Verifies: Per-check-type false positive breakdown

- **P2** `it.skip('should flag if false positive count exceeds 20')`
  - Status: RED — threshold alert not implemented
  - Verifies: Unreasonable false positive detection

### Integration Tests — AC2: Tier 2 Multi-Language (P1)

**File:** `src/__tests__/integration/tier2-multilang-parity.test.ts` (new file)

- **P1** `it.skip('should discover all SDLXLIFF files in NCR corpus per language')`
  - Status: RED — multi-lang discovery not implemented
  - Verifies: File discovery across 7 language dirs

- **P1** `it.skip('should produce per-language parity percentage')`
  - Status: RED — per-language comparison not implemented
  - Verifies: AC2 measurement output

- **P1** `it.skip('should skip non-SDLXLIFF files (VTT, Excel) and document reason')`
  - Status: RED — format filtering not implemented
  - Verifies: Graceful handling of unsupported formats

- **P2** `it.skip('should flag languages with parity < 90% for investigation')`
  - Status: RED — threshold alert not implemented
  - Verifies: Low-parity early warning

### Regression Tests — AC4: Gap Fixes (P1, Conditional)

**File:** Rule engine check files under `src/features/pipeline/engine/checks/` (modify existing)

- **P1** `it.skip('should detect [gap finding description] that Xbench catches')` (×N, one per gap found)
  - Status: RED — gap fixes not yet implemented
  - Verifies: Each genuine detection gap is fixed
  - NOTE: These stubs are created AFTER V1/V2 gap analysis identifies specific gaps

---

## Data Factories Required

### Synthetic Segment Factory (for perf test)

**File:** `src/test/factories.ts` (extend existing)

**New export:**

- `buildPerfSegments(count: number): SegmentRecord[]` — Generate deterministic segment dataset
  - 60% normal text (realistic patterns from golden corpus)
  - 10% with inline tags (`<g id="1">`, `<x id="2"/>`)
  - 10% with numbers and currencies
  - 5% with placeholders (`{0}`, `%s`, `%d`)
  - 10% Thai/CJK text with Intl.Segmenter-relevant content
  - 5% edge cases (empty target, very long text, special chars)

**Requirements:**
- Deterministic: same output every call (use seeded faker or static templates)
- Realistic: patterns extracted from golden corpus, not random gibberish
- No network or file I/O — pure in-memory generation

---

## Fixtures Created

### Golden Corpus Fixture (enhanced)

**File:** `src/__tests__/integration/fixtures/golden-corpus.fixture.ts` (if needed)

**Fixture:**
- `goldenCorpusData` — Pre-parsed SDLXLIFF + Xbench findings, cached across tests
  - Setup: Parse 8 SDLXLIFF files + Xbench report once
  - Provides: `{ segments, engineFindings, xbenchFindings, fileMap }`
  - Cleanup: None (read-only)

**Note:** If existing tests already handle parsing inline, this fixture is OPTIONAL. Prefer reusing existing patterns over creating new abstraction.

---

## Mock Requirements

### Existing Mocks (reuse from golden-corpus-parity.test.ts)

- `vi.mock('server-only', () => ({}))` — SSR guard bypass
- `vi.mock('@/lib/audit/writeAuditLog')` — Audit log suppression
- `vi.mock('@/lib/logger')` — Logger suppression
- `vi.mock('@/features/glossary/glossaryMatcher')` — Glossary term injection

**No new mock requirements** — Story 2.10 tests run against real data, not mocked services.

---

## Required data-testid Attributes

**None** — Story 2.10 has no UI components. All tests are backend integration/unit tests.

---

## Implementation Checklist

### Test Group 1: AC1 Tier 1 Parity (P0) — 4 tests

**File:** `src/__tests__/integration/golden-corpus-parity.test.ts`

**Tasks to make these tests pass:**

- [ ] Add env var `GOLDEN_CORPUS_PATH` support to `hasGoldenCorpus()` function
- [ ] Add parity % calculation: `const parityPct = (matched / totalXbench) * 100`
- [ ] Add strict assertion: `expect(parityPct).toBeGreaterThanOrEqual(99.5)`
- [ ] Add per-category tracking object: `Record<string, { xbench: number, matched: number, gap: number }>`
- [ ] Add categorization for each Xbench-only finding (fixable vs architectural difference)
- [ ] Remove `it.skip()` from all 4 tests
- [ ] Run: `npx vitest run --project integration src/__tests__/integration/golden-corpus-parity.test.ts`
- [ ] All 4 tests pass (green phase)

### Test Group 2: AC3 NFR2 Performance (P0) — 6 tests

**File:** `src/features/pipeline/engine/__tests__/ruleEngine.perf.test.ts`

**Tasks to make these tests pass:**

- [ ] Create perf test file with Vitest setup (node environment)
- [ ] Implement `buildPerfSegments(count)` factory function
- [ ] Import and call rule engine directly (no DB, no Inngest)
- [ ] Use `performance.now()` for timing
- [ ] Assert `< 5000ms` hard fail, log warning at `> 3000ms`
- [ ] Implement boundary tests (0, 1, 4999, 5000, 5001 segments)
- [ ] Remove `it.skip()` from all 6 tests
- [ ] Run: `npx vitest run src/features/pipeline/engine/__tests__/ruleEngine.perf.test.ts`
- [ ] All 6 tests pass (green phase)
- [ ] Run 3x consecutively to verify no flakiness

### Test Group 3: AC6 False Positive Baseline (P1) — 3 tests

**File:** `src/__tests__/integration/clean-corpus-baseline.test.ts`

**Tasks to make these tests pass:**

- [ ] Create new integration test file
- [ ] Reuse mock pattern from golden-corpus-parity.test.ts (server-only, audit, logger)
- [ ] Parse 14 clean SDLXLIFF files from `2026-02-24_Studio_No_issues_Mona/`
- [ ] Run L1 engine with all 17 checks
- [ ] Count and categorize findings per check type
- [ ] Log false positive summary to stderr (diagnostic output)
- [ ] Remove `it.skip()` from all 3 tests
- [ ] Run: `npx vitest run --project integration src/__tests__/integration/clean-corpus-baseline.test.ts`
- [ ] All 3 tests pass (green phase)

### Test Group 4: AC2 Tier 2 Multi-Language (P1) — 4 tests

**File:** `src/__tests__/integration/tier2-multilang-parity.test.ts`

**Tasks to make these tests pass:**

- [ ] Create new integration test file
- [ ] Implement language directory discovery from NCR corpus path
- [ ] Filter to SDLXLIFF files only (skip VTT, Excel)
- [ ] Per-language: parse → L1 engine → compare with Xbench report
- [ ] Handle both tabular and sectioned Xbench report formats
- [ ] Calculate per-language parity %
- [ ] Flag languages < 90% for investigation
- [ ] Remove `it.skip()` from all 4 tests
- [ ] Run: `npx vitest run --project integration src/__tests__/integration/tier2-multilang-parity.test.ts`
- [ ] All 4 tests pass (green phase)

### Test Group 5: AC4 Gap Fix Regression (P1, Conditional) — N tests

**File:** Rule engine check files (determined after V1/V2 analysis)

**Tasks (conditional — only if V1/V2 finds genuine gaps):**

- [ ] Analyze V1/V2 Xbench-only findings list
- [ ] For each genuine gap: create `it.skip()` stub in relevant check test file
- [ ] Fix rule engine check to detect the gap finding
- [ ] Verify fix is GENERIC (not corpus-specific)
- [ ] Remove `it.skip()`, run test, verify green
- [ ] Run full test suite: `npm run test:unit` — all 1,500+ tests still pass (regression gate)

### Test Group 6: AC5 Parity Report (P2) — Manual

**No automated test.** Report is a markdown document verified by Mona.

- [ ] Generate `_bmad-output/implementation-artifacts/parity-report-{date}.md`
- [ ] Include: Tier 1 parity %, per-category breakdown, Tier 2 per-language, NFR2 result, gap analysis, false positive baseline
- [ ] Deliver to Mona for sign-off

---

## Running Tests

```bash
# Run all parity integration tests
npx vitest run --project integration src/__tests__/integration/golden-corpus*.test.ts src/__tests__/integration/clean-corpus*.test.ts src/__tests__/integration/tier2*.test.ts

# Run performance test
npx vitest run src/features/pipeline/engine/__tests__/ruleEngine.perf.test.ts

# Run specific test file
npx vitest run --project integration src/__tests__/integration/golden-corpus-parity.test.ts

# Run all tests (regression gate)
npm run test:unit

# Run with verbose output
npx vitest run --project integration --reporter=verbose
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All 17+ test stubs written with `it.skip()`
- Factory extension designed (`buildPerfSegments`)
- Mock patterns documented (reuse existing)
- Implementation checklist created with 6 test groups
- Priority: P0 (AC1 + AC3) → P1 (AC2 + AC4 + AC6) → P2 (AC5)

**Verification:**

- All tests have `it.skip()` — will skip (not fail, not pass)
- Test structure follows existing golden-corpus patterns
- No new libraries needed

---

### GREEN Phase (DEV Team)

**Execution order:**

1. **P0 first:** AC1 (Tier 1 parity) + AC3 (NFR2 perf) — these are blockers
2. **P1 next:** AC6 (false positive baseline) → AC2 (multi-lang) → AC4 (gap fixes)
3. **P2 last:** AC5 (report generation)

**Key principle:** Remove ONE `it.skip()` at a time, implement, verify green, move on.

---

### REFACTOR Phase

After all tests pass:
- Ensure no duplicated test setup (extract shared fixtures if needed)
- Verify all tests < 60s timeout (integration) or < 15s (unit)
- Run full regression: `npm run test:unit` — all 1,500+ tests pass
- Generate parity report

---

## Test Count Summary

| Priority | Test Group | Tests | Level |
|----------|-----------|-------|-------|
| P0 | AC1 Tier 1 Parity | 4 | Integration |
| P0 | AC3 NFR2 Performance | 6 | Unit/Perf |
| P1 | AC6 False Positive Baseline | 3 | Integration |
| P1 | AC2 Tier 2 Multi-Language | 4 | Integration |
| P1 | AC4 Gap Fix Regression | TBD | Unit |
| P2 | AC5 Report | 0 (manual) | N/A |
| | **Total** | **17+** | |

**P0 (must pass):** 10 tests
**P1 (should pass):** 7+ tests
**P2 (nice-to-have):** manual only

---

## Notes

- Story 2.10 is unique: the "implementation" IS the tests + report. ATDD stubs are placeholders for enhanced assertions and new test files.
- Existing 4 integration test files contain valuable patterns — REUSE, don't recreate.
- Perf test must use deterministic data — no flakiness allowed.
- AC4 gap fix tests are CONDITIONAL: only created after V1/V2 analysis reveals gaps.
- All rule engine fixes must be generic (no golden-corpus-specific hacks).
- Regression gate: `npm run test:unit` must pass after ANY rule engine changes.

---

**Generated by BMad TEA Agent (Murat)** - 2026-02-26
