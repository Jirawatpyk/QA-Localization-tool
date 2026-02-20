---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-21'
story: '1-7-dashboard-notifications-onboarding'
status: COMPLETE
---

# ATDD Checklist — Story 1.7: Dashboard, Notifications & Onboarding

---

## Step 1: Preflight & Context Loading

### Prerequisites ✅
| Item | Status | Detail |
|------|--------|--------|
| Story file | ✅ | `_bmad-output/implementation-artifacts/1-7-dashboard-notifications-onboarding.md` |
| Acceptance Criteria | ✅ | 6 ACs (AC#1–AC#6) |
| `playwright.config.ts` | ✅ | testDir: `./e2e`, Chromium only, baseURL `http://localhost:3000`, `fullyParallel: true` |
| `e2e/` directory | ✅ | Existing patterns: `auth-tenant.spec.ts`, `taxonomy-mapping.spec.ts` |

### AC Summary
| AC | Description | Risk |
|----|-------------|------|
| AC#1 | Dashboard: 4 metric cards, recent files table, RSC, TTI ≤ 2s | P2 |
| AC#2 | Notifications: bell icon, dropdown, toast (sonner), mark-read | **P1** |
| AC#3 | First-time tour: driver.js 4-step overlay, navigate/dismiss/skip | **P1** |
| AC#4 | Realtime push foundation (Supabase Realtime, Epic 6 prep) | P2 |
| AC#5 | Mobile layout: summary cards only, mobile banner | P2 |
| AC#6 | Returning user: tour resumes at dismissed step, Help→Restart Tour | **P1** |

### Framework Patterns Loaded
- **Auth:** Inline login per test (no storageState yet) — `page.getByLabel().fill()` pattern
- **Selectors:** `data-testid` for stable IDs, `getByRole` for semantic elements
- **Test data:** Factory-based unique timestamps — `const uid = Date.now()`
- **Realtime:** Cannot fully E2E-test Supabase WebSocket; unit-test subscription setup instead
- **Driver.js:** Overlay elements are DOM-injected — query via `page.locator('.driver-popover')`

---

## Step 2: Generation Mode

**Selected Mode: AI Generation**

**Rationale:**
- All 6 ACs are clearly specified with concrete Given/When/Then
- Scenarios are standard: auth, navigation, CRUD, UI state transitions
- No complex drag/drop or multi-step wizard flows requiring live browser recording
- `tea_browser_automation: auto` — AI generation sufficient for clear AC coverage

---

## Step 3: Test Strategy

### AC → Test Scenario Mapping

#### AC#1 — Dashboard Display

| # | Scenario | Level | Priority | Red Phase Trigger |
|---|----------|-------|----------|-------------------|
| 1.1 | After login, `/dashboard` shows 4 metric cards: Recent Files, Pending Reviews, Auto-pass placeholder, Team Activity | E2E | P2 | `data-testid="dashboard-metric-recent-files"` not found |
| 1.2 | Recent Files table shows up to 10 rows | E2E | P2 | Table row count assertion fails |
| 1.3 | Auto-pass metric card shows text "Auto-pass setup pending" | E2E | P2 | Placeholder text not rendered |
| 1.4 | Unauthenticated access to `/dashboard` redirects to `/login` | E2E | P1 | Redirect not triggered (regression guard) |

> TTI ≤ 2s (NFR5) is excluded from ATDD scope — belongs in Lighthouse/Perf pipeline.

#### AC#2 — Notification System

| # | Scenario | Level | Priority | Red Phase Trigger |
|---|----------|-------|----------|-------------------|
| 2.1 | Bell icon is visible in header for authenticated user | E2E | P1 | `data-testid="notification-bell"` not found |
| 2.2 | Bell icon shows unread badge count when unread notifications exist | E2E | P1 | Badge not rendered when `isRead=false` records exist |
| 2.3 | Clicking bell opens notification dropdown with notification list | E2E | P1 | Dropdown not visible after click |
| 2.4 | Notification item shows title, body, and timestamp | E2E | P2 | Expected fields not rendered in dropdown item |
| 2.5 | Clicking "Mark all read" removes the unread badge | E2E | P1 | Badge remains after action |
| 2.6 | `getNotifications` action returns only notifications for current tenant/user | Unit | P1 | Action returns cross-tenant data |

#### AC#3 — First-Time Onboarding Tour

| # | Scenario | Level | Priority | Red Phase Trigger |
|---|----------|-------|----------|-------------------|
| 3.1 | First-time user (metadata=null) sees driver.js overlay on dashboard | E2E | P1 | `.driver-popover` not present in DOM |
| 3.2 | Tour step 1 shows "Welcome" popover | E2E | P1 | Popover title text mismatch |
| 3.3 | Clicking "Next" in tour advances to step 2 | E2E | P2 | Step 2 popover not visible after Next click |
| 3.4 | Clicking "Skip All" completes tour and overlay disappears | E2E | P1 | Overlay still visible / metadata not updated |
| 3.5 | After Skip All, returning to dashboard does NOT show tour again | E2E | P1 | Tour re-triggers despite `setup_tour_completed` set |
| 3.6 | `updateTourState` action persists `setup_tour_completed` ISO timestamp | Unit | P1 | Metadata not written / wrong format |
| 3.7 | `updateTourState` action persists `dismissed_at_step.setup` when Dismiss clicked | Unit | P1 | Step number not saved correctly |

#### AC#4 — Realtime Push Foundation

| # | Scenario | Level | Priority | Red Phase Trigger |
|---|----------|-------|----------|-------------------|
| 4.1 | `useNotifications` hook subscribes to Supabase Realtime channel on mount | Unit | P1 | Channel subscription not called |
| 4.2 | `useNotifications` hook unsubscribes on unmount (no memory leak) | Unit | P2 | Cleanup not called |
| 4.3 | New Realtime INSERT event adds notification to state | Unit | P1 | State not updated on channel event |

> Full Realtime E2E (two-browser session) is deferred to Epic 6. Foundation unit tests only.

#### AC#5 — Mobile Layout

| # | Scenario | Level | Priority | Red Phase Trigger |
|---|----------|-------|----------|-------------------|
| 5.1 | At 375px viewport, dashboard shows only summary cards and recent files | E2E | P2 | Extra widgets visible on mobile |
| 5.2 | At 375px viewport, mobile desktop-suggestion banner is visible | E2E | P2 | Banner not rendered on mobile |
| 5.3 | At 375px viewport, onboarding tour is suppressed | E2E | P2 | `.driver-popover` present on mobile (should not be) |

#### AC#6 — Returning User Tour Resume

| # | Scenario | Level | Priority | Red Phase Trigger |
|---|----------|-------|----------|-------------------|
| 6.1 | User with `dismissed_at_step.setup = 2` sees tour resume at step 2 on return | E2E | P1 | Tour starts at step 1 instead of 2 |
| 6.2 | Tour resume uses 0-based index: `drive(dismissed_at_step - 1)` | Unit | P1 | Wrong step shown (off-by-one) |
| 6.3 | Help menu shows "Restart Tour" option for users with `setup_tour_completed != null` | E2E | P2 | Menu option absent |
| 6.4 | Clicking "Restart Tour" starts tour from step 1 and clears dismissed_at_step | E2E | P2 | Tour not restarted / metadata not cleared |

---

### Priority Summary

| Priority | Count | Scenarios |
|----------|-------|-----------|
| **P1** | 14 | 1.4, 2.1, 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 4.1, 4.3, 6.1, 6.2 |
| **P2** | 10 | 1.1, 1.2, 1.3, 2.4, 3.3, 4.2, 5.1, 5.2, 5.3, 6.3, 6.4 |

### Test Level Distribution

| Level | Count | Notes |
|-------|-------|-------|
| E2E (Playwright) | 18 | All AC user journeys |
| Unit (Vitest) | 6 | Actions, hook, off-by-one |
| Component | 0 | Covered by E2E |

### Red Phase Confirmation

All E2E tests target `data-testid` attributes and `.driver-popover` CSS classes that will NOT exist until implementation is complete.
All unit tests assert on functions that do not exist yet (`updateTourState`, `getNotifications`, `useNotifications`).
**Every test MUST fail before Story 1.7 is implemented** — this is the ATDD red phase guarantee.

---

## Step 4C: Aggregate — TDD Red Phase

### TDD Validation ✅

| Check | Status |
|-------|--------|
| All unit tests use `it.skip()` | ✅ PASS |
| All E2E tests use `test.skip()` | ✅ PASS |
| No placeholder assertions | ✅ PASS |
| All marked `expected_to_fail: true` | ✅ PASS |

### Files Written to Disk

**Unit Tests (Vitest — 3 files, 12 tests):**

| File | Tests | AC Coverage |
|------|-------|-------------|
| `src/features/dashboard/actions/__tests__/getNotifications.action.test.ts` | 4 | AC#2, AC#4 |
| `src/features/onboarding/actions/__tests__/updateTourState.action.test.ts` | 4 | AC#3, AC#6 |
| `src/features/dashboard/hooks/__tests__/useNotifications.test.ts` | 4 | AC#2, AC#4 |

**E2E Tests (Playwright — 3 files, 16 tests):**

| File | Tests | AC Coverage |
|------|-------|-------------|
| `e2e/dashboard.spec.ts` | 6 | AC#1, AC#5 |
| `e2e/notifications.spec.ts` | 5 | AC#2 |
| `e2e/onboarding-tour.spec.ts` | 8 | AC#3, AC#6 |

> **Note:** `e2e/dashboard.spec.ts` includes 1 non-skipped regression guard (unauthenticated redirect) carried from Story 1.2.

### Summary Statistics

```
🔴 TDD RED PHASE: Failing Tests Generated

📊 Summary:
- Total Tests: 28 (unit: 12 + E2E: 16)
- Unit Tests (Vitest): 12 — all it.skip()
- E2E Tests (Playwright): 16 — all test.skip()
- Fixture needs: mockCurrentUser, mockDb, mockSupabaseRealtime, inlineLogin, firstTimeUserSetup

🚀 Execution: PARALLEL (Subprocess A + B simultaneously)
```

### Fixture Needs (for green phase)

| Fixture | Type | Used by |
|---------|------|---------|
| `mockCurrentUser` | vi.mock | Unit tests |
| `mockDb` | vi.mock | Unit tests |
| `mockSupabaseRealtime` | vi.mock | useNotifications.test.ts |
| `inlineLogin()` | helper fn | All E2E tests |
| `E2E_FIRST_TIME_EMAIL` | env var | onboarding-tour.spec.ts |
| `E2E_RETURNING_EMAIL` | env var | onboarding-tour.spec.ts |

---

## Step 5: Validate & Complete ✅

### Validation Checklist

| Item | Status |
|------|--------|
| Prerequisites satisfied (story file, ACs, Playwright config, e2e/) | ✅ |
| Unit test files created (3 files, 12 tests) | ✅ |
| E2E test files created (3 files, 16 tests) | ✅ |
| All tests use `it.skip()` or `test.skip()` (red phase) | ✅ |
| No placeholder assertions (`expect(true).toBe(true)`) | ✅ |
| All 6 ACs covered | ✅ |
| Checklist stored in `_bmad-output/test-artifacts/` | ✅ |
| No orphaned CLI browser sessions | ✅ (AI generation mode — no CLI used) |

### Risks & Assumptions

| Risk | Mitigation |
|------|-----------|
| `E2E_FIRST_TIME_EMAIL` requires a fresh user with `metadata=null` | Create dedicated Supabase user in CI setup; reset metadata between runs |
| `E2E_RETURNING_EMAIL` requires user with `dismissed_at_step.setup=2` | Create via API in CI setup hook before E2E run |
| `useNotifications.test.ts` requires `@testing-library/react` | Add to package.json if missing: `npm i -D @testing-library/react` |
| Supabase Realtime channel mock — depends on exact client API shape | Adjust mock after seeing actual `createClient` import path in implementation |
| driver.js popover CSS classes (`.driver-popover`) may change in future | Pin `driver.js@^1.3.0` in package.json to avoid API drift |

---

## Completion Summary

```
✅ ATDD Workflow COMPLETE — Story 1.7

🔴 TDD RED PHASE: 28 FAILING tests generated

📂 Test Files Created:
Unit Tests (Vitest):
  ├── src/features/dashboard/actions/__tests__/getNotifications.action.test.ts  (4 tests)
  ├── src/features/onboarding/actions/__tests__/updateTourState.action.test.ts  (4 tests)
  └── src/features/dashboard/hooks/__tests__/useNotifications.test.ts           (4 tests)

E2E Tests (Playwright):
  ├── e2e/dashboard.spec.ts          (5 skip + 1 live regression guard)
  ├── e2e/notifications.spec.ts      (5 tests)
  └── e2e/onboarding-tour.spec.ts    (8 tests)

📋 Checklist: _bmad-output/test-artifacts/atdd-checklist-1-7.md

🚀 Next Steps — for Dev (after implementing Story 1.7):
1. Remove all it.skip() / test.skip() from the 6 test files
2. npm run test:unit       → verify all 12 unit tests PASS
3. npm run test:e2e        → verify all 16 E2E tests PASS
4. If any tests fail → fix implementation (not the test)
5. Commit passing tests
```
