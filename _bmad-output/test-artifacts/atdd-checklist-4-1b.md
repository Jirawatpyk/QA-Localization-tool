---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-10'
status: complete
---

# ATDD Checklist - Epic 4, Story 4.1b: Keyboard Navigation & Focus Management

**Date:** 2026-03-10
**Author:** Mona
**Primary Test Level:** Unit (Vitest + RTL)
**Secondary Test Level:** E2E (Playwright)

---

## Story Summary

Enable keyboard-driven review workflow with J/K/Arrow navigation, Enter/Esc expand/collapse, roving tabindex, focus stability on Realtime updates, and WCAG 2.1 AA compliance.

**As a** QA Reviewer
**I want** to navigate findings using keyboard shortcuts with clear focus indicators
**So that** I can review 300+ findings per day efficiently without switching between mouse and keyboard

---

## Acceptance Criteria

1. **AC1:** J/K/Arrow Navigation with Roving Tabindex — cross-severity group, wrap, scoped hotkeys
2. **AC2:** Enter/Esc Expand/Collapse with Escape Hierarchy — inline expand, `aria-expanded`, `stopPropagation`
3. **AC3:** Tab Order — Filter Bar → Finding List → Action Bar — grid entry/exit, re-entry restore
4. **AC4:** Minor Accordion Keyboard Interaction — open/closed navigation, trigger focus
5. **AC5:** Focus Stability on Realtime Updates — ID-based tracking, recalculate on list change
6. **AC6:** Keyboard Accessibility Compliance — focus contrast, screen reader, `prefers-reduced-motion`

---

## Preflight Context

### Existing Infrastructure (DO NOT rebuild)

| Component/Hook | Location | Notes |
|---------------|----------|-------|
| useKeyboardActions | `features/review/hooks/use-keyboard-actions.ts` | Singleton registry, scope-based, IME guard |
| useFocusManagement | `features/review/hooks/use-focus-management.ts` | Focus trap, escape layers, autoAdvance |
| FindingList | `features/review/components/FindingList.tsx` | Has activeIndex, indexMap, severity grouping |
| FindingCardCompact | `features/review/components/FindingCardCompact.tsx` | Per-row Enter/Esc handlers, tabIndex, data-finding-id |
| buildFindingForUI | `src/test/factories.ts` | Reusable test factory |

### Existing Test Coverage

- `FindingList.test.tsx` — 18 tests (sorting, progressive disclosure, boundary)
- `FindingCardCompact.test.tsx` — 14 tests (rendering, interaction, a11y)
- `use-keyboard-actions.test.ts` — hook tests (register, conflict, IME)
- `use-focus-management.test.ts` — hook tests (trap, escape, autoAdvance)
- `e2e/review-keyboard.spec.ts` — 3 passing + 1 skipped (TD-E2E-014)

### Knowledge Fragments Applied

- `test-quality.md` — deterministic, isolated, <300 lines
- `component-tdd.md` — Red-Green-Refactor, a11y assertions
- `selector-resilience.md` — data-testid > ARIA > text hierarchy

---

## Test Strategy (Step 3)

### Test Level Selection

- **Primary: Unit (Vitest + RTL)** — 33 tests for keyboard navigation logic, focus management, ARIA attributes, flattenedIds computation
- **Secondary: E2E (Playwright)** — 1 test (TD-E2E-014 rewrite) for full keyboard review flow
- **No API/Component tests** — pure UI/keyboard story with no DB or Server Action interaction

### AC → Test Mapping (34 total)

| AC | P0 | P1 | P2 | Total | Level |
|----|-----|-----|-----|-------|-------|
| AC1: J/K Navigation | 4 | 6 | 1 | 11 | Unit |
| AC2: Enter/Esc | 0 | 3 | 0 | 3 | Unit (2 already tested in 4.1a) |
| AC3: Tab Order | 1 | 2 | 1 | 4 | Unit |
| AC4: Minor Accordion | 2 | 3 | 0 | 5 | Unit |
| AC5: Focus Stability | 2 | 2 | 0 | 4 | Unit |
| AC6: Accessibility | 1 | 4 | 1 | 6 | Unit |
| E2E (TD-E2E-014) | 1 | 0 | 0 | 1 | E2E |
| **Total** | **11** | **20** | **3** | **34** | |

### Boundary Value Tests (MANDATORY — Epic 2 Retro A2)

| ID | Priority | Boundary | At | Below | Above | Zero/Empty |
|----|----------|----------|----|-------|-------|------------|
| B1 | P1 | J wrap at last finding | `idx=length-1` → wraps to 0 | `idx=length-2` → normal | N/A | Single finding wraps to self |
| B2 | P1 | K wrap at first finding | `idx=0` → wraps to `length-1` | N/A | `idx=1` → normal | Single finding wraps to self |
| B3 | P1 | Single finding J/K | `length=1` → stays | N/A | N/A | `length=0` → no-op |
| B4 | P1 | Focus stability: finding removed → length=0 | safe index fallback | N/A | N/A | activeFindingId=null |
| B5 | P1 | aria-label single finding | "Finding 1 of 1" | N/A | N/A | empty list = no label |
| B6 | P1 | Accordion closed: 0 Minor in flattenedIds | excludes all Minor | N/A | open = includes all | 0 Minor findings total |

---

## Failing Tests Created (Step 4 — TDD RED Phase)

### TDD Red Phase Validation

| Check | Status |
|-------|--------|
| All unit tests use `it.skip()` | ✅ PASS (44 tests) |
| All E2E tests use `test.skip()` | ✅ PASS (1 new + 1 existing) |
| No placeholder assertions (`expect(true).toBe(true)`) | ✅ PASS (0 found) |
| All tests assert expected behavior | ✅ PASS |

### Generated Test Files

| File | Tests | Level | Phase |
|------|-------|-------|-------|
| `src/features/review/components/FindingList.keyboard.test.tsx` | 44 `it.skip()` | Unit (Vitest + RTL) | RED |
| `e2e/review-keyboard.spec.ts` (E1 rewritten) | 1 `test.skip()` | E2E (Playwright) | RED |
| **Total** | **45** | | |

### AC Coverage by Generated Tests

| AC | Tests | IDs |
|----|-------|-----|
| AC1: J/K Navigation | 12 | T1.1–T1.12 |
| AC2: Enter/Esc | 3 | T2.3–T2.5 (T2.1, T2.2 already in 4.1a) |
| AC3: Tab Order | 4 | T3.1–T3.4 (T3.3 confirms no-change from 4.1a) |
| AC4: Minor Accordion | 5 | T4.1–T4.5 |
| AC5: Focus Stability | 4 | T5.1–T5.4 |
| AC6: Accessibility | 6 | T6.1–T6.6 (T6.5 confirms no-change from 4.1a) |
| Boundary | 6 | B1–B6 |
| Party Mode | 4 | T-IME-01, T-SCROLL-01, T-CLEANUP-01, T-ASYNC-01 |
| E2E (TD-E2E-014) | 1 | E1 (rewritten from Sheet → inline expand) |

### data-testid Requirements

| data-testid | Component | Used By |
|-------------|-----------|---------|
| `finding-compact-row` | FindingCardCompact | 35+ tests (existing from 4.1a) |

### Mock Requirements

| Mock | Location | Purpose |
|------|----------|---------|
| `useKeyboardActions` | `@/features/review/hooks/use-keyboard-actions` | Capture J/K/Arrow registrations |
| `useReducedMotion` | `@/hooks/useReducedMotion` | Toggle reduced motion for G#37 |
| `useFocusManagement` | `@/features/review/hooks/use-focus-management` | Verify escape layer push/pop (T2.5) |

### Data Factories

| Factory | Location | Used By |
|---------|----------|---------|
| `buildFindingForUI()` | `src/test/factories.ts` | All 40 unit tests |
| `buildMixedSeverityFindings()` | Test file (local helper) | Default props: 2C + 2M + 2m |
| `seedFileWithFindingsForKeyboard()` | `e2e/review-keyboard.spec.ts` | E2E test seeding |

---

## Implementation Checklist

### Files to Modify

1. **`src/features/review/components/FindingList.tsx`**
   - [ ] Replace `activeIndex` (number) → `activeFindingId` (string | null) for ID-based tracking (AC5)
   - [ ] Compute `flattenedIds` from severity groups (exclude Minor when accordion closed) (AC1, AC4)
   - [ ] Derive `activeIndex` from `flattenedIds.indexOf(activeFindingId)` (AC5)
   - [ ] Register J/K/ArrowDown/ArrowUp handlers via `useKeyboardActions` (AC1)
   - [ ] Implement wrap navigation (idx+1 % length, idx-1 with wrap) (AC1, B1, B2)
   - [ ] Remove lines 110-114 (reset activeIndex to 0 on length change) — conflicts with AC5
   - [ ] Recalculate activeIndex from activeFindingId when findings change (AC5)
   - [ ] Handle finding removal: advance to nearest available (AC5, B4, B5)
   - [ ] Auto-collapse expanded finding before J/K navigation (DD#11) (AC1 T1.9)
   - [ ] Grid onFocus: focus activeFindingId row on Tab entry (AC3)
   - [ ] Pass `findingIndex` + `totalFindings` to FindingCardCompact (AC6)

2. **`src/features/review/components/FindingCardCompact.tsx`**
   - [ ] Add `findingIndex` + `totalFindings` props (AC6)
   - [ ] Add `aria-label` with "Finding N of M, severity, category, status" (AC6 T6.1)
   - [ ] Add `aria-rowindex` attribute (AC6 T6.2)
   - [ ] Use `requestAnimationFrame` for DOM focus after navigation (AC1 T1.12)
   - [ ] Respect `prefers-reduced-motion` for scroll behavior (AC6 T6.4)

3. **`src/features/review/hooks/use-focus-management.ts`**
   - [ ] Push escape layer for expanded cards (AC2 T2.5)

### Files to NOT Modify (existing behavior preserved)

- `FindingCardCompact.tsx` per-row Enter/Esc handlers (lines 64-72) — already correct from 4.1a
- `use-keyboard-actions.ts` — singleton registry works as-is
- `FindingList.test.tsx` — 18 existing tests remain

---

## Running Tests

### Unit Tests (Primary)

```bash
# Run all 4.1b keyboard tests
npx vitest run src/features/review/components/FindingList.keyboard.test.tsx

# Run with verbose output
npx vitest run src/features/review/components/FindingList.keyboard.test.tsx --reporter=verbose

# Run alongside existing tests (verify no regression)
npx vitest run src/features/review/components/FindingList.test.tsx src/features/review/components/FindingList.keyboard.test.tsx
```

### E2E Tests (Secondary)

```bash
# Run keyboard E2E spec
npx playwright test e2e/review-keyboard.spec.ts

# Run specific E1 test
npx playwright test e2e/review-keyboard.spec.ts -g "E1"
```

### All Review Tests (Regression Check)

```bash
# All review unit tests
npx vitest run src/features/review/

# All review E2E tests
npx playwright test e2e/review-keyboard.spec.ts
```

---

## Red-Green-Refactor Workflow

### Phase 1: RED (Current — ATDD Complete)

- [x] 40 unit tests generated with `it.skip()` in `FindingList.keyboard.test.tsx`
- [x] 1 E2E test rewritten with `test.skip()` in `review-keyboard.spec.ts` (E1)
- [x] All tests assert expected behavior (no placeholders)
- [x] TD-E2E-014 rewritten: Sheet-open → inline-expand assertions

### Phase 2: GREEN (Dev Implementation)

1. Remove `it.skip()` from P0 tests first (11 tests)
2. Implement minimum code to make P0 tests pass
3. Remove `it.skip()` from P1 tests (20 tests + 6 boundary)
4. Implement remaining code for P1
5. Remove `it.skip()` from P2 tests (3 tests)
6. Implement P2 enhancements
7. Remove `test.skip()` from E2E E1 test
8. Verify E2E passes locally (`npx playwright test e2e/review-keyboard.spec.ts`)

### Phase 3: REFACTOR

- Ensure `FindingList.keyboard.test.tsx` stays < 300 lines or split by AC
- Extract shared helpers if patterns emerge
- Verify existing 18 tests in `FindingList.test.tsx` still pass (regression)

### DoD Gate (Story Completion)

- [ ] ALL P0 tests PASS (11 unit + 1 E2E)
- [ ] ALL P1 tests PASS (20 unit + 6 boundary)
- [ ] P2 tests PASS or tracked as tech debt with TD ID
- [ ] Existing tests in `FindingList.test.tsx` (18) still pass
- [ ] Existing tests in `FindingCardCompact.test.tsx` (14) still pass
- [ ] E2E `review-keyboard.spec.ts` — all non-skipped tests pass

---
