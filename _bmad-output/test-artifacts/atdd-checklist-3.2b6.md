---
stepsCompleted: ['step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-02'
---

# ATDD Checklist — Story 3.2b6: Orphan Wiring Cleanup

## Step 2: Generation Mode Selection

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear and unambiguous (4 ACs)
- Scenarios are standard: component editing (AC1), file deletion (AC2), E2E test maintenance (AC3), unit tests (AC4)
- No complex UI interactions requiring browser recording
- All test patterns exist in codebase (dynamic import for unit, Playwright serial for E2E)

## Step 3: Test Strategy

### AC → Test Scenario Mapping

#### AC1: Budget Alert Threshold Editable in AiBudgetCard

**Boundary Values:** `thresholdPct` range 1-100 (integer only)

| # | Scenario | Level | Priority | Red Phase? |
|---|----------|-------|----------|------------|
| T1.1 | Admin sees threshold input (`canEditThreshold=true`) | Component | P0 | Yes — input not rendered yet |
| T1.2 | Non-Admin sees read-only text (`canEditThreshold=false`) | Component | P0 | Yes — prop doesn't exist yet |
| T1.3 | Blur triggers `updateBudgetAlertThreshold` with `{ projectId, thresholdPct }` | Component | P0 | Yes — no save handler yet |
| T1.4 | Enter key triggers save (same as blur) | Component | P1 | Yes |
| T1.5 | Success → toast.success + marker position updates | Component | P0 | Yes |
| T1.6 | Error → toast.error + input reverts to previous value | Component | P0 | Yes |
| T1.7 | Client-side rejects `0` (below min boundary) | Component | P1-BV | Yes |
| T1.8 | Client-side accepts `1` (at min boundary) | Component | P1-BV | Yes |
| T1.9 | Client-side accepts `100` (at max boundary) | Component | P1-BV | Yes |
| T1.10 | Client-side rejects `101` (above max boundary) | Component | P1-BV | Yes |
| T1.11 | Client-side rejects `50.5` (non-integer) | Component | P1-BV | Yes |
| T1.12 | Unlimited budget (`null`) → threshold input NOT shown | Component | P1 | Yes |
| T1.13 | E2E: Admin → settings → edit threshold → save → verify | E2E | P0 | Yes |

#### AC2: Delete Dead Code

| # | Scenario | Level | Priority | Red Phase? |
|---|----------|-------|----------|------------|
| T2.1 | `npm run type-check` passes after deletion | Build | P0 | N/A (build gate) |
| T2.2 | `npm run test:unit` passes after deletion | Build | P0 | N/A (build gate) |

> AC2 has no TDD test scenarios — build verification only (confirm no broken imports after deletion)

#### AC3: Stale E2E Tests Unskipped (18 tests across 3 files)

| # | Scenario | Level | Priority | Source File |
|---|----------|-------|----------|-------------|
| T3.1 | Parity: navigate via ProjectSubNav Parity tab | E2E | P1 | parity-comparison.spec.ts |
| T3.2 | Parity: upload Xbench xlsx → comparison results | E2E | P1 | parity-comparison.spec.ts |
| T3.3 | Parity: Xbench Only styling (destructive variant) | E2E | P2 | parity-comparison.spec.ts |
| T3.4 | Parity: Report Missing Check dialog submit | E2E | P2 | parity-comparison.spec.ts |
| T3.5 | Parity: Report Missing Check validation errors | E2E | P2 | parity-comparison.spec.ts |
| T3.6 | Parity: invalid file upload error state | E2E | P2 | parity-comparison.spec.ts |
| T3.7 | Batch: summary with Recommended Pass / Need Review | E2E | P1 | batch-summary.spec.ts |
| T3.8 | Batch: navigate via ProjectSubNav Batches tab | E2E | P1 | batch-summary.spec.ts |
| T3.9 | Batch: FileStatusCard with all info | E2E | P2 | batch-summary.spec.ts |
| T3.10 | Batch: FileStatusCard click → review page | E2E | P2 | batch-summary.spec.ts |
| T3.11 | Batch: ScoreBadge color-coding | E2E | P2 | batch-summary.spec.ts |
| T3.12 | Batch: mobile viewport summary only | E2E | P3 | batch-summary.spec.ts |
| T3.13 | Batch: tablet compact layout | E2E | P3 | batch-summary.spec.ts |
| T3.14 | Files: file history table with all columns | E2E | P1 | file-history.spec.ts |
| T3.15 | Files: navigate via ProjectSubNav History tab | E2E | P1 | file-history.spec.ts |
| T3.16 | Files: filter by status | E2E | P1 | file-history.spec.ts |
| T3.17 | Files: last reviewer name | E2E | P2 | file-history.spec.ts |
| T3.18 | Files: pagination when >50 files | E2E | P3 | file-history.spec.ts |

#### AC4: Unit Tests — mapped to T1.1–T1.12 (no duplicate coverage)

### Duplicate Coverage Analysis

- **Component tests (T1.1–T1.12):** Cover rendering + interaction + edge cases + boundaries — NO overlap with E2E
- **E2E budget (T1.13):** Admin-only settings page flow — complements but does not duplicate component tests
- **E2E AC3 (T3.1–T3.18):** Existing test stubs — unique scenarios, no overlap with AC1 tests
- **Build verification (T2.1–T2.2):** Orthogonal to all other levels

### Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 7 | Core rendering, save, revert, E2E threshold flow, build gates |
| P1 | 11 | Enter key, boundary values, unlimited, parity/batch/files nav+display |
| P1-BV | 5 | Boundary value tests (thresholdPct range) |
| P2 | 8 | Styling, dialog, card details, reviewer name |
| P3 | 3 | Mobile/tablet responsive, pagination |

### Red Phase Confirmation

- **T1.1–T1.12:** All FAIL — `AiBudgetCard` has no `projectId`/`canEditThreshold` props, no `"use client"`, no `useState`
- **T1.13:** FAIL — no threshold input on settings page
- **T3.1–T3.18:** After unskip → FAIL — `placeholder-project-id` breaks navigation, no `test.beforeAll` data setup

## Step 4: Test Generation + Aggregation

### TDD Red Phase Compliance

| Check | Status |
|-------|--------|
| All component tests use `it.skip()` | PASS (12/12) |
| All E2E tests use `test.skip()` | PASS (2/2 new + 18 existing) |
| No placeholder assertions | PASS |
| All tests assert expected behavior | PASS |
| `// RED:` comments explain why each test fails | PASS |

### Generated Test Files

| File | Tests | Type | Status |
|------|-------|------|--------|
| `src/features/pipeline/components/AiBudgetCard.test.tsx` | +12 `it.skip()` (T1.1–T1.12) | Component | Written to disk |
| `e2e/budget-threshold.spec.ts` | 2 `test.skip()` (T1.13a, T1.13b) + 1 setup | E2E | Written to disk (NEW) |

### Existing E2E Tests (AC3 — already on disk as `test.skip()`)

| File | Tests | Dev Action |
|------|-------|------------|
| `e2e/parity-comparison.spec.ts` | 6 (T3.1–T3.6) | Unskip + replace placeholder IDs + add data setup |
| `e2e/batch-summary.spec.ts` | 7 (T3.7–T3.13) | Unskip + replace placeholder IDs + add data setup |
| `e2e/file-history.spec.ts` | 5 (T3.14–T3.18) | Unskip + replace placeholder IDs + add data setup |

### Fixture Needs

| Fixture | Purpose | Created? |
|---------|---------|----------|
| `mockUpdateBudgetAlertThreshold` | Mock server action for component tests | Yes (in test file) |
| `signupOrLogin` + `createTestProject` | E2E project creation | Yes (existing helpers) |
| `setProjectMonthlyBudget` | E2E budget setup | Yes (inline in E2E file) |
| `queryBudgetThresholdPct` | E2E DB verification | Yes (inline in E2E file) |

### Summary Statistics

| Metric | Value |
|--------|-------|
| TDD Phase | RED |
| New component tests (it.skip) | 12 |
| New E2E tests (test.skip) | 2 |
| Existing E2E tests to unskip | 18 |
| Total test coverage | 32 scenarios |
| Boundary value tests | 5 (T1.7–T1.11) |
| P0 tests | 7 |
| P1/P1-BV tests | 16 |
| P2 tests | 8 |
| P3 tests | 3 |
| Execution mode | Parallel (2 subprocesses) |

### Next Steps (TDD Green Phase)

After implementing the feature:
1. Dev adds `"use client"`, `projectId`, `canEditThreshold` props to `AiBudgetCard`
2. Remove `it.skip()` from 12 component tests → run → verify PASS
3. Remove `test.skip()` from 2 budget E2E tests → run → verify PASS
4. Unskip 18 existing E2E tests, replace placeholder IDs, add `test.beforeAll` data setup → run → verify PASS
5. Delete dead code (AC2) → verify `type-check` + `test:unit` pass
6. Mark TD entries as RESOLVED

## Step 5: Validation & Completion

### Validation Results

| Check | Status |
|-------|--------|
| Prerequisites satisfied | PASS |
| Test files created correctly | PASS |
| Checklist matches acceptance criteria | PASS |
| Tests designed to fail (TDD red phase) | PASS |
| CLI sessions cleaned up | PASS |
| Temp artifacts in correct location | PASS |
| Boundary value tests (Epic 2 Retro A2) | PASS (5 BV tests) |
| No duplicate coverage | PASS |

### Key Risks

1. **TS compilation** — `it.skip()` tests pass props not yet on component. Dev: add props first, then unskip.
2. **Existing test breakage** — 8 passing tests will break when new required props added. Dev: update simultaneously.
3. **E2E data setup complexity** — 18 E2E tests need non-trivial `test.beforeAll`. Zero-defer: all must pass.

### Completion

- **ATDD Phase:** RED (all tests skipped/failing)
- **Total scenarios:** 32 (12 component + 2 new E2E + 18 existing E2E)
- **Checklist:** `_bmad-output/test-artifacts/atdd-checklist-3.2b6.md`
- **Next workflow:** `dev-story` — implement Story 3.2b6
