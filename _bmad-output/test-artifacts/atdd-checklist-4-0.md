---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-09'
---

# ATDD Checklist - Epic 4, Story 4.0: Review Infrastructure Setup

**Date:** 2026-03-09
**Author:** Mona
**Primary Test Level:** Unit (Vitest/jsdom) + E2E (Playwright) for real browser keyboard tests

---

## Story Summary

Infrastructure story establishing the keyboard hotkey framework, accessibility foundation (ARIA, focus management), review UI shell (3-zone layout with shadcn Sheet), action bar, and contrast token fixes — enabling Stories 4.1-4.7 to build review features on a consistent, accessible, keyboard-driven foundation.

**As a** Developer
**I want** the hotkey framework, accessibility foundation, and review UI shell established
**So that** Stories 4.1-4.7 can build review features on a consistent, accessible, keyboard-driven foundation

---

## Preflight Results

### Prerequisites
- Story approved: `4-0-review-infrastructure-setup.md` — 7 ACs, status `ready-for-dev`
- Playwright configured: `playwright.config.ts` — testDir `./e2e`, Chromium, baseURL localhost:3000
- Vitest configured: `vitest.config.ts` — unit (jsdom) + rls (node) + integration (node)

### Framework & Existing Patterns
- 22 E2E specs, 21 review unit tests
- E2E helpers: `signupOrLogin`, `createTestProject`, `pollFileStatus`, `pollScoreLayer`, `queryScore`
- Factories: `buildFinding`, `buildFile`, `buildSegment`, `buildReviewSession`, `createDrizzleMock`
- Pattern: hoisted mocks → `vi.mock()` → `beforeEach` store reset → render/renderHook → assert

### TEA Config
- `tea_use_playwright_utils`: true
- `tea_browser_automation`: auto

### Knowledge Base (9 fragments loaded)
- data-factories, component-tdd, test-quality, test-healing-patterns, selector-resilience
- timing-debugging, test-levels-framework, test-priorities-matrix, playwright-cli

---

## Advanced Elicitation Findings

### Pre-mortem Analysis (6 prevention actions)
1. jsdom != real browser for keyboard → add E2E keyboard tests (not just unit)
2. aria-live mount timing → test 2-step: mount empty container then inject content
3. Focus trap not real in jsdom → E2E `page.keyboard.press('Tab')` + `toBeFocused()`
4. Token change visual regression → contrast ratio boundary test + render existing components
5. E2E flaky from pipeline dependency → PostgREST seed + Inngest gate + poll helper
6. TD fixes break siblings → dedicated regression tests per TD item

### Red Team vs Blue Team (+4 test cases)
1. Modal transition race → test `isClosing` state + suppress hotkey (P1)
2. Nested Esc across zones → dropdown-in-Sheet Esc test (P1)
3. Hotkey vs disabled button → handler checks enabled state stub (P2, real in 4.2)
4. reduced-motion incomplete → extend to Sheet + tooltip (P1)
- DEFERRED to 4.1b: roving tabindex DOM reorder (P0 for 4.1b)

### FMEA (27 failure modes → 28 test cases)
- useKeyboardActions: K1-K6 (6 modes, 3 P0 + 3 P1)
- useFocusManagement: F1-F6 (6 modes, 4 P0 + 3 P1)
- ARIA Foundation: A1-A5 (5 modes, 2 P0 + 2 P1 + 1 P2)
- Layout + Sheet: L1-L5 (5 modes, 3 P0 + 2 P1)
- Action Bar + Cheat Sheet + Tokens: B1-B2, C1, T1-T2 (5 modes, 1 P0 + 4 P1)

### War Room Consensus (Final Test Budget)

| Category | Unit | E2E | Boundary | Total |
|----------|:---:|:---:|:---:|:---:|
| useKeyboardActions (K1-K6) | 6 | — | — | 6 |
| useFocusManagement (F1-F6+rerender) | 5 | 2 | — | 7 |
| ARIA Foundation (A1-A5) | 5 | — | — | 5 |
| Layout + Sheet (L1-L5) | 5 | — | — | 5 |
| Action Bar (B1-B2+order) | 2 | — | 1 | 3 |
| Cheat Sheet (C1+categories) | 2 | 1 | — | 3 |
| Tokens (T1-T2) | — | — | 2 | 2 |
| reduced-motion (Sheet+modal) | 1 | — | — | 1 |
| E2E keyboard composite | — | 1 | — | 1 |
| TD fixes (7 items) | 7 | — | — | 7 |
| **Grand Total** | **33** | **4** | **3** | **40** |

Priority breakdown: P0=13, P1=18, P2=2, TD regression=7

Test file structure: task-aligned (1 test file per task)
E2E: 4 tests in `e2e/review-keyboard.spec.ts` (serial)

---

## Generation Mode

**Mode:** AI Generation
**Rationale:** ACs are clear, scenarios are standard UI infrastructure (hooks, components, ARIA, tokens). No complex multi-step UI recording needed. 40 test cases defined from FMEA + War Room — AI generates stubs from existing project patterns.

---

## Test Strategy (AC → Scenarios → Levels → Priorities)

### AC1: useKeyboardActions Hook (6 Unit)
- [P0] K1: ignore keypress during IME composition (isComposing + keyCode=229)
- [P0] K2: not preventDefault on browser shortcuts (Ctrl+S/P/W/N/T/F5)
- [P0] K3: suppress review hotkeys when modal scope active
- [P1] K4: warn when duplicate key registered in same scope
- [P1] K5: suppress hotkeys in input/textarea/select/contenteditable
- [P1] K6: cleanup event listener on component unmount

### AC2: useFocusManagement Hook (5 Unit + 2 E2E)
- [P0] F1: trap Tab within modal boundary (Unit)
- [P0] F1e: trap Tab in real browser modal (E2E)
- [P0] F2: restore focus to trigger element after modal close
- [P0] F3: auto-advance to next Pending finding, skipping reviewed
- [P1] F3b: focus action bar when no Pending findings remain
- [P1] F4: use requestAnimationFrame for auto-advance focus
- [P0] F5: close only innermost layer on Esc (stopPropagation)
- [P1] F5e: close dropdown-in-Sheet before Sheet on Esc (E2E)
- [P1] F6: handle focus restore after component re-render

### AC3: ARIA Foundation (5 Unit)
- [P0] A1: role="grid" + aria-label on finding list container
- [P0] A2: mount aria-live container before injecting content
- [P1] A3: toggle aria-expanded on finding card click
- [P1] A4: apply focus ring CSS (outline: 2px solid, offset: 4px)
- [P2] A5: debounce rapid announcements in announce utility

### AC4: 3-Zone Layout + Sheet (5 Unit)
- [P0] L1: open FindingDetailSheet when finding selected in store
- [P1] L2: not render both Sheet and global DetailPanel content
- [P0] L3: render 3-zone layout without max-width constraint
- [P0] L4: maintain Realtime subscriptions after layout refactor
- [P1] L5: not auto-focus any element on mount

### AC5: Action Bar (2 Unit + 1 Boundary)
- [P1] B1: show tooltip on keyboard focus, not just hover
- [P1] B2: correct aria-keyshortcuts on each button
- [P1] B3 (boundary): render 7 buttons in exact order

### AC6: Keyboard Cheat Sheet (2 Unit + 1 E2E)
- [P0] C1: open cheat sheet on Ctrl+Shift+/ (Ctrl+?)
- [P1] C1e: E2E real Ctrl+Shift+/ keypress
- [P2] C2: group hotkeys by 5 categories

### AC7: Contrast Tokens (2 Boundary)
- [P1] T1: --color-severity-major passes 4.5:1 contrast
- [P1] T2: all 5 finding tinted backgrounds pass 4.5:1

### Cross-cutting
- [P1] RM1: Sheet renders without transition when prefers-reduced-motion
- [P0] E1: E2E serial composite (page load → hotkey → Esc → focus restore)

### TD Regression (7 tests)
- [P1] TD1: review-score E2E unskip (TD-E2E-007)
- [P1] TD2: getBreadcrumbEntities real queries + withTenant (TD-TODO-001)
- [P1] TD3: breadcrumb AbortController on route change (TD-UX-001)
- [P1] TD4: truncateSegments [first,...,secondToLast,last] (TD-UX-002)
- [P1] TD5: getDashboardData non-zero findingsCount (TD-DASH-001)
- [P1] TD6: useNotifications Zod validation (TD-DASH-003)
- [P1] TD7: auto_passed rationale Realtime update (TD-REVIEW-002)

### Boundary Value Summary
| Boundary | At | Below | Above | Zero |
|---|---|---|---|---|
| Contrast 4.5:1 | 4.5 (pass) | 4.4 (fail) | 5.0 (pass) | N/A |
| Button count=7 | 7 (pass) | 6 (fail) | 8 (fail) | 0 (fail) |
| Browser shortcut exclusion=6 | 6 excluded (pass) | 5 excluded (fail) | N/A | 0 excluded (fail) |

### Final Budget: P0=11, P1=21, P2=1, TD=7 → Total=40 tests (32 unit + 5 E2E + 3 boundary)

---

## Step 04c: Test Generation Aggregation Results

### TDD Red Phase Validation: PASS

- All unit tests use `it.skip()` — will be skipped until feature implemented
- All E2E tests use `test.skip()` — will be skipped until feature implemented
- All tests assert expected behavior (no `expect(true).toBe(true)` placeholders)
- Fail markers: `expect(true).toBe(false)` in unit stubs (will error if accidentally unskipped)

### Generated Test Files

#### New Unit Test Files (6 files, 31 stubs)

| File | Stubs | Coverage |
|------|:-----:|----------|
| `src/features/review/hooks/use-keyboard-actions.test.ts` | 6 | K1-K6: IME, browser shortcuts, modal scope, duplicates, input suppression, cleanup |
| `src/features/review/hooks/use-focus-management.test.ts` | 7 | F1-F6+F3b: focus trap, restore, auto-advance, rAF, Esc hierarchy, re-render |
| `src/features/review/components/ReviewPageClient.story40.test.tsx` | 11 | A1-A5 (ARIA), L1-L5 (layout), RM1 (reduced-motion) |
| `src/features/review/components/ReviewActionBar.test.tsx` | 3 | B1-B3: tooltip, aria-keyshortcuts, button order (boundary) |
| `src/features/review/components/KeyboardCheatSheet.test.tsx` | 2 | C1-C2: Ctrl+Shift+/ open, 5 categories |
| `src/styles/tokens.test.ts` | 2 | T1-T2: contrast ratio boundary (4.5:1 WCAG) |

#### TD Regression Stubs (5 modified files, 6 stubs)

| File | Stubs | TD Item |
|------|:-----:|---------|
| `src/components/layout/actions/getBreadcrumbEntities.action.test.ts` | 1 | TD2 (TD-TODO-001): real DB queries + withTenant |
| `src/components/layout/app-breadcrumb.test.tsx` | 2 | TD3 (TD-UX-001): AbortController, TD4 (TD-UX-002): truncateSegments |
| `src/features/dashboard/actions/getDashboardData.action.test.ts` | 1 | TD5 (TD-DASH-001): non-zero findingsCount |
| `src/features/dashboard/hooks/useNotifications.test.ts` | 1 | TD6 (TD-DASH-003): Zod validation |
| `src/features/review/hooks/use-score-subscription.test.ts` | 1 | TD7 (TD-REVIEW-002): auto_passed rationale Realtime |

#### E2E Test Files (2 files, 7 stubs + 2 setups)

| File | Stubs | Coverage |
|------|:-----:|----------|
| `e2e/review-keyboard.spec.ts` | 4 + 1 setup | F1e (focus trap), F5e (Esc hierarchy), C1e (cheat sheet), E1 (composite flow) |
| `e2e/review-score.spec.ts` | 3 + 1 setup | TD1 (score badge), TD2 (accept→recalc), TD3 (severity icons+text) |

### Test Count Summary

| Category | Count |
|----------|:-----:|
| Unit test stubs (new files) | 31 |
| TD regression stubs (modified files) | 6 |
| Boundary stubs (included in above) | 3 (B3, T1, T2) |
| E2E test stubs | 7 |
| E2E setup tests | 2 |
| **Total test stubs** | **44** |
| **Planned (War Room budget)** | **40** |
| **Delta** | +4 (review-score added TD2/TD3 E2E + F3b was extra unit) |

### Fixture Infrastructure

Existing factories/helpers sufficient for red phase:
- `buildFinding()` — `src/test/factories.ts`
- `createDrizzleMock()` — `src/test/drizzleMock.ts`
- `signupOrLogin()`, `createTestProject()`, `queryScore()` — `e2e/helpers/`
- New E2E seed helper: `seedFileWithFindingsForKeyboard()` in `review-keyboard.spec.ts`
- New E2E seed helper: `seedFileWithScoreForReview()` in `review-score.spec.ts`
- WCAG contrast utilities: `relativeLuminance()`, `contrastRatio()` inline in `tokens.test.ts`

No additional fixture files needed for TDD red phase.

### Acceptance Criteria Coverage Map

| AC | Tests | Status |
|----|-------|--------|
| AC1: useKeyboardActions | K1, K2, K3, K4, K5, K6 | 6/6 covered |
| AC2: useFocusManagement | F1, F1e, F2, F3, F3b, F4, F5, F5e, F6 | 9/9 covered |
| AC3: ARIA Foundation | A1, A2, A3, A4, A5 | 5/5 covered |
| AC4: Layout + Sheet | L1, L2, L3, L4, L5 | 5/5 covered |
| AC5: Action Bar | B1, B2, B3 | 3/3 covered |
| AC6: Cheat Sheet | C1, C1e, C2 | 3/3 covered |
| AC7: Contrast Tokens | T1, T2 | 2/2 covered |
| Cross-cutting | RM1, E1 | 2/2 covered |
| TD Regression | TD1-TD7 | 7/7 covered |
| **Total** | | **42/42 scenarios covered** |

---

## Step 05: Validation & Completion

### Validation Checklist

| Check | Status | Notes |
|-------|:------:|-------|
| Story approved with testable ACs | PASS | 7 ACs, `ready-for-dev` |
| Test framework configured | PASS | Vitest (jsdom) + Playwright (Chromium) |
| All ACs mapped to test scenarios | PASS | 42 scenarios across 7 ACs + cross-cutting + TD |
| All tests use `it.skip()`/`test.skip()` | PASS | TDD Red Phase compliant |
| No placeholder assertions | PASS | `expect(true).toBe(false)` markers |
| No `expect(true).toBe(true)` | PASS | All stubs assert expected behavior |
| Factories/helpers exist or documented | PASS | `buildFinding`, `createDrizzleMock`, E2E seed helpers |
| No orphaned browser sessions | PASS | No CLI sessions left |
| Artifacts in `_bmad-output/test-artifacts/` | PASS | `atdd-checklist-4-0.md` |
| Priority framework applied | PASS | P0=11, P1=21, P2=2, TD=7 |
| Boundary value tests present | PASS | T1, T2 (contrast), B3 (button count) |
| E2E tests follow project patterns | PASS | PostgREST seed, `signupOrLogin`, `waitForReviewPageReady` |
| Unit tests follow project patterns | PASS | Hoisted mocks, `vi.mock()`, `beforeEach` reset |

### Implementation Checklist (for dev-story GREEN phase)

Dev must implement in this order to pass tests:

1. **Task 0.1-0.3: shadcn components** — `npx shadcn@latest add sheet tooltip` → generates `sheet.tsx`, `tooltip.tsx`
2. **Task 1: `useKeyboardActions` hook** → `src/features/review/hooks/use-keyboard-actions.ts`
   - Remove `it.skip()` from `use-keyboard-actions.test.ts` → make 6 tests pass (K1-K6)
3. **Task 2: `useFocusManagement` hook** → `src/features/review/hooks/use-focus-management.ts`
   - Remove `it.skip()` from `use-focus-management.test.ts` → make 7 tests pass (F1-F6+F3b)
4. **Task 3: ARIA utilities** — `announce()`, focus ring CSS, aria-live container
   - Remove `it.skip()` from `ReviewPageClient.story40.test.tsx` A1-A5 → make 5 tests pass
5. **Task 4.1-4.2: Layout refactor** — 3-zone layout + `FindingDetailSheet.tsx`
   - Remove `it.skip()` from `ReviewPageClient.story40.test.tsx` L1-L5 → make 5 tests pass
6. **Task 5: ReviewActionBar** → `src/features/review/components/ReviewActionBar.tsx`
   - Remove `it.skip()` from `ReviewActionBar.test.tsx` → make 3 tests pass (B1-B3)
7. **Task 6: KeyboardCheatSheet** → `src/features/review/components/KeyboardCheatSheet.tsx`
   - Remove `it.skip()` from `KeyboardCheatSheet.test.tsx` → make 2 tests pass (C1-C2)
8. **Task 7: Contrast token fixes** — update `src/styles/tokens.css`
   - Remove `it.skip()` from `tokens.test.ts` → make 2 tests pass (T1-T2)
9. **Task 8: TD regression fixes** (6 unit stubs across 5 files)
   - TD2-TD7: fix each function/hook, remove `it.skip()`, verify pass
10. **Task 9: RM1** — reduced-motion on Sheet
   - Remove `it.skip()` from RM1 stub → verify pass
11. **E2E tests** — remove `test.skip()` from both spec files, run `npx playwright test e2e/review-keyboard.spec.ts e2e/review-score.spec.ts`

### Execution Commands

```bash
# Unit tests (all Story 4.0 stubs)
npx vitest run src/features/review/hooks/use-keyboard-actions.test.ts
npx vitest run src/features/review/hooks/use-focus-management.test.ts
npx vitest run src/features/review/components/ReviewPageClient.story40.test.tsx
npx vitest run src/features/review/components/ReviewActionBar.test.tsx
npx vitest run src/features/review/components/KeyboardCheatSheet.test.tsx
npx vitest run src/styles/tokens.test.ts

# TD regression tests
npx vitest run src/components/layout/actions/getBreadcrumbEntities.action.test.ts
npx vitest run src/components/layout/app-breadcrumb.test.tsx
npx vitest run src/features/dashboard/actions/getDashboardData.action.test.ts
npx vitest run src/features/dashboard/hooks/useNotifications.test.ts
npx vitest run src/features/review/hooks/use-score-subscription.test.ts

# E2E tests
npx playwright test e2e/review-keyboard.spec.ts
npx playwright test e2e/review-score.spec.ts

# All unit tests at once
npx vitest run --project unit

# All E2E tests at once
npx playwright test
```

### Key Risks & Assumptions

1. **jsdom keyboard fidelity** — unit tests for keyboard hooks test handler logic, NOT real browser events. E2E tests (F1e, F5e, C1e, E1) cover real browser keyboard interaction
2. **Sheet component** — tests assume shadcn Sheet renders `role="complementary"` (may need custom role override during implementation)
3. **Roving tabindex** — DEFERRED to Story 4.1b. Story 4.0 tests focus trap and auto-advance, not grid navigation
4. **E2E seed vs real pipeline** — E2E tests seed via PostgREST (bypass Inngest pipeline). Real pipeline E2E tested in existing `score-lifecycle.spec.ts`
5. **Token contrast values** — T1/T2 tests assert current token hex values. If tokens change, tests need updating

### Completion Summary

| Metric | Value |
|--------|-------|
| Story | 4.0 Review Infrastructure Setup |
| Primary test level | Unit (Vitest/jsdom) + E2E (Playwright) |
| Total test stubs | 44 (31 unit + 6 TD unit + 7 E2E) |
| New test files | 8 (6 unit + 2 E2E) |
| Modified test files | 5 (TD regression stubs) |
| Boundary tests | 3 (T1, T2, B3) |
| AC coverage | 42/42 scenarios (100%) |
| Priority breakdown | P0=11, P1=21, P2=2, TD=7 |
| Elicitation methods | 4 (pre-mortem, red/blue, FMEA, war room) |
| Knowledge fragments | 9 |
| Output file | `_bmad-output/test-artifacts/atdd-checklist-4-0.md` |
| Next workflow | `dev-story` (implementation → GREEN phase) |
