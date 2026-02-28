---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-28'
---

# ATDD Checklist - Epic 3, Story 1b: AI Dashboard UX Polish & Data Depth

**Date:** 2026-02-28
**Author:** Mona (TEA)
**Primary Test Level:** Unit (Vitest — jsdom)

---

## Story Summary

Follow-on to Story 3.1a. 4 pure-frontend ACs addressing UX/data-depth gaps found in CR R2:
empty-state guidance, sortable project table, per-model token breakdown table, tooltip/aria consistency.
No new server actions. No DB migrations.

**As an** Admin
**I want** the AI Usage Dashboard to show empty-state guidance, sortable project spend data, a
per-model token breakdown, and consistent chart tooltips
**So that** I can orient quickly when no data exists, rank projects by cost or budget, understand
token consumption per model, and read chart tooltips without confusion

---

## Acceptance Criteria

1. **AC1 (AiUsageSummaryCards):** Empty-state message when `filesProcessed===0 && totalCostUsd===0`; correct card labels "Total AI Cost (MTD)" and "Projected Month Cost"
2. **AC2 (AiSpendByProjectTable):** Client-side sortable by Cost and Budget % with ↑/↓ indicators; default descending cost; `aria-sort` on all `<th>` elements
3. **AC3 (AiSpendByModelChart):** Per-model breakdown `<table>` below BarChart; hidden when `data.length===0`
4. **AC4 (AiSpendTrendChart + AiSpendByModelChart):** Tooltip labels "Total Cost"/"L2 (Screening)"/"L3 (Deep Analysis)"; `aria-pressed` on L2/L3 toggle; Bar name `'Cost (USD)'`

---

## Test Strategy

### Test Level Selection

| AC | Test Level | Rationale |
|----|-----------|-----------|
| AC1 (Empty State + Labels) | Unit (jsdom) | Pure render logic — conditional empty-state + text content checks |
| AC2 (Sortable Table) | Unit (jsdom) | Client-side useState + click events — userEvent.click() |
| AC3 (Model Table) | Unit (jsdom) | Render presence/absence of `<table>` based on data prop |
| AC4 (Tooltip + aria) | Unit (jsdom) | aria-pressed state via click; tooltip labels via source structure |

### No New Action Tests

Story 3.1b is frontend-only. All 5 server actions from 3.1a are unchanged and do not need new tests.

### No E2E Tests

Pure component enhancements with no new routes or route handlers.

---

## Test Cases

### File: `AiUsageSummaryCards.test.tsx`

| ID | Priority | AC | Test Description |
|----|----------|----|-----------------|
| SC-AC1-01 | P0 | AC1 | Empty-state message shown when filesProcessed=0 AND totalCostUsd=0 |
| SC-AC1-02 | P0 | AC1 | Empty-state NOT shown when data exists (totalCostUsd > 0) |
| SC-AC1-03 | P1 | AC1 | Card label "Total AI Cost (MTD)" rendered |
| SC-AC1-04 | P1 | AC1 | Card label "Projected Month Cost" rendered |
| SC-AC1-BV1 | P1-BV | AC1 | BV: filesProcessed=0 but totalCostUsd=0.01 → empty-state NOT shown (BOTH must be zero) |

### File: `AiSpendByProjectTable.test.tsx`

| ID | Priority | AC | Test Description |
|----|----------|----|-----------------|
| PT-AC2-01 | P0 | AC2 | Default sort is Cost (Month) descending (highest first) |
| PT-AC2-02 | P0 | AC2 | Clicking Cost header switches to ascending sort |
| PT-AC2-03 | P0 | AC2 | Clicking Cost header again switches back to descending |
| PT-AC2-04 | P0 | AC2 | Clicking Budget % header sorts by budget percentage ascending |
| PT-AC2-05 | P1 | AC2 | Cost header shows ↓ by default; ↑ after first click |
| PT-AC2-06 | P1 | AC2 | aria-sort="descending" on Cost header by default |
| PT-AC2-07 | P1 | AC2 | aria-sort="none" on Budget % header by default (not active) |

### File: `AiSpendByModelChart.test.tsx`

| ID | Priority | AC | Test Description |
|----|----------|----|-----------------|
| MC-AC3-01 | P0 | AC3 | Model breakdown table renders below chart when data provided |
| MC-AC3-02 | P0 | AC3 | Table has 5 header columns: Model, Provider, Total Cost (USD), Input Tokens, Output Tokens |
| MC-AC3-03 | P0 | AC3 | One row per model entry in data prop |
| MC-AC3-04 | P0 | AC3 | Table NOT rendered when data.length===0 (empty state shown instead) |
| MC-AC4-01 | P1 | AC4 | Bar component name prop is 'Cost (USD)' — tooltip/legend consistency |

### File: `AiSpendTrendChart.test.tsx`

| ID | Priority | AC | Test Description |
|----|----------|----|-----------------|
| TC-AC4-01 | P0 | AC4 | L2/L3 toggle has aria-pressed="false" by default (total view) |
| TC-AC4-02 | P0 | AC4 | L2/L3 toggle has aria-pressed="true" after clicking (breakdown view) |
| TC-AC4-03 | P1 | AC4 | aria-pressed toggles back to "false" on second click (back to total) |

---

## Boundary Value Analysis

### AC1 — Empty State Condition (AND logic)

| filesProcessed | totalCostUsd | Expected |
|---|---|---|
| 0 | 0 | SHOW empty state |
| 0 | 0.01 | NO empty state (data exists) |
| 1 | 0 | NO empty state (data exists) |
| 42 | 15.50 | NO empty state (normal data view) |

### AC2 — Sort Toggle Cycle

| Click # | Expected sort direction | Expected indicator |
|---|---|---|
| 0 (default) | descending (cost) | ↓ |
| 1 | ascending (cost) | ↑ |
| 2 | descending (cost) | ↓ |

### AC4 — aria-pressed Toggle Cycle

| Click # | Expected aria-pressed |
|---|---|
| 0 (default) | "false" |
| 1 | "true" |
| 2 | "false" |

---

## RED Phase Validation

All tests stubbed as `it.skip()` in respective test files. Run:

```bash
npx vitest run src/features/dashboard/components/AiUsageSummaryCards.test.tsx
npx vitest run src/features/dashboard/components/AiSpendByProjectTable.test.tsx
npx vitest run src/features/dashboard/components/AiSpendByModelChart.test.tsx
npx vitest run src/features/dashboard/components/AiSpendTrendChart.test.tsx
```

All skipped tests produce `SKIP` (not `FAIL`) — RED phase confirms.

---

## P2 / Out of Scope

- E2E tests for sort interaction (jsdom sufficient)
- aria-busy loading state (deferred to future story)
- x-axis truncation fix (AC3 table solves the data visibility need)
- Export of per-model table data (separate story)
