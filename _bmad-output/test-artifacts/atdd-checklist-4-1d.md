---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04a-subprocess-unit', 'step-04b-subprocess-e2e', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-13'
---

# ATDD Checklist - Epic 4, Story 4.1d: Responsive Layout

**Date:** 2026-03-13
**Author:** Mona
**Primary Test Level:** Unit + E2E (dual-level strategy)

---

## Story Summary

As a QA Reviewer, I want the review interface to adapt gracefully to different screen sizes, so that I can review on various displays without losing critical functionality.

**As a** QA Reviewer
**I want** responsive review interface across desktop/laptop/mobile
**So that** I can review on any display size without losing critical functionality

---

## Step 1: Preflight & Context

### Prerequisites Verified
- Story 4.1d: 6 ACs, validated, ready-for-dev
- Playwright: `playwright.config.ts` (chromium, `./e2e`)
- Vitest: `vitest.config.ts` (unit/jsdom + rls/node + integration)
- Existing review E2E: 30 specs, helpers in `e2e/helpers/review-page.ts`

### Key Components Affected
- `ReviewPageClient.tsx` (modify: conditional zone rendering)
- `FindingDetailSheet.tsx` (modify: extract content, responsive width)
- `FindingCard.tsx` (modify: expansion animation)
- `tokens.css` (modify: add laptop/tablet panel widths)

### New Components
- `src/hooks/useMediaQuery.ts` — reusable media query hook
- `src/features/review/components/FileNavigationDropdown.tsx` — placeholder dropdown
- `src/features/review/components/FindingDetailContent.tsx` — shared detail panel content

### Knowledge Base Applied
- test-quality.md, selector-resilience.md, test-levels-framework.md, test-priorities-matrix.md

## Step 2: Generation Mode

**Mode:** AI Generation (ACs clear, standard responsive scenarios, no complex recording needed)

### Advanced Elicitation Findings (42 insights)

#### Pre-mortem Analysis (12 prevention items)
| # | Prevention | Level | Priority |
|---|-----------|-------|----------|
| PM-1 | `data-layout-mode` attribute + wait after viewport change | E2E | P0 |
| PM-2 | `useMediaQuery` change event listener test | Unit | P1 |
| PM-3 | Static aside + Sheet render identical content for same finding | Unit | P0 |
| PM-4 | `data-testid="finding-detail-content"` in shared component | Impl | P0 |
| PM-5 | Focus trap Tab-cycle verification at 1200px viewport | E2E | P1 |
| PM-6 | Inverse: no focus trap at >= 1440px (static aside) | E2E | P1 |
| PM-7 | Reduced-motion: hook return value + className (not computed CSS) | Unit | P1 |
| PM-8 | `page.emulateMedia({ reducedMotion })` for animation E2E | E2E | P2 |
| PM-9 | Touch target `boundingBox()` >= 44px at 768px viewport | E2E | P1 |
| PM-10 | `FileNavigationDropdown` wraps `<nav>` landmark | Unit | P1 |
| PM-11 | ARIA landmark presence at each breakpoint | E2E | P1 |
| PM-12 | Empty state test: aside shows placeholder when no finding selected | Unit | P1 |

#### What-If Scenarios (8 edge cases)
| # | What-If | Level | Priority |
|---|---------|-------|----------|
| WI-1 | Resize during Sheet animation — no scrim remnant | E2E | P1 |
| WI-2 | Focus recovery after mode switch (not `<body>`) | E2E | P2 |
| WI-3 | Simultaneous selectedId + breakpoint renders correct finding | Unit | P2 |
| WI-4a | `useMediaQuery` returns `false` on SSR | Unit | P1 |
| WI-4b | No layout flash on hydration | E2E | P2 |
| WI-5 | selectedId persists across mode switch (aside→Sheet) | E2E | P0 |
| WI-6a | Sheet content visible with `reducedMotion: reduce` | E2E | P1 |
| WI-6b | Existing `[&[data-state]]:duration-0` pattern works | Unit | P1 |

#### Red Team vs Blue Team (14 hardening tests)
| # | Attack Vector | Defense | Level | Priority |
|---|--------------|---------|-------|----------|
| RT-1a | CSS hide vs unmount — Tab reaches hidden sidebar | Tab order excludes hidden sidebar at laptop | E2E | P1 |
| RT-1b | Tab order includes aside at desktop | Tab from finding list reaches aside | E2E | P1 |
| RT-1c | Tab stays in single column at mobile | Tab cycle within single column only | E2E | P2 |
| RT-2a | Duplicate complementary landmarks | Exactly 1 `[role="complementary"]:visible` per breakpoint | E2E | P0 |
| RT-2b | Complementary NOT in Radix portal at desktop | `[data-radix-portal] [role="complementary"]` count = 0 | E2E | P1 |
| RT-2c | Complementary IN Radix portal at laptop | `[data-radix-portal] [role="complementary"]` count = 1 | E2E | P1 |
| RT-3a | CSS specificity war on Sheet width | Computed width ≈ 360px at laptop via boundingBox | E2E | P1 |
| RT-3b | Sheet width at tablet | Computed width ≈ 300px via boundingBox | E2E | P1 |
| RT-3c | Aside width at desktop | Computed width ≈ 400px via boundingBox | E2E | P1 |
| RT-4a | Missing reduced-motion pair | FindingCard expand animation with motion | Unit | P1 |
| RT-4b | Missing reduced-motion pair | FindingCard expand instant without motion | Unit | P1 |
| RT-4c | Sheet instant with reduced-motion | Sheet open instant with reduced-motion | E2E | P1 |
| RT-5 | Clipped touch targets | Touch targets >= 44x44 at 768px | E2E | P1 |
| RT-6 | Landmark gap during resize | ARIA nav landmark at desktop + laptop stable states | E2E | P1 |

---

## Acceptance Criteria

1. **AC1:** Full 3-Column at >= 1440px — nav sidebar + finding list + static aside (400px)
2. **AC2:** 2-Column at 1024-1439px — dropdown nav + finding list + Sheet overlay (360px)
3. **AC3:** Single Column at < 768px — finding list + Sheet drawer (300px) + MobileBanner
4. **AC4:** Dual rendering — static aside at desktop, Radix Sheet below 1440px
5. **AC5:** Animation/motion — 150ms card expand, 200ms Sheet, respect prefers-reduced-motion
6. **AC6:** Accessibility — ARIA landmarks, keyboard nav, focus traps, touch targets, contrast

---

## Step 3: Test Strategy

### AC → Test Scenario Mapping

#### AC1: Full 3-Column at >= 1440px (Desktop)
| ID | Test Scenario | Level | Priority | Red Phase Failure |
|----|--------------|-------|----------|-------------------|
| T1.1 | 3-zone flex layout visible: nav sidebar (w-60) + finding list (flex-1) + static aside (400px) | E2E | P0 | Aside doesn't exist yet |
| T1.2 | Detail panel renders as static `<aside>` (NOT in Radix portal) | E2E | P0 | No aside component yet |
| T1.3 | `data-layout-mode="desktop"` attribute on root div | E2E | P1 | Attribute not implemented |
| T1.4 | Exactly 1 `[role="complementary"]:visible` (no duplicate) | E2E | P0 | Dual rendering not yet conditional |
| T1.5 | Aside computed width ≈ 400px via `boundingBox()` | E2E | P1 | Token not applied |
| T1.6 | Tab from finding list reaches aside content (no focus trap) | E2E | P1 | Aside not in tab order |

#### AC2: 2-Column at 1024-1439px (Laptop)
| ID | Test Scenario | Level | Priority | Red Phase Failure |
|----|--------------|-------|----------|-------------------|
| T2.1 | Sidebar hidden, `FileNavigationDropdown` visible with file name | E2E | P1 | Dropdown doesn't exist |
| T2.2 | Detail panel renders as Radix Sheet overlay (in portal) | E2E | P1 | Sheet still renders as default |
| T2.3 | Sheet width ≈ 360px (override `sm:max-w-sm`) | E2E | P1 | Override not applied |
| T2.4 | Scrim visible when Sheet open, click scrim closes | E2E | P1 | Existing behavior — may pass |
| T2.5 | Sidebar `<nav>` not in tab order (hidden or unmounted) | E2E | P1 | Sidebar still in DOM |
| T2.6 | `FileNavigationDropdown` wraps `<nav aria-label="File navigation">` | Unit | P1 | Component doesn't exist |

#### AC3: Single Column at < 768px (Mobile)
| ID | Test Scenario | Level | Priority | Red Phase Failure |
|----|--------------|-------|----------|-------------------|
| T3.1 | Only finding list visible (single column) | E2E | P1 | Layout doesn't collapse |
| T3.2 | Detail panel as Sheet drawer, width ≈ 300px | E2E | P1 | Width not responsive |
| T3.3 | Toggle button visible when finding selected but panel closed | E2E | P1 | Toggle doesn't exist |
| T3.4 | MobileBanner visible (from parent layout) | E2E | P2 | Already works |
| T3.5 | FindingCard expansion uses 150ms ease-out slide | Unit | P1 | Animation not added |

#### AC4: Dual Rendering Strategy
| ID | Test Scenario | Level | Priority | Red Phase Failure |
|----|--------------|-------|----------|-------------------|
| T4.1 | `useIsDesktop()` returns true at 1440px, false at 1439px | Unit | P0 | Hook doesn't exist |
| T4.2 | `useIsLaptop()` returns true at 1024px, false at 1023px | Unit | P0 | Hook doesn't exist |
| T4.3 | `useMediaQuery` SSR-safe: returns `false` when `window` undefined | Unit | P1 | Hook doesn't exist |
| T4.4 | `useMediaQuery` fires on `change` event (resize response) | Unit | P1 | Hook doesn't exist |
| T4.5 | `FindingDetailContent` renders same content in both aside and Sheet mode | Unit | P0 | Component doesn't exist |
| T4.6 | selectedId persists across mode switch (aside→Sheet on resize) | E2E | P0 | No persistence logic |
| T4.7 | Empty state: aside shows placeholder when no finding selected | Unit | P1 | Aside doesn't exist |
| T4.8 | Resize during Sheet animation — no scrim remnant | E2E | P1 | Edge case not handled |

#### AC5: Animation & Motion Compliance
| ID | Test Scenario | Level | Priority | Red Phase Failure |
|----|--------------|-------|----------|-------------------|
| T5.1 | FindingCard expand: transition class applied (motion enabled) | Unit | P1 | No animation yet |
| T5.2 | FindingCard expand: instant (no transition) when reduced-motion | Unit | P1 | No animation yet |
| T5.3 | Sheet open/close with `reducedMotion: reduce` — content visible immediately | E2E | P1 | Need to verify |
| T5.4 | Existing `[&[data-state]]:duration-0` pattern verified | Unit | P1 | Verify existing code |

#### AC6: Accessibility Compliance
| ID | Test Scenario | Level | Priority | Red Phase Failure |
|----|--------------|-------|----------|-------------------|
| T6.1 | ARIA nav landmark at desktop (sidebar) | E2E | P1 | Verify persists |
| T6.2 | ARIA nav landmark at laptop (dropdown) | E2E | P1 | Dropdown doesn't exist |
| T6.3 | `role="grid"` retained at all breakpoints | E2E | P1 | Verify existing |
| T6.4 | `role="complementary"` on detail panel (both modes) | E2E | P1 | Aside missing role |
| T6.5 | Focus trap in Sheet overlay/drawer mode | E2E | P1 | Verify Radix behavior |
| T6.6 | No focus trap at desktop (Tab between zones) | E2E | P1 | New behavior |
| T6.7 | Touch targets >= 44x44px at 768px viewport | E2E | P1 | Buttons too small |
| T6.8 | Keyboard J/K at all breakpoints >= 768px | E2E | P2 | Verify existing |
| T6.9 | Scrim contrast `bg-black/50` | E2E | P2 | Verify existing |

### Boundary Value Tests

#### Breakpoint: 1440px (Desktop ↔ Laptop)
| Boundary | Value | Expected Layout | Priority |
|----------|-------|----------------|----------|
| At | 1440px | Desktop (3-column, static aside) | P0 |
| Below | 1439px | Laptop (2-column, Sheet overlay) | P0 |
| Above | 1441px | Desktop | P2 |

#### Breakpoint: 1024px (Laptop ↔ Tablet)
| Boundary | Value | Expected Layout | Priority |
|----------|-------|----------------|----------|
| At | 1024px | Laptop (dropdown, Sheet) | P0 |
| Below | 1023px | Tablet (single column, drawer) | P0 |
| Above | 1025px | Laptop | P2 |

#### Breakpoint: 768px (Tablet ↔ Mobile)
| Boundary | Value | Expected Layout | Priority |
|----------|-------|----------------|----------|
| At | 768px | Tablet | P1 |
| Below | 767px | Mobile (+ MobileBanner) | P1 |
| Above | 769px | Tablet | P2 |

#### Touch Target: 44px minimum
| Boundary | Value | Expected | Priority |
|----------|-------|----------|----------|
| At | 44px | Pass | P1 |
| Below | 43px | Fail | P1 |

### Test Level Distribution
| Level | Count | Focus |
|-------|-------|-------|
| Unit (Vitest/jsdom) | ~14 | useMediaQuery, convenience hooks, component rendering, animation classes, ARIA |
| E2E (Playwright) | ~24 | Viewport resize, layout, widths, tab order, focus, touch targets, landmarks |
| API | 0 | No API in this story |

### Priority Summary
| Priority | Count | DoD Gate |
|----------|-------|----------|
| P0 | 8 | MUST PASS |
| P1 | 24 | MUST PASS |
| P2 | 6 | Nice-to-have |

### Red Phase Confirmation
All tests designed to fail before implementation — referencing components/hooks that don't exist yet. Test stubs use `it.skip()` pattern.

---

## Step 4: Failing Tests Generated (TDD RED Phase)

### TDD Red Phase Validation: PASS ✅

- All unit tests use `it.skip()` — 27/27
- All E2E tests use `test.skip()` — 30/30
- No placeholder assertions (`expect(true).toBe(true)`) — 0 found
- All tests assert expected behavior with real values

### Generated Test Files

#### Unit Tests (Subprocess A — 5 files, 27 tests)

| File | Tests | Priority Coverage |
|------|-------|-------------------|
| `src/hooks/useMediaQuery.test.ts` | 8 | P0×3, P1×5 |
| `src/features/review/components/FindingDetailContent.test.tsx` | 5 | P0×3, P1×2 |
| `src/features/review/components/FileNavigationDropdown.test.tsx` | 4 | P1×3, P2×1 |
| `src/features/review/components/ReviewPageClient.responsive.test.tsx` | 6 | P0×2, P1×3, P2×1 |
| `src/features/review/components/FindingCard.animation.test.tsx` | 4 | P1×4 |

#### E2E Tests (Subprocess B — 1 file, 30 tests + 1 setup)

| File | Tests | Groups |
|------|-------|--------|
| `e2e/review-responsive.spec.ts` | 30 (+1 setup) | Desktop(7) + Laptop(6) + Mobile(4) + Boundaries(3) + Persistence(3) + Accessibility(5) + Animation(2) |

#### Stub Files (import resolution)

| File | Purpose |
|------|---------|
| `src/hooks/useMediaQuery.ts` | Hook stubs (returns false) |
| `src/features/review/components/FindingDetailContent.tsx` | Renders null |
| `src/features/review/components/FileNavigationDropdown.tsx` | Renders null |

### Summary Statistics

| Metric | Value |
|--------|-------|
| TDD Phase | RED 🔴 |
| Total Tests | 57 (all skipped) |
| Unit Tests | 27 (`it.skip()`) |
| E2E Tests | 30 (`test.skip()`) |
| Stub Files | 3 |
| Subprocess Execution | PARALLEL (Unit + E2E) |
| AC Coverage | 6/6 (100%) |
| P0 Tests | 8 |
| P1 Tests | 24 |
| P2 Tests | 6 |
| Existing Tests Regression | 0 (33 existing tests unaffected) |

### Fixture & Mock Requirements

#### Unit Test Mocks
- `matchMedia` — `vi.stubGlobal()` with configurable `matches` and `addEventListener`
- `useReducedMotion` — `vi.mock('@/hooks/useReducedMotion')`
- `useSegmentContext` — `vi.mock('@/features/review/hooks/use-segment-context')`
- Subscription hooks — `useFindingsSubscription`, `useScoreSubscription`, `useThresholdSubscription`
- Child components — `FindingDetailSheet`, `FindingDetailContent`, `FileNavigationDropdown`, etc.
- Review actions — `retryAiAnalysis`, `approveFile`
- Factory functions — `buildFinding()`, `buildFindingForUI()` from `@/test/factories`

#### E2E Test Fixtures
- PostgREST seed: 1 file + 1 score + 5 segments + 4 findings
- Ephemeral user: `e2e-responsive-{timestamp}@test.local`
- Helper: `waitForLayoutMode(page, expectedMode)` — waits for `data-layout-mode` attribute
- Helper: `waitForReviewPageHydrated(page)` — from existing `e2e/helpers/review-page.ts`
- Cleanup: `cleanupTestProject()` in `afterAll`

### data-testid Registry (Story 4.1d)

| Test ID | Component | Purpose |
|---------|-----------|---------|
| `review-3-zone` | ReviewPageClient | Root layout container |
| `finding-detail-aside` | ReviewPageClient | Static aside wrapper (desktop) |
| `finding-detail-content` | FindingDetailContent | Shared content (aside + Sheet) |
| `finding-detail-sheet` | FindingDetailSheet | Sheet wrapper (existing) |
| `file-navigation-dropdown` | FileNavigationDropdown | Dropdown trigger wrapper |
| `file-nav-chevron` | FileNavigationDropdown | Chevron icon |
| `file-sidebar-nav` | ReviewPageClient | Sidebar nav (hidden at laptop) |
| `detail-panel-toggle` | ReviewPageClient | Mobile toggle button |
| `finding-list` | ReviewPageClient | Finding list container |
| `finding-compact-row` | FindingCard | Individual finding row |
| `finding-card` | FindingCard | Card wrapper (animation) |
| `finding-count-summary` | ReviewPageClient | Count summary badge |

### Implementation Checklist (for dev-story)

1. ☐ `src/hooks/useMediaQuery.ts` — implement real hook (SSR-safe, change listener, cleanup)
2. ☐ `src/features/review/components/FindingDetailContent.tsx` — extract from FindingDetailSheet
3. ☐ `src/features/review/components/FileNavigationDropdown.tsx` — nav landmark + dropdown
4. ☐ `src/features/review/components/ReviewPageClient.tsx` — conditional 3-zone rendering
5. ☐ `src/features/review/components/FindingDetailSheet.tsx` — responsive width (360px/300px)
6. ☐ `src/features/review/components/FindingCard.tsx` — expand animation (150ms ease-out)
7. ☐ `src/styles/tokens.css` — `--panel-width-desktop: 400px`, `--panel-width-laptop: 360px`, `--panel-width-mobile: 300px`
8. ☐ Add `data-layout-mode` attribute to root container
9. ☐ Add `data-testid` attributes per registry above
10. ☐ Verify `prefers-reduced-motion` compliance (Guardrail #37)

### Running Tests

```bash
# Unit tests (should all be SKIPPED in RED phase)
npx vitest run src/hooks/useMediaQuery.test.ts
npx vitest run src/features/review/components/FindingDetailContent.test.tsx
npx vitest run src/features/review/components/FileNavigationDropdown.test.tsx
npx vitest run src/features/review/components/ReviewPageClient.responsive.test.tsx
npx vitest run src/features/review/components/FindingCard.animation.test.tsx

# E2E tests (should all be SKIPPED in RED phase)
npx playwright test e2e/review-responsive.spec.ts

# All unit tests (verify no regression)
npm run test:unit
```

### Next Steps (TDD GREEN Phase)

After Story 4.1d implementation:
1. Remove `it.skip()` / `test.skip()` from all test files
2. Run unit tests: `npm run test:unit`
3. Run E2E tests: `npx playwright test e2e/review-responsive.spec.ts`
4. Verify ALL P0 + P1 tests PASS (DoD gate)
5. P2 tests: fix or defer with TD entry
6. Commit passing tests

---

## Step 5: Validation & Completion

### Validation Results

| Check | Status |
|-------|--------|
| Prerequisites satisfied | ✅ Story 4.1d validated, Playwright + Vitest configured |
| Test files created correctly | ✅ 6 test files + 3 stub files |
| Checklist matches acceptance criteria | ✅ 6/6 ACs covered |
| Tests designed to fail before implementation | ✅ All `it.skip()` / `test.skip()` |
| No orphaned browsers/CLI sessions | ✅ N/A (unit + E2E skip mode) |
| Artifacts in `test-artifacts/` | ✅ `atdd-checklist-4-1d.md` |
| Existing tests regression | ✅ 3156 passed, 0 failures |

### Completion Summary

| Metric | Value |
|--------|-------|
| Story | 4.1d — Responsive Layout |
| Primary Test Level | Unit + E2E (dual-level) |
| Unit Tests | 27 (across 5 files) |
| E2E Tests | 30 (1 file, 7 groups) |
| Total Failing Tests | 57 (all skipped — RED phase) |
| Stub Files | 3 (useMediaQuery, FindingDetailContent, FileNavigationDropdown) |
| AC Coverage | 6/6 (100%) |
| P0 | 8 tests |
| P1 | 24 tests |
| P2 | 6 tests |
| Knowledge Fragments | test-quality, selector-resilience, test-levels-framework, test-priorities-matrix |
| Advanced Elicitation | 42 insights (Pre-mortem 12 + What-If 8 + Red Team 14) |
| Boundary Tests | 3 breakpoints (1440/1024/768) + touch target (44px) |
| Existing Regression | 0 (3156 passed) |

### Key Risks & Assumptions

1. **E2E seed pattern** assumes PostgREST direct insert — may need adjustment if RLS policies change
2. **boundingBox() assertions** (400px/360px/300px) use ±5px tolerance — CSS custom properties must match exactly
3. **`data-layout-mode` attribute** is implementation assumption — dev must add to root container
4. **Mobile Sheet drawer** width (300px) assumes Tailwind token override — verify `tokens.css` values
5. **Focus trap verification** relies on Radix Sheet behavior — if Radix version changes, tests may need update

### Output Files

| File | Path |
|------|------|
| ATDD Checklist | `_bmad-output/test-artifacts/atdd-checklist-4-1d.md` |
| Unit: useMediaQuery | `src/hooks/useMediaQuery.test.ts` |
| Unit: FindingDetailContent | `src/features/review/components/FindingDetailContent.test.tsx` |
| Unit: FileNavigationDropdown | `src/features/review/components/FileNavigationDropdown.test.tsx` |
| Unit: ReviewPageClient responsive | `src/features/review/components/ReviewPageClient.responsive.test.tsx` |
| Unit: FindingCard animation | `src/features/review/components/FindingCard.animation.test.tsx` |
| E2E: Responsive layout | `e2e/review-responsive.spec.ts` |
| Stub: useMediaQuery | `src/hooks/useMediaQuery.ts` |
| Stub: FindingDetailContent | `src/features/review/components/FindingDetailContent.tsx` |
| Stub: FileNavigationDropdown | `src/features/review/components/FileNavigationDropdown.tsx` |

### Next Recommended Workflow

**`dev-story`** — implement Story 4.1d using the implementation checklist above, then remove `it.skip()` / `test.skip()` to turn GREEN.
