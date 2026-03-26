# Story 4.8 — Accessibility & Integration Verification

## CR R1 (2026-03-18) — 0C / 3H / 5M / 5L (pre-fix)

See below for R2 review after fixes.

## CR R2 (2026-03-18) — 0C / 4H / 8M / 0L (post-fix, re-review of final code)

### High Findings

1. **H1: Placeholder assertions in ReviewPage.aria.test.tsx** — `expect(Component).toBeDefined()` and `expect(true).toBe(true)` always pass. TA-08, TA-17, TA-18 have zero real assertion.
2. **H2: buildVerificationFindings factory — dead code** — `src/test/factories/verification-findings.ts` 110 lines, zero imports anywhere.
3. **H3: E2E TA-03 has no expect() statement** — P0 test (AC1) with zero assertions, always passes.
4. **H4: Hotkey conflict test uses hardcoded data** — static arrays instead of importing from production config. Self-referencing assertions.

### Medium Findings

- M1: BudgetStatus type repeated 4x (DRY)
- M2: ModelPinningSettings listbox no auto-focus on open (APG pattern)
- M3: ModelPinningSettings missing Home/End key nav
- M4: E2E perf thresholds very wide (15s render, 10s action)
- M5: Scripts use console.log/process.env (acceptable for standalone)
- M6: Scripts cleanup may fail on RESTRICT FK
- M7: blendWithOpacity parameter naming confusion (fg2, bg2)
- M8: E2E seed score insert no error check

### Positive

- AiSpendByProjectTable: icon+text+color = correct WCAG SC 1.4.1
- NotificationDropdown: sr-only Unread minimal fix
- ModelPinningSettings: arrow keys, focusedIndex reset, label htmlFor
- useNotifications: tenantId in deps
- a11y-helpers: pure functions, boundary tests
- E2E nth(1) comment explaining NO-OP click pattern = good knowledge share

### Recurring Pattern: Placeholder Tests (NEW)

Story 4.8 introduced several "structural verification" tests that use `expect(Component).toBeDefined()` or `expect(true).toBe(true)` when render is difficult due to server-only deps. This pattern should be tracked — it gives false coverage confidence. Prefer `it.todo()` + TD entry.
