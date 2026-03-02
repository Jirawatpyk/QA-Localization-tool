# Story 3.2b6: Orphan Wiring Cleanup (Budget Threshold UI + Dead Code + Parity E2E)

Status: ready-for-dev

## Story

As a QA Reviewer / Admin,
I want the budget alert threshold to be editable, dead code to be removed, and parity E2E tests to run against real routes,
so that all existing features work end-to-end without orphan code or skipped tests.

## Background

Orphan scan (Party Mode 2026-03-02) identified 3 issues that can be fixed in a single small story:

1. **`updateBudgetAlertThreshold.action.ts`** — Story 3.1 AC7 specifies "threshold is configurable, editable by Admin" but `AiBudgetCard` is read-only. Action exists, UI does not.
2. **`getUploadedFiles.action.ts`** — Created in Story 2.1 but superseded by `getFileHistory` (Story 2.7). Zero consumers. Dead code.
3. **`parity-comparison.spec.ts`** — 6 E2E tests all `test.skip()` with comment "Route DOES NOT EXIST YET" — but route + components exist since Story 2.7. Comment is stale.

## Acceptance Criteria

### AC1: Budget Alert Threshold Editable in AiBudgetCard

**Given** the `AiBudgetCard` component displays the budget progress bar with threshold marker
**When** an Admin views the card
**Then** a threshold input appears below the progress bar: `Alert at [80] % of budget`
**And** the input accepts integers 1–100
**And** on blur or Enter, it calls `updateBudgetAlertThreshold({ projectId, thresholdPct })`
**And** on success: progress bar marker updates to new threshold position
**And** on error: toast.error shows the error message, input reverts to previous value
**And** non-Admin users see the threshold as read-only text (no input)

**Implementation notes:**
- `AiBudgetCard` needs `projectId` prop added (currently only receives budget data)
- `AiBudgetCard` needs `userRole` or `canEditThreshold` prop to gate edit UI
- Use inline `<Input type="number" min={1} max={100} />` — no dialog needed
- `updateBudgetAlertThreshold` already handles validation, auth, audit log

### AC2: Delete Dead Code — `getUploadedFiles`

**Given** `getUploadedFiles.action.ts` has zero consumers (superseded by `getFileHistory`)
**When** the dead code is removed
**Then** the following files are deleted:
  - `src/features/upload/actions/getUploadedFiles.action.ts`
  - `src/features/upload/actions/getUploadedFiles.test.ts` (if exists)
  - Related Zod schema `getUploadedFilesSchema` from `uploadSchemas.ts` (if only used by this action)
**And** no other file fails to compile after deletion
**And** `npm run type-check` passes

### AC3: Stale E2E Tests Unskipped (Parity + Batch Summary + File History)

**Given** the following routes and components all exist since Story 2.7:
  - `/projects/[projectId]/parity` (TD-E2E-003)
  - `/projects/[projectId]/batches` + `/batches/[batchId]` (TD-E2E-004)
  - `/projects/[projectId]/files` (TD-E2E-005)
**When** the E2E test files are updated
**Then** stale comments "DOES NOT EXIST YET" / "DO NOT EXIST YET" are removed from all 3 files
**And** `PROJECT_ID` uses real test project ID from E2E setup (not `'placeholder-project-id'`)
**And** at least the P1 tests in each file are unskipped and pass:
  - `parity-comparison.spec.ts` — P1: navigate to parity page (1 test)
  - `batch-summary.spec.ts` — P1: display batch summary, navigate via tab (2 tests)
  - `file-history.spec.ts` — P1: display table, navigate via tab, filter by status (3 tests)
**And** P2/P3 tests that require pre-seeded pipeline data may remain skipped with `// TODO(TD-XXX): description` + tech debt entry if fixture setup is too complex for this story

### AC4: Unit Tests

- `AiBudgetCard` — threshold input renders for Admin, hidden for non-Admin
- `AiBudgetCard` — calls `updateBudgetAlertThreshold` on blur with correct args
- `AiBudgetCard` — shows error toast on action failure, reverts input
- `AiBudgetCard` — validates range 1–100 client-side
- Type-check passes after `getUploadedFiles` deletion

## Tasks / Subtasks

- [ ] **Task 1: Budget threshold input** (AC: #1)
  - [ ] 1.1 Add `projectId` and `canEditThreshold` props to `AiBudgetCard`
  - [ ] 1.2 Add inline threshold input (number, 1–100) below progress bar
  - [ ] 1.3 Call `updateBudgetAlertThreshold` on blur/Enter
  - [ ] 1.4 Handle success (update local state) and error (toast + revert)
  - [ ] 1.5 Update parent components that render `AiBudgetCard` to pass new props

- [ ] **Task 2: Delete dead code** (AC: #2)
  - [ ] 2.1 Delete `getUploadedFiles.action.ts` + its test file
  - [ ] 2.2 Remove `getUploadedFilesSchema` from `uploadSchemas.ts` if orphaned
  - [ ] 2.3 Run `npm run type-check` to verify no broken imports

- [ ] **Task 3: Unskip stale E2E tests** (AC: #3)
  - [ ] 3.1 `parity-comparison.spec.ts` — remove stale comment, update PROJECT_ID, unskip P1 (1 test)
  - [ ] 3.2 `batch-summary.spec.ts` — remove stale comment, update PROJECT_ID, unskip P1 (2 tests)
  - [ ] 3.3 `file-history.spec.ts` — remove stale comment, update PROJECT_ID, unskip P1 (3 tests)
  - [ ] 3.4 Assess P2/P3 tests across all 3 files — unskip if feasible, otherwise add `// TODO(TD-XXX)` + tech debt
  - [ ] 3.5 Mark TD-E2E-003, TD-E2E-004, TD-E2E-005 as RESOLVED in tech-debt-tracker.md

- [ ] **Task 4: Unit tests** (AC: #4)
  - [ ] 4.1 AiBudgetCard threshold editing tests
  - [ ] 4.2 Type-check verification after deletion

- [ ] **Task 5: Full E2E — Budget flow** (MANDATORY — critical flow per CLAUDE.md)
  - [ ] 5.1 Create `e2e/budget-threshold.spec.ts`
  - [ ] 5.2 Test: navigate to project settings → see AiBudgetCard → edit threshold → save → verify updated
  - [ ] 5.3 Test: budget exceeded → processing paused message visible
  - [ ] 5.4 Test: non-Admin cannot edit threshold (input hidden)
  - [ ] 5.5 Verify `npm run test:e2e` passes

## Dev Notes

### What Already Exists

| Component | Path | Change |
|-----------|------|--------|
| `AiBudgetCard` | `src/features/pipeline/components/AiBudgetCard.tsx` | Modify — add threshold input |
| `updateBudgetAlertThreshold` | `src/features/pipeline/actions/updateBudgetAlertThreshold.action.ts` | Read-only (call from UI) |
| `getUploadedFiles` | `src/features/upload/actions/getUploadedFiles.action.ts` | **Delete** |
| `parity-comparison.spec.ts` | `e2e/parity-comparison.spec.ts` | Modify — unskip + real IDs (TD-E2E-003) |
| `batch-summary.spec.ts` | `e2e/batch-summary.spec.ts` | Modify — unskip + real IDs (TD-E2E-004) |
| `file-history.spec.ts` | `e2e/file-history.spec.ts` | Modify — unskip + real IDs (TD-E2E-005) |

### Scope Boundaries

| In Scope | Out of Scope |
|----------|-------------|
| Threshold input in AiBudgetCard | Budget management page redesign |
| Delete getUploadedFiles dead code | Refactor getFileHistory |
| Unskip P1 E2E tests (parity + batch + file-history) | Full E2E fixture seeding for P2/P3 tests |

## Dependencies

- **Depends on:** Story 2.7 (parity route), Story 3.1 (budget threshold action) — all done
- **Blocks:** Nothing critical

## References

- `src/features/pipeline/components/AiBudgetCard.tsx`
- `src/features/pipeline/actions/updateBudgetAlertThreshold.action.ts`
- `src/features/upload/actions/getUploadedFiles.action.ts`
- `e2e/parity-comparison.spec.ts`
- UX Spec Gap #27: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md`
