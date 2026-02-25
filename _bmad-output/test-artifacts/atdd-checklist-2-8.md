# ATDD Checklist — Story 2.8: Project-level Onboarding Tour

Generated: 2026-02-25
Phase: RED (failing tests — all `it.skip()`)

## Test Summary

| Level | File | Total | Skipped | Passed |
|-------|------|-------|---------|--------|
| Component | `src/features/onboarding/components/ProjectTour.test.tsx` | 13 | 13 | 0 |
| Component | `src/features/onboarding/components/HelpMenu.test.tsx` | 3 (new) | 3 | 0 |
| Unit | `src/features/onboarding/actions/__tests__/updateTourState.action.test.ts` | 3 (new) | 3 | 0 |
| E2E | `e2e/project-tour.spec.ts` | 10 | 10 | 0 |
| **Total** | | **29** | **29** | **0** |

Existing tests unaffected: 29 passed (no regression)

## AC → Test Mapping

### AC#1: First-Time Project Tour Activation

| # | Test | Level | Priority | File | Status |
|---|------|-------|----------|------|--------|
| 1 | Skip if `project_tour_completed` is set | Component | P0 | ProjectTour.test.tsx | `skip` |
| 2 | Start from step 0 for first-time user (null metadata) | Component | P1 | ProjectTour.test.tsx | `skip` |
| 3 | Start from step 0 for first-time user (empty object) | Component | P1 | ProjectTour.test.tsx | `skip` |
| 4 | Set exactly 2 tour steps (Glossary + Files) | Component | P0 | ProjectTour.test.tsx | `skip` |
| 5 | Dismiss fires updateTourState with tourId 'project' | Component | P1 | ProjectTour.test.tsx | `skip` |
| 6 | Complete fires on natural finish (last step) | Component | P1 | ProjectTour.test.tsx | `skip` |
| 7 | Dismiss on last step does NOT fire complete | Component | P1 | ProjectTour.test.tsx | `skip` |
| 8 | Show driver.js overlay on first project visit | E2E | P1 | project-tour.spec.ts | `skip` |
| 9 | Show "Import Glossary" as first step title | E2E | P1 | project-tour.spec.ts | `skip` |
| 10 | Advance to step 2 "Upload Files" on Next click | E2E | P2 | project-tour.spec.ts | `skip` |
| 11 | NOT show tour after completion | E2E | P1 | project-tour.spec.ts | `skip` |
| 12 | Close overlay on close/skip click | E2E | P1 | project-tour.spec.ts | `skip` |

### AC#2: Resume After Dismiss

| # | Test | Level | Priority | File | Status |
|---|------|-------|----------|------|--------|
| 13 | Resume at correct step (dismissed_at_step.project=2) | Component | P1 | ProjectTour.test.tsx | `skip` |
| 14 | Clamp resumeStep to LAST_STEP_INDEX | Component | P1 | ProjectTour.test.tsx | `skip` |
| 15 | No re-init after dismiss on re-render | Component | P2 | ProjectTour.test.tsx | `skip` |
| 16 | Resume at step 2 for returning user | E2E | P1 | project-tour.spec.ts | `skip` |

### AC#3: Mobile Suppression

| # | Test | Level | Priority | File | Status |
|---|------|-------|----------|------|--------|
| 17 | Not start tour on mobile viewport (< 768px) | Component | P1 | ProjectTour.test.tsx | `skip` |
| 18 | NOT show tour on mobile viewport | E2E | P1 | project-tour.spec.ts | `skip` |

### Task 1: Type Bug Fix (tourCompletedKey)

| # | Test | Level | Priority | File | Status |
|---|------|-------|----------|------|--------|
| 19 | Set project_tour_completed on complete | Unit | P0 | updateTourState.action.test.ts | `skip` |
| 20 | Set dismissed_at_step.project on dismiss | Unit | P1 | updateTourState.action.test.ts | `skip` |
| 21 | Clear both on restart | Unit | P1 | updateTourState.action.test.ts | `skip` |

### Task 5: HelpMenu "Restart Project Tour"

| # | Test | Level | Priority | File | Status |
|---|------|-------|----------|------|--------|
| 22 | Show "Restart Project Tour" on project routes | Component | P1 | HelpMenu.test.tsx | `skip` |
| 23 | NOT show on dashboard | Component | P1 | HelpMenu.test.tsx | `skip` |
| 24 | Click calls updateTourState with tourId 'project' | Component | P1 | HelpMenu.test.tsx | `skip` |
| 25 | Show in Help menu on project page | E2E | P2 | project-tour.spec.ts | `skip` |
| 26 | Restart tour from Help menu | E2E | P2 | project-tour.spec.ts | `skip` |

### Cleanup & Lifecycle

| # | Test | Level | Priority | File | Status |
|---|------|-------|----------|------|--------|
| 27 | Destroy driver on unmount | Component | P2 | ProjectTour.test.tsx | `skip` |
| 28 | NOT fire complete on cleanup unmount | Component | P2 | ProjectTour.test.tsx | `skip` |

## Files Created/Modified

### New Files
- `src/features/onboarding/components/ProjectTour.test.tsx` — 13 component tests (all skip)
- `src/features/onboarding/components/ProjectTour.tsx` — RED phase stub (returns null)
- `e2e/project-tour.spec.ts` — 10 E2E tests (all skip)

### Modified Files
- `src/features/onboarding/components/HelpMenu.test.tsx` — +3 skipped tests, added `mockUsePathname`
- `src/features/onboarding/actions/__tests__/updateTourState.action.test.ts` — +3 skipped tests

## GREEN Phase Instructions

1. **Task 1**: Fix `tourCompletedKey` type in `updateTourState.action.ts` line 29-32 → un-skip 3 updateTourState tests
2. **Task 2**: Add `dataTour` to `ProjectSubNav.tsx` TABS → no direct test (verified via component tests)
3. **Task 3**: Implement `ProjectTour.tsx` (replace stub) → un-skip 13 ProjectTour tests
4. **Task 4**: Integrate in project layout → prerequisite for E2E tests
5. **Task 5**: Update `HelpMenu.tsx` → un-skip 3 HelpMenu tests
6. **E2E**: Un-skip after all Tasks 1-5 complete → remove `test.skip(true, ...)` from describe blocks

## Verification Command

```bash
# Unit/Component tests (should show 29 passed + 19 skipped)
npx vitest run src/features/onboarding/ --reporter=verbose

# E2E tests (should show all skipped)
npx playwright test e2e/project-tour.spec.ts --reporter=list
```
