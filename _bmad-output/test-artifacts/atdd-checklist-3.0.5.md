---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-01'
---

# ATDD Checklist - Epic 3, Story 3.0.5: UX Foundation Gap Fix

**Date:** 2026-03-01
**Author:** Mona
**Primary Test Level:** Component (Vitest jsdom)

---

## Story Summary

ScoreBadge component refactor (sizes, states, animations), breadcrumb navigation, severity badge color fix, and RecentFilesTable ScoreBadge integration. Pure UI story that closes 4 verified UX gaps before Story 3.2c.

**As a** QA Reviewer / PM
**I want** ScoreBadge to show proper size variants, status labels, and analyzing animation; the app header to display breadcrumb navigation; and severity badge colors to match design tokens
**So that** the UI accurately communicates quality scores, navigation context, and severity levels before AI-produced findings are displayed

---

## Acceptance Criteria

1. **AC1** — ScoreBadge supports 3 size variants (sm/md/lg) with correct text sizing
2. **AC2** — ScoreBadge displays 5 states (pass/review/fail/analyzing/rule-only) with color tokens + auto-derivation
3. **AC3** — ScoreBadge `analyzing` state shows pulse animation with prefers-reduced-motion support
4. **AC4** — ScoreBadge score change shows 300ms slide animation with prefers-reduced-motion support
5. **AC5** — Breadcrumb navigation replaces static title in AppHeader
6. **AC6** — Taxonomy severity badges use correct design token colors (major=orange, minor=blue)
7. **AC7** — RecentFilesTable uses ScoreBadge component instead of raw `<span>`
8. **AC8** — Unit tests cover all above with boundary values

---

## Step 01: Preflight & Context — Complete

### Prerequisites Verified
- [x] Story approved with clear AC (8 ACs, ready-for-dev)
- [x] Test framework configured (Vitest workspace: unit/jsdom + rls/node)
- [x] Development environment available

### Context Loaded
- [x] Story file: `_bmad-output/implementation-artifacts/3-0-5-ux-foundation-gap-fix.md`
- [x] Framework config: `vitest.config.ts` — unit project with jsdom, setupFiles: `src/test/setup.ts`
- [x] Existing ScoreBadge tests: 9 tests in `ScoreBadge.test.tsx` (will break after refactor)
- [x] Source components: ScoreBadge.tsx (33 lines), AppHeader (38 lines), finding.ts types
- [x] Test utilities: factories.ts, drizzleMock.ts, setup.ts

### Knowledge Fragments Loaded
- [x] data-factories.md — Factory with overrides + faker
- [x] component-tdd.md — Red-Green-Refactor, render + assert pattern
- [x] test-quality.md — Deterministic, isolated, explicit, <300 lines
- [x] test-healing-patterns.md — Common failure patterns
- [x] selector-resilience.md — data-testid > ARIA roles > text
- [x] timing-debugging.md — Deterministic waits (less relevant for jsdom)

### TEA Config Flags
- `tea_use_playwright_utils: true` — N/A for component tests
- `tea_browser_automation: auto` — N/A for component tests

### Test Pattern Established
- **Framework:** Vitest + @testing-library/react
- **Import pattern:** dynamic `await import('./Component')`
- **Assertions:** `screen.getByText()`, `screen.getByTestId()`, className matching
- **Setup:** `vi.clearAllMocks()` in `beforeEach`, Zustand reset in global setup
- **Factories:** `buildFinding()`, `buildReviewSession()` etc. in `src/test/factories.ts`

---

## Step 02: Generation Mode — AI Generation

**Mode:** AI Generation (not Recording)
**Reason:** ACs have precise expected values (thresholds, color tokens, CSS classes). Test level is component (Vitest jsdom) — no browser automation needed. No complex UI interactions requiring live recording.

---

## Step 03: Test Strategy

### Test Level: Component (Vitest jsdom) — All Tests

### Test Files

| File | Tests | Scope |
|------|-------|-------|
| `src/features/batch/components/ScoreBadge.test.tsx` | 32 | AC1-AC4 + boundaries + backward compat |
| `src/components/layout/app-breadcrumb.test.tsx` | 7 | AC5 + breadcrumb boundaries |
| `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx` | 3 | AC6 severity badge colors |
| `src/features/dashboard/components/RecentFilesTable.test.tsx` | 2 | AC7 ScoreBadge integration |
| **Total** | **44** | |

### ScoreBadge Tests (32 tests)

#### AC1: Size Variants (4 tests, P1)
- 1.1 `size="sm"` renders text-xs class (default)
- 1.2 `size="md"` renders text-2xl class
- 1.3 `size="lg"` renders text-5xl class
- 1.4 No size prop defaults to sm

#### AC2: States + Auto-derivation (13 tests, P0/P1)
- 2.1 [P0] `state="pass"` → green + "Passed" label
- 2.2 [P0] `state="review"` → amber + "Review" label
- 2.3 [P0] `state="fail"` → red + "Fail" label
- 2.4 [P0] `state="analyzing"` → indigo + "Analyzing..." label
- 2.5 [P0] `state="rule-only"` → blue + "Rule-based" label
- 2.6 [P0] Auto: score=96, criticalCount=0 → "Passed"
- 2.7 [P0] Auto: score=96, criticalCount=1 → "Review"
- 2.8 [P0] Auto: score=85 → "Review"
- 2.9 [P0] Auto: score=65 → "Fail"
- 2.10 [P0] Auto: score=null → muted "N/A"
- 2.11 [P1] Explicit state overrides auto-derivation
- 2.12 [P1] lg/md show label below score
- 2.13 [P1] sm shows label as tooltip only

#### AC2: Boundary Values (8 tests, P0 — MANDATORY)
- B1 [P0] Score=95.0 + criticalCount=0 → "Passed" (at pass threshold)
- B2 [P0] Score=94.9 → "Review" (below pass threshold)
- B3 [P0] Score=70.0 → "Review" (at fail boundary)
- B4 [P0] Score=69.9 → "Fail" (below fail boundary)
- B5 [P0] Score=null → "N/A" muted
- B6 [P0] criticalCount=0 at score=95 → "Passed"
- B7 [P0] criticalCount=1 at score=95 → "Review"
- B8 [P0] criticalCount=undefined at score=96 → "Passed" (backward compat)

#### AC3: Analyzing Animation (3 tests, P1)
- 3.1 [P1] Analyzing state has pulse animation class
- 3.2 [P1] Score with analyzing shows reduced opacity
- 3.3 [P1] prefers-reduced-motion disables pulse

#### AC4: Score Change Animation (3 tests, P2)
- 4.1 [P2] Score increase applies slide-up class
- 4.2 [P2] Score decrease applies slide-down class
- 4.3 [P2] prefers-reduced-motion disables slide

#### Backward Compatibility (1 test, P0)
- BC1 [P0] ScoreBadge with only score prop renders correctly

### Breadcrumb Tests (7 tests)

#### AC5: Breadcrumb Navigation (5 tests, P1)
- 5.1 [P1] Root `/dashboard` shows "Dashboard" only
- 5.2 [P1] Nested route shows correct segments
- 5.3 [P1] Last segment is bold and not a link
- 5.4 [P1] > 4 segments truncates middle to `...`
- 5.5 [P1] Static segments resolve from pathname

#### AC5: Boundary Values (2 tests, P1)
- B9 [P1] 4 segments → no truncation (at threshold)
- B10 [P1] 5 segments → truncation (above threshold)

### TaxonomyMappingTable Tests (3 tests)

#### AC6: Severity Badge Colors (3 tests, P1)
- 6.1 [P1] major → bg-severity-major class (orange)
- 6.2 [P1] minor → bg-severity-minor class (blue)
- 6.3 [P1] critical → bg-severity-critical class (red)

### RecentFilesTable Tests (2 tests)

#### AC7: ScoreBadge Integration (2 tests, P1)
- 7.1 [P1] Score column renders ScoreBadge component
- 7.2 [P1] Null score renders ScoreBadge with score=null

### Priority Summary

| Priority | Count | Gate |
|----------|-------|------|
| P0 | 20 | MUST pass before story done |
| P1 | 21 | MUST pass before story done |
| P2 | 3 | Nice-to-have (tech debt if skipped) |
| **Total** | **44** | |

### Red Phase Confirmation
All tests will FAIL before implementation:
- ScoreBadge: new types/props don't exist yet
- AppBreadcrumb: component doesn't exist yet
- TaxonomyMappingTable: still uses wrong variant classes
- RecentFilesTable: still uses raw `<span>` not ScoreBadge

---

## Step 04: Parallel Test Generation — Complete

**Execution mode:** Parallel (2 groups)
- **Group A:** ScoreBadge tests (32 tests)
- **Group B:** Breadcrumb + Taxonomy + RecentFiles (12 tests)

### Subprocess Results

| Group | Tests Generated | `it.skip()` | Regression |
|-------|----------------|-------------|------------|
| A (ScoreBadge) | 32 | ✅ All skipped | 0 |
| B (Other components) | 12 | ✅ All skipped | 0 |

---

## Step 04c: Aggregation — Complete

### TDD Red Phase Compliance ✅

- [x] All 44 tests use `it.skip()` (verified by Vitest output)
- [x] No placeholder assertions (`expect(true).toBe(true)`)
- [x] All tests assert expected behavior with specific values
- [x] `@ts-expect-error` on new props (state, size, criticalCount)
- [x] 1,914 existing tests pass — zero regressions

### Failing Tests Created (RED Phase)

#### Component Tests (44 tests)

**File:** `src/features/batch/components/ScoreBadge.test.tsx` (458 lines)

- ✅ **[P1] 1.1** size="sm" renders text-xs class — RED: new size logic not implemented
- ✅ **[P1] 1.2** size="md" renders text-2xl class — RED: size prop doesn't exist
- ✅ **[P1] 1.3** size="lg" renders text-5xl class — RED: size prop doesn't exist
- ✅ **[P1] 1.4** default size is sm — RED: no size defaulting logic
- ✅ **[P0] 2.1** state="pass" → green + "Passed" — RED: state prop doesn't exist
- ✅ **[P0] 2.2** state="review" → amber + "Review" — RED: state prop doesn't exist
- ✅ **[P0] 2.3** state="fail" → red + "Fail" — RED: state prop doesn't exist
- ✅ **[P0] 2.4** state="analyzing" → indigo + "Analyzing..." — RED: state prop doesn't exist
- ✅ **[P0] 2.5** state="rule-only" → blue + "Rule-based" — RED: state prop doesn't exist
- ✅ **[P0] 2.6** Auto: score=96, criticalCount=0 → "Passed" — RED: criticalCount not accepted
- ✅ **[P0] 2.7** Auto: score=96, criticalCount=1 → "Review" — RED: criticalCount not accepted
- ✅ **[P0] 2.8** Auto: score=85 → "Review" — RED: class is 'warning' not 'status-pending'
- ✅ **[P0] 2.9** Auto: score=65 → "Fail" — RED: class is 'destructive' not 'status-fail'
- ✅ **[P0] 2.10** Auto: score=null → muted "N/A" — RED: muted class may change
- ✅ **[P1] 2.11** Explicit state overrides auto-derivation — RED: state prop doesn't exist
- ✅ **[P1] 2.12** lg/md show label below score — RED: no label rendering
- ✅ **[P1] 2.13** sm shows label as tooltip only — RED: no tooltip behavior
- ✅ **[P0] B1** Score=95.0 + criticalCount=0 → "Passed" — RED: new thresholds
- ✅ **[P0] B2** Score=94.9 → "Review" — RED: new thresholds
- ✅ **[P0] B3** Score=70.0 → "Review" — RED: threshold changed from 80 to 70
- ✅ **[P0] B4** Score=69.9 → "Fail" — RED: threshold changed from 80 to 70
- ✅ **[P0] B5** Score=null → "N/A" muted — RED: muted class may change
- ✅ **[P0] B6** criticalCount=0 at score=95 → "Passed" — RED: criticalCount not implemented
- ✅ **[P0] B7** criticalCount=1 at score=95 → "Review" — RED: criticalCount not implemented
- ✅ **[P0] B8** criticalCount=undefined at score=96 → "Passed" — RED: backward compat
- ✅ **[P1] 3.1** Analyzing has pulse class — RED: no animation logic
- ✅ **[P1] 3.2** Analyzing shows reduced opacity — RED: no opacity logic
- ✅ **[P1] 3.3** prefers-reduced-motion disables pulse — RED: no motion detection
- ✅ **[P2] 4.1** Score increase → slide-up class — RED: no animation logic
- ✅ **[P2] 4.2** Score decrease → slide-down class — RED: no animation logic
- ✅ **[P2] 4.3** prefers-reduced-motion disables slide — RED: no motion detection
- ✅ **[P0] BC1** Backward compat: only score prop works — RED: class changes

**File:** `src/components/layout/app-breadcrumb.test.tsx` (179 lines)

- ✅ **[P1] 5.1** Root /dashboard shows "Dashboard" only — RED: stub returns null
- ✅ **[P1] 5.2** Nested route shows correct segments — RED: stub returns null
- ✅ **[P1] 5.3** Last segment is bold non-link — RED: stub returns null
- ✅ **[P1] 5.4** > 4 segments truncates middle — RED: stub returns null
- ✅ **[P1] 5.5** Static segments resolve without server action — RED: stub returns null
- ✅ **[P1] B9** 4 segments → no truncation — RED: stub returns null
- ✅ **[P1] B10** 5 segments → truncation — RED: stub returns null

**File:** `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx` (138 lines)

- ✅ **[P1] 6.1** major → bg-severity-major — RED: uses variant="default" (indigo)
- ✅ **[P1] 6.2** minor → bg-severity-minor — RED: uses variant="secondary" (gray)
- ✅ **[P1] 6.3** critical → bg-severity-critical — RED: uses variant="destructive"

**File:** `src/features/dashboard/components/RecentFilesTable.test.tsx` (100 lines)

- ✅ **[P1] 7.1** Score renders ScoreBadge — RED: uses raw `<span>`
- ✅ **[P1] 7.2** Null score renders ScoreBadge — RED: uses raw `<span>` with mdash

### Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

#### ScoreBadge Thresholds

| Boundary | At | Below | Above | Zero/Empty |
|---|---|---|---|---|
| Pass (score >= 95) | B1: 95.0 + cc=0 → Pass | B2: 94.9 → Review | — | B5: null → N/A |
| Fail (score < 70) | B3: 70.0 → Review | B4: 69.9 → Fail | — | — |
| Critical count | B6: cc=0 → Pass | — | B7: cc=1 → Review | B8: cc=undefined → Pass |

#### Breadcrumb Truncation

| Boundary | At | Below | Above |
|---|---|---|---|
| Truncation (> 4 segments) | B9: 4 segments → no truncation | — | B10: 5 segments → truncation |

### Stub Files Created (TDD)

- `src/components/layout/app-breadcrumb.tsx` — returns null (placeholder)
- `src/components/layout/actions/getBreadcrumbEntities.action.ts` — returns empty object

### Data Factories

No new factories needed — existing `buildFinding()`, `buildReviewSession()` in `src/test/factories.ts` are not used by this story's component tests. Test data is inline (simpler for pure UI tests).

### Required data-testid Attributes

#### ScoreBadge
- `score-badge` — root element (for ScoreBadge mock detection in RecentFilesTable test)

#### AppBreadcrumb
- No data-testid required — tests use text content and DOM structure assertions

### Mock Requirements

#### next/navigation (Breadcrumb tests)
- `usePathname()` — returns current route path string

#### getBreadcrumbEntities (Breadcrumb tests)
- Server action mock returning `{ projectName?, sessionName? }`

#### ScoreBadge (RecentFilesTable tests)
- Mock rendering `<span data-testid="score-badge" data-score={score}>`

### Test Execution Evidence

**Command:** `npx vitest run --project unit`

**Results:**
```
Test Files  157 passed | 4 skipped (161)
     Tests  1914 passed | 44 skipped (1958)
```

**Summary:**
- Total new tests: 44
- Passing: 0 (expected — all skipped)
- Skipped: 44 (expected — TDD RED phase)
- Existing tests: 1,914 passed (zero regressions)
- Status: ✅ RED phase verified

---

## Step 05: Validate & Complete

### Validation Results

| Criteria | Status |
|---|---|
| Prerequisites satisfied | ✅ |
| Test files created correctly (4 test + 2 stub) | ✅ |
| All 8 ACs covered with 44 tests | ✅ |
| Tests designed to fail (all `it.skip()`) | ✅ |
| Boundary value tests present (10 tests) | ✅ |
| Zero regression (1,914 existing tests pass) | ✅ |
| No orphaned browsers (jsdom only) | ✅ |
| Artifacts in correct location | ✅ |

### Gaps Found: 0

---

## Implementation Checklist

### Task 1: ScoreBadge Refactor (Tests: 1.1-1.4, 2.1-2.13, B1-B8, 3.1-3.3, 4.1-4.3, BC1)

**File:** `src/features/batch/components/ScoreBadge.test.tsx`

**Tasks to make these tests pass:**

- [ ] Add `ScoreBadgeState` + `ScoreBadgeSize` types in `src/types/finding.ts`
- [ ] Refactor ScoreBadge props: add `size`, `state`, `criticalCount`
- [ ] Implement 3 size variants (sm/md/lg) with responsive text classes
- [ ] Implement 5 state values with design token color classes
- [ ] Add auto-derivation logic with priority order (null→muted, <70→fail, >=95+noCritical→pass, else→review)
- [ ] Add analyzing pulse animation in `src/styles/animations.css`
- [ ] Add score change slide animation with `useRef` previous score tracking
- [ ] Add `prefers-reduced-motion` support
- [ ] Add `data-testid="score-badge"` to root element
- [ ] Remove `@ts-expect-error` from test file
- [ ] Remove `it.skip` → `it` for all 32 ScoreBadge tests
- [ ] Run test: `npx vitest run src/features/batch/components/ScoreBadge.test.tsx`
- [ ] ✅ All 32 tests pass (green phase)

### Task 2: Breadcrumb Component (Tests: 5.1-5.5, B9-B10)

**File:** `src/components/layout/app-breadcrumb.test.tsx`

**Tasks to make these tests pass:**

- [ ] Install shadcn Breadcrumb: `npx shadcn@latest add breadcrumb`
- [ ] Implement `AppBreadcrumb` client component (replace stub)
- [ ] Implement `getBreadcrumbEntities.action.ts` server action (replace stub)
- [ ] Implement route-based segment parsing with `usePathname()`
- [ ] Implement truncation (> 4 segments → `...`)
- [ ] Integrate into `AppHeader` — replace static `<h1>`
- [ ] Remove `it.skip` → `it` for all 7 breadcrumb tests
- [ ] Run test: `npx vitest run src/components/layout/app-breadcrumb.test.tsx`
- [ ] ✅ All 7 tests pass (green phase)

### Task 3: Severity Badge Fix (Tests: 6.1-6.3)

**File:** `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx`

**Tasks to make these tests pass:**

- [ ] Replace `SEVERITY_BADGE` variant map with className-based styling
- [ ] Use `bg-severity-major text-white`, `bg-severity-minor text-white`, `bg-severity-critical text-white`
- [ ] Remove `it.skip` → `it` for all 3 TaxonomyMappingTable tests
- [ ] Run test: `npx vitest run src/features/taxonomy/components/TaxonomyMappingTable.test.tsx`
- [ ] ✅ All 3 tests pass (green phase)

### Task 4: RecentFilesTable ScoreBadge (Tests: 7.1-7.2)

**File:** `src/features/dashboard/components/RecentFilesTable.test.tsx`

**Tasks to make these tests pass:**

- [ ] Import `ScoreBadge` in RecentFilesTable
- [ ] Replace raw `<span>` score display with `<ScoreBadge score={file.mqmScore} size="sm" />`
- [ ] Remove `it.skip` → `it` for all 2 RecentFilesTable tests
- [ ] Run test: `npx vitest run src/features/dashboard/components/RecentFilesTable.test.tsx`
- [ ] ✅ All 2 tests pass (green phase)

---

## Running Tests

```bash
# Run all failing tests for this story
npx vitest run --project unit src/features/batch/components/ScoreBadge.test.tsx src/components/layout/app-breadcrumb.test.tsx src/features/taxonomy/components/TaxonomyMappingTable.test.tsx src/features/dashboard/components/RecentFilesTable.test.tsx

# Run specific test file
npx vitest run --project unit src/features/batch/components/ScoreBadge.test.tsx

# Watch mode
npx vitest --project unit src/features/batch/components/ScoreBadge.test.tsx

# Run all unit tests (regression check)
npx vitest run --project unit
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All 44 tests written and skipped (it.skip)
- ✅ Stub files created for import resolution
- ✅ Mock requirements documented
- ✅ data-testid requirements listed
- ✅ Implementation checklist created
- ✅ Boundary value tests present (10 tests)
- ✅ Zero regression on existing 1,914 tests

### GREEN Phase (DEV Team — Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one failing test** from implementation checklist (start with Task 1 — ScoreBadge)
2. **Read the test** to understand expected behavior
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it now passes (green)
5. **Check off the task** in implementation checklist
6. **Move to next test** and repeat

**Recommended order:** Task 1 (ScoreBadge) → Task 3 (severity fix) → Task 4 (RecentFilesTable) → Task 2 (Breadcrumb)

### REFACTOR Phase (DEV Team — After All Tests Pass)

1. Verify all 44 tests pass
2. Review code quality
3. Run full suite: `npx vitest run --project unit`
4. Run pre-CR agents (anti-pattern-detector, tenant-isolation-checker, code-quality-analyzer)

---

## Key Risks & Assumptions

| Risk | Mitigation |
|---|---|
| ScoreBadge threshold change (80→70) may affect existing callers | Intentional per UX spec — documented in AC2 |
| `prefers-reduced-motion` hard to test in jsdom | `matchMedia` mock pattern provided in story |
| Breadcrumb `getBreadcrumbEntities` needs `withTenant()` | Documented in Task 2 |
| TaxonomyMappingTable test uses dynamic import | Follows existing project pattern (AiUsageSummaryCards) |

---

## Next Steps

1. **Share this checklist** with the dev workflow (manual handoff)
2. **Run failing tests** to confirm RED phase: `npx vitest run --project unit`
3. **Begin implementation** using implementation checklist as guide
4. **Work one test at a time** (red → green for each)
5. **When all tests pass**, refactor code for quality
6. **Run pre-CR agents** before code review
7. **When complete**, update story status to `in-progress` → `review` → `done`

---

## Knowledge Base References Applied

- **component-tdd.md** — Red-Green-Refactor cycle, render + assert pattern
- **data-factories.md** — Factory patterns (determined inline test data sufficient for this story)
- **test-quality.md** — Deterministic, isolated, explicit, <300 lines per test file
- **selector-resilience.md** — data-testid > ARIA roles > text content
- **test-healing-patterns.md** — Common failure patterns for CSS class assertions
- **timing-debugging.md** — N/A for jsdom component tests

---

**Generated by BMad TEA Agent (Murat)** — 2026-03-01
