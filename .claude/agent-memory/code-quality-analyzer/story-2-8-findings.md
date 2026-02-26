# Story 2.8 — Project-level Onboarding Tour CR Summary

## Status: DONE — All 3 CR rounds completed and pushed ✅

---

## CR R1 (1C / 2H / 7M / 4L — 14 findings, all fixed)

- **C1**: `dismissedRef` not reset on Restart — fixed in ProjectTour.tsx
- **H1**: 768px viewport boundary off-by-one — fixed (`< 768` not `<= 768`)
- **H2**: DB try-catch missing in `updateTourState.action.ts`
- Key patterns fixed: `Math.max(0, resumeStep)`, mobile suppression, null guards in E2E

## CR R2 (0C / 3H / 5M / 3L — 11 findings, all fixed)

- **H1**: `Object.defineProperty` missing `configurable:true` in ProjectTour.test.tsx
- **H2**: `dismissedRef` not reset on completed-then-restart path (C1 was partially incomplete)
- **H3**: `getUserInfo` null guard missing in E2E [setup] blocks
- M1: `router.refresh()` fires on failure path — now guarded with `result.success`
- Post-verify M6: DB try-catch actually added to action

## CR R3 (0C / 2H / 3M / 3L — 8 findings, all fixed)

- **H1**: `void updateTourState()` without `.catch()` in ProjectTour.tsx + OnboardingTour.tsx — silent rejection on network errors
- **H2**: `OnboardingTour.tsx` missing `dismissedRef` reset logic — restart setup tour fails after dismiss in same session
- M2: `if (setupBtn)` guard in isPending test → `getByTestId` (strong assertion)
- M3: DB update 0 rows returns success → added `.returning()` + NOT_FOUND guard
- L1: `await import()` per-test in ProjectTour.test.tsx → top-level static import

## Pre-existing Full-Suite Fix (same session as R3)

- `OnboardingTour.test.tsx` `beforeEach` lacked `configurable:true` → full suite failures fixed
- 1496/1496 unit tests pass ✅

## Key Patterns to Reuse in Future Tours

- `dismissedRef` reset: `if (dismissedRef.current && !userMetadata?.dismissed_at_step?.tourId) { dismissedRef.current = false }` — must appear before `if (dismissedRef.current) return`
- `void asyncFn()` → always `.catch(() => {})` for fire-and-forget Server Actions
- `Object.defineProperty(window, 'innerWidth', { value: X, writable: true, configurable: true })` — always `configurable: true` in tests
- DB update → always `.returning()` + guard `if (rows.length === 0) return NOT_FOUND`
