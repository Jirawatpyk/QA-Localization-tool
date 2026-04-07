# Story S-FIX-6: Onboarding Persistence

Status: done

## Story

As a QA Reviewer,
I want the onboarding tour to stay dismissed after I close it,
so that it does not repeat on every page navigation or block my review workflow.

## Findings Addressed

| ID | Severity | Description |
|---|---|---|
| UX-NEW-02 | P1 | Dashboard onboarding tooltip repeats after dismiss — does not stay dismissed |
| MULTI-02 | P1 | Onboarding tooltip "Import Glossary" blocks Review page for new qa_reviewer |
| BUG-6 | Low | Onboarding Tooltip Repeats on Every Page (same root cause as UX-NEW-02) |

## Root Cause Analysis

**Primary Bug:** `dismissedRef` in `OnboardingTour.tsx` and `ProjectTour.tsx` is a local `useRef(false)` that resets to `false` when the component remounts. If the component remounts before the server action `updateTourState` completes persistence, the tour re-initializes from step 0.

**Race condition flow:**
1. User clicks X → `dismissedRef.current = true` + `updateTourState({ action: 'dismiss', ... })` fires async
2. User navigates (e.g., tab switch, sub-page) → component unmounts + remounts
3. New component instance: `dismissedRef = useRef(false)` → ref is `false`
4. `useEffect` runs → checks `dismissedRef.current` (false) → checks `userMetadata.dismissed_at_step[tourId]`
5. If server action hasn't completed yet → `dismissed_at_step` is still `null` → **tour starts again**

**Secondary Bug (MULTI-02):** `ProjectTour` is mounted at `src/app/(app)/projects/[projectId]/layout.tsx:29`, which wraps ALL project sub-routes including the Review page. The "Import Glossary" tooltip appears on top of the review UI, blocking interaction for new users who haven't dismissed it yet.

## Acceptance Criteria

### AC1: Dismiss state survives component remount (UX-NEW-02)

**Given** a user dismisses the onboarding tour at any step,
**When** the component remounts (navigation, parent rerender, tab switch),
**Then** the tour does NOT re-appear in the same session.

Implementation:
- Replace `useRef(false)` with a **module-level `Set<string>`** that tracks dismissed tour IDs for the current session (e.g., `const dismissedInSession = new Set<string>()`)
- On dismiss: add `tourId` to the Set BEFORE calling server action (synchronous, instant)
- On mount: check `dismissedInSession.has(tourId)` as first guard, before checking server metadata
- This ensures dismiss state survives remounts even if server persistence is still in-flight
- Keep the existing server persistence (`updateTourState`) as the durable store — the Set is a same-session cache only

### AC2: Tour does not block Review page (MULTI-02)

**Given** a new qa_reviewer user who has not completed the Project Tour,
**When** they navigate to the Review page (`/projects/[projectId]/review/[sessionId]`),
**Then** the Project Tour tooltip does NOT appear and does not block interaction.

Implementation:
- Add a **route check** in `ProjectTour.tsx` useEffect: suppress tour when pathname includes `/review/`
- The Project Tour is about Import Glossary + Upload Files — these actions are irrelevant on the Review page
- Use `usePathname()` from `next/navigation` to detect current route
- Tour should only activate on project root, glossary, upload, and settings pages

### AC3: Restart still works after session dismiss

**Given** a user has dismissed the tour in the current session (Set contains tourId),
**When** they click "Restart Tour" from the Help menu,
**Then** the tour re-activates correctly.

Implementation:
- `HelpMenu` restart flow calls `updateTourState({ action: 'restart', ... })` + `router.refresh()`
- On restart: remove `tourId` from `dismissedInSession` Set
- This requires either: (a) HelpMenu imports and mutates the same Set, or (b) use a shared module export
- Simplest: export `dismissedInSession` from a shared module (e.g., `src/features/onboarding/dismissState.ts`) and import in both tour components + HelpMenu

### AC4: Existing test suite remains green

**Given** the refactored dismiss logic,
**When** running `npm run test:unit`,
**Then** all existing onboarding tests pass (OnboardingTour.test.tsx, ProjectTour.test.tsx, HelpMenu.test.tsx, updateTourState.action.test.ts) with updated assertions for the new dismiss mechanism.

### AC5: New tests cover the race condition fix

**Given** the module-level Set approach,
**When** a tour component unmounts and remounts with stale metadata (dismissed_at_step still null),
**Then** a test verifies the tour does NOT re-initialize because the Set blocks it.

Also test:
- Dismiss in OnboardingTour → remount → no re-init
- Dismiss in ProjectTour → remount → no re-init
- Restart clears Set → tour re-activates
- Review page pathname → tour suppressed

## UX States Checklist (Guardrail #96)

- [x] **Loading state:** N/A — tour activates after async import of driver.js (existing pattern)
- [x] **Error state:** N/A — tour failure is non-critical (existing: silent fail)
- [x] **Empty state:** N/A — tour is overlay, no empty state
- [x] **Success state:** Tour completes → success toast (existing pattern, unchanged)
- [x] **Partial state:** Tour dismissed mid-way → resumes at same step on next visit (existing + fix)
- [x] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/` — dismiss = pause (resume same step), not skip

## Tasks / Subtasks

- [x] Task 1: Create shared dismiss state module (AC: #1, #3)
  - [x] 1.1 Create `src/features/onboarding/dismissState.ts` — export helper functions `markDismissed(tourId: TourId)`, `isDismissed(tourId: TourId)`, `clearDismissed(tourId: TourId)`, `_resetForTesting()`. Import `TourId` from `./types.ts` for compile-time safety
  - [x] 1.2 Write unit tests for the module (add, check, clear, reset operations)

- [x] Task 2: Refactor OnboardingTour.tsx dismiss logic (AC: #1, #4)
  - [x] 2.1 Import `isDismissed`, `markDismissed` from `dismissState.ts`
  - [x] 2.2 Replace `dismissedRef.current` check in useEffect (line ~53) with `isDismissed(tourId)` as first guard
  - [x] 2.3 In `onCloseClick`: call `markDismissed(tourId)` before `updateTourState`
  - [x] 2.4 Update `onDestroyed` callback guard (line ~89): replace `dismissedRef.current` with `isDismissed(tourId)` — this prevents false "complete" events from firing after dismiss
  - [x] 2.5 Remove the reset condition block (lines ~50-52: `if (dismissedRef.current && !userMetadata?.dismissed_at_step?.setup)`) — this is dead code after refactor since `clearDismissed` in HelpMenu handles restart case
  - [x] 2.6 Remove `dismissedRef` declaration entirely — all 3 reference sites (useEffect guard, onCloseClick, onDestroyed) are now using `dismissState` module
  - [x] 2.7 Keep the `cancelled` local variable and cleanup function unchanged — it handles async `import('driver.js')` race, orthogonal to dismiss fix
  - [x] 2.8 Keep the existing `userMetadata.dismissed_at_step` check as second guard (server state)
  - [x] 2.9 Update OnboardingTour.test.tsx — `vi.mock('@/features/onboarding/dismissState')` with auto-resettable mocks; add `beforeEach` that calls `vi.mocked(isDismissed).mockReturnValue(false)` as default

- [x] Task 3: Refactor ProjectTour.tsx dismiss logic + route guard (AC: #1, #2, #4)
  - [x] 3.1 Import `isDismissed`, `markDismissed` from `dismissState.ts`
  - [x] 3.2 Add NEW import: `import { usePathname } from 'next/navigation'` — this is NOT currently imported in ProjectTour.tsx
  - [x] 3.3 Replace `dismissedRef.current` check in useEffect (line ~57) with `isDismissed(tourId)` as first guard
  - [x] 3.4 In `onCloseClick`: call `markDismissed(tourId)` before `updateTourState`
  - [x] 3.5 Update `onDestroyed` callback guard (line ~93): replace `dismissedRef.current` with `isDismissed(tourId)`
  - [x] 3.6 Remove the reset condition block (lines ~51-53: `if (dismissedRef.current && !userMetadata?.dismissed_at_step?.project)`) — dead code after refactor
  - [x] 3.7 Remove `dismissedRef` declaration entirely — all 3 reference sites updated
  - [x] 3.8 Keep the `cancelled` local variable unchanged (async import race guard)
  - [x] 3.9 Add route guard: `const pathname = usePathname()` at component top + `if (pathname.includes('/review/')) return` in useEffect (before driver.js import)
  - [x] 3.10 Update ProjectTour.test.tsx — `vi.mock('@/features/onboarding/dismissState')` + mock `usePathname` for review route test; add `beforeEach` default: `vi.mocked(isDismissed).mockReturnValue(false)`

- [x] Task 4: Update HelpMenu restart to clear session state (AC: #3)
  - [x] 4.1 Import `clearDismissed` from `dismissState.ts`
  - [x] 4.2 Call `clearDismissed(tourId)` inside `handleRestartTour` (shared handler for both 'setup' and 'project' restarts) — after `result.success` check, before `router.refresh()`
  - [x] 4.3 Update HelpMenu.test.tsx — `vi.mock('@/features/onboarding/dismissState')` + verify `clearDismissed` called with correct tourId on both "Restart Tour" and "Restart Project Tour"

- [x] Task 5: Add race condition regression tests (AC: #5)
  - [x] 5.1 OnboardingTour: test dismiss → `unmount()` + fresh `render()` (NOT `rerender()`) with stale metadata → verify no re-init. Note: existing "no re-init" test uses `rerender()` which preserves React refs — that doesn't catch the original bug
  - [x] 5.2 ProjectTour: test dismiss → `unmount()` + fresh `render()` with stale metadata → verify no re-init (same pattern as 5.1)
  - [x] 5.3 ProjectTour: test pathname `/projects/abc/review/xyz` → verify tour suppressed (mock `usePathname` return value)
  - [x] 5.4 HelpMenu: test restart → verify `clearDismissed` called with tourId → tour re-activates on next mount

- [x] Task 6: Verify all gates green (AC: #4)
  - [x] 6.1 `npm run test:unit` — all onboarding tests pass (79/79)
  - [x] 6.2 `npm run lint` — 0 errors
  - [x] 6.3 `npm run type-check` — 0 errors

## Dev Notes

### Architecture Pattern

**Module-level Set approach** chosen over alternatives:
- Zustand store: overkill for a boolean-per-tour, adds unnecessary complexity
- localStorage/sessionStorage: requires serialization, not needed since server metadata is the durable store
- Module-level Set: simplest, survives remounts within same session, zero dependencies, testable via mock

**File: `src/features/onboarding/dismissState.ts`**
```typescript
import type { TourId } from './types'

// Session-scoped dismiss state — survives component remounts
// Server-side metadata (updateTourState) remains the durable store
// Each tour is independent — markDismissed('setup') does not affect 'project'
const dismissedInSession = new Set<TourId>()

export function markDismissed(tourId: TourId): void {
  dismissedInSession.add(tourId)
}

export function isDismissed(tourId: TourId): boolean {
  return dismissedInSession.has(tourId)
}

export function clearDismissed(tourId: TourId): void {
  dismissedInSession.delete(tourId)
}

/** Test-only: reset all dismiss state between test runs */
export function _resetForTesting(): void {
  dismissedInSession.clear()
}
```

**Test isolation:** Module-level state persists across Vitest test files in the same worker. Every test file MUST either `vi.mock('@/features/onboarding/dismissState')` OR call `_resetForTesting()` in `afterEach` to prevent cross-test leakage.

### Files to Modify

| File | Change |
|---|---|
| `src/features/onboarding/dismissState.ts` | **NEW** — shared dismiss state module |
| `src/features/onboarding/dismissState.test.ts` | **NEW** — unit tests |
| `src/features/onboarding/components/OnboardingTour.tsx` | Replace `dismissedRef` with `isDismissed`/`markDismissed` |
| `src/features/onboarding/components/OnboardingTour.test.tsx` | Update mocks, add remount regression test |
| `src/features/onboarding/components/ProjectTour.tsx` | Replace `dismissedRef` + add `/review/` route guard |
| `src/features/onboarding/components/ProjectTour.test.tsx` | Update mocks, add remount + pathname tests |
| `src/features/onboarding/components/HelpMenu.tsx` | Call `clearDismissed` on restart |
| `src/features/onboarding/components/HelpMenu.test.tsx` | Verify `clearDismissed` called |

### Guardrails to Follow

| # | Rule | Application |
|---|---|---|
| #20 | No focus stealing on mount | Tour activation is visual only — don't `.focus()` on mount |
| #21 | Dialog state reset on re-open | `clearDismissed` on restart ensures clean re-init |
| #23 | `void asyncFn()` swallows errors | `updateTourState` call — use `.catch(() => {})` if fire-and-forget |
| #35 | Run tests before claim done | `npm run test:unit` + `npm run lint` + `npm run type-check` must GREEN |
| #95 | Check UX spec before mark done | Verify dismiss/resume behavior matches UX spec |
| #96 | UX States Checklist | Addressed above — all states verified |

### Anti-Patterns to Avoid

- Do NOT add `useState` for dismiss tracking — React state resets on unmount just like `useRef`
- Do NOT add localStorage — the server metadata is already the durable store; we only need session-level cache
- Do NOT move ProjectTour to a higher layout — this would break the scoping (project-specific tour)
- Do NOT add try-catch around `import('driver.js')` beyond existing pattern — it already handles this
- Do NOT use `useEffect` cleanup to persist dismiss state — the dismiss action itself persists
- Do NOT remove the `cancelled` variable in useEffect — it guards async `import('driver.js')` race, orthogonal to dismiss fix
- Do NOT forget to update `onDestroyed` callback — it also checks `dismissedRef.current` and will cause false "complete" events if not updated

### Dependencies

- **Blocks:** None
- **Blocked by:** None (S-FIX-5 is done, no dependencies)
- **Tested in:** S-FIX-V2 (Playwright browser verification of Phase 2)

### Previous Story Intelligence

**From S-FIX-14 (most recent Phase 2 story):**
- Multi-round review discipline: expect 2+ CR rounds for bug-class closure
- Root-cause fix > call-site fix: the module-level Set closes the entire "ref resets on remount" class
- Pre-existing test failures: note baseline before starting

**From S-FIX-5:**
- Event emission patterns: not directly relevant but same test harness patterns apply
- DRY helpers: the `dismissState.ts` module follows same extraction pattern

### Existing Test Baseline

| Test File | Tests | Status |
|---|---|---|
| OnboardingTour.test.tsx | ~12 tests | GREEN (includes "no re-init after dismiss" test — uses `rerender()` pattern) |
| ProjectTour.test.tsx | ~17 tests | GREEN (includes "no re-init when dismissed_at_step still set") |
| HelpMenu.test.tsx | ~10 tests | GREEN |
| updateTourState.action.test.ts | ~15 tests | GREEN (server action unchanged) |

**Critical testing notes:**
- Existing "no re-init" tests use `rerender()` which preserves React refs — they do NOT catch the actual remount bug. New regression tests (Task 5) must use `unmount()` + fresh `render()`
- All test files use `vi.clearAllMocks()` in `beforeEach` — this clears mock call history but does NOT reset module-level state. Must add `vi.mock()` or `_resetForTesting()`
- Existing tests mock `dismissedRef` behavior implicitly through component props — these must be updated to mock `dismissState` module instead

### References

- [Source: DEEP-VERIFICATION-CHECKLIST.md > Onboarding section, lines 364-366]
- [Source: DEEP-VERIFICATION-CHECKLIST.md > MULTI-02, line 584]
- [Source: PROJECT-TOUR-REPORT.md > BUG-6, lines 175-178]
- [Source: UX Design Spec > onboarding section — dismiss vs skip behavior]
- [Source: src/features/onboarding/components/ProjectTour.tsx lines 46-117]
- [Source: src/features/onboarding/components/OnboardingTour.tsx lines 46-115]
- [Source: src/app/(app)/projects/[projectId]/layout.tsx line 29]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, 0 debug cycles needed.

### Completion Notes List

- Task 1: Created `dismissState.ts` module with `markDismissed`, `isDismissed`, `clearDismissed`, `_resetForTesting` — 8 unit tests, all GREEN
- Task 2: Refactored `OnboardingTour.tsx` — removed `dismissedRef`, replaced with `isDismissed`/`markDismissed` from shared module. Removed dead restart-reset code block. Updated 13 tests, all GREEN
- Task 3: Refactored `ProjectTour.tsx` — removed `dismissedRef`, added `usePathname` import + `/review/` route guard (AC2: MULTI-02 fix). Added `pathname` to useEffect deps. Updated 19 tests, all GREEN
- Task 4: Updated `HelpMenu.tsx` — added `clearDismissed(tourId)` call after successful restart, before `router.refresh()`. Added 3 new tests (clearDismissed with 'setup', 'project', and not-called-on-failure). 11 tests, all GREEN
- Task 5: Added 4 regression tests: unmount+remount race condition for OnboardingTour and ProjectTour (uses fresh `render()` not `rerender()`), pathname `/review/` suppression, and pathname non-review activation
- Task 6: All gates verified — 79/79 onboarding tests GREEN, 0 lint errors, 0 type errors. 4 pre-existing timeout failures in unrelated files (TaxonomyManager, getFileHistory)

### Review Findings

- [x] [Review][Patch] **F1: Route guard regex** — team decided denylist with regex `/\/review(\/|$)/` + derive `isReviewPage` boolean. FIXED.
- [x] [Review][Patch] **F2: `pathname` in useEffect deps** — derived `isReviewPage` boolean, effect fires only on review↔non-review boundary. FIXED.
- [x] [Review][Patch] **F3: Missing OnboardingTour restart path test** — added restart test (AC5). FIXED.
- [x] [Review][Patch] **F4: `waitFor` + negative assertion** — replaced with `setTimeout(50ms)` + direct `expect`. FIXED.
- [x] [Review][Patch] **F5: Sequential `mockReturnValue`** — added intermediate rerender+assert to verify dismiss blocks, then restart clears. FIXED.
- [x] [Review][Patch] **F6: `_resetForTesting` guard** — `@/lib/env` has no NODE_ENV; underscore prefix convention sufficient per project patterns. ACCEPTED as-is.
- [x] [Review][Patch] **F7: "Restart Project Tour" button visible on review page** — excluded review page from `isProjectRoute` with same regex guard. FIXED.

### Change Log

- 2026-04-06: S-FIX-6 implemented — module-level Set dismiss state, route guard, restart integration, race condition regression tests
- 2026-04-06: CR R1 — 6 patches applied (regex guard, isReviewPage deps, restart test, waitFor fix, mock sequencing, HelpMenu review page exclusion), 1 accepted as-is (underscore convention). 81/81 tests GREEN
- 2026-04-06: CR R2 — 1 patch (OnboardingTour restart test intermediate dismiss-blocks assertion). 2 deferred (restart action dismissed_at_step init, OnboardingTour review guard). All ACs verified clean by Acceptance Auditor. 81/81 tests GREEN

### File List

| File | Change |
|---|---|
| `src/features/onboarding/dismissState.ts` | **NEW** — shared session-scoped dismiss state module |
| `src/features/onboarding/dismissState.test.ts` | **NEW** — 8 unit tests for dismiss state operations |
| `src/features/onboarding/components/OnboardingTour.tsx` | **MODIFIED** — replaced `dismissedRef` with `isDismissed`/`markDismissed`, removed dead restart-reset block |
| `src/features/onboarding/components/OnboardingTour.test.tsx` | **MODIFIED** — added dismissState mock, updated dismiss tests, added remount regression test (14 tests) |
| `src/features/onboarding/components/ProjectTour.tsx` | **MODIFIED** — replaced `dismissedRef` with `isDismissed`/`markDismissed`, added `usePathname` route guard for `/review/` |
| `src/features/onboarding/components/ProjectTour.test.tsx` | **MODIFIED** — added dismissState + usePathname mocks, updated dismiss tests, added remount + pathname regression tests (23 tests) |
| `src/features/onboarding/components/HelpMenu.tsx` | **MODIFIED** — added `clearDismissed(tourId)` on successful restart |
| `src/features/onboarding/components/HelpMenu.test.tsx` | **MODIFIED** — added dismissState mock, 3 new clearDismissed tests (11 tests) |
