---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-28'
workflowType: 'testarch-atdd'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-2c-native-reviewer-workflow.md'
  - 'src/db/schema/findingAssignments.ts'
  - 'src/db/schema/findingComments.ts'
  - 'src/types/assignment.ts'
  - 'src/features/review/utils/state-transitions.ts'
  - 'src/features/review/validation/reviewAction.schema.ts'
---

# ATDD Checklist - Epic 5, Story 5.2c: Native Reviewer Workflow

**Date:** 2026-03-28
**Author:** Mona (TEA: Murat)
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)

---

## Story Summary

Native reviewers get a focused workflow for reviewing flagged findings — including flag action (QA reviewer), scoped view, confirm/override actions, comment threads, and keyboard shortcuts.

**As a** PM
**I want** native reviewers to have a focused workflow for reviewing flagged findings
**So that** quality is maintained through layered review while keeping native reviewer scope focused

---

## Acceptance Criteria

1. **AC1:** Flag for Native Review Action (QA Reviewer) — FlagForNativeDialog, atomic 5-step transaction, max 3 assignments
2. **AC2:** Native Reviewer Scoped View — RLS + app-level filter, banner, pre-filter
3. **AC3:** Native Reviewer Confirm/Override Actions — C/O keys, re_accepted logic, atomic transaction
4. **AC4:** Finding Comment Thread — immutable comments, ownership validation
5. **AC5:** Notification on Flag + Comment — non-blocking, 3 notification types
6. **AC6:** Finding + Assignment Status Transitions — confirm_native in matrix, override dynamic
7. **AC7:** Assignment Audit Log — every state change → writeAuditLog
8. **AC8:** Keyboard Shortcuts for Native Reviewer — C/O, scoped, suppress in inputs, auto-advance

---

## Failing Tests Created (RED Phase)

### Unit Tests — Server Actions (42 tests)

**File 1:** `src/features/review/actions/flagForNative.action.test.ts`
- ✅ 10 tests | Status: RED (all `it.skip`)
- Verifies: AC1, AC5, AC7 — atomic transaction, cross-file guard, max 3 limit, role/tenant, audit, notification non-blocking, boundary

**File 2:** `src/features/review/actions/confirmNativeReview.action.test.ts`
- ✅ 8 tests | Status: RED (all `it.skip`)
- Verifies: AC3, AC7 — confirm flow, re_accepted logic, native_verified metadata, ownership guard, audit

**File 3:** `src/features/review/actions/overrideNativeReview.action.test.ts`
- ✅ 6 tests | Status: RED (all `it.skip`)
- Verifies: AC3 — override to accept/reject, validation, ownership guard, native_override metadata

**File 4:** `src/features/review/actions/addFindingComment.action.test.ts`
- ✅ 6 tests | Status: RED (all `it.skip`)
- Verifies: AC4, AC5, AC7 — insert comment, ownership validation (Guardrail #73), boundary, audit, notification

**File 5:** `src/features/review/actions/getFindingComments.action.test.ts`
- ✅ 4 tests | Status: RED (all `it.skip`)
- Verifies: AC4 — load comments with author details, empty result, tenant isolation

**File 6:** `src/features/review/actions/getNativeReviewers.action.test.ts`
- ✅ 4 tests | Status: RED (all `it.skip`)
- Verifies: AC1 — list eligible native reviewers by language, empty result, tenant isolation

**File 7:** `src/features/review/actions/startNativeReview.action.test.ts`
- ✅ 4 tests | Status: RED (all `it.skip`)
- Verifies: AC6, AC7 — pending→in_review, idempotent, role guard, audit

### Unit Tests — Utils/Schema/Hooks (33 tests)

**File 8:** `src/features/review/utils/state-transitions.native.test.ts`
- ✅ 7 tests | Status: RED (all `it.skip`)
- Verifies: AC6 — confirm_native in TRANSITION_MATRIX, override_native NOT in matrix

**File 9:** `src/features/review/validation/reviewAction.schema.native.test.ts`
- ✅ 18 tests | Status: RED (all `it.skip`)
- Verifies: AC1, AC3, AC4 — 4 new Zod schemas, boundary values for comment lengths

**File 10:** `src/features/review/hooks/use-keyboard-actions.native.test.ts`
- ✅ 8 tests | Status: RED (all `it.skip`)
- Verifies: AC8 — C/O shortcuts, suppress in inputs/textarea/modal, scoped, auto-advance

### E2E Tests (5 tests)

**File 11:** `e2e/review-native-workflow.spec.ts`
- ✅ 5 tests | Status: RED (all `test.skip`)
- Verifies: AC1→AC2→AC3→AC4 end-to-end flow with 2 user contexts

---

## Boundary Value Tests

| AC | Boundary | At | Below | Above | Zero |
|----|----------|----|-------|-------|------|
| AC1 | flaggerComment length | 10 ✅, 500 ✅ | 9 (reject) ✅ | 501 (reject) ✅ | — |
| AC4 | comment body length | 1 ✅, 1000 ✅ | 0 (reject) ✅ | 1001 (reject) ✅ | empty (reject) ✅ |
| AC1 | max assignments | 0→OK, 2→OK | — | 3→reject ✅ | — |
| AC3 | override newStatus | accepted ✅, rejected ✅ | — | flagged (reject) ✅, pending (reject) ✅ | — |

---

## Data Factories Required

### Finding Assignment Factory (Task 14.1)

**File:** `src/test/factories.ts` (extend existing)

**New exports:**
- `buildFindingAssignment(overrides?)` — returns valid `finding_assignments` row data
- `buildFindingComment(overrides?)` — returns valid `finding_comments` row data

---

## Implementation Checklist

### Phase 1: Types & Validation (AC6, AC8 — foundation)

**Test:** `state-transitions.native.test.ts` (7 tests)
- [ ] Add `'confirm_native'` to `ReviewAction` type in `state-transitions.ts`
- [ ] Add `confirm_native` entry to all 8 states in `TRANSITION_MATRIX`
- [ ] Run: `npx vitest run src/features/review/utils/state-transitions.native.test.ts`
- [ ] ✅ Tests pass

**Test:** `reviewAction.schema.native.test.ts` (18 tests)
- [ ] Add `flagForNativeSchema` to `reviewAction.schema.ts`
- [ ] Add `confirmNativeSchema` to `reviewAction.schema.ts`
- [ ] Add `overrideNativeSchema` to `reviewAction.schema.ts`
- [ ] Add `addFindingCommentSchema` to `reviewAction.schema.ts`
- [ ] Export inferred types
- [ ] Run: `npx vitest run src/features/review/validation/reviewAction.schema.native.test.ts`
- [ ] ✅ Tests pass

### Phase 2: Server Actions (AC1, AC3, AC4, AC5, AC7 — core logic)

**Test:** `flagForNative.action.test.ts` (10 tests)
- [ ] Create `flagForNative.action.ts` — atomic transaction, guards, audit, notification
- [ ] Create `getNativeReviewers.action.ts` — query eligible reviewers
- [ ] Run: `npx vitest run src/features/review/actions/flagForNative.action.test.ts`
- [ ] Run: `npx vitest run src/features/review/actions/getNativeReviewers.action.test.ts`
- [ ] ✅ Tests pass

**Test:** `confirmNativeReview.action.test.ts` (8 tests)
- [ ] Create `confirmNativeReview.action.ts` — confirm flow, re_accepted logic
- [ ] Run: `npx vitest run src/features/review/actions/confirmNativeReview.action.test.ts`
- [ ] ✅ Tests pass

**Test:** `overrideNativeReview.action.test.ts` (6 tests)
- [ ] Create `overrideNativeReview.action.ts` — override with dynamic status
- [ ] Run: `npx vitest run src/features/review/actions/overrideNativeReview.action.test.ts`
- [ ] ✅ Tests pass

**Test:** `addFindingComment.action.test.ts` + `getFindingComments.action.test.ts` (10 tests)
- [ ] Create `addFindingComment.action.ts` — ownership validation, audit, notification
- [ ] Create `getFindingComments.action.ts` — load with author details
- [ ] Run: `npx vitest run src/features/review/actions/addFindingComment.action.test.ts`
- [ ] Run: `npx vitest run src/features/review/actions/getFindingComments.action.test.ts`
- [ ] ✅ Tests pass

**Test:** `startNativeReview.action.test.ts` (4 tests)
- [ ] Create `startNativeReview.action.ts` — pending→in_review transition
- [ ] Run: `npx vitest run src/features/review/actions/startNativeReview.action.test.ts`
- [ ] ✅ Tests pass

### Phase 3: UI Components (AC1, AC2, AC4 — user-facing)

- [ ] Create `FlagForNativeDialog.tsx` — dialog with reviewer dropdown + comment textarea
- [ ] Create `FindingCommentThread.tsx` — comment list + add comment form
- [ ] Update `ReviewPageClient.tsx` — role-based rendering, scoped view banner
- [ ] Update `FindingDetailContent.tsx` — comment section for flagged findings
- [ ] Update `ReviewActionBar.tsx` — Confirm/Override buttons for native reviewer
- [ ] Update `FindingCard.tsx` — assignment status badge + reviewer name

### Phase 4: Keyboard & Store (AC8, AC2, AC3)

**Test:** `use-keyboard-actions.native.test.ts` (8 tests)
- [ ] Add C/O shortcuts to `use-keyboard-actions.ts`
- [ ] Add `userRole`, `assignedFindingCount` to review store
- [ ] Add `confirmFinding`, `overrideFinding` actions to store
- [ ] Run: `npx vitest run src/features/review/hooks/use-keyboard-actions.native.test.ts`
- [ ] ✅ Tests pass

### Phase 5: Data Layer Updates (AC2, AC6)

- [ ] Update `getFileReviewData.action.ts` — native reviewer query path
- [ ] Add factories: `buildFindingAssignment()`, `buildFindingComment()` to `factories.ts`

### Phase 6: RLS Hardening (TD-RLS-001)

- [ ] Create migration `supabase/migrations/00027_story_5_2c_findings_rls_hardening.sql`
- [ ] Add 4 RLS tests for findings INSERT/DELETE role-scoped
- [ ] Run: `npm run test:rls`
- [ ] ✅ All pass

### Phase 7: E2E Verification

**Test:** `e2e/review-native-workflow.spec.ts` (5 tests)
- [ ] Wire E2E helpers for 2-context flow (QA + native)
- [ ] Run: `npx playwright test e2e/review-native-workflow.spec.ts`
- [ ] ✅ Tests pass

### Phase 8: Final Verification

- [ ] `npm run type-check` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm run test:unit` — all pass (no regression)
- [ ] `npm run test:rls` — all pass

---

## Running Tests

```bash
# Run all unit tests for this story (RED phase — should all skip)
npx vitest run src/features/review/actions/flagForNative.action.test.ts src/features/review/actions/confirmNativeReview.action.test.ts src/features/review/actions/overrideNativeReview.action.test.ts src/features/review/actions/addFindingComment.action.test.ts src/features/review/actions/getFindingComments.action.test.ts src/features/review/actions/getNativeReviewers.action.test.ts src/features/review/actions/startNativeReview.action.test.ts src/features/review/utils/state-transitions.native.test.ts src/features/review/validation/reviewAction.schema.native.test.ts src/features/review/hooks/use-keyboard-actions.native.test.ts --project unit

# Run specific test file
npx vitest run src/features/review/actions/flagForNative.action.test.ts --project unit

# Run E2E
npx playwright test e2e/review-native-workflow.spec.ts

# Full suite verification
npm run test:unit && npm run lint && npm run type-check
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

- ✅ 75 unit tests written (all `it.skip`)
- ✅ 5 E2E tests written (all `test.skip`)
- ✅ Vitest confirms: 75 skipped, 0 failed, 10 files
- ✅ Boundary value tests for all numeric thresholds
- ✅ Implementation checklist with 8 phases

### GREEN Phase (DEV — Next Steps)

1. Pick Phase 1 (types/schemas) first — foundation for all actions
2. Remove `it.skip` → `it` as you implement each feature
3. Run that test file after each change
4. Move to next phase when all tests in current phase pass

### REFACTOR Phase (After All Tests Pass)

1. Verify all 75+5 tests pass
2. Review for quality, duplication
3. Run full suite: `npm run test:unit && npm run lint && npm run type-check`

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run ... --project unit`

**Results:**
```
Test Files  10 skipped (10)
     Tests  75 skipped (75)
  Start at  22:52:10
  Duration  13.47s
```

**Summary:**
- Total unit tests: 75
- Total E2E tests: 5
- Grand total: 80
- Passing: 0 (expected)
- Skipped: 80 (expected)
- Status: ✅ RED phase verified

---

## Notes

- TD-RLS-001 (findings INSERT/DELETE role-scoped) included in Phase 6 — quick fix per Guardrail #23
- TD-ARCH-002 (store dual-write refactor) is optional for this story — do BEFORE adding assignment fields to store if time permits
- E2E requires 2 browser contexts (QA + native) — Playwright multi-context pattern
- `re_accepted` logic depends on looking up original `flag_for_native` review_action's `previousState`
- `override_native` is NOT in TRANSITION_MATRIX — dynamic target handled in action code
- All notification inserts use try-catch (Guardrail #74) — tested in flagForNative + addFindingComment

---

**Generated by BMad TEA Agent (Murat)** - 2026-03-28
