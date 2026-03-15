---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-15'
workflowType: 'testarch-atdd'
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-4a-bulk-operations-decision-override.md'
  - 'src/features/review/stores/review.store.ts'
  - 'src/features/review/actions/helpers/executeReviewAction.ts'
  - 'src/features/review/hooks/use-review-actions.ts'
  - 'src/db/schema/reviewActions.ts'
---

# ATDD Checklist - Epic 4, Story 4a: Bulk Operations & Decision Override

**Date:** 2026-03-15
**Author:** Mona
**Primary Test Level:** Unit (Server Actions) + E2E (User Journeys)

---

## Story Summary

QA Reviewer ต้องการ bulk accept/reject หลาย findings พร้อมกัน และ override decisions เดิมได้ โดยไม่สูญเสีย audit history

**As a** QA Reviewer
**I want** to bulk accept or reject multiple findings at once and override previous decisions when needed
**So that** I can handle large batches of false positives efficiently and correct mistakes without losing audit history

---

## Acceptance Criteria

1. **AC1:** Multi-select via Shift+Click, Shift+J/K, Ctrl+A with BulkActionBar
2. **AC2:** Bulk Accept ≤5 findings — no confirmation dialog, atomic transaction, single score recalc
3. **AC3:** Bulk Reject >5 findings — confirmation dialog with severity breakdown
4. **AC4:** Decision Override — "Override" badge when finding re-decided
5. **AC5:** Override History View — full decision trail, newest-first, read-only
6. **AC6:** Bulk Operation Audit Trail — shared batch_id, is_bulk column, metadata
7. **AC7:** Common Behaviors — progress update, clear selection, focus, prefers-reduced-motion

---

## Failing Tests Created (RED Phase)

### Unit Tests (20 tests)

**File:** `src/features/review/actions/bulkAction.action.test.ts` (12 tests)

- `it.skip` **[P0] should bulk accept 3 findings atomically**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC2 — atomic transaction, all 3 transition to accepted
- `it.skip` **[P0] should bulk reject 8 findings with batch_id**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC3, AC6 — shared batchId across review_actions
- `it.skip` **[P0] should skip no-op findings (already accepted, manual)**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC2 — getNewState returns null → skip
- `it.skip` **[P0] should return processedCount and skippedCount**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC7 — accurate counts excluding no-ops
- `it.skip` **[P0] boundary: should accept exactly 5 findings without error**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC2 boundary — 5 is ≤5 threshold
- `it.skip` **[P0] boundary: should accept 200 findings (max valid)**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: Zod max(200) validation
- `it.skip` **[P0] boundary: should reject 201 findings via Zod validation**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: Zod max(200) rejects 201
- `it.skip` **[P1] should rollback all on transaction failure**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC2 — all-or-nothing atomicity
- `it.skip` **[P1] should send single Inngest event with first finding data**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC2 — single finding.changed event, not N events
- `it.skip` **[P1] should insert feedback_events for bulk reject**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC3 — AI training data for rejected findings
- `it.skip` **[P1] should set is_bulk=true and shared batchId on all review_actions**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: AC6 — audit trail metadata
- `it.skip` **[P2] should return empty processedFindings when all are no-ops**
  - Status: RED — `bulkAction` function not implemented
  - Verifies: Edge case — all findings already in target state

**File:** `src/features/review/actions/getOverrideHistory.action.test.ts` (3 tests)

- `it.skip` **[P0] should return decision history ordered newest-first**
  - Status: RED — `getOverrideHistory` function not implemented
  - Verifies: AC5 — ORDER BY created_at DESC
- `it.skip` **[P1] should return empty array for finding with single action**
  - Status: RED — `getOverrideHistory` function not implemented
  - Verifies: AC5 — no history for first-decision findings
- `it.skip` **[P1] should enforce tenant isolation on history query**
  - Status: RED — `getOverrideHistory` function not implemented
  - Verifies: Guardrail #1 — withTenant on every query

**File:** `src/features/review/stores/review.store.bulk.test.ts` (5 tests)

- `it.skip` **[P0] should select range between two finding IDs in sort order**
  - Status: RED — `selectRange` method not implemented
  - Verifies: AC1 — Shift+Click range selection
- `it.skip` **[P0] should select all filtered findings on selectAllFiltered**
  - Status: RED — `selectAllFiltered` method not implemented
  - Verifies: AC1 — Ctrl+A
- `it.skip` **[P1] should track isBulkInFlight state**
  - Status: RED — `isBulkInFlight` not in store
  - Verifies: AC7 — double-click prevention
- `it.skip` **[P1] should track overrideCounts per finding**
  - Status: RED — `overrideCounts` map not in store
  - Verifies: AC4 — badge count tracking
- `it.skip` **[P1] should reset bulk state and overrideCounts on resetForFile**
  - Status: RED — `resetForFile` not updated
  - Verifies: AC7 — clean state on file switch

### E2E Tests (8 tests + 1 setup)

**File:** `e2e/review-bulk-operations.spec.ts` (9 tests)

- `test.skip` **[P0] E-BK1: should show BulkActionBar when Shift+Click selects**
  - Status: RED — BulkActionBar component not implemented
  - Verifies: AC1 — multi-select UI, aria-selected, role=toolbar
- `test.skip` **[P0] E-BK2: should bulk accept 3 findings with summary toast**
  - Status: RED — bulk accept flow not implemented
  - Verifies: AC2 — ≤5 no dialog, single toast, score recalc
- `test.skip` **[P0] E-BK3: should show confirmation dialog for >5 bulk reject**
  - Status: RED — BulkConfirmDialog not implemented
  - Verifies: AC3 — severity breakdown, focus trap, confirm executes
- `test.skip` **[P0] E-BK4: should clear selection on Escape**
  - Status: RED — Escape handler for bulk mode not wired
  - Verifies: AC1 — Esc clears, BulkActionBar hides
- `test.skip` **[P1] E-BK5: should select all filtered findings with Ctrl+A**
  - Status: RED — Ctrl+A handler not wired
  - Verifies: AC1 — selectAllFiltered
- `test.skip` **[P1] E-BK6: should show Override badge after re-decision**
  - Status: RED — OverrideBadge component not implemented
  - Verifies: AC4 — badge appears when review_actions count > 1
- `test.skip` **[P1] E-BK7: should display decision history in OverrideHistoryPanel**
  - Status: RED — OverrideHistoryPanel not implemented
  - Verifies: AC5 — history panel with decision trail
- `test.skip` **[P2] E-BK8: should return to single-select on regular click**
  - Status: RED — single-click exit from bulk mode not wired
  - Verifies: AC1 — click without Shift clears selection

---

## Implementation Checklist

### Phase 1: Server-Side (Tasks 1-3)

- [ ] Task 1: DB Migration — `is_bulk` column
  - Run: `npx vitest run src/features/review/actions/bulkAction.action.test.ts`
- [ ] Task 2: `bulkAction.action.ts` — bulk accept/reject Server Action
  - Makes 12 unit tests pass
  - Run: `npx vitest run src/features/review/actions/bulkAction.action.test.ts`
- [ ] Task 2.5: Extend `FindingChangedEventData` type + Inngest Events
- [ ] Task 3: `getOverrideHistory.action.ts` — override history Server Action
  - Makes 3 unit tests pass
  - Run: `npx vitest run src/features/review/actions/getOverrideHistory.action.test.ts`

### Phase 2: Store (Task 4)

- [ ] Task 4: Extend Zustand store — `selectRange`, `selectAllFiltered`, `isBulkInFlight`, `overrideCounts`
  - Makes 5 store tests pass
  - Run: `npx vitest run src/features/review/stores/review.store.bulk.test.ts`

### Phase 3: Client-Side (Tasks 5-13)

- [ ] Task 5: Keyboard hooks — Shift+Click, Shift+J/K, Ctrl+A, Escape
- [ ] Task 6: BulkActionBar component
- [ ] Task 7: BulkConfirmDialog component
- [ ] Task 8: OverrideBadge component
- [ ] Task 9: OverrideHistoryPanel in FindingDetailContent
- [ ] Task 10: Checkbox column in FindingCard/Compact
- [ ] Task 11: Wire bulk actions in ReviewPageClient
- [ ] Task 12: Wire override badge
- [ ] Task 13: Optimistic UI for bulk operations

### Phase 4: E2E Verification (Task 15)

- [ ] Unskip E2E tests → run with Inngest dev server
  - Run: `INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-bulk-operations.spec.ts`
- [ ] All 8 E2E tests pass (green phase)

---

## Running Tests

```bash
# Run all failing unit tests for this story
npx vitest run src/features/review/actions/bulkAction.action.test.ts src/features/review/actions/getOverrideHistory.action.test.ts src/features/review/stores/review.store.bulk.test.ts

# Run specific test file
npx vitest run src/features/review/actions/bulkAction.action.test.ts

# Run E2E tests (requires Inngest dev server)
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-bulk-operations.spec.ts

# Run E2E in headed mode
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-bulk-operations.spec.ts --headed

# Debug specific E2E test
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-bulk-operations.spec.ts --debug
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- 20 unit tests (all `it.skip`)
- 8 E2E tests + 1 setup (all `test.skip`)
- 2 action stubs (throw "Not implemented")
- Tests assert expected behavior, not placeholders
- Boundary value tests included (5/6/200/201)

### GREEN Phase (DEV Team — Next Steps)

1. Pick one failing test (start with Task 2 — bulkAction)
2. Implement minimal code to make it pass
3. Remove `it.skip` → run test → verify green
4. Move to next test and repeat
5. After Phase 1-3 unit tests green → unskip E2E tests

### REFACTOR Phase

After all tests pass, review for DRY, optimize bulk transaction performance.

---

## Priority Coverage Summary

| Priority | Unit | E2E | Total |
|----------|------|-----|-------|
| P0 | 9 | 4 | 13 |
| P1 | 9 | 3 | 12 |
| P2 | 2 | 1 | 3 |
| **Total** | **20** | **8** | **28** |

---

## Notes

- `bulkAction.action.ts` stub created with `// TODO(story-4.4a)` marker — throws at runtime
- `getOverrideHistory.action.ts` stub created with `// TODO(story-4.4a)` marker
- E2E seeds 16 findings (2× consumption) with word_count=100 per segment
- E2E uses suite-level `test.skip(!process.env.INNGEST_DEV_URL)` guard
- `getNewState(action, currentState)` — parameter order verified in tests

---

**Generated by BMad TEA Agent (Murat)** - 2026-03-15
