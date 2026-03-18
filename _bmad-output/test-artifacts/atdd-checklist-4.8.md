---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests']
lastStep: 'step-04-generate-tests'
lastSaved: '2026-03-18'
storyId: '4.8'
storyKey: '4-8-accessibility-integration-verification'
detectedStack: 'fullstack'
testFrameworks: ['vitest', 'playwright']
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-8-accessibility-integration-verification.md'
  - '_bmad-output/accessibility-baseline-2026-03-08.md'
  - 'e2e/helpers/review-page.ts'
  - 'src/test/factories.ts'
  - '_bmad/tea/testarch/knowledge/test-quality.md'
  - '_bmad/tea/testarch/knowledge/test-priorities-matrix.md'
  - '_bmad/tea/testarch/knowledge/test-levels-framework.md'
  - '_bmad/tea/testarch/knowledge/selector-resilience.md'
---

# ATDD Checklist — Story 4.8: Accessibility & Integration Verification

## Step 1: Preflight & Context

### Stack Detection
- **Detected stack:** fullstack (Next.js 16 + Supabase + Drizzle ORM)
- **Test frameworks:** Vitest (unit/jsdom + rls/node) + Playwright (E2E)
- **Browser automation:** Playwright CLI (auto-detected)

### Story Nature
- **Type:** Verification story — tests + audits + documentation
- **ACs:** 8 (AC1-AC8)
- **Code changes:** Minimal (quick fixes for baseline issues #1, #5; new test files; documentation)

### Existing Test Infrastructure
- **E2E helpers:** `e2e/helpers/review-page.ts` (waitForReviewPageHydrated, gotoReviewPageWithRetry, waitForFindingsVisible)
- **E2E helpers:** `e2e/helpers/supabase-admin.ts`, `e2e/helpers/fileUpload.ts`, `e2e/helpers/pipeline-admin.ts`
- **Unit factories:** `src/test/factories.ts` (buildFinding, buildReviewSession, buildFindingForDisplay, etc.)
- **Drizzle mock:** `src/test/drizzleMock.ts`
- **Existing review E2E specs:** review-actions, review-bulk-operations, review-extended-actions, review-findings, review-detail-panel, review-suppress-patterns, review-search-filter, review-add-to-glossary

### Knowledge Fragments Loaded
- test-quality (DoD: deterministic, isolated, <1.5min, <300 lines)
- test-priorities-matrix (P0-P3 classification)
- test-levels-framework (unit vs integration vs E2E decision)
- selector-resilience (ARIA roles > data-testid > CSS)

## Step 2: Generation Mode

- **Mode:** AI Generation
- **Reason:** ACs have clear acceptance criteria with specific numeric thresholds; scenarios are standard (ARIA unit tests, keyboard E2E, contrast computation, performance benchmarks); no live browser recording needed — existing components are being verified, not created

## Step 3: Test Strategy

### AC → Test Scenario Mapping

#### P0 — Critical (Must Test) — 8 tests

| ID | AC | Scenario | Level | File |
|----|-----|----------|-------|------|
| TA-01 | AC1 | Keyboard-only full review flow: navigate (J/K), accept (A), reject (R), flag (F), note (N), source (S), bulk (Shift+J/K, Ctrl+A), undo (Ctrl+Z), search (Ctrl+K), suppress pattern, add glossary — zero mouse | E2E | `e2e/review-accessibility.spec.ts` |
| TA-02 | AC1 | Hotkey combinations conflict-free: register all hotkeys in same scope, verify no collisions | Unit | `src/features/review/hooks/use-keyboard-actions.conflict.test.ts` |
| TA-03 | AC1 | Esc hierarchy: open dropdown > expanded card > detail panel, Esc closes innermost first, one per press | E2E | `e2e/review-accessibility.spec.ts` |
| TA-04 | AC2 | Fix verification: AiSpendByProjectTable L126 has icon + sr-only status text (not color-only dot) | Unit | `src/features/dashboard/components/AiSpendByProjectTable.a11y.test.tsx` |
| TA-05 | AC2 | Fix verification: NotificationDropdown L80 has `<span className="sr-only">Unread</span>` | Unit | `src/features/dashboard/components/NotificationDropdown.a11y.test.tsx` |
| TA-06 | AC3 | Contrast: all severity token colors on white background >= 4.5:1 (normal text AA) | Unit | `src/features/review/components/contrast.test.ts` |
| TA-07 | AC3 | Contrast: tinted state backgrounds (accepted/rejected/flagged/noted/source-issue) vs text >= 4.5:1 | Unit | `src/features/review/components/contrast.test.ts` |
| TA-08 | AC5 | ARIA: FindingList renders `role="grid"` + `aria-label` + `aria-rowcount`; rows have `role="row"` | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |

#### P1 — High (Should Test) — 14 tests

| ID | AC | Scenario | Level | File |
|----|-----|----------|-------|------|
| TA-09 | AC2 | Baseline Critical #7 verified: `--color-severity-major` is `#b45309` (not `#f59e0b`) | Unit | `src/features/review/components/contrast.test.ts` |
| TA-10 | AC2 | Baseline Critical #13-15 verified: FindingList has `role="grid"`, items have tabindex, keyboard wired | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |
| TA-11 | AC3 | Contrast: non-text UI (focus ring indigo `#4f46e5`, icon colors) >= 3:1 on backgrounds | Unit | `src/features/review/components/contrast.test.ts` |
| TA-12 | AC4 | Performance: 300+ findings page renders in < 2000ms (boundary: exactly 300) | E2E | `e2e/review-accessibility.spec.ts` |
| TA-13 | AC4 | Performance: J/K navigation response < 100ms | E2E | `e2e/review-accessibility.spec.ts` |
| TA-14 | AC4 | Performance: hotkey action (A/R/F) response < 200ms including optimistic UI | E2E | `e2e/review-accessibility.spec.ts` |
| TA-15 | AC5 | ARIA: `aria-live="polite"` container exists in DOM before content changes | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |
| TA-16 | AC5 | ARIA: all 7 action buttons have `aria-keyshortcuts` matching config | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |
| TA-17 | AC5 | ARIA: modals (SuppressPatternDialog, AddFindingDialog, AddToGlossaryDialog) have `aria-modal="true"` + `role="dialog"` | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |
| TA-18 | AC5 | ARIA: landmarks present — `<nav>`, `<main>`, `role="complementary"` on detail panel | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |
| TA-19 | AC6 | Pipeline: L2 Precision >= 70% on 500-segment test file (boundary: at 70%) | E2E | `e2e/review-pipeline-verification.spec.ts` |
| TA-20 | AC6 | Pipeline: L2 Recall >= 60% (boundary: at 60%) | E2E | `e2e/review-pipeline-verification.spec.ts` |
| TA-21 | AC6 | Pipeline: L3 deduplication — 0 duplicate findings for same segment+category across L2/L3 | E2E | `e2e/review-pipeline-verification.spec.ts` |
| TA-22 | AC2 | Baseline Major #27-28 verified: SegmentTextDisplay has `lang` attribute from file metadata | Unit | `src/features/review/components/ReviewPage.aria.test.tsx` |

#### P2 — Medium (Nice to Test) — 5 tests

| ID | AC | Scenario | Level | File |
|----|-----|----------|-------|------|
| TA-23 | AC4 | Performance: bulk action 50 findings < 3000ms including score recalc | E2E | `e2e/review-accessibility.spec.ts` |
| TA-24 | AC6 | Pipeline timing: Economy < 5 min, Thorough < 10 min for 500 segments | E2E | `e2e/review-pipeline-verification.spec.ts` |
| TA-25 | AC7 | Cost tracking: ai_usage_logs token totals within +/-5% of expected | Integration | `src/features/pipeline/ai-cost-verification.test.ts` |
| TA-26 | AC7 | Cost tracking: AI Usage Dashboard totals match ai_usage_logs aggregation | E2E | `e2e/review-pipeline-verification.spec.ts` |
| TA-27 | AC7 | Cost tracking: budget threshold alert fires when spend exceeds config | E2E | `e2e/review-pipeline-verification.spec.ts` |

### Boundary Value Tests (MANDATORY per CLAUDE.md)

| AC | Threshold | At | Below | Above |
|----|-----------|-----|-------|-------|
| AC4 | 300 findings | TA-12 (exactly 300) | N/A | seed 350 for margin |
| AC4 | 2000ms render | TA-12 asserts < 2000 | pass | fail |
| AC4 | 100ms nav | TA-13 asserts < 100 | pass | fail |
| AC4 | 200ms action | TA-14 asserts < 200 | pass | fail |
| AC6 | 70% precision | TA-19 boundary | fail at 69% | pass at 71% |
| AC6 | 60% recall | TA-20 boundary | fail at 59% | pass at 61% |
| AC7 | 5% cost delta | TA-25 boundary | pass at 4.9% | fail at 5.1% |

### Red Phase Confirmation

All P0+P1 tests are designed to FAIL before implementation:
- **TA-04, TA-05:** Fail until quick fixes applied to AiSpendByProjectTable + NotificationDropdown
- **TA-06, TA-07, TA-11:** Fail until `src/test/a11y-helpers.ts` contrast utility created
- **TA-01, TA-03:** Fail until E2E spec created with full keyboard flow
- **TA-08, TA-15-18, TA-22:** Fail until `ReviewPage.aria.test.tsx` created
- **TA-09, TA-10:** Green from start (resolved in previous stories) — serve as regression guards

### Test File Summary

| File | Level | Test Count | Priority |
|------|-------|-----------|----------|
| `e2e/review-accessibility.spec.ts` | E2E | 7 (TA-01,03,12-14,23) | P0-P2 |
| `e2e/review-pipeline-verification.spec.ts` | E2E | 5 (TA-19-21,24,26-27) | P1-P2 |
| `src/features/review/components/ReviewPage.aria.test.tsx` | Unit | 7 (TA-08,10,15-18,22) | P0-P1 |
| `src/features/review/components/contrast.test.ts` | Unit | 4 (TA-06,07,09,11) | P0-P1 |
| `src/features/dashboard/components/AiSpendByProjectTable.a11y.test.tsx` | Unit | 1 (TA-04) | P0 |
| `src/features/dashboard/components/NotificationDropdown.a11y.test.tsx` | Unit | 1 (TA-05) | P0 |
| `src/features/review/hooks/use-keyboard-actions.conflict.test.ts` | Unit | 1 (TA-02) | P0 |
| `src/features/pipeline/ai-cost-verification.test.ts` | Integration | 1 (TA-25) | P2 |
| **Total** | | **27 tests** | **8 P0, 14 P1, 5 P2** |

## Step 4: Test Stubs Generated (TDD Red Phase)

### Execution Mode
- **Mode:** Sequential (Claude Code context)
- **Phase:** RED — all tests use `it.skip()` or `test.skip()`

### Files Created on Disk

#### Unit Test Stubs (5 files)
1. `src/features/review/components/ReviewPage.aria.test.tsx` — 19 test cases (ARIA structure)
2. `src/features/review/components/contrast.test.ts` — 13 test cases (WCAG contrast)
3. `src/features/dashboard/components/AiSpendByProjectTable.a11y.test.tsx` — 3 test cases (baseline fix #1)
4. `src/features/dashboard/components/NotificationDropdown.a11y.test.tsx` — 2 test cases (baseline fix #5)
5. `src/features/review/hooks/use-keyboard-actions.conflict.test.ts` — 4 test cases (hotkey conflicts)

#### E2E Test Stubs (2 files)
6. `e2e/review-accessibility.spec.ts` — 20 test cases (keyboard flow + performance)
7. `e2e/review-pipeline-verification.spec.ts` — 7 test cases (pipeline + cost)

### TDD Compliance
- All unit tests: `it.skip('...', () => { expect(true).toBe(false) })`
- All E2E tests: `test.skip(true, SKIP_REASON)` at describe level
- Total: **68 test cases** across 27 test scenarios (TA-01 through TA-27)
- All tests will FAIL when `skip` is removed (red phase confirmed)

### DoD Gate
- **P0+P1 tests (22 scenarios):** ALL must PASS before story completion
- **P2 tests (5 scenarios):** Nice-to-have; skip = tech debt entry if deferred
