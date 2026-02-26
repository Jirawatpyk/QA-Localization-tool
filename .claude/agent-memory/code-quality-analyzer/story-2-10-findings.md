# Story 2.10 — Parity Verification CR Findings

## R1 (2026-02-26): 2C / 6H / 5S

### Critical

- **C1** `buildPerfSegments` invalid UUIDs — FIXED in R2 (now uses `00000000-0000-4000-8000-*` valid UUID v4)
- **C2** Dead import `parseXbenchReport` in tier2-multilang-parity.test.ts — FIXED in R2 (removed)

### High

- **H1** `toSegmentRecord()` duplicated 6x across integration tests — OPEN (tech debt, extract to factories.ts)
- **H2** Mock block (server-only, writeAuditLog, logger, glossaryCache) duplicated 4+ files — OPEN (create shared setup.ts)
- **H3** `process.env['GOLDEN_CORPUS_PATH']` direct access — FIXED (ESLint exemption added for integration tests)
- **H4** `computePerFindingParity()` called 3x with same data — OPEN (compute once in beforeAll)
- **H5** Missing `/// <reference types="vitest/globals" />` in 3 of 4 new test files — OPEN
- **H6** Local `XbenchFinding` type fragmentation (Anti-pattern #15) — OPEN (tech debt)

### Suggestions

- **S1** No warmup run in perf test — OPEN
- **S2** Duplicate `buildPerfSegments(5000)` in 2 perf tests — OPEN
- **S3** `expect(allFindings.length).toBeDefined()` meaningless assertion — OPEN
- **S4** `ENGINE_TO_MQM` map missing 4 RuleCategory entries — OPEN (use `satisfies Record<RuleCategory, string>`)
- **S5** `buildPerfSegments` word count uses `split(' ')` — OPEN (English source only, acceptable for now)

## R2 (2026-02-26): 0C / 5H / 7S

R1 Critical findings C1+C2 verified FIXED. No new Critical findings.

### High (R2)

- **H1-H3** carryover from R1 — DRY violations (toSegmentRecord 6x, mock 4x, computePerFindingParity 3x)
- **H4** Missing `/// <reference types="vitest/globals" />` (3 files) — inconsistent with 7 existing files
- **H5** `ENGINE_TO_MQM` missing 4 RuleCategory entries — no compile-time safety for new categories

### Suggestions (R2)

- **S1** JIT warmup run needed in perf test
- **S2** Dedup `buildPerfSegments(5000)` — create once in beforeAll
- **S3** `expect(allFindings.length).toBeDefined()` — meaningless assertion
- **S4** XbenchFinding type fragmentation continues (now 4+ definitions)
- **S5** `buildPerfSegments` wordCount uses `split(' ')` — English-only is fine, add comment
- **S6** `getCellText` + `readXbenchReport` duplicated 3-4x — extract to shared helper
- **S7** `discoverSdlxliffFiles` no symlink protection — very low risk for test code

### Recommendation

- Fix H4+H5 before merge (quick fixes)
- Defer H1-H3 as tech debt (shared integration test infrastructure)

### Files Reviewed

- `src/__tests__/integration/golden-corpus-parity.test.ts` (698 lines)
- `src/__tests__/integration/clean-corpus-baseline.test.ts` (189 lines)
- `src/__tests__/integration/tier2-multilang-parity.test.ts` (300 lines)
- `src/features/pipeline/engine/__tests__/ruleEngine.perf.test.ts` (109 lines)
- `src/test/factories.ts` — `buildPerfSegments` function (lines 433-519)
- `eslint.config.mjs` — process.env exemption for integration tests
- `package.json` — cross-env + test:parity script
