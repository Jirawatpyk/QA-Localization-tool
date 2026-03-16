---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-16'
workflowType: 'testarch-atdd'
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-5-search-filter-ai-layer-toggle.md'
  - 'src/features/review/stores/review.store.ts'
  - 'src/features/review/components/ReviewPageClient.tsx'
  - 'src/features/review/components/FindingList.tsx'
  - 'src/features/review/components/FindingCardCompact.tsx'
  - 'src/features/review/hooks/use-keyboard-actions.ts'
  - 'src/types/finding.ts'
---

# ATDD Checklist - Epic 4, Story 5: Search, Filter & AI Layer Toggle

**Date:** 2026-03-16
**Author:** Mona
**Primary Test Level:** Unit (35) + Component (12) + E2E (10) = 57 tests

---

## Story Summary

Search and filter findings by severity, type, status, category, confidence, keyword, toggle AI suggestions on/off, and use command palette for quick navigation.

**As a** QA Reviewer
**I want** to search, filter findings and toggle AI layer visibility
**So that** I can efficiently focus on specific finding subsets during review

---

## Acceptance Criteria

1. **AC1**: Filter bar renders above finding list with 5 dimensions (Severity, Layer, Status, Category, Confidence). Default: Status = Pending
2. **AC2**: AND-logic client-side filtering via Zustand store. Badge chips with [X]. "Showing X of Y" count. "Clear all" link
3. **AC3**: Filter state persists per file within session (save/restore on file switch)
4. **AC4**: Keyword search across source, target, description, suggestion. Highlight matches. Thai/CJK safe
5. **AC5**: Debounced search (300ms). Empty = show all
6. **AC6**: Command palette (Ctrl+K). 3-tier scope: > actions, # findings, @ files
7. **AC7**: Finding search in palette shows severity icon, category, truncated preview, confidence %
8. **AC8**: AI toggle switch. OFF = hide L2/L3, score unchanged + "AI findings hidden" indicator. Display-only
9. **AC9**: Filter bar keyboard accessible. role="toolbar", per-button aria-labels with match counts
10. **AC10**: Command palette accessible. Focus trap, Esc closes, aria-modal, arrow key navigation

---

## Failing Tests Created (RED Phase)

### Unit Tests (35 tests)

**File:** `src/features/review/stores/review.store.filter.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-01 | should initialize with category null, confidence null, searchQuery empty | 1 | P1 | RED — FilterState not extended |
| U-02 | should set category filter via setFilter | 2 | P1 | RED — category field missing |
| U-03 | should set confidence filter via setFilter | 2 | P1 | RED — confidence field missing |
| U-04 | should set searchQuery via setSearchQuery | 4 | P1 | RED — setSearchQuery undefined |
| U-05 | should initialize aiSuggestionsEnabled as true | 8 | P0 | RED — field missing |
| U-06 | should toggle aiSuggestionsEnabled via setAiSuggestionsEnabled | 8 | P0 | RED — action missing |
| U-07 | should save filter state to perFileFilterCache on file switch | 3 | P0 | RED — cache missing |
| U-08 | should restore filter state from cache when returning to visited file | 3 | P0 | RED — cache missing |
| U-09 | should set default filter (status=pending) for never-visited file | 3 | P0 | RED — cache missing |
| U-10 | should save aiSuggestionsEnabled in per-file cache | 3 | P0 | RED — cache missing |
| U-11 | should NOT save undo/redo stacks in cache (Guardrail #35) | 3 | P0 | RED — cache missing |
| U-12 | should always clear undo/redo stacks on file switch regardless of cache | 3 | P0 | RED — cache missing |
| U-13 | should filter by category when category filter is set | 2 | P1 | RED — selectAllFiltered not extended |
| U-14 | should filter by confidence=high (aiConfidence > 85) | 2 | P0 | RED — selectAllFiltered not extended |
| U-15 | should filter by confidence=medium (70 <= aiConfidence <= 85) | 2 | P0 | RED — selectAllFiltered not extended |
| U-16 | should filter by confidence=low (aiConfidence < 70) | 2 | P0 | RED — selectAllFiltered not extended |
| U-17 | should exclude null-confidence findings from confidence filter | 2 | P1 | RED — selectAllFiltered not extended |
| U-18 | should filter by searchQuery matching description | 4 | P1 | RED — selectAllFiltered not extended |
| U-19 | should exclude L2/L3 findings when aiSuggestionsEnabled is false | 8 | P0 | RED — selectAllFiltered not extended |
| U-20 | should apply AND logic across all filter dimensions | 2 | P0 | RED — selectAllFiltered not extended |
| U-21 | should classify aiConfidence=85 as medium (boundary) | 2 | P0 | RED — boundary test |
| U-22 | should classify aiConfidence=85.01 as high (boundary) | 2 | P0 | RED — boundary test |
| U-23 | should classify aiConfidence=70 as medium (boundary) | 2 | P0 | RED — boundary test |
| U-24 | should classify aiConfidence=69.99 as low (boundary) | 2 | P0 | RED — boundary test |
| U-25 | should classify aiConfidence=0 as low (boundary) | 2 | P1 | RED — boundary test |
| U-26 | should classify aiConfidence=100 as high (boundary) | 2 | P1 | RED — boundary test |
| U-27 | should intersect selectedIds with visible findings when filter changes | Cross | P0 | RED — clearSelectionOnFilterChange missing |
| U-28 | should exit bulk mode when all selected findings become invisible | Cross | P0 | RED — missing |
| U-29 | should keep visible selected findings after filter change | Cross | P1 | RED — missing |
| U-30 | should reset selectedId to first filtered finding when active filtered out | Cross | P0 | RED — resetSelectedOnFilterChange missing |
| U-31 | should set selectedId to null when filter produces zero results | Cross | P1 | RED — missing |
| U-32 | should match Thai text "คำแปล" case-insensitively | 4 | P1 | RED — search not implemented |
| U-33 | should match CJK text "翻訳" | 4 | P1 | RED — search not implemented |
| U-34 | should treat whitespace-only query as empty (show all) | 4 | P1 | RED — search not implemented |
| U-35 | should handle null text fields without error | 4 | P1 | RED — search not implemented |

### Component Tests (12 tests)

**File:** `src/features/review/components/FilterBar.test.tsx`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| C-01 | should render with role="toolbar" and aria-label="Filter findings" | 9 | P1 | RED — FilterBar not created |
| C-02 | should render all 5 filter dimension groups | 1 | P1 | RED — FilterBar not created |
| C-03 | should show active badge chip when filter selected | 2 | P1 | RED — FilterBar not created |
| C-04 | should clear all filters when "Clear all" clicked | 2 | P1 | RED — FilterBar not created |
| C-05 | should show per-button aria-label with match count | 9 | P1 | RED — FilterBar not created |
| C-06 | should show "No findings match your filters" empty state | 2 | P1 | RED — FilterBar not created |

**File:** `src/features/review/components/SearchInput.test.tsx`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| C-07 | should debounce input by 300ms before updating store | 5 | P1 | RED — SearchInput not created |
| C-08 | should clear query when Escape pressed (Guardrail #31) | 4 | P1 | RED — SearchInput not created |

**File:** `src/features/review/components/CommandPalette.test.tsx`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| C-09 | should open on Ctrl+K and close on Escape | 6 | P1 | RED — CommandPalette not created |
| C-10 | should filter to findings group with "#" prefix | 6 | P1 | RED — CommandPalette not created |

**File:** `src/features/review/components/FindingCardCompact.highlight.test.tsx`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| C-11 | should render mark element around matching text | 4 | P1 | RED — highlight not implemented |
| C-12 | should handle special characters in searchQuery (E5 fix) | 4 | P1 | RED — highlight not implemented |

### E2E Tests (10 tests)

**File:** `e2e/review-search-filter.spec.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| E-01 | should filter findings by severity and show correct count | 1,2 | P1 | RED — FilterBar not mounted |
| E-02 | should apply AND logic across multiple filter dimensions | 2 | P1 | RED — FilterBar not mounted |
| E-03 | should clear all filters and show all findings | 2 | P1 | RED — FilterBar not mounted |
| E-04 | should persist filter state when switching files and returning | 3 | P1 | RED — filter cache not implemented |
| E-05 | should filter findings by search query with debounce | 4,5 | P1 | RED — SearchInput not mounted |
| E-06 | should handle Thai text search correctly | 4 | P2 | RED — SearchInput not mounted |
| E-07 | should hide L2/L3 findings when AI toggle OFF | 8 | P1 | RED — AI toggle not implemented |
| E-08 | should open command palette with Ctrl+K | 6 | P1 | RED — CommandPalette not implemented |
| E-09 | should clear bulk selection when filter hides selected findings | Cross | P0 | RED — selection clearing not implemented |
| E-10 | should auto-advance within filtered view after action | Cross | P1 | RED — auto-advance not scoped to filter |

---

## Required data-testid Attributes

### FilterBar Component
- `filter-bar` — toolbar container
- `filter-severity-{value}` — severity filter buttons (all, critical, major, minor)
- `filter-layer-{value}` — layer filter buttons (all, rule-based, ai)
- `filter-status-{value}` — status filter buttons (all, pending, accepted, rejected, flagged)
- `filter-category-{value}` — dynamic category filter buttons
- `filter-confidence-{value}` — confidence filter buttons (all, high, medium, low)
- `filter-chip-{dimension}-{value}` — active filter badge chip
- `filter-chip-remove` — badge chip remove button
- `filter-clear-all` — "Clear all" link
- `filter-count` — "Showing X of Y findings" label
- `filter-empty-state` — empty state container

### SearchInput Component
- `search-input` — search text input
- `search-clear` — clear button

### AI Toggle
- `ai-toggle` — AI suggestions toggle switch
- `ai-hidden-indicator` — "AI findings hidden" indicator

### CommandPalette
- `command-palette` — palette dialog container
- `command-input` — palette search input

---

## Running Tests

```bash
# Run all unit tests for this story
npx vitest run src/features/review/stores/review.store.filter.test.ts
npx vitest run src/features/review/components/FilterBar.test.tsx
npx vitest run src/features/review/components/SearchInput.test.tsx
npx vitest run src/features/review/components/CommandPalette.test.tsx
npx vitest run src/features/review/components/FindingCardCompact.highlight.test.tsx

# Run E2E tests
npx playwright test e2e/review-search-filter.spec.ts

# Run all unit tests in review feature
npx vitest run --project unit src/features/review/
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- All 57 tests written with `it.skip()` / `test.skip()` (failing)
- Fixtures and factories use existing `src/test/factories.ts`
- data-testid requirements listed
- Implementation checklist mapped to story Tasks 1-8

### GREEN Phase (DEV Team)

1. Pick one failing test (start P0 → P1 → P2)
2. Implement minimal code to pass
3. Unskip and run test → green
4. Check off in implementation checklist
5. Repeat

### Implementation Order (recommended)

1. **Task 1** (Store) → unskip U-01 through U-35
2. **Task 2** (FilterBar) → unskip C-01 through C-06
3. **Task 3** (SearchInput) → unskip C-07, C-08
4. **Task 4** (Client filtering) → integration tests
5. **Task 5** (AI toggle) → already covered by U-05, U-06, U-19
6. **Task 6** (CommandPalette) → unskip C-09, C-10
7. **Task 7** (Highlight) → unskip C-11, C-12
8. **Task 8** (E2E) → unskip E-01 through E-10

---

## Knowledge Base References Applied

- **component-tdd.md** — Red-Green-Refactor cycle, provider isolation, accessibility assertions
- **test-quality.md** — Deterministic tests, isolation, explicit assertions, <300 lines
- **test-priorities-matrix.md** — P0-P3 priority assignment based on risk and business impact
- **selector-resilience.md** — data-testid > ARIA roles > text content hierarchy

---

**Generated by BMad TEA Agent** — 2026-03-16
