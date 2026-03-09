# Story 4.0 CR Round 2 — Review Infrastructure Setup

**Date:** 2026-03-09
**Reviewer:** Testing QA Expert Agent
**Files reviewed:** 14 (11 unit test files + 2 E2E spec files + 1 E2E helper)
**All tests green:** 71 active tests pass (31 unit Story 4.0 + 40 TD regression)
**Skipped E2E:** TD-E2E-013 (F5e), TD-E2E-014 (E1), TD-E2E-015 (TD2) — all have tech-debt-tracker entries

---

## Summary

**0C · 1H · 4M · 4L**

All P0 and P1 ATDD tests implemented and green. No `it.skip()` in unit tests. Three E2E tests correctly deferred with TD entries (TD-E2E-013/014/015). The main quality concern is the vacuous B1 tooltip test (H1) and several weaker assertion patterns.

---

## Critical (0)

None.

---

## High (1)

### H1: B1 tooltip test is vacuous — never asserts tooltip content visible

**File:** `src/features/review/components/ReviewActionBar.test.tsx` lines 17-34

Test [P1] B1 tabs to focus a button then asserts only `buttons[0]` is defined (always true after render). The stated purpose is to verify "tooltip appears on keyboard focus, not just hover" but:

1. `role="tooltip"` content is never queried
2. No assertion checks `screen.getByRole('tooltip')` or tooltip text
3. `expect(buttons[0]).toBeDefined()` would pass on a component with zero tooltip wiring

The test effectively only validates that buttons render — it does NOT validate the tooltip focus behavior at all.

**Fix:** After `user.tab()` to focus the first button, assert the tooltip content is visible:

```typescript
// After focusing the button, tooltip should open on focus
await waitFor(() => {
  expect(screen.getByRole('tooltip')).toBeVisible()
})
// Tooltip content should mention the hotkey
expect(screen.getByRole('tooltip')).toHaveTextContent(/accept/i)
```

Note: Radix Tooltip in jsdom may require `delayDuration={0}` or `open={true}` for testability — verify tooltip component renders content in test env before committing.

---

## Medium (4)

### M1: K2 browser-shortcut test only verifies handler for one of six shortcuts

**File:** `src/features/review/hooks/use-keyboard-actions.test.ts` lines 66-104

Only `ctrl+s` is registered as a handler. The `expect(handler).not.toHaveBeenCalled()` at line 103 only strictly validates that `ctrl+s` was not dispatched to the handler — for `ctrl+p`, `ctrl+w`, `ctrl+n`, `ctrl+t`, `F5`, there is no registered handler at all, so they would not call anything regardless of the passthrough logic. This means the passthrough guard is only actually validated for `ctrl+s`.

**Fix:** Register handlers for ALL six browser shortcuts, then verify none were called:

```typescript
const handler = vi.fn()
for (const shortcut of ['ctrl+s', 'ctrl+p', 'ctrl+w', 'ctrl+n', 'ctrl+t', 'f5']) {
  result.current.register(shortcut, handler, { scope: 'global', description: 'test' })
}
// ... dispatch all 6 shortcuts
expect(handler).not.toHaveBeenCalled()
```

### M2: L4 `useThresholdSubscription` assertion does not verify `tenantId` dropped from call signature

**File:** `src/features/review/components/ReviewPageClient.story40.test.tsx` line 269

Test asserts `mockUseThresholdSubscription.toHaveBeenCalledWith('en-US', 'th-TH')` — 2-arg form. This correctly matches the production 2-arg signature. However, the ATDD checklist (Story 3.5) originally documented a 3-arg form `(sourceLang, targetLang, tenantId)`. The test passes because production dropped `tenantId`. No defect — but there is no test that explicitly guards against accidental re-addition of a third `tenantId` argument (which would be a regression). This is a minor documentation/regression guard concern.

**Recommendation:** Add an inline comment explaining why 2-arg form is used: the production hook derives `tenantId` internally via `useReviewStore`.

### M3: C1 dialog open assertion uses `?? data-state` pattern that would pass even if dialog is closed

**File:** `src/features/review/components/KeyboardCheatSheet.test.tsx` lines 53-55

```typescript
expect(dialog.getAttribute('aria-modal') ?? dialog.getAttribute('data-state')).toBeDefined()
```

`data-state` is always present on a Radix Dialog element. Even `data-state="closed"` is defined (truthy string). If `aria-modal` is null, this falls to `data-state` which is always non-null. The `.toBeDefined()` assertion is therefore vacuous for the `data-state` branch.

The intent is to check `aria-modal="true"`. The real proof the dialog opened is `screen.getByRole('dialog')` on line 53 — that already verifies the dialog is accessible. The extra assertion on line 55 is misleading noise.

**Fix:** Replace with explicit assertion:

```typescript
expect(dialog.getAttribute('aria-modal')).toBe('true')
```

Or simply remove line 55 since `getByRole('dialog')` already proves the dialog is open.

### M4: getDashboardData test uses module-level mutable `queryIndex`/`queryResults` — shared state across tests

**File:** `src/features/dashboard/actions/getDashboardData.action.test.ts` lines 29-41

`queryIndex` and `queryResults` are declared at module level (not inside `vi.hoisted`), making them truly global variables. The `beforeEach` resets them correctly (lines 86-87) but:

1. If any test throws before completion, `queryIndex` leaks to the next test
2. Unlike the canonical `createDrizzleMock()` from `src/test/drizzleMock.ts`, this inline mock does NOT track calls, captured values, or `throwAtCallIndex` — it provides no diagnostics when call counts mismatch

This should use the project-standard `createDrizzleMock()` factory instead of the inline Proxy.

---

## Low (4)

### L1: `use-score-subscription.test.ts` — stale `// TDD RED PHASE` header comment

**File:** `src/features/review/hooks/use-score-subscription.test.ts` line 2-4

The file header says "TDD RED PHASE" but the tests are fully implemented (GREEN phase). This was carried forward from Story 3.0 and never updated in Story 3.2c or 4.0 green phase. Minor but misleading documentation.

### L2: useNotifications TD6 test has `act()` warning (state update outside act)

**File:** `src/features/dashboard/hooks/useNotifications.test.ts`

Test output shows: `An update to TestComponent inside a test was not wrapped in act(...)`. The `onInsertHandler` call on line 57-63 triggers `setNotifications` but is correctly wrapped in `act(() => { onInsertHandler(...) })`. The warning likely comes from the initial `fetchInitial()` useEffect that runs on mount (calling `getNotifications` mock which resolves synchronously). The `renderHook()` call should be wrapped in a `waitFor` or the mock should be set to `mockResolvedValue(...)` BEFORE `renderHook`.

**Fix:**

```typescript
it('[P1] TD6: ...', async () => {
  const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))
  // Wait for initial fetch to settle
  await waitFor(() => expect(result.current.notifications).toBeDefined())
  // ... rest of test
})
```

### L3: app-breadcrumb TD4 test assertion at line 268 is redundant

**File:** `src/components/layout/app-breadcrumb.test.tsx` lines 265-268

The TD4 test for truncation algorithm checks that `allText` contains `'Details'` — but `'Details'` was already asserted two lines earlier via `screen.getByText('Details')`. The `allText.toContain('Details')` at the end is a duplicate check that adds no coverage. The more meaningful assertion would be to also verify `secondToLast` content appears (e.g., 'Session 123' is visible), since that is the stated purpose of the `[first, ..., secondToLast, last]` algorithm.

### L4: review-keyboard E2E — `waitForReviewPageHydrated` clicks body to ensure keyboard focus but adds DOM mutation risk in headless CI

**File:** `e2e/helpers/review-page.ts` line 42

`await page.locator('body').click()` is used to ensure keyboard focus. This can trigger click handlers registered on the body or unintentionally dismiss any visible popovers/tooltips. A safer alternative for giving keyboard focus to the page without side effects is `page.keyboard.press('Tab')` followed by `page.keyboard.press('Shift+Tab')` to ensure focus is on body, or using `page.evaluate(() => document.body.focus())`.

---

## Additional Observations

### P0 E1 E2E test is `test.skip` — intentional, has TD entry

`e2e/review-keyboard.spec.ts` line 323: `test.skip('[P0] E1: ...)` is correctly deferred to Story 4.1a (when J/K roving tabindex is wired). TD-E2E-014 entry confirmed in tech-debt-tracker. The P0 designation is important — this test MUST be unskipped in Story 4.1a.

### getDashboardData test correctly handles `inArray` guard for empty fileIds

The empty-dashboard test pushes 3 query results (not 4) because when `recentFilesRows=[]`, `fileIds=[]`, and the `if (fileIds.length > 0)` guard skips the findings count query entirely. The mock query counter only advances when `db.select()` is called — so 3 queries (recentFiles, pendingReviews, teamActivity) consume indices 0,1,2 correctly. This is sound.

### All boundary value tests are solid

T1/T2 WCAG contrast ratio tests: luminance formula correct, boundary at 4.5:1. B3 button count+order: exact match assertions. All three boundary tests are meaningful.

### TD regression coverage complete

All 7 TD items (TD2-TD7 + TD1 E2E) implemented and green. No gaps in TD regression coverage.
