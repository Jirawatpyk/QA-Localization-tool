---
stepsCompleted: ['step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-02'
---

# ATDD Checklist - Epic 3, Story 3.2b7: Taxonomy Mapping Reorder UI

**Date:** 2026-03-02
**Author:** Mona
**Primary Test Level:** Unit (Vitest/jsdom) + E2E (Playwright)

---

## Story Summary

Story 3.2b7 adds drag-and-drop reorder UI to TaxonomyMappingTable using @dnd-kit, wires the existing `reorderMappings` server action (fixing 3 pre-existing bugs), and gates reorder behind `canReorder` boolean prop for admin-only access.

**As a** Admin
**I want** to drag-and-drop taxonomy mappings to reorder their display priority
**So that** the most important QA categories appear first in review panels and reports

---

## Acceptance Criteria

1. **AC1: Drag-and-Drop Reorder** — Admin drags row to new position via GripVertical handle, onReorder callback invoked, Manager calls action, success/error toast, drag disabled during inline edit
2. **AC2: Keyboard Accessible Reorder** — Space to pick up, Arrow Up/Down to move, Space to drop, Escape to cancel
3. **AC3: Non-Admin Cannot Reorder (Unit Test Only)** — canReorder={false} hides drag handles
4. **AC4: Unit Tests** — 6 specific test cases defined in story

---

## Generation Mode

**Mode:** AI Generation (Default)

**Rationale:**
- Acceptance criteria are clear with Given/When/Then format
- Scenarios are standard (DnD UI, role gating, optimistic update)
- @dnd-kit patterns well-documented in story dev notes
- No live UI to record (library not yet installed)

---

## Test Strategy

### AC → Test Scenario Mapping

| AC | Test Scenario | Level | Priority |
|----|--------------|-------|----------|
| AC1 | Drag handle (GripVertical) renders when `canReorder={true}` | Unit | P0 |
| AC1 | `onReorder` called with `[{id, displayOrder}]` after DragEnd | Unit | P0 |
| AC1 | Drag disabled when `editingId !== null` (inline edit mode) | Unit | P1 |
| AC1 | E2E: Admin drags row → order persists after reload | E2E | P0 |
| AC2 | Keyboard: Space pick → Arrow move → Space drop triggers reorder | Unit | P1 |
| AC3 | No drag handles when `canReorder={false}` | Unit | P0 |
| AC4 | Optimistic revert when action returns `{success: false}` | Unit | P0 |
| Task3 | `db.transaction()` wraps batch UPDATEs | Unit | P0 |
| Task3 | Duplicate ID validation returns VALIDATION_ERROR | Unit | P1 |
| Task3 | `revalidateTag` called with single arg `'taxonomy'` | Unit | P1 |

### Boundary Value Tests

No boundary values identified in UI-level ACs — boundary tests N/A.

Schema-level boundaries (empty array `.min(1)`, displayOrder `.min(0)`) already covered by existing `reorderMappings.action.test.ts`.

---

## Failing Tests Created (RED Phase)

### Unit Tests (10 tests)

**File:** `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx` (397 lines)

- `it.skip` **[P0] should render drag handles (GripVertical icons) when canReorder={true}**
  - **Status:** RED — `canReorder` prop doesn't exist, no drag handle elements
  - **Verifies:** AC1, AC3 — drag handle visibility gated by canReorder prop

- `it.skip` **[P0] should NOT render drag handles when canReorder={false}**
  - **Status:** RED — `canReorder` prop doesn't exist
  - **Verifies:** AC3 — non-admin role gating via canReorder={false}

- `it.skip` **[P0] should call onReorder with [{id, displayOrder}] after drag end**
  - **Status:** RED — `onReorder` prop doesn't exist, no DndContext
  - **Verifies:** AC1 — core reorder callback with correct data shape

- `it.skip` **[P1] should disable drag when editingId is set (inline edit mode)**
  - **Status:** RED — no DnD integration, no disabled logic
  - **Verifies:** AC1 — drag disabled during inline edit

- `it.skip` **[P1] should support keyboard reorder: Space to pick, Arrow to move, Space to drop**
  - **Status:** RED — no KeyboardSensor configured
  - **Verifies:** AC2 — keyboard accessible reorder

- `it.skip` **[P0] should update colSpan to 7 on empty state when canReorder={true}**
  - **Status:** RED — colSpan hardcoded to 6, no drag handle column
  - **Verifies:** AC1 — table layout correctness with new column

**File:** `src/features/taxonomy/components/TaxonomyManager.test.tsx` (129 lines, NEW)

- `it.skip` **[P0] should revert mappings order on action failure (optimistic revert)**
  - **Status:** RED — Manager has no `isAdmin` prop, no `handleReorder`, no `reorderMappings` import
  - **Verifies:** AC1, AC4 — optimistic state revert on error

**File:** `src/features/taxonomy/actions/reorderMappings.action.test.ts` (216 lines)

- `it.skip` **[P0] should wrap all updates in a database transaction**
  - **Status:** RED — action uses for-loop without `db.transaction()` (Guardrail #6)
  - **Verifies:** Task 3.1 — transaction for atomic batch updates

- `it.skip` **[P1] should return VALIDATION_ERROR for duplicate IDs**
  - **Status:** RED — schema missing `.refine()` for duplicate check (Guardrail #7)
  - **Verifies:** Task 3.2 — Zod array uniqueness validation

- `it.skip` **[P1] should call revalidateTag("taxonomy") with single argument (bug fix)**
  - **Status:** RED — action calls `revalidateTag('taxonomy', 'minutes')` with extra arg
  - **Verifies:** Task 3.3 — correct Next.js revalidateTag API usage

### E2E Tests (2 tests)

**File:** `e2e/taxonomy-admin.spec.ts` (441 lines, extended)

- `test.skip` **[setup] login as admin user**
  - **Status:** RED — setup for serial block
  - **Verifies:** Admin auth prerequisite

- `test.skip` **[P0] AC1 — should reorder taxonomy mapping via drag-and-drop and persist after reload**
  - **Status:** RED — no `@dnd-kit` integration, no `data-testid="drag-handle"`, no `DndContext`
  - **Verifies:** AC1 — full integration: drag → server action → persist → reload verify

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

No boundary values identified — boundary tests N/A.

---

## Data Factories Created

No new factories needed. Tests use inline `MOCK_MAPPINGS` array (consistent with existing test pattern in this feature module).

---

## Fixtures Created

No new fixtures created. Tests use:
- `vi.mock()` for server actions (existing pattern)
- `@testing-library/react` render with props
- Playwright `login()` helper (existing in E2E file)

---

## Mock Requirements

### Server Actions Mocked (Unit Tests)

- `@/features/taxonomy/actions/createMapping.action` → `vi.fn()`
- `@/features/taxonomy/actions/deleteMapping.action` → `vi.fn()`
- `@/features/taxonomy/actions/updateMapping.action` → `vi.fn()`
- `@/features/taxonomy/actions/reorderMappings.action` → `vi.fn()` returning `{ success: false, code: 'INTERNAL_ERROR', error: 'DB error' }`

### DB/Auth Mocked (Action Tests)

- `@/db/client` → `{ db: { update, transaction } }`
- `@/lib/auth/requireRole` → returns mock admin user
- `next/cache` → `{ revalidateTag: vi.fn() }`
- `@/features/audit/actions/writeAuditLog` → `vi.fn()`

---

## Required data-testid Attributes

### TaxonomyMappingTable

- `taxonomy-mapping-table` — `<Table>` element (already exists)
- `drag-handle` — `<GripVertical>` icon in each row (NEW — for DnD E2E targeting)

---

## Implementation Checklist

### Test: Drag handle renders when canReorder={true}

**File:** `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx`

**Tasks to make this test pass:**

- [ ] Add `canReorder` and `onReorder` to Props type
- [ ] Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- [ ] Add GripVertical drag handle column (visible only when canReorder)
- [ ] Add `data-testid="drag-handle"` to each GripVertical icon
- [ ] Run test: `npx vitest run src/features/taxonomy/components/TaxonomyMappingTable.test.tsx`
- [ ] Test passes (green phase)

### Test: onReorder called with correct data after drag end

**File:** `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx`

**Tasks to make this test pass:**

- [ ] Wrap table body in `DndContext` + `SortableContext` when canReorder
- [ ] Extract `SortableRow` component using `useSortable` hook
- [ ] Implement `onDragEnd` handler → `arrayMove()` → map to `[{id, displayOrder}]` → call `onReorder`
- [ ] Run test: `npx vitest run src/features/taxonomy/components/TaxonomyMappingTable.test.tsx`
- [ ] Test passes (green phase)

### Test: Optimistic revert on action failure

**File:** `src/features/taxonomy/components/TaxonomyManager.test.tsx`

**Tasks to make this test pass:**

- [ ] Add `isAdmin` prop to TaxonomyManager
- [ ] Import `reorderMappings` action in TaxonomyManager
- [ ] Implement `handleReorder` with optimistic update + revert pattern
- [ ] Pass `canReorder={isAdmin}` and `onReorder={handleReorder}` to TaxonomyMappingTable
- [ ] Run test: `npx vitest run src/features/taxonomy/components/TaxonomyManager.test.tsx`
- [ ] Test passes (green phase)

### Test: Transaction wraps batch updates

**File:** `src/features/taxonomy/actions/reorderMappings.action.test.ts`

**Tasks to make this test pass:**

- [ ] Wrap batch UPDATE loop in `db.transaction()` in reorderMappings action
- [ ] Run test: `npx vitest run src/features/taxonomy/actions/reorderMappings.action.test.ts`
- [ ] Test passes (green phase)

### Test: Duplicate ID validation

**File:** `src/features/taxonomy/actions/reorderMappings.action.test.ts`

**Tasks to make this test pass:**

- [ ] Add `.refine()` to `reorderMappingsSchema` for duplicate ID check
- [ ] Run test: `npx vitest run src/features/taxonomy/actions/reorderMappings.action.test.ts`
- [ ] Test passes (green phase)

### Test: revalidateTag single argument

**File:** `src/features/taxonomy/actions/reorderMappings.action.test.ts`

**Tasks to make this test pass:**

- [ ] Fix `revalidateTag('taxonomy', 'minutes')` → `revalidateTag('taxonomy')`
- [ ] Remove legacy test that asserts the buggy behavior
- [ ] Run test: `npx vitest run src/features/taxonomy/actions/reorderMappings.action.test.ts`
- [ ] Test passes (green phase)

### Test: E2E drag-and-drop reorder persists

**File:** `e2e/taxonomy-admin.spec.ts`

**Tasks to make this test pass:**

- [ ] Complete all unit test implementations above (prerequisite)
- [ ] Wire `isAdmin={true}` from TaxonomyPage to TaxonomyManager
- [ ] Verify `npm run build` passes
- [ ] Run test: `npx playwright test e2e/taxonomy-admin.spec.ts`
- [ ] Test passes (green phase)

---

## Running Tests

```bash
# Run all unit tests for this story (skip stubs visible)
npx vitest run src/features/taxonomy/components/TaxonomyMappingTable.test.tsx src/features/taxonomy/components/TaxonomyManager.test.tsx src/features/taxonomy/actions/reorderMappings.action.test.ts --reporter=verbose

# Run specific unit test file
npx vitest run src/features/taxonomy/components/TaxonomyMappingTable.test.tsx

# Run E2E tests
npx playwright test e2e/taxonomy-admin.spec.ts

# Run tests in headed mode
npx playwright test e2e/taxonomy-admin.spec.ts --headed

# Run all unit tests with coverage
npx vitest run --coverage
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All tests written and failing (10 unit skipped + 2 E2E skipped)
- No new fixtures needed (inline mocks follow existing pattern)
- Mock requirements documented
- data-testid requirements listed (`drag-handle`)
- Implementation checklist created

**Verification:**

```
9 tests passed (existing)
10 tests skipped (new ATDD RED stubs)
1 test file skipped (TaxonomyManager.test.tsx)
0 failures
```

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Install @dnd-kit** — verify React 19 compat, install 3 packages
2. **Pick one failing test** from implementation checklist (start with drag handle visibility)
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it passes (green)
5. **Move to next test** and repeat
6. **Fix action bugs** (transaction, refine, revalidateTag) — make those tests pass
7. **Wire props** (TaxonomyPage → Manager → Table)
8. **Remove `it.skip()` / `test.skip()`** as each test passes
9. **E2E last** — requires all unit tests green first

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

1. Verify all tests pass (green phase complete)
2. Review DnD performance (animation smoothness)
3. Verify keyboard accessibility (screen reader testing optional)
4. Ensure tests still pass after each refactor

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run ... --reporter=verbose`

**Results:**

```
 ✓ unit  reorderMappings.action.test.ts > should reorder mappings and return updated count
 ✓ unit  reorderMappings.action.test.ts > should return FORBIDDEN for non-admin
 ✓ unit  reorderMappings.action.test.ts > should return VALIDATION_ERROR for empty array
 ✓ unit  reorderMappings.action.test.ts > should return VALIDATION_ERROR for invalid UUID
 ↓ unit  reorderMappings.action.test.ts > [P1] should call revalidateTag("taxonomy") with single argument (bug fix)
 ✓ unit  reorderMappings.action.test.ts > should call revalidateTag("taxonomy") [legacy]
 ✓ unit  reorderMappings.action.test.ts > should write audit log
 ↓ unit  reorderMappings.action.test.ts > [P0] should wrap all updates in a database transaction
 ↓ unit  reorderMappings.action.test.ts > [P1] should return VALIDATION_ERROR for duplicate IDs
 ↓ unit  TaxonomyManager.test.tsx > [P0] should revert mappings order on action failure
 ✓ unit  TaxonomyMappingTable.test.tsx > Severity Badge Colors > [P1] major badge
 ✓ unit  TaxonomyMappingTable.test.tsx > Severity Badge Colors > [P1] minor badge
 ✓ unit  TaxonomyMappingTable.test.tsx > Severity Badge Colors > [P1] critical badge
 ↓ unit  TaxonomyMappingTable.test.tsx > DnD Reorder > [P0] drag handles when canReorder={true}
 ↓ unit  TaxonomyMappingTable.test.tsx > DnD Reorder > [P0] NO drag handles when canReorder={false}
 ↓ unit  TaxonomyMappingTable.test.tsx > DnD Reorder > [P0] onReorder called after drag end
 ↓ unit  TaxonomyMappingTable.test.tsx > DnD Reorder > [P1] drag disabled during inline edit
 ↓ unit  TaxonomyMappingTable.test.tsx > DnD Reorder > [P1] keyboard reorder
 ↓ unit  TaxonomyMappingTable.test.tsx > DnD Reorder > [P0] colSpan=7 on empty state

 Test Files  2 passed | 1 skipped (3)
      Tests  9 passed | 10 skipped (19)
   Duration  5.99s
```

**Summary:**

- Total tests: 19 (9 existing + 10 new)
- Passing: 9 (existing, expected)
- Skipped: 10 (new RED stubs, expected)
- Failing: 0 (correct — skipped tests don't count as failures)
- Status: RED phase verified

---

## Notes

- **@dnd-kit React 19 compat:** Verify v8+ or peer dep range before installing. If incompatible, use `--legacy-peer-deps` or check for alternatives.
- **DnD E2E pattern:** @dnd-kit uses pointer events, NOT HTML5 drag. Playwright `dragTo()` won't work. Must use `page.mouse.move/down/up` sequence.
- **Legacy revalidateTag test:** The existing test `should call revalidateTag("taxonomy")` passes with the BUGGY implementation (`revalidateTag('taxonomy', 'minutes')`). After bug fix, replace with the new skip stub assertion. Remove the legacy test.
- **TaxonomyManager.test.tsx:** This is a NEW file. When implementing, the test will need to actually trigger the onReorder callback. In GREEN phase, this may require rendering the full component tree and simulating DnD, or testing the handleReorder function in isolation.

---

## Knowledge Base References Applied

- **component-tdd.md** — Component test strategies using @testing-library/react
- **test-quality.md** — Test design principles (Given-When-Then, one assertion per test, determinism)
- **test-priorities-matrix.md** — P0-P3 priority assignment framework

---

**Generated by BMad TEA Agent** - 2026-03-02
