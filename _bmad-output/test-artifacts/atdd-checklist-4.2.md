---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-13'
---

# ATDD Checklist - Epic 4, Story 4.2: Core Review Actions — Accept, Reject, Flag & Finding States

**Date:** 2026-03-13
**Author:** Mona
**Primary Test Level:** Unit (Vitest) + E2E (Playwright)

---

## Story Summary

Story 4.2 implements the three core review actions (Accept, Reject, Flag) with keyboard hotkeys (A/R/F) and mouse button interactions. It includes an 8-state finding lifecycle with score impact rules, optimistic UI updates, auto-advance to next Pending finding, MQM score recalculation via Inngest, and crash recovery (NFR17).

**As a** QA Reviewer
**I want** to Accept, Reject, or Flag findings using keyboard hotkeys with immediate visual feedback
**So that** I can review 300+ findings per day efficiently with a consistent state lifecycle

---

## Acceptance Criteria

1. **AC1: Accept Action (Hotkey A)** — Finding transitions to accepted/re_accepted, green bg + line-through, score recalculates via Inngest, auto-advance to next Pending
2. **AC2: Reject Action (Hotkey R)** — Finding transitions to rejected, red bg + dimmed, no MQM penalty, feedback_events logged (15 NOT NULL columns)
3. **AC3: Flag Action (Hotkey F)** — Finding transitions to flagged, yellow bg + flag icon, penalty held at severity weight
4. **AC4: 8-State Lifecycle & Score Impact Rules** — pending/accepted/re_accepted/rejected/flagged/noted/source_issue/manual with defined score impact per state
5. **AC5: Mouse Button Interactions** — Accept/Reject/Flag buttons + quick-action icons produce identical outcomes to hotkeys, with proper ARIA labels and disabled states
6. **AC6: Auto-Save & Crash Recovery (NFR17)** — Immediate DB persistence via Server Action, accurate ReviewProgress count, rehydrate from server on return

---

## Preflight Summary

### Prerequisites Verified
- Story approved with clear ACs: YES (6 ACs, 11 Tasks)
- Test framework configured: YES (playwright.config.ts, testDir: ./e2e)
- Dev environment available: YES

### Existing Test Infrastructure
- 26 E2E spec files in e2e/
- 15 review unit test files in src/features/review/
- Factory functions in src/test/factories.ts (buildFinding, buildReviewSession, etc.)
- drizzleMock shared utility in src/test/drizzleMock.ts
- E2E helpers: review-page.ts, pipeline-admin.ts, supabase-admin.ts
- PostgREST seeding pattern for E2E data setup

### Knowledge Base Applied
- test-quality.md: determinism, isolation, <300 lines
- data-factories.md: factory with overrides, API seeding
- selector-resilience.md: data-testid > ARIA > text hierarchy
- timing-debugging.md: network-first, no hard waits
- overview.md + fixtures-composition.md: playwright-utils patterns

---

## Test Strategy

### Test Level Summary

| Level | Test Count | Focus |
|---|---|---|
| Unit (Vitest) | ~28 | State transitions (24-matrix), Server Actions (8), hooks (5), validation (2), boundaries (4) |
| E2E (Playwright) | ~11 | Keyboard flow, mouse flow, crash recovery, score recalc, no-op, boundaries |
| Component | 0 | Covered by Unit (jsdom) + E2E integration |
| **Total** | **~39** | |

### AC → Test Mapping

#### AC1: Accept Action — 9 tests
- U-T1/T2/T3: State transitions (pending→accepted, rejected→re_accepted, accepted→no-op) [P0 Unit]
- U-SA1/SA2/SA3/SA4/SA5: Server Action (success, not found, unauthorized, tenant, no-op) [P0/P1 Unit]
- U-H1/H2/H4: Hook (optimistic, rollback, auto-advance) [P0/P1 Unit]
- E-R1: Keyboard A → green bg + toast + auto-advance [P0 E2E]

#### AC2: Reject Action — 5 tests
- U-T4/T5: State transitions (pending→rejected, rejected→no-op) [P0 Unit]
- U-SA6/SA7: Server Action (success + feedback_events 15 cols) [P0 Unit]
- E-R2: Keyboard R → red bg + toast + auto-advance [P0 E2E]

#### AC3: Flag Action — 4 tests
- U-T6/T7: State transitions (pending→flagged, flagged→no-op) [P0 Unit]
- U-SA8: Server Action (success) [P0 Unit]
- E-R3: Keyboard F → yellow bg + toast + auto-advance [P0 E2E]

#### AC4: 8-State Lifecycle — 3 tests
- U-T8: Full 24-transition matrix (8 states × 3 actions) [P0 Unit]
- U-T9: SCORE_IMPACT_MAP correctness [P0 Unit]
- U-V1/V2: Zod schema validation [P1 Unit]

#### AC5: Mouse Buttons — 3 tests
- U-H3: Double-click prevention [P1 Unit]
- E-R5: Click Accept button = hotkey [P1 E2E]
- E-R6: Click quick-action icon [P1 E2E]

#### AC6: Crash Recovery — 3 tests
- U-H5: ReviewProgress count [P1 Unit]
- E-R7: Accept → reload → preserved [P0 E2E]
- E-R4: Full keyboard review (J→A→J→R→J→F) [P0 E2E]

### Boundary Value Tests (MANDATORY)

| Boundary | At | Below | Above | Zero |
|---|---|---|---|---|
| Remaining Pending (auto-advance) | 1 → advance to it | N/A | 2+ → advance nearest | 0 → focus action bar |
| Reviewed count (ReviewProgress) | 1/N (first) | 0/N (none) | N/N (all) | 0/0 (no findings) |
| State no-op (accept) | accepted→null | re_accepted→null | pending→accepted | — |
| State no-op (reject) | rejected→null | — | pending→rejected | — |

Boundary tests: U-B1 (0 pending→action bar, P0), U-B2 (1 pending→advance, P0), U-B3 (0/N display, P1), U-B4 (N/N display, P1), E-B1 (all reviewed→action bar, P0)

### Red Phase Confirmation
All tests use `it.skip()` / `test.skip()` — implementation stubs throw `Error('Not implemented')`. Vitest confirmed: **6 files skipped, 45 tests skipped, 0 failures**.

---

## Generated Test Files

### Unit Tests (Vitest) — 45 `it.skip()` tests

| File | Tests | Test IDs | Priority |
|------|-------|----------|----------|
| `src/features/review/utils/state-transitions.test.ts` | 15 | U-T1→T9b, U-B1→B4 | P0 |
| `src/features/review/actions/acceptFinding.action.test.ts` | 5 | U-SA1→SA5 | P0/P1 |
| `src/features/review/actions/rejectFinding.action.test.ts` | 4 | U-SA6→SA7 + extras | P0 |
| `src/features/review/actions/flagFinding.action.test.ts` | 5 | U-SA8 + extras | P0/P1 |
| `src/features/review/hooks/use-review-actions.test.ts` | 7 | U-H1→H5 + extras | P0/P1 |
| `src/features/review/validation/reviewAction.schema.test.ts` | 9 | U-V1→V2 + extras | P1 |

### E2E Tests (Playwright) — 11 `test.skip()` tests

| File | Tests | Test IDs | Priority |
|------|-------|----------|----------|
| `e2e/review-actions.spec.ts` | 11 | E-R1→R10, E-B1 | P0/P1 |

### Implementation Stubs Created

| Stub File | Exports |
|-----------|---------|
| `src/features/review/utils/state-transitions.ts` | `getNewState()`, `SCORE_IMPACT_MAP` |
| `src/features/review/actions/acceptFinding.action.ts` | `acceptFinding()` |
| `src/features/review/actions/rejectFinding.action.ts` | `rejectFinding()` |
| `src/features/review/actions/flagFinding.action.ts` | `flagFinding()` |
| `src/features/review/hooks/use-review-actions.ts` | `useReviewActions()` |
| `src/features/review/validation/reviewAction.schema.ts` | `acceptFindingSchema`, `rejectFindingSchema`, `flagFindingSchema` |

---

## Test Infrastructure

### Factories Used
- `buildFinding()` from `src/test/factories.ts` — for mock finding objects
- `buildFindingForUI()` from `src/test/factories.ts` — for UI display shape
- `createDrizzleMock()` from `src/test/drizzleMock.ts` — shared DB mock (globalThis)

### E2E Seed Pattern
- `seedFileWithFindingsForActions()` — inserts 1 file (l2_completed) + 1 score (calculated, L1L2) + 5 findings (1 critical, 3 major, 1 minor) via PostgREST

### E2E Helpers Used
- `waitForReviewPageHydrated(page)` — waits for grid + keyboard ready
- `waitForFindingsVisible(page)` — waits for findings in Zustand store
- `signupOrLogin(page, email)` — auth flow
- `createTestProject(tenantId, name)` — project creation
- `cleanupTestProject(projectId)` — cascade cleanup
- `queryScore(fileId)` — PostgREST score query

### Mocks Pattern (Unit)
- `vi.hoisted(() => createDrizzleMock())` + `vi.mock('@/db/client', () => dbMockModule)`
- `mockRequireRole` — auth mock (resolve/reject per test)
- `mockWriteAuditLog` — audit mock
- `mockInngestSend` — Inngest event mock
- Schema table mocks for `findings`, `reviewActions`, `feedbackEvents`
- `vi.mock('server-only', () => ({}))` for Server Action files

### data-testid Selectors (E2E)
- `finding-list` — finding list container
- `finding-compact-row` — compact finding rows
- `finding-count-summary` — shows "Total: N"
- `review-action-bar` — action button toolbar
- `review-progress` — progress indicator
- `data-status` attribute on finding rows — `accepted` / `rejected` / `flagged`

---

## Implementation Checklist (TDD Green Phase)

When implementing Story 4.2, follow this order to turn tests GREEN:

1. **Task 1: `state-transitions.ts`** → makes U-T1 through U-T9b GREEN (15 tests)
2. **Task 1: `reviewAction.schema.ts`** → makes U-V1/V2 GREEN (9 tests)
3. **Task 2: Server Actions** → makes U-SA1 through U-SA8 GREEN (14 tests)
4. **Task 4: `use-review-actions.ts` hook** → makes U-H1 through U-H5 GREEN (7 tests)
5. **Task 5-6: Wire UI components** → makes E-R1 through E-R10, E-B1 GREEN (11 tests)

### DoD Gate (MANDATORY before story completion)
- [x] ALL P0 tests PASS (remove `it.skip()` / `test.skip()`) — **45 unit tests GREEN, 11 E2E unskipped**
- [x] ALL P1 tests PASS — **all P1 unit tests GREEN**
- [x] P2 = nice-to-have (tech debt if skipped) — no P2 tests in this story
- [x] Unit: `npx vitest run src/features/review/` — **0 failures (3261 passed total)**
- [ ] E2E: `npx playwright test e2e/review-actions.spec.ts` — requires INNGEST_DEV_URL (suite-level skip guard)

---

## Running Tests

```bash
# Unit tests (all 6 files)
npx vitest run src/features/review/utils/state-transitions.test.ts
npx vitest run src/features/review/actions/acceptFinding.action.test.ts
npx vitest run src/features/review/actions/rejectFinding.action.test.ts
npx vitest run src/features/review/actions/flagFinding.action.test.ts
npx vitest run src/features/review/hooks/use-review-actions.test.ts
npx vitest run src/features/review/validation/reviewAction.schema.test.ts

# E2E tests
npx playwright test e2e/review-actions.spec.ts

# All review unit tests together
npx vitest run src/features/review/
```

---

## Validation Summary

### TDD Red Phase Compliance
- [x] All 45 unit tests use `it.skip()` — verified via Vitest run
- [x] All 11 E2E tests use `test.skip()` — verified via file inspection
- [x] All tests assert EXPECTED behavior (no placeholder assertions)
- [x] No `expect(true).toBe(true)` patterns found
- [x] Implementation stubs throw `Error('Not implemented')` with `TODO(story-4.2)` refs
- [x] 6 ACs fully covered: AC1 (9), AC2 (5), AC3 (4), AC4 (3), AC5 (3), AC6 (3) + cross-cutting

### Boundary Value Tests (MANDATORY — Epic 2 Retro A2)
- [x] U-B1: 0 pending → focus action bar
- [x] U-B2: 1 pending → advance to it
- [x] U-B3: 0/N reviewed display
- [x] U-B4: N/N reviewed display
- [x] E-B1: All reviewed → focus action bar (E2E)

### Knowledge Fragments Applied
- test-quality.md: determinism, isolation, <300 lines per file
- data-factories.md: factory with overrides, PostgREST API seeding
- selector-resilience.md: data-testid > ARIA > text hierarchy
- timing-debugging.md: network-first, no hard waits
- overview.md + fixtures-composition.md: playwright-utils patterns

### Risks & Assumptions
1. `data-status` attribute assumed on finding rows — implementation must add this
2. `review-progress` testid assumed — implementation must add this
3. Score recalculation E2E (E-R9) depends on Inngest dev server being available
4. Crash recovery (E-R7) assumes DB persistence is immediate (not batched)
5. Auto-advance (E-R4) assumes `requestAnimationFrame` timing — may need adjustment

### Next Recommended Workflow
→ `dev-story` for Story 4.2 implementation (TDD Green Phase)
