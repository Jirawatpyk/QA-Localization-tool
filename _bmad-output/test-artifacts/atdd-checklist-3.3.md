---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-03'
---

# ATDD Checklist - Epic 3, Story 3.3: AI Layer 3 Deep Contextual Analysis

**Date:** 2026-03-03
**Author:** Mona
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)

---

## Story Summary

Story 3.3 enhances the L3 deep AI analysis pipeline with selective segment filtering (only L2-flagged segments go to L3), surrounding context (±2 segments), shared prompt builder integration (resolving TD-PIPE-003), and L3 confirm/contradict post-processing for L2 findings. UI updates include ScoreBadge 'deep-analyzed' (gold) state and FindingListItem confirm/contradict badges.

**As a** QA Reviewer
**I want** AI-powered deep contextual analysis (Layer 3) on segments flagged by L2 screening
**So that** I get the most thorough quality assessment with high-confidence findings on complex issues that L1 rules and L2 screening might miss

---

## Preflight Verification

### Prerequisites — ALL PASS

| Prerequisite | Status |
|---|---|
| Story 3.3 approved with 11 ACs | PASS |
| `playwright.config.ts` configured (Chromium, `e2e/` dir) | PASS |
| Vitest configured (unit + rls workspaces) | PASS |
| Dev environment available | PASS |

### Existing Test Patterns

| Area | Existing Tests | File |
|---|---|---|
| runL3ForFile | 14 tests (P0 lifecycle, P1 errors, P2 behavior) | `src/features/pipeline/helpers/runL3ForFile.test.ts` |
| build-l3-prompt | 14 tests (prompt sections) | `src/features/pipeline/prompts/__tests__/build-l3-prompt.test.ts` |
| l2-output schema | Schema validation tests | `src/features/pipeline/schemas/l2-output.test.ts` |
| ScoreBadge | State rendering tests | `src/features/batch/components/ScoreBadge.test.tsx` + `src/features/review/components/ScoreBadge.boundary.test.tsx` |
| ReviewProgress | L3 step rendering | `src/features/review/components/ReviewProgress.test.tsx` |
| FindingListItem | Expandable list + badges | `src/features/review/components/FindingListItem.test.tsx` |
| processFile | Pipeline orchestration | `src/features/pipeline/inngest/processFile.test.ts` |
| E2E pipeline | Review findings flow | `e2e/review-findings.spec.ts` |

### Mock Infrastructure

- `createDrizzleMock()` from `src/test/drizzleMock.ts` — Proxy-based DB mock
- `createAIMock({ layer: 'L3' })` from `src/test/mocks/ai-providers.ts` — AI provider mock
- `buildL3Response()`, `buildSegmentRow()` from `src/test/fixtures/ai-responses.ts` — L3 fixtures
- `BUDGET_HAS_QUOTA` from `src/test/fixtures/ai-responses.ts` — budget mock

### TEA Config

- `tea_use_playwright_utils: true`
- `tea_browser_automation: auto`
- `test_framework: playwright`

---

## Generation Mode

**Mode:** AI Generation
**Rationale:** All 11 ACs are clear and testable. Story covers backend pipeline changes + UI component updates — standard patterns with existing test infrastructure. No complex UI recording needed.

---

## Acceptance Criteria

1. **AC1** — Selective segment filtering: only L2-flagged segments sent to L3
2. **AC2** — Surrounding context ±2 segments per filtered segment
3. **AC3** — Shared prompt builder integration (TD-PIPE-003)
4. **AC4** — L3 confirm/contradict L2 post-processing
5. **AC5** — L3 Zod output schema with rationale field
6. **AC6** — Score update + ScoreBadge 'deep-analyzed' (gold)
7. **AC7** — languagePair wiring for AI usage records
8. **AC8** — Performance: 100 flagged segments within 2 minutes
9. **AC9** — L3 findings display with confirm/contradict badges
10. **AC10** — Auto-pass evaluation after L3 scoring
11. **AC11** — Boundary values (zero flagged, all flagged, confidence caps, context boundaries)

---

## Test Strategy — AC to Test Level Mapping

### Unit Tests (Vitest) — 33 test scenarios

| # | AC | Test Scenario | Level | Priority | Red Phase Failure |
|---|---|----|---|---|---|
| U01 | AC1 | Segments with L2 findings included in filtered set | Unit | P0 | L2 finding query not implemented |
| U02 | AC1 | Segments without L2 findings excluded from L3 | Unit | P0 | No filtering logic yet |
| U03 | AC1 | Zero flagged segments → L3 skipped, status l3_completed, findingCount 0 | Unit | P0 | No early return path |
| U04 | AC1 | All segments flagged → all sent to L3 | Unit | P1 | No filtering logic yet |
| U05 | AC1 | l3ConfidenceMin threshold: segment at exact threshold excluded (confidence >= threshold) | Unit | P1 | No threshold query |
| U06 | AC1 | l3ConfidenceMin threshold: segment below threshold included | Unit | P1 | No threshold query |
| U07 | AC2 | Middle segment gets ±2 surrounding context | Unit | P0 | No surrounding context logic |
| U08 | AC2 | First segment (position 0): 0 previous, 2 next | Unit | P1 | No boundary handling |
| U09 | AC2 | Last segment (position N): 2 previous, 0 next | Unit | P1 | No boundary handling |
| U10 | AC2 | Second segment (position 1): 1 previous, 2 next | Unit | P1 | No boundary handling |
| U11 | AC3 | Shared buildL3Prompt called instead of inline function | Unit | P0 | Inline function still in use |
| U12 | AC3 | Glossary terms, taxonomy categories, project context passed to prompt builder | Unit | P1 | Context queries not loaded |
| U13 | AC3 | Surrounding context included in prompt input | Unit | P1 | surroundingContext not in L3PromptInput |
| U14 | AC4 | L3 confirms L2: confidence boosted (Math.min(100, existing * 1.1)) | Unit | P0 | No confirm/contradict logic |
| U15 | AC4 | L3 contradicts L2: [L3 Disagrees] marker appended to description | Unit | P0 | No contradict logic |
| U16 | AC4 | No L3 match for L2 finding → L2 finding unchanged | Unit | P1 | No post-processing logic |
| U17 | AC4 | Confidence boost capped at 100 (95% * 1.1 = 104.5 → 100) | Unit | P1 | No cap logic |
| U18 | AC4 | Idempotent: re-run L3 → markers NOT duplicated in description | Unit | P1 | No idempotent check |
| U19 | AC4 | Multiple L3 findings for same L2 segment: each matched independently | Unit | P1 | No multi-match logic |
| U20 | AC5 | Valid L3 finding with rationale parses OK | Unit | P0 | Schema not extracted yet |
| U21 | AC5 | Missing rationale → Zod parse error | Unit | P0 | Schema lacks rationale requirement |
| U22 | AC5 | Confidence 0 (pass), 100 (pass) — boundary at limits | Unit | P1 | No .min(0).max(100) on confidence |
| U23 | AC5 | Confidence -1 (reject), 101 (reject) — out of bounds | Unit | P1 | No bounds validation |
| U24 | AC5 | suggestedFix: null passes, string passes | Unit | P1 | Already works (.nullable()) |
| U25 | AC6 | ScoreBadge 'deep-analyzed': gold color + "Deep Analyzed" label | Unit | P0 | State not in ScoreBadgeState |
| U26 | AC6 | ReviewPageClient: layerCompleted 'L1L2L3' → state 'deep-analyzed' (NOT 'ai-screened') | Unit | P0 | L1L2L3 falls through to ai-screened |
| U27 | AC6 | ReviewProgress: L3 checkmark when layerCompleted includes L3 | Unit | P1 | Already partially works |
| U28 | AC7 | AIUsageRecord languagePair derived from segments (e.g., 'en→th') | Unit | P1 | Currently hardcoded null |
| U29 | AC7 | languagePair null when segments have no language info | Unit | P2 | Currently always null |
| U30 | AC9 | FindingListItem: [L3 Confirmed] marker → green "Confirmed by L3" badge | Unit | P1 | No marker parsing |
| U31 | AC9 | FindingListItem: [L3 Disagrees] marker → amber "L3 disagrees" badge | Unit | P1 | No marker parsing |
| U32 | AC9 | FindingListItem: markers stripped from visible description | Unit | P1 | No marker stripping |
| U33 | AC9 | FindingListItem: no markers → no badges displayed | Unit | P1 | No marker detection |

### E2E Tests (Playwright) — 1 test scenario

| # | AC | Test Scenario | Level | Priority | Red Phase Failure |
|---|---|----|---|---|---|
| E01 | AC6,8,9 | Thorough mode pipeline → L3 complete → "Deep Analyzed" badge + L3 findings visible | E2E | P1 | L3 processing not wired with selective filtering |

### Tests NOT needed (coverage already exists or AC verifiable by inspection)

| AC | Reason |
|---|---|
| AC8 (Performance) | NFR4 soft target — verified by manual timing during E2E, not a unit test assertion |
| AC10 (Auto-pass) | Already tested in `scoreFile.test.ts` — no new code for auto-pass, verify via existing tests |

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

### AC1: Segment Filtering — Zero/All/Mixed

| Boundary | At | Below | Above | Zero/Empty |
|---|---|---|---|---|
| Flagged segment count | 1 segment flagged (included) | N/A | N/A | 0 segments flagged → skip L3 |
| All segments | All flagged → all processed | N/A | N/A | N/A |

### AC2: Surrounding Context — Segment Position

| Boundary | At Start | Near Start | Middle | Near End | At End |
|---|---|---|---|---|---|
| Position 0 | prev=[], next=[1,2] | — | — | — | — |
| Position 1 | — | prev=[0], next=[2,3] | — | — | — |
| Position mid | — | — | prev=[mid-2,mid-1], next=[mid+1,mid+2] | — | — |
| Position N-1 | — | — | — | prev=[N-3,N-2], next=[N] | — |
| Position N | — | — | — | — | prev=[N-2,N-1], next=[] |

### AC4: Confidence Boost — Cap at 100

| Boundary | Input | Formula | Result |
|---|---|---|---|
| Low confidence | 50% | min(100, 50 * 1.1) | 55 |
| High confidence | 90% | min(100, 90 * 1.1) | 99 |
| Near cap | 95% | min(100, 95 * 1.1) | 100 (capped) |
| At max | 100% | min(100, 100 * 1.1) | 100 (capped) |
| Zero confidence | 0% | min(100, 0 * 1.1) | 0 |

### AC5: Confidence Schema Validation

| Boundary | Value | Expected |
|---|---|---|
| Minimum valid | 0 | Zod PASS |
| Maximum valid | 100 | Zod PASS |
| Below minimum | -1 | Zod REJECT |
| Above maximum | 101 | Zod REJECT |

---

## Test Count Summary

| Level | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Unit (Vitest) | 10 | 21 | 2 | 33 |
| E2E (Playwright) | 0 | 1 | 0 | 1 |
| **Total** | **10** | **22** | **2** | **34** |

---

## Step 4: Generated Test Files (TDD RED Phase)

### TDD Red Phase Validation: PASS

- All unit tests use `it.skip()` — 33 stubs across 6 files
- All E2E tests use `test.skip()` — 7 assertion stubs + 2 active setup tests
- Zero placeholder assertions found
- All tests assert EXPECTED behavior with realistic mock setups
- Parallel subprocess execution: Unit + E2E generated concurrently

### Generated Unit Test Files (Vitest)

| # | File | Stubs | ACs Covered |
|---|------|-------|-------------|
| 1 | `src/features/pipeline/helpers/runL3ForFile.story33.test.ts` | 18 | AC1, AC2, AC4, AC7 |
| 2 | `src/features/pipeline/schemas/l3-output.test.ts` | 6 | AC5 |
| 3 | `src/features/pipeline/prompts/__tests__/build-l3-prompt.story33.test.ts` | 2 | AC3 |
| 4 | `src/features/batch/components/ScoreBadge.story33.test.tsx` | 1 | AC6 |
| 5 | `src/features/review/components/ReviewPageClient.story33.test.tsx` | 2 | AC6 |
| 6 | `src/features/review/components/FindingListItem.story33.test.tsx` | 4 | AC9 |

### Generated E2E Test File (Playwright)

| # | File | Stubs | ACs Covered |
|---|------|-------|-------------|
| 1 | `e2e/review-l3-findings.spec.ts` | 7 + 2 setup | AC6, AC8, AC9 |

### AC Coverage Matrix

| AC | Unit Tests | E2E Tests | Covered By |
|---|---|---|---|
| AC1 (Selective filtering) | U01-U06 | — | `runL3ForFile.story33.test.ts` |
| AC2 (Surrounding context) | U07-U10 | — | `runL3ForFile.story33.test.ts` |
| AC3 (Shared prompt builder) | U11-U13 | — | `build-l3-prompt.story33.test.ts` |
| AC4 (Confirm/contradict) | U14-U19 | — | `runL3ForFile.story33.test.ts` |
| AC5 (L3 output schema) | U20-U24 | — | `l3-output.test.ts` |
| AC6 (ScoreBadge deep-analyzed) | U25-U27 | E01 | `ScoreBadge.story33.test.tsx` + `ReviewPageClient.story33.test.tsx` + E2E |
| AC7 (languagePair wiring) | U28-U29 | — | `runL3ForFile.story33.test.ts` |
| AC8 (Performance) | — | E01 (timing) | E2E pipeline timing |
| AC9 (L3 findings display) | U30-U33 | E01 | `FindingListItem.story33.test.tsx` + E2E |
| AC10 (Auto-pass) | — | — | Existing `scoreFile.test.ts` |
| AC11 (Boundary values) | U03,U04,U05,U06,U08-U10,U17,U22,U23 | — | Embedded in AC-specific tests |

### Fixture Infrastructure

Existing fixtures reused (no new fixtures needed for RED phase):
- `createDrizzleMock()` — Proxy-based DB mock
- `createAIMock({ layer: 'L3' })` — AI provider mock
- `buildL3Response()`, `buildSegmentRow()` — L3 response builders
- `buildDbFinding()` — Finding factory for UI component tests
- `BUDGET_HAS_QUOTA` — Budget mock constant

### Next Steps (TDD Green Phase)

After implementing Story 3.3:
1. Remove `it.skip()` / `test.skip()` from all test files
2. Run unit tests: `npx vitest run src/features/pipeline/helpers/runL3ForFile.story33.test.ts`
3. Run schema tests: `npx vitest run src/features/pipeline/schemas/l3-output.test.ts`
4. Run UI tests: `npx vitest run --project unit src/features/batch/components/ScoreBadge.story33.test.tsx`
5. Run E2E test: `npx playwright test e2e/review-l3-findings.spec.ts`
6. Verify ALL tests PASS (green phase)
7. If any fail: fix implementation (feature bug) or fix test (test bug)
8. All P0+P1 tests MUST pass before story completion (DoD gate)

---

## Step 5: Validation & Completion

### Checklist Validation

| Category | Status | Notes |
|---|---|---|
| Prerequisites (story, config, env) | PASS | Story 3.3 approved (11 ACs), Vitest + Playwright configured |
| Step 1: Context loading | PASS | 11 ACs extracted, 8 existing test patterns identified, 4 KB fragments loaded |
| Step 2: Generation mode | PASS | AI Generation mode (clear ACs, standard patterns) |
| Step 3: Test strategy | PASS | 34 scenarios (33 unit + 1 E2E), P0-P2 priorities, 4 boundary tables |
| Step 4: Test generation | PASS | 7 files created, 33 `it.skip()` + 7 `test.skip()` stubs, zero placeholders |
| Step 4: TDD compliance | PASS | All tests use skip(), all assert expected behavior, realistic mocks |
| Step 4: Fixture infrastructure | PASS | Existing factories reused (no new fixtures needed for RED phase) |
| CLI sessions cleaned up | PASS | No orphaned browsers (Playwright MCP not used) |
| Temp artifacts in correct location | PASS | All in `_bmad-output/test-artifacts/` |
| AC coverage complete | PASS | All 11 ACs mapped, 9 have tests, 2 covered by existing/manual verification |

### Completion Summary

**Story:** 3.3 — AI Layer 3 Deep Contextual Analysis
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)
**ATDD Checklist:** `_bmad-output/test-artifacts/atdd-checklist-3.3.md`

**Test Files Created:**

| # | File | Test Count | Type |
|---|------|-----------|------|
| 1 | `src/features/pipeline/helpers/runL3ForFile.story33.test.ts` | 18 stubs | Unit (Vitest) |
| 2 | `src/features/pipeline/schemas/l3-output.test.ts` | 6 stubs | Unit (Vitest) |
| 3 | `src/features/pipeline/prompts/__tests__/build-l3-prompt.story33.test.ts` | 2 stubs | Unit (Vitest) |
| 4 | `src/features/batch/components/ScoreBadge.story33.test.tsx` | 1 stub | Unit (Vitest) |
| 5 | `src/features/review/components/ReviewPageClient.story33.test.tsx` | 2 stubs | Unit (Vitest) |
| 6 | `src/features/review/components/FindingListItem.story33.test.tsx` | 4 stubs | Unit (Vitest) |
| 7 | `e2e/review-l3-findings.spec.ts` | 7 + 2 setup | E2E (Playwright) |

**Totals:** 33 unit stubs + 7 E2E stubs = **40 test stubs** (RED phase)

**Factories & Fixtures:** Existing infrastructure reused — `createDrizzleMock()`, `createAIMock()`, `buildL3Response()`, `buildSegmentRow()`, `buildDbFinding()`, `BUDGET_HAS_QUOTA`

**data-testid Requirements for DEV:** `score-badge`, `review-progress`, `layer-status-L1/L2/L3`, `finding-list-item`, `confidence-badge`, `finding-description`, `finding-detail`, `layer-badge`, `l3-cross-ref-badge`

**Key Risks:**
1. `l3-output.test.ts` imports from `./l3-output` which doesn't exist yet — expected RED phase behavior, schema file created during implementation
2. E2E test requires both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` + Inngest dev server running
3. `l3ConfidenceMin` threshold logic (U05/U06) may need project-level config loading — story Task 3.2 handles this

**Next Recommended Workflow:** `dev-story` (implementation) — Story 3.3 is `ready-for-dev` in sprint-status.yaml
