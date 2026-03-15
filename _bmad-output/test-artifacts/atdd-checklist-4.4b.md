---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-15'
workflowType: 'testarch-atdd'
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-4b-undo-redo-realtime-conflict-resolution.md'
  - 'src/features/review/stores/review.store.ts'
  - 'src/features/review/actions/bulkAction.action.ts'
  - 'src/features/review/hooks/use-review-actions.ts'
  - 'e2e/review-bulk-operations.spec.ts'
---

# ATDD Checklist - Epic 4, Story 4b: Undo/Redo & Realtime Conflict Resolution

**Date:** 2026-03-15
**Author:** Mona
**Primary Test Level:** Unit (25) + Component (4) + E2E (5) = 34 tests

---

## Story Summary

Undo/redo review actions with Ctrl+Z/Ctrl+Shift+Z and conflict detection via Supabase Realtime.

**As a** QA Reviewer
**I want** to undo/redo review actions and receive conflict notifications
**So that** I can correct mistakes and collaborate without data loss

---

## Acceptance Criteria

1. **AC1**: Undo single action (status revert + feedback_events for undo-reject)
2. **AC2**: Undo bulk action (atomic, partial conflict handling)
3. **AC3**: Undo severity override (severity + originalSeverity restore)
4. **AC4**: Undo manual add/delete finding
5. **AC5**: Redo (Ctrl+Shift+Z)
6. **AC6**: Undo stack limits (max 20, clear on file switch, redo clears on new action)
7. **AC7**: Realtime conflict detection (UPDATE → stale, DELETE → remove)
8. **AC8**: Conflict dialog UX (AlertDialog, a11y, force/cancel)

---

## Failing Tests Created (RED Phase)

### Unit Tests (19 tests)

**File:** `src/features/review/stores/review.store.test.ts` (undo slice additions)

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-01 | should push undo entry and maintain LIFO order | 6 | P0 | RED — `pushUndo` undefined |
| U-02 | should drop oldest entry when stack exceeds 20 (boundary: 21st push) | 6 | P0 | RED — `pushUndo` undefined |
| U-03 | should return undefined when popping empty undo stack (boundary: 0) | 6 | P0 | RED — `popUndo` undefined |
| U-04 | should pop single entry leaving empty stack (boundary: 1) | 6 | P1 | RED — `popUndo` undefined |
| U-05 | should clear undo and redo stacks on resetForFile | 6 | P0 | RED — UndoRedoSlice missing |
| U-06 | should clear redo stack when pushUndo is called | 6 | P0 | RED — UndoRedoSlice missing |
| U-07 | should mark entry stale per-finding (single entry) | 7 | P0 | RED — `markEntryStale` undefined |
| U-08 | should mark stale per-finding in bulk entry (partial staleness) | 7 | P1 | RED — `markEntryStale` undefined |
| U-09 | should remove entries for finding from both stacks | 7 | P1 | RED — `removeEntriesForFinding` undefined |
| U-10 | should return correct canUndo/canRedo via selectors | 6 | P1 | RED — selectors undefined |

**File:** `src/features/review/actions/undoAction.action.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-11 | should revert finding to previousState when status matches | 1 | P0 | RED — module not found |
| U-12 | should return CONFLICT when status does not match expectedCurrentState | 1 | P0 | RED — module not found |
| U-13 | should bypass state check when force=true | 1 | P1 | RED — module not found |
| U-14 | should insert feedback_events with action undo_reject when undoing reject | 1 | P0 | RED — module not found |
| U-15 | should set updatedAt on finding (Realtime merge guard) | 1 | P0 | RED — module not found |

**File:** `src/features/review/actions/undoBulkAction.action.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-16 | should revert all findings and return reverted array | 2 | P0 | RED — module not found |
| U-17 | should partition into canRevert and conflicted on state mismatch | 2 | P0 | RED — module not found |
| U-18 | should insert feedback_events for each undone reject in batch | 2 | P1 | RED — module not found |

**File:** `src/features/review/actions/undoSeverityOverride.action.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-19 | should restore previousSeverity and previousOriginalSeverity | 3 | P0 | RED — module not found |

**File:** `src/features/review/actions/undoAddFinding.action.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-20 | should delete manually added finding and its review_actions | 4 | P1 | RED — module not found |
| U-21 | should return error if finding already deleted | 4 | P1 | RED — module not found |

**File:** `src/features/review/actions/undoDeleteFinding.action.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-22 | should re-insert finding with original ID from snapshot | 4 | P1 | RED — module not found |
| U-23 | should return FK_VIOLATION if parent segment was deleted | 4 | P1 | RED — module not found |

**File:** `src/features/review/actions/redoAction.action.test.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| U-24 | should re-apply action (target state) after undo | 5 | P0 | RED — module not found |
| U-25 | should return CONFLICT when state does not match | 5 | P1 | RED — module not found |

### Component Tests (4 tests)

**File:** `src/features/review/components/ConflictDialog.test.tsx`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| C-01 | should render with correct state information | 8 | P1 | RED — component not found |
| C-02 | should call onForceUndo when Undo Anyway clicked | 8 | P1 | RED — component not found |
| C-03 | should call onCancel when Cancel clicked or Esc pressed | 8 | P1 | RED — component not found |
| C-04 | should have aria-modal and focus trap (a11y) | 8 | P1 | RED — component not found |

### E2E Tests (5 tests)

**File:** `e2e/review-undo-redo.spec.ts`

| # | Test | AC | Priority | Status |
|---|------|:--:|:--------:|--------|
| E-01 | should undo accept via Ctrl+Z and revert finding to pending | 1 | P0 | RED — Ctrl+Z not registered |
| E-02 | should undo bulk accept and revert all findings | 2 | P1 | RED — Ctrl+Z not registered |
| E-03 | should redo via Ctrl+Shift+Z after undo | 5 | P1 | RED — Ctrl+Shift+Z not registered |
| E-04 | should undo severity override and restore original severity | 3 | P2 | RED — undo severity not implemented |
| E-05 | should clear undo stack on file switch (Ctrl+Z = no-op) | 6 | P1 | RED — undo stack not implemented |

---

## Priority Coverage Summary

| Priority | Unit | Component | E2E | Total |
|----------|:----:|:---------:|:---:|:-----:|
| **P0** | 11 | 0 | 1 | **12** |
| **P1** | 14 | 4 | 3 | **21** |
| **P2** | 0 | 0 | 1 | **1** |
| **Subtotal** | **25** (74%) | **4** (12%) | **5** (14%) | **34** |

**DoD Gate:** ALL P0 + P1 tests must PASS before story completion (33/34 required)
**P2:** Nice-to-have (tech debt entry if skipped)

---

## Running Tests

```bash
# Unit tests (all undo/redo)
npx vitest run src/features/review/stores/review.store.test.ts
npx vitest run src/features/review/actions/undoAction.action.test.ts
npx vitest run src/features/review/actions/undoBulkAction.action.test.ts
npx vitest run src/features/review/actions/undoSeverityOverride.action.test.ts

# Component tests
npx vitest run src/features/review/components/ConflictDialog.test.tsx

# E2E tests
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-undo-redo.spec.ts

# All unit+component tests for this story
npx vitest run --reporter=verbose src/features/review/actions/undo src/features/review/stores/review.store.test.ts src/features/review/components/ConflictDialog.test.tsx
```

---

## Red-Green-Refactor Workflow

### RED Phase (Current) — TEA Agent

- All 28 tests written as `it.skip()` / `test.skip()` stubs
- Tests assert EXPECTED behavior
- Tests will FAIL until feature implemented
- This is INTENTIONAL (TDD red phase)

### GREEN Phase — DEV Agent

1. Pick one failing test (start with P0 store tests U-01 to U-06)
2. Implement minimal code to make that test pass
3. Run test to verify GREEN
4. Move to next test

**Recommended order:**
1. Store slice (U-01 → U-10) — foundation
2. Server actions (U-11 → U-19) — business logic
3. Component (C-01 → C-04) — UI
4. E2E (E-01 → E-05) — integration

### REFACTOR Phase — After All Tests Pass

1. Extract shared `executeUndoRedo` helper
2. Verify all tests still pass
3. Run pre-CR agents

---

## Notes

- E2E tests require `INNGEST_DEV_URL` env var + Inngest dev server running
- Unit tests use `createDrizzleMock()` from `src/test/drizzleMock.ts` (shared utility)
- Factories: use `buildFinding()` from `src/test/factories.ts` — never hardcode test data
- Keyboard tests: use `click()` on finding row BEFORE Ctrl+Z (focus sync required)
- Toast assertions: wait for toast before next action (inFlightRef debounce)

---

**Generated by BMad TEA Agent** - 2026-03-15
