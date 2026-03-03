# Story 3.2b7 — Taxonomy Mapping Reorder UI — TEA CR R1

**Date:** 2026-03-02
**Verdict:** 0C · 2H · 5M · 4L
**Test count:** 21 unit tests (all green, 0 skipped) + 2 E2E tests

---

## ATDD Activation Status

All 10 stubs activated. No `it.skip()` remaining.
3 of 6 P0 stubs have material defects:

- "onReorder after drag end" — vacuous conditional (H1)
- "keyboard reorder" — vacuous conditional (H1 pattern)
- "optimistic revert" — renamed test covers different behavior (M1)

---

## HIGH

**H1: Vacuous conditional assertion — P0 test "onReorder after drag end" + P1 "keyboard reorder"**
File: `TaxonomyMappingTable.test.tsx` lines 237–251 and 312–319
Pattern: `if (mockOnReorder.mock.calls.length > 0) { expect(...) }` — @dnd-kit keyboard sensor
does NOT fire in jsdom (getBoundingClientRect returns zeros), so `if` branch never executes.
Both tests always pass vacuously.
Fix: extract `computeNewOrder(mappings, activeId, overId)` as a pure testable function.
Note: Same anti-pattern as Story 3.1 H2 "expect(true).toBe(true)".

**H2: revalidateTag test asserts two-arg form but ATDD says it should be single arg**
File: `reorderMappings.action.test.ts` line 118 asserts `('taxonomy', 'minutes')`
Production: `reorderMappings.action.ts` line 63 still calls `revalidateTag('taxonomy', 'minutes')`
ATDD checklist item [P1] says this is a bug that must be fixed to single arg.
Code quality analyzer says "confirmed correct" — AMBIGUOUS. Must resolve:
Option A: Fix production to `revalidateTag('taxonomy')`, fix test to single-arg assertion.
Option B: Document that two-arg form is intentional in Next.js 16, mark ATDD item as resolved.

---

## MEDIUM

**M1: Optimistic revert P0 ATDD coverage gap**
File: `TaxonomyManager.test.tsx` — test renamed from "revert on failure" to "wire isAdmin/render drag handles"
The `handleReorder` optimistic revert path (TaxonomyManager.tsx lines 98–123) has ZERO unit coverage.
Fix: call `onReorder` prop directly (bypassing DnD) with a mock that rejects, then assert mappings revert.

**M2: MOCK_MAPPINGS duplicated 3 times across test files**
Pattern violates project factory convention. All three arrays are byte-identical.
Should be extracted to `src/test/factories.ts` as `createMockTaxonomyMapping()` or `MOCK_TAXONOMY_MAPPINGS`.

**M3: Weak drag-disable assertion — `aria-disabled='true'` only**
File: `TaxonomyMappingTable.test.tsx` lines 275–277
Real disable mechanism: `useSortable({ disabled })` + listeners stripped.
Test does not verify listeners are absent. A refactor removing `{...(isDragDisabled ? {} : listeners)}`
would not be caught.
Fix: after setting edit mode, fire keyboard events on handle and assert `mockOnReorder` not called.

**M4: `expect(screen.getByText('3 mappings')).toBeTruthy()` — weak assertion**
File: `TaxonomyManager.test.tsx` line 100
`getByText` throws if not found — `.toBeTruthy()` on HTMLElement is always true.
Fix: `expect(screen.getByText('3 mappings')).toBeInTheDocument()`

**M5: Transaction test verifies call counts only — no payload assertion**
File: `reorderMappings.action.test.ts` lines 147–160
`mockTxUpdate` called twice but which table, what `.set()` values, what `.where()` ID — all unchecked.
A bug like `tx.update(wrongTable)` would still pass.

---

## LOW

**L1: describe-scoped `vi.fn()` not reset between tests — low risk but fragile**
File: `TaxonomyMappingTable.test.tsx` lines 8–10
`vi.clearAllMocks()` in `beforeEach` does reset `vi.fn()` in Vitest 1.x, but pattern is fragile.

**L2: E2E column index `.nth(1)` hardcoded for QA Cosmetic Term column**
File: `e2e/taxonomy-admin.spec.ts` line 392
Brittle — new column insertion before "QA Cosmetic Term" silently reads wrong cell.

**L3: E2E post-reload assertion uses `toContain` (partial match) instead of exact match**
File: `e2e/taxonomy-admin.spec.ts` line 421
`expect(newThirdRowName).toContain(firstRowName!.trim())` — partial match risks false positive.
Also: `firstRowName` captured without `.trim()` but compared with `.trim()` — potential whitespace mismatch.

**L4: E2E Story 3.2b7 `[setup]` missing replica-sync retry loop and timeout**
File: `e2e/taxonomy-admin.spec.ts` lines 370–375
Story 1.6 [setup] has retry loop + `test.setTimeout(120000)`. Story 3.2b7 [setup] is bare `login()`.
Risk: CI fresh-env JWT replica lag causes setup failure → cascades to P0 test.

---

## Key Patterns for Future Tests

- @dnd-kit pointer/keyboard sensors do NOT work in jsdom — any assertion inside `if (mock.calls.length > 0)` is vacuous
- DnD logic must be extracted to a pure function to be unit-testable
- Optimistic revert CAN be tested without DnD by calling the `onReorder` prop callback directly
- E2E column index assertions are fragile — use column header lookup or data-testid
