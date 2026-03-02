---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-01'
---

# ATDD Checklist - Epic 3, Story 3.2b: L2 Batch Processing & Pipeline Extension

**Date:** 2026-03-01
**Author:** Mona
**Primary Test Level:** Unit (Vitest)

---

## Story Summary

Extend the Inngest pipeline orchestrator (`processFile.ts`) to wire L2 AI screening and provisional L3 deep analysis after L1 rule engine completes, with mode-aware processing (economy: L1+L2, thorough: L1+L2+L3), score recalculation per layer, and mode-aware batch completion.

**As a** QA Reviewer
**I want** AI Layer 2 screening to process segments in efficient batches within the Inngest pipeline
**So that** large files are processed within performance targets with proper error handling per batch

---

## Acceptance Criteria

1. **AC1 — L2 Pipeline Wiring:** L1 completion triggers `runL2ForFile()` as Inngest step `l2-screening-{fileId}`, file status: `l1_completed → l2_processing → l2_completed`
2. **AC2 — Chunk Processing Within Single Inngest Step:** Segments chunked at 30K chars inside `runL2ForFile`, partial failure tolerated
3. **AC3 — Finding Persistence:** L2 findings have `detectedByLayer='L2'`, `aiConfidence`, `status='pending'`, `aiModel`; invalid segmentIds dropped; atomic DELETE+INSERT
4. **AC4 — Score Recalculation After L2:** `scoreFile()` called with `layerCompleted: 'L1L2'`, DB-persisted value = `'L1L2'`
5. **AC5 — Economy Mode Guard:** Economy mode stops after L2 — no L3 triggered; batch completion uses `l2_completed | failed`
6. **AC6 — Thorough Mode L3 Handoff:** Thorough mode triggers `runL3ForFile()` after L2, final score with `layerCompleted: 'L1L2L3'`
7. **AC7 — Performance:** 100 segments < 30 seconds L2 processing
8. **AC8 — Batch Completion Awareness:** `pipeline.batch-completed` fires when all files reach terminal state per mode
9. **AC9 — L1 Results Preserved on L2 Failure:** On L2 failure, file status = `'failed'`, L1 findings + score intact

---

## Preflight Context

### Source Files Under Test
| File | Lines | Change |
|------|-------|--------|
| `src/features/pipeline/inngest/processFile.ts` | 126 | MAIN: extend with L2/L3 steps + mode-aware batch |
| `src/features/scoring/helpers/scoreFile.ts` | 279 | MINOR: add `layerCompleted` override param (2-line) |
| `src/types/pipeline.ts` | 59 | COMMENT: update batch-completed event comment |

### Existing Test Infrastructure
| Component | Path | Notes |
|-----------|------|-------|
| Existing processFile tests | `processFile.test.ts` | ~15 tests, EXTEND not recreate |
| `createMockStep()` | Local in test file | Mock Inngest step API |
| `buildPipelineEvent()` | Local in test file | Event data builder |
| `createDrizzleMock()` | `src/test/drizzleMock.ts` | Global via setupFiles |
| AI mock factory | `src/test/mocks/ai-providers.ts` | Available but NOT needed (mock at function level) |

### Knowledge Applied
- test-quality.md: deterministic, isolated, explicit assertions
- test-levels-framework.md: unit test is correct level for pipeline orchestration
- data-factories.md: factory with overrides pattern
- test-priorities-matrix.md: P0/P1/P2 classification guide

---

## Test Strategy

### Generation Mode
**AI Generation** — ACs are clear BDD format, scenarios are standard pipeline orchestration logic (no browser interaction).

### AC → Test Scenario Mapping

| # | AC | Test Scenario | Priority | Red Phase Reason | File |
|---|-----|--------------|----------|-----------------|------|
| 1 | AC1 | Economy: full step order L1→L1score→L2→L2score→batch (assert `mock.calls[N][0]` per index) | P0 | Steps not wired | processFile.test.ts |
| 2 | AC1 | `runL2ForFile` receives correct args (fileId, projectId, tenantId, userId) | P0 | Function not imported | processFile.test.ts |
| 3 | AC1 | Step ID renamed: `score-l1-{fileId}` (was `score-{fileId}`) | P0 | Step ID not renamed | processFile.test.ts |
| 4 | AC4 | `scoreFile` called with `layerCompleted: 'L1L2'` after L2 step | P0 | Param doesn't exist | processFile.test.ts |
| 5 | AC4 | **scoreFile override: `input.layerCompleted='L1L2'` persists 'L1L2' (not prev's 'L1')** | P0 | Override logic missing in scoreFile.ts | **scoreFile.test.ts** (NEW) |
| 6 | AC4 | **scoreFile override: `input.layerCompleted=undefined` → falls to prev?.layerCompleted** | P0 | Backward compat not verified | **scoreFile.test.ts** (NEW) |
| 7 | AC4 | **scoreFile override: `input.layerCompleted='L1L2L3'` persists 'L1L2L3'** | P0 | L3 override not tested | **scoreFile.test.ts** (NEW) |
| 8 | AC5 | Economy mode: L3 NOT triggered (runL3ForFile not called) | P0 | Mode guard missing | processFile.test.ts |
| 9 | AC5 | Economy batch: `l2_completed \| failed \| auto_passed` terminal states | P0 | Uses `l1_completed` | processFile.test.ts |
| 10 | AC6 | Thorough: full step order L1→L1score→L2→L2score→L3→L3score→batch | P0 | L3 step not wired | processFile.test.ts |
| 11 | AC6 | Thorough: final score `layerCompleted: 'L1L2L3'` | P0 | L3 score step missing | processFile.test.ts |
| 12 | AC6 | Thorough batch: `l3_completed \| failed \| auto_passed` terminal states | P0 | Doesn't check L3 | processFile.test.ts |
| 13 | AC9 | L2 failure: onFailure → `status:'failed'` + exactly 1 DB call (no DELETE) | P0 | Verify L1 intact | processFile.test.ts |
| 14 | AC8 | Batch event: exact payload `{ name: 'pipeline.batch-completed', data: { mode, batchId, ... } }` + verify batch form `sendEvent(stringId, [events])` (Guardrail #10) | P1 | Payload shape + batch form not asserted | processFile.test.ts |
| 15 | AC8 | Non-batch (`uploadBatchId=''`) skips batch check entirely | P1 | Verify preserved | processFile.test.ts |
| 16 | AC2 | L2 partial failure (`partialFailure: true`) → score + batch still proceed | P1 | Not handled yet | processFile.test.ts |
| 17 | AC1 | Return shape: `l1FindingCount`, `l2FindingCount`, `l3FindingCount`, `layerCompleted`, `l2PartialFailure` | P1 | Return type old | processFile.test.ts |
| 18 | AC6 | Return `l3FindingCount: null` for economy — use `toBe(null)` strict (not `toBeFalsy`) | P1 | exactOptionalProperties | processFile.test.ts |
| 19 | AC4 | scoreFile backward compat: recalculateScore caller (no layerCompleted) still works | P1 | Fallback chain | processFile.test.ts |
| 20 | AC9 | `auto_passed` status from scoreFile correctly propagated in return | P2 | Verify existing | processFile.test.ts |
| 21 | AC7 | Pipeline completes under 30s for 100 segments (mock-based sanity) | P2 | Perf deferred to E2E | processFile.test.ts |
| 22 | AC5 | Optional: mode undefined → defaults to economy (defense-in-depth) | P2 | TypeScript guards | processFile.test.ts |
| 23 | AC9 | Thorough: L3 failure → `status:'failed'` + L1 AND L2 findings preserved (no DELETE on L1/L2) | P0 | L3 failure path untested | processFile.test.ts |
| 24 | AC6 | Thorough: `runL3ForFile` receives correct args (fileId, projectId, tenantId, userId) | P0 | L3 args not verified | processFile.test.ts |

### Boundary Value Tests

| Boundary | At | Below | Above | Zero/Empty |
|----------|---|-------|-------|------------|
| Batch file count | 1 → fires immediately | N/A | 2 → waits for both | `''` = skip batch |
| Mode | `economy` → L1+L2 | N/A | `thorough` → L1+L2+L3 | N/A |
| L2 partialFailure | `true` → proceeds | `false` → normal | N/A | N/A |
| layerCompleted | `'L1L2'` persists | undefined → fallback | `'L1L2L3'` persists | N/A |

### Existing Test Impact

| Existing Test | Action |
|--------------|--------|
| `step count === 2` assertions (2 tests) | UPDATE → 4+ (economy) / 6+ (thorough) |
| Step ID `score-${fileId}` assertions | UPDATE → `score-l1-${fileId}` |
| Return `layerCompleted: 'L1'` | UPDATE → `'L1L2'` or `'L1L2L3'` |
| `should not run L2/L3 in economy` | UPDATE → "should not run L3 in economy" |
| `should not run L2/L3 in thorough (deferred)` | UPDATE → full L2+L3 flow |
| `scoreFile` args assertions | UPDATE → verify L1 score call specifically |
| onFailure tests (4) | VERIFY unchanged |
| Function config tests (3) | VERIFY unchanged |

### Test Counts (post Gap Analysis)

| Category | P0 | P1 | P2 | Total |
|----------|---|---|---|------|
| New tests (processFile.test.ts) | 12 | 6 | 3 | 21 |
| **New tests (scoreFile.test.ts)** | **3** | **0** | **0** | **3** |
| Updated existing | 6 | 1 | 0 | 7 |
| Unchanged existing | 0 | 2 | 6 | 8 |
| **Total** | **21** | **9** | **9** | **39** |

### Failure Mode Analysis Applied

| FM | Finding | Resolution |
|----|---------|------------|
| FM-1 CRITICAL | scoreFile override not tested (mock hides bug) | Added 3 P0 tests in **scoreFile.test.ts** (#5, #6, #7) |
| FM-2 HIGH | Step order not verified by index | Strengthened test #1, #10 to assert `mock.calls[N][0]` per index |
| FM-3 MEDIUM | Batch event payload shape not asserted | Added test #14: assert exact `{ name, data }` payload |
| FM-4 MEDIUM | L1 preservation: no negative DELETE assertion | Strengthened test #13: assert exactly 1 DB call (no DELETE) |
| FM-5 LOW | Mode undefined not tested | Added optional P2 test #22 (defense-in-depth) |
| FM-6 LOW | null vs undefined assertion style | Noted: use `toBe(null)` strict in test #18 |

### Gap Analysis Applied

| GAP | Finding | Severity | Resolution |
|-----|---------|----------|------------|
| GAP-1 | `runL3ForFile` args not verified in thorough mode | MEDIUM | Added test #24 (P0): verify correct args passed to L3 |
| GAP-2 | `sendEvent` batch form `(stringId, [events])` not asserted (Guardrail #10) | MEDIUM | Strengthened test #14: assert first arg = string, second arg = array |
| GAP-3 | AC3 (finding persistence) scope not documented — tested in `runL2ForFile.test.ts` (Story 3.2a) | LOW | Scope note: AC3 out of scope for orchestrator tests |

**AC3 Scope Note:** Finding persistence (AC3: `detectedByLayer='L2'`, `aiConfidence`, atomic DELETE+INSERT) is fully tested in `runL2ForFile.test.ts` (Story 3.2a). processFile.test.ts only tests orchestration — it mocks `runL2ForFile` at function level.

### Devil's Advocate Analysis Applied

| DA | Challenge | Severity | Resolution |
|----|-----------|----------|------------|
| DA-1 | `auto_passed` not in batch terminal states — batch never completes if file auto-passes | MEDIUM | Updated tests #9, #12: terminal states now include `auto_passed` |
| DA-2 | L3 failure must preserve both L1 AND L2 findings — only L2→L1 tested | MEDIUM | Added test #23 (P0): L3 failure in thorough mode → L1+L2 intact |
| DA-3 | Mock return type drift — `L2Result` changes won't break untyped mock | LOW | Code pattern note: type mock as `L2Result` explicitly at Step 4 |
| DA-4 | `runL3ForFile` is provisional stub — signature may not match mock | LOW | Verify stub exists at Step 4 + add `// provisional L3 — Story 3.3` comment |
| DA-5 | Batch race condition (TD-PIPE-001) untestable at unit level | LOW | Add comment: `// race condition: see TD-PIPE-001` in batch tests |

### Pre-mortem Analysis Applied

| PM | Risk | Severity | Resolution |
|----|------|----------|------------|
| PM-1 | Existing test changes not specified per-assertion — dev may "fix to green" without understanding intent | HIGH | Added **Existing Test Change Spec** below with exact before→after per test |
| PM-2 | `scoreFile.test.ts` may not exist yet — unclear if extend or create | MEDIUM | **Action:** Check at Step 4. If missing, create new file with describe block + 3 P0 tests |
| PM-3 | 37 test scenarios may produce >40 actual `it()` blocks — review fatigue | MEDIUM | **Merge plan:** Tests #1+#3 (step order includes ID rename), #8+#9 (economy guard + terminal), #10+#12 (thorough order + terminal). Target: ~30 `it()` blocks |
| PM-4 | No runtime smoke test for chunking perf (AC7) | LOW | Noted: P2 test #21 is mock-based sanity only. Real perf = E2E gate (Story 3.4+) |
| PM-5 | Step ID rename (`score-` → `score-l1-`) affects Inngest dashboard history | LOW | Noted: deployment note in story — no test action needed |

### Existing Test Change Spec (PM-1 Resolution)

| Existing Test Description | Current Assertion | New Assertion | Reason |
|--------------------------|-------------------|---------------|--------|
| "should execute pipeline steps in correct order" | `step.run.mock.calls.length === 2` | `=== 4` (economy) + verify `calls[0][0]` = `l1-*`, `calls[1][0]` = `score-l1-*`, `calls[2][0]` = `l2-*`, `calls[3][0]` = `score-l2-*` | L2 steps added |
| "should call scoreFile with correct args" | `mockScoreFile(fileId, projectId, tenantId)` | Add assertion: first call has NO `layerCompleted` (L1 score) | Distinguish L1 vs L2 score calls |
| Step ID assertion | `score-${fileId}` | `score-l1-${fileId}` | Renamed for clarity |
| "should not run L2/L3 in economy mode" | `runL2ForFile not called` | **DELETE this test** — replaced by test #8 (economy runs L2 but not L3) | Economy now includes L2 |
| "should not run L2/L3 in thorough mode (deferred)" | `runL2ForFile not called` (placeholder) | **REPLACE** with test #10 (full L1→L2→L3 flow) | L2+L3 now implemented |
| Return value assertion | `{ layerCompleted: 'L1', findingCount }` | `{ layerCompleted: 'L1L2', l1FindingCount, l2FindingCount, l3FindingCount: null }` | New return shape |

---

## Generated Test Stubs (Step 4 — TDD RED PHASE)

### Output Files

| File | Target | Stubs | Priority |
|------|--------|-------|----------|
| `_bmad-output/test-artifacts/3-2b-processFile-stubs.ts` | `src/features/pipeline/inngest/processFile.test.ts` | 18 `it.skip()` | 9 P0 / 6 P1 / 3 P2 |
| `_bmad-output/test-artifacts/3-2b-scoreFile-stubs.ts` | `src/features/scoring/helpers/scoreFile.test.ts` | 3 `it.skip()` | 3 P0 |

### Integration Instructions

1. **processFile.test.ts:** Merge Section 1 (hoisted mocks: `mockRunL2ForFile`, `mockRunL3ForFile`) → Add Section 2 (`vi.mock()`) → Paste Section 3 (18 stubs)
2. **scoreFile.test.ts:** Paste 3 stubs after line 727 (after existing layerCompleted tests)
3. **Existing tests:** Update/delete 7 tests per Existing Test Change Spec above
4. **GREEN phase:** Remove `.skip` one-by-one as implementation progresses

### PM-2 Resolved
`scoreFile.test.ts` EXISTS at `src/features/scoring/helpers/scoreFile.test.ts` (753 lines, 25 tests). Action: EXTEND, not create.

### PM-3 Applied (Merge Plan)
24 scenarios → 18 actual `it.skip()` stubs via 3 merges:
- #1+#3 → "Economy 4-step order + step ID rename"
- #8+#9 → "Economy L3 NOT triggered + batch terminal states"
- #10+#12 → "Thorough 6-step order + batch terminal states"

---

## Validation & Completion (Step 5)

### Validation Results

| Check | Status |
|-------|--------|
| Steps 1-4 complete | PASS |
| Test stubs created with `it.skip()` | PASS (21/21) |
| No placeholder assertions | PASS |
| AC coverage (9 ACs → 24 scenarios) | PASS |
| Artifacts in `_bmad-output/test-artifacts/` | PASS (3 files) |

### Elicitation Methods Applied

| Method | Findings | Top Impact |
|--------|----------|------------|
| Failure Mode Analysis | 6 | FM-1 CRITICAL: scoreFile override untested |
| Pre-mortem Analysis | 5 | PM-1 HIGH: existing test change spec needed |
| Devil's Advocate | 5 | DA-1 MEDIUM: auto_passed terminal state |
| Gap Analysis | 3 | GAP-1 MEDIUM: runL3ForFile args not verified |

### Next Workflow
**`dev-story`** for Story 3.2b implementation — dev removes `.skip` one-by-one (GREEN phase)
