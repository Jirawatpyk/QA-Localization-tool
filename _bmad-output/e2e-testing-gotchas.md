# E2E Testing Gotchas — qa-localization-tool

**Owner:** Dana (QA Engineer)
**Created:** 2026-02-23 (Epic 1 Retrospective — Action Item A3)
**Purpose:** Prevent repeated debugging of known edge cases in E2E tests.
  Read this before writing a new `.spec.ts` file.

---

## 1. Supabase Replica Lag After Signup

### Problem
`custom_access_token_hook` queries the **read replica**, not primary. Right after a new user
is created (signup), the replica hasn't caught up yet → JWT has `user_role='none'` even
though the DB trigger already wrote the role to `user_roles`. This causes:
- Admin pages return 403/redirect immediately after signup
- `requireRole()` server-side check fails in first few requests

### Symptom
```
test.beforeAll: navigating to /admin → redirected to /dashboard or /login
even though signup succeeded
```

### Fix
In `[setup]` / `beforeAll`, add a **retry loop** after login — keep re-logging until the
protected page is actually reachable:

```typescript
test.setTimeout(120_000) // extend timeout for retry loop

async function loginUntilAdminReachable(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    try {
      await page.waitForURL('**/dashboard', { timeout: 8_000 })
    } catch {
      continue
    }
    // Probe admin route — if reachable, JWT has the role
    await page.goto('/admin')
    const url = page.url()
    if (!url.includes('/login') && !url.includes('/dashboard')) return
    await page.waitForTimeout(2_000) // wait for replica to catch up
  }
  throw new Error('Admin route never became reachable — replica lag too long')
}
```

**Rule:** Use `loginUntilAdminReachable()` for ANY test that needs admin access right after
signup. For tests that reuse an existing user (fixture pattern), regular login is fine.

---

## 2. Radix UI Select — NOT a Native `<select>`

### Problem
`shadcn/ui` Select uses **Radix UI** under the hood. It renders a `<button>` trigger, not a
native `<select>`. Playwright's `page.selectOption()` does **nothing** on it.

### Symptom
```
page.selectOption('[data-testid="severity-select"]', 'Critical')
// → no error, but value doesn't change
```

### Fix
Always use the **two-click pattern**: click the trigger to open the dropdown, then click
the option by role:

```typescript
// ✅ CORRECT
await page.getByTestId('severity-select').click()           // open dropdown
await page.getByRole('option', { name: 'Critical' }).click() // select option

// ❌ WRONG — silently does nothing
await page.selectOption('[data-testid="severity-select"]', 'Critical')
```

**Rule:** Never use `selectOption()` on shadcn/ui or Radix UI components.

---

## 3. Strict Mode: "Edit" Button False Matches

### Problem
When a table row's `internalName` cell contains the word "edit", Playwright's
`getByRole('button', { name: 'Edit' })` can match **both** the Edit button AND the
Delete button (whose `aria-label` is `"Delete mapping: edit-something"`).
Strict mode throws: `"strict mode violation: multiple elements matched"`.

### Symptom
```
await row.getByRole('button', { name: 'Edit' }).click()
// → Error: strict mode violation
```

### Fix
Always use `exact: true` for action buttons in table rows:

```typescript
// ✅ CORRECT
await row.getByRole('button', { name: 'Edit', exact: true }).click()

// ❌ WRONG — matches aria-label substrings
await row.getByRole('button', { name: 'Edit' }).click()
```

**Rule:** All `getByRole('button', { name: ... })` calls inside table rows MUST use
`exact: true`.

---

## 4. Global Tables (No `tenant_id`) — Test Data Strategy

### Problem
`taxonomy_definitions` has NO `tenant_id` — it's shared across all tenants.
If a test creates a mapping named "Test Mapping" and asserts its content, a parallel
test run (or a failed previous run) may leave stale rows, causing false failures.

### Rules for tests against global tables

```typescript
// ✅ Use timestamp-based unique names to avoid collisions
const MAPPING_NAME = `E2E Test ${Date.now()}`

// ✅ Use position-based row targeting (nth) instead of asserting cell values
//    on rows that existed before the test
const rows = page.getByRole('row')
await rows.nth(1).getByRole('button', { name: 'Edit', exact: true }).click()

// ❌ NEVER assert specific pre-existing cell values (permanent data can change)
await expect(page.getByText('Accuracy')).toBeVisible() // fragile
```

**Rule:** For shared/global tables: unique names for CREATE/DELETE tests, position-based
targeting for EDIT tests on pre-existing rows.

---

## 5. Duplicate Cell Content — `.first()` Before Parent Traversal

### Problem
Some rows have the same text in multiple cells (e.g., "Capitalization" appears in both
`internalName` and `parentCategory` cells). Calling `.locator('..')` on an ambiguous
locator throws strict mode violation.

### Symptom
```
await page.getByText('Capitalization').locator('..').getByRole('button', ...).click()
// → strict mode violation: 2 elements matched getByText('Capitalization')
```

### Fix
```typescript
// ✅ CORRECT — disambiguate with .first()
await page.getByText('Capitalization').first().locator('..').getByRole('button', ...).click()

// ❌ WRONG — ambiguous when text appears in multiple cells
await page.getByText('Capitalization').locator('..').getByRole('button', ...).click()
```

**Rule:** Whenever cell text might appear in multiple columns, always chain `.first()`
before `.locator('..')`.

---

## 6. RSC Transition Strict Mode — `router.refresh()` Doubles DOM

### Problem
After a Server Action triggers `router.refresh()`, Next.js App Router **briefly renders
both the old and new DOM** during hydration. Any locator that matches elements in the
sidebar or admin tab area can temporarily return 2 matches → strict mode violation.

### Symptom
```
// After a save/delete action that calls router.refresh()
await page.getByRole('tab', { name: 'Admin' }).click()
// → strict mode violation: 2 elements matched
```

### Fix
```typescript
// ✅ CORRECT — wait for network idle, then use .first()
await page.waitForLoadState('networkidle')
await page.getByRole('tab', { name: 'Admin' }).first().click()

// ✅ Also acceptable — wait for the doubled element to resolve
await page.waitForFunction(() =>
  document.querySelectorAll('[role="tab"][data-value="admin"]').length === 1
)
await page.getByRole('tab', { name: 'Admin' }).click()
```

**Rule:** After any action that triggers `router.refresh()` or `revalidatePath()`,
call `waitForLoadState('networkidle')` before re-querying the DOM.

---

## 7. Dialog Content — Verify Before Asserting

### Problem
Confirmation dialogs (delete, destructive actions) don't always show the item name.
Some dialogs show only generic text like "Are you sure you want to delete this item?"
without including the specific item name. Tests that assert the item name in the dialog
will fail.

### Rule
Before writing a dialog assertion, **manually verify** what the dialog actually shows.
Do not assume the dialog will contain the item name.

```typescript
// ✅ SAFE — assert what the dialog actually shows
await expect(dialog.getByText('Are you sure')).toBeVisible()

// ❌ RISKY — assumes dialog contains item name (may not be true)
await expect(dialog.getByText(MAPPING_NAME)).toBeVisible()
```

---

## 8. `test.setTimeout` for Auth-Heavy Tests

Any test that does signup → admin probe retry loop needs an extended timeout.
Default Playwright timeout (30s) is too short.

```typescript
test.describe('Admin feature', () => {
  test.setTimeout(120_000) // 2 minutes for replica lag retry loop

  test.beforeAll(async ({ browser }) => {
    // ... signup + loginUntilAdminReachable
  })
})
```

---

## 9. Reuse Existing Test Users (Fixture Pattern)

Creating new test users in every `beforeAll` accumulates stale data and hits replica lag
every time. Prefer a **fixed email pattern** per test suite:

```typescript
// ✅ Fixed email — user created once, reused across runs
const TEST_EMAIL = process.env.E2E_TAX16_EMAIL ?? 'e2e-tax16@test.local'

// ❌ Random email — creates new user every run, always hits replica lag
const TEST_EMAIL = `e2e-${Date.now()}@test.local`
```

Use `signupOrLogin()` from `e2e/helpers/supabase-admin.ts` — it tries login first,
falls back to signup only if needed.

---

## 9. @dnd-kit Drag Reorder — Playwright Pattern

### Problem
Mouse-based drag (`page.mouse`) is **unreliable in headless CI** for @dnd-kit:
- @dnd-kit uses CSS transforms to shift rows during drag animation — bounding boxes
  captured before drag start become stale, causing `closestCenter` collision detection
  to resolve the wrong `over` target.
- `hover()` moves the real browser pointer but does NOT update Playwright's internal mouse
  coordinate state.
- `handleDragEnd` sees `over = null` or `active.id === over.id` → returns early (no reorder).

### Symptom
```
// Toast never appears after mouse drag in headless Chromium CI:
// → await expect(page.getByText('Mappings reordered')).toBeVisible() FAILS (timeout)
```

### Fix — Use keyboard reorder (recommended for CI)
```typescript
const dragHandle = rows.nth(1).getByTestId('drag-handle')

// Step 1: Focus the drag handle (KeyboardSensor listens on the activator element)
await dragHandle.focus()
await page.waitForTimeout(300)

// Step 2: Activate drag — Space triggers KeyboardSensor.handleKeyDown()
await dragHandle.press('Space')
await page.waitForTimeout(1000) // Wait for document-level listener attachment

// Step 3: Move down N positions — ArrowDown via sortableKeyboardCoordinates
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(500)
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(500)

// Step 4: Confirm drop — Space fires onDragEnd with correct active + over
await page.keyboard.press('Space')
```

### Key Rules
- **Prefer keyboard over mouse** for @dnd-kit E2E in headless CI — deterministic, no pixel dependency
- Wait ≥1000ms after `press('Space')` before ArrowDown — KeyboardSensor needs time to attach document listener
- Wait ≥500ms between ArrowDown presses — @dnd-kit needs time to update `over` state
- Component must have `KeyboardSensor` in `useSensors()` + `sortableKeyboardCoordinates`
- The drag handle must spread both `{...attributes}` (tabIndex) and `{...listeners}` (onKeyDown)

---

## Keyboard & Accessibility E2E Patterns (Epic 4)

Epic 4 introduces keyboard-driven review workflow: J/K navigation, A/R/F/N/S hotkeys,
Ctrl+Z undo, Esc hierarchy, Tab focus management, and ARIA live regions. This section
documents Playwright testing patterns for all these interactions.

**Reference:** `_bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md`

---

### 10.1 Playwright Keyboard API Reference

Playwright provides two distinct APIs for keyboard interaction. Choosing the wrong one
is a common source of flaky tests.

| API | When to use | Focus behavior |
|-----|-------------|---------------|
| `page.keyboard.press('j')` | Global hotkeys (dispatches to whatever element is focused) | Does NOT change focus — fires on `document.activeElement` |
| `locator.press('Enter')` | Element-specific keys (button activation, input confirm) | First focuses the locator's element, then dispatches key |
| `page.keyboard.type('hello')` | Text input (dispatches `keydown` + `keypress` + `input` per char) | Does NOT change focus — types into `document.activeElement` |
| `page.keyboard.down('Shift')` / `.up('Shift')` | Hold modifier across multiple actions | Manual modifier state management |

**Key name format:** Playwright uses [UIEvents KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values) values.
Common names: `'a'` (lowercase), `'A'` (Shift+a), `'Enter'`, `'Escape'`, `'Tab'`,
`'ArrowDown'`, `'ArrowUp'`, `'Backspace'`, `'Control+z'` (modifier combo).

**Modifier combos:** Use `+` separator: `'Control+z'`, `'Control+Shift+z'`, `'Meta+z'`.
On macOS, Playwright maps `Meta` to Command. On Windows/Linux, use `Control`.

```typescript
// Cross-platform undo — use Control (Playwright normalizes for the OS)
await page.keyboard.press('Control+z')

// NOT this — Meta only works on macOS
await page.keyboard.press('Meta+z')
```

---

### 10.2 Pattern: J/K Finding Navigation

The review page uses `aria-activedescendant` for virtual focus (DOM focus stays on
the grid container, visual focus indicator moves between rows). This means we assert
the grid's `aria-activedescendant` attribute, NOT `toBeFocused()` on individual rows.

```typescript
// Step 1: Focus the grid container first — hotkeys fire on the focused element
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()

// Step 2: Press J to move to first finding
await page.keyboard.press('j')

// Step 3: Assert virtual focus via aria-activedescendant
const firstRow = grid.getByRole('row').first()
const firstRowId = await firstRow.getAttribute('id')
await expect(grid).toHaveAttribute('aria-activedescendant', firstRowId!)

// Step 4: Press J again to move to second finding
await page.keyboard.press('j')
const secondRow = grid.getByRole('row').nth(1)
const secondRowId = await secondRow.getAttribute('id')
await expect(grid).toHaveAttribute('aria-activedescendant', secondRowId!)

// Step 5: Press K to move back
await page.keyboard.press('k')
await expect(grid).toHaveAttribute('aria-activedescendant', firstRowId!)
```

**Gotcha:** `aria-activedescendant` is NOT set until the grid receives focus AND a
navigation key is pressed. Do not assert it immediately after `grid.focus()`.

**Gotcha:** `data-keyboard-focused="true"` is the CSS visual indicator (custom attribute,
not native focus). To assert the highlight is on the correct row:

```typescript
await expect(secondRow).toHaveAttribute('data-keyboard-focused', 'true')
```

---

### 10.3 Pattern: Hotkey Actions (A/R/F/N/S)

Single-key hotkeys execute review actions on the currently selected finding. The test
must: (1) navigate to a finding, (2) press the hotkey, (3) assert action executed,
(4) assert auto-advance moved to next pending finding.

```typescript
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()

// Navigate to first pending finding
await page.keyboard.press('j')

// Accept the finding
await page.keyboard.press('a')

// Assert: action feedback via aria-live region (screen reader announcement)
const announcer = page.locator('[aria-live="assertive"]')
await expect(announcer).toHaveText(/accepted/i, { timeout: 3_000 })

// Assert: toast confirmation (auto-dismiss in 3s — assert quickly)
await expect(page.getByText(/accepted/i)).toBeVisible({ timeout: 2_000 })

// Assert: auto-advance — focus moved to next pending finding (200ms delay per AC)
await page.waitForTimeout(300) // 200ms auto-advance + 100ms buffer
const newActiveId = await grid.getAttribute('aria-activedescendant')
// Verify the new active finding is NOT the one we just accepted
expect(newActiveId).not.toBe(firstRowId)
```

**Gotcha:** Toast auto-dismisses after 3 seconds. Assert toast content within 2 seconds
of the action, or use `page.waitForSelector('[data-sonner-toast]')` to catch it.

**Gotcha:** Auto-advance has a 200ms delay (per Story 4.2 AC). Always `waitForTimeout(300)`
before asserting the new focus position. Do NOT use exact 200ms — CI timing is imprecise.

---

### 10.4 Pattern: Esc Hierarchy (Layered Escape)

Escape closes the most specific open layer first. Test each layer independently:

```typescript
// ── Layer 1: Dropdown inside expanded finding ──
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()
await page.keyboard.press('j')
await page.keyboard.press('Enter') // expand finding

// Open severity override dropdown
await page.keyboard.press('-')
const dropdown = page.getByRole('listbox')
await expect(dropdown).toBeVisible()

// Esc closes ONLY the dropdown, NOT the expanded finding
await page.keyboard.press('Escape')
await expect(dropdown).not.toBeVisible()
// Finding is still expanded
const row = grid.getByRole('row').first()
await expect(row).toHaveAttribute('aria-expanded', 'true')

// ── Layer 2: Esc collapses the expanded finding ──
await page.keyboard.press('Escape')
await expect(row).toHaveAttribute('aria-expanded', 'false')

// ── Layer 3: Esc deselects the finding ──
await page.keyboard.press('Escape')
await expect(grid).not.toHaveAttribute('aria-activedescendant')
```

**Gotcha:** Radix UI dropdowns/popovers handle their own Escape internally. If your
component uses Radix `DropdownMenu` or `Popover`, the first Escape is consumed by Radix
(closes the popup) and does NOT propagate to the grid's `onKeyDown`. The custom Esc
hierarchy handler only fires for subsequent Escape presses.

---

### 10.5 Pattern: Tab Order Verification

Tab order tests verify the logical flow through the review page layout. Use sequential
Tab presses and `toBeFocused()` assertions.

```typescript
// Start from top of page (focus first element)
await page.keyboard.press('Tab')

// Expected tab order: filter bar -> finding list (grid) -> detail panel -> action bar
await expect(page.getByRole('combobox', { name: /severity filter/i }))
  .toBeFocused()

// Tab through filter controls...
await page.keyboard.press('Tab')
await page.keyboard.press('Tab')
// ... until we reach the grid
await expect(page.getByRole('grid', { name: /findings review list/i }))
  .toBeFocused()

// Shift+Tab goes backwards
await page.keyboard.press('Shift+Tab')
await expect(page.getByRole('combobox', { name: /severity filter/i }))
  .toBeFocused()
```

**Gotcha:** `toBeFocused()` checks `document.activeElement`. In headless Chromium,
programmatic focus via `element.focus()` behaves identically to keyboard Tab focus.
However, add a 50ms delay before `toBeFocused()` if the assertion is flaky in CI:

```typescript
await page.keyboard.press('Tab')
await page.waitForTimeout(50) // allow focus to settle
await expect(targetElement).toBeFocused()
```

**Gotcha:** `tabIndex={0}` should only be on the grid container, NOT on every finding
row (300+ rows would make Tab traversal unusable). Inside the grid, navigation is via
J/K (virtual focus), not Tab.

---

### 10.6 Pattern: Focus Trap in Modal

Modals (Radix Dialog) trap Tab focus — Tab from last focusable wraps to first focusable.
Test both the trap and focus restoration on close.

```typescript
// Remember what was focused before modal opens
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()

// Open keyboard shortcuts modal
await page.keyboard.press('Control+/')
const dialog = page.getByRole('dialog')
await expect(dialog).toBeVisible()

// Focus should be inside the modal (on first focusable element)
const closeBtn = dialog.getByRole('button', { name: /close/i })
await expect(closeBtn).toBeFocused()

// Tab should cycle within modal (not escape to grid behind it)
const allButtons = dialog.getByRole('button')
const lastButton = allButtons.last()
await lastButton.focus()
await page.keyboard.press('Tab')
// Wraps back to first focusable in modal
await expect(closeBtn).toBeFocused()

// Shift+Tab from first wraps to last
await page.keyboard.press('Shift+Tab')
await expect(lastButton).toBeFocused()

// Escape closes modal and RESTORES focus to grid
await page.keyboard.press('Escape')
await expect(dialog).not.toBeVisible()
await expect(grid).toBeFocused()
```

**Gotcha:** Radix Dialog uses `FocusScope` with sentinel `<span>` elements at boundaries.
These are not visible but are focusable. If `Tab` appears to "skip" an element, it may
be hitting a sentinel. Do NOT assert focus on sentinels — they are implementation details.

**Gotcha:** Focus restoration uses `requestAnimationFrame`. In rare CI cases, the restored
element may not have focus immediately after the dialog's exit animation. Add a short wait:

```typescript
await page.keyboard.press('Escape')
await expect(dialog).not.toBeVisible()
await page.waitForTimeout(100) // allow rAF focus restore
await expect(grid).toBeFocused()
```

---

### 10.7 Pattern: Ctrl+Z Undo

After accepting/rejecting a finding, Ctrl+Z should revert it to the previous state.

```typescript
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()

// Navigate to finding and accept it
await page.keyboard.press('j')
const activeId = await grid.getAttribute('aria-activedescendant')
await page.keyboard.press('a')

// Verify accepted state
await expect(page.locator(`#${activeId}`))
  .toHaveAttribute('data-status', 'accepted')

// Undo
await page.keyboard.press('Control+z')

// Verify reverted to pending
await expect(page.locator(`#${activeId}`))
  .toHaveAttribute('data-status', 'pending')

// Toast should announce undo
await expect(page.getByText(/undone/i)).toBeVisible({ timeout: 2_000 })
```

**Gotcha:** Ctrl+Z also triggers browser "undo" in text inputs. The app's input guard
should let Ctrl+Z pass through to the browser when an input/textarea is focused (undo
typed text), and only intercept it when the grid or page body is focused (undo review
action). Test this explicitly:

```typescript
// Focus a text input — Ctrl+Z should NOT undo review action
const searchInput = page.getByRole('searchbox')
await searchInput.fill('test')
await page.keyboard.press('Control+z')
// Browser undo removes the typed text, NOT the review action
await expect(searchInput).toHaveValue('tes') // browser text undo
```

---

### 10.8 Pattern: Screen Reader Announcements (aria-live)

The review page uses a centralized `aria-live` region for action feedback. Test that
it updates correctly after keyboard actions.

```typescript
// The announcer element (sr-only, but content is testable)
const announcer = page.locator('#sr-announcer')

// Perform an action
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()
await page.keyboard.press('j')
await page.keyboard.press('a') // accept

// aria-live region should contain action feedback
await expect(announcer).toHaveText(/finding.*accepted/i, { timeout: 2_000 })

// Navigate — announcement should update
await page.keyboard.press('j')
await expect(announcer).toHaveText(/finding.*\d+/i, { timeout: 1_000 })
```

**Gotcha:** The announcer clears its `textContent` before setting a new message (to
force screen readers to re-announce even if the text is identical). If you assert too
fast, you may catch the empty state. Use `toHaveText()` with a timeout (it retries)
rather than a single `textContent()` snapshot.

**Gotcha:** `aria-live="polite"` waits for idle before announcing. In fast E2E tests,
"polite" announcements may queue up. For action feedback tests, the app uses
`aria-live="assertive"` which announces immediately. Assert against the assertive region.

---

### 10.9 Pattern: Reduced Motion & Animations

Epic 4 respects `prefers-reduced-motion: reduce` for auto-advance animations and focus
transitions. Playwright can emulate this media feature.

```typescript
// Emulate reduced motion BEFORE navigating to the page
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(`/projects/${projectId}/review/${fileId}`)

// Auto-advance should still work but skip CSS transition animations.
// Assert the functional behavior (focus moved), NOT animation timing.
const grid = page.getByRole('grid', { name: /findings review list/i })
await grid.focus()
await page.keyboard.press('j')
await page.keyboard.press('a')
await page.waitForTimeout(300)

// Focus should still advance (functionality, not animation)
const activeId = await grid.getAttribute('aria-activedescendant')
expect(activeId).toBeTruthy()
```

**Rule:** NEVER assert animation duration or CSS transition timing in E2E tests.
Headless browser animation timing is unreliable. Assert the **end state** only.

---

### 10.10 Pattern: Input Guard Verification

Single-key hotkeys (A, R, F, J, K) must NOT fire when the user is typing in a text
input, textarea, or contenteditable element. This is critical to prevent accidental
actions.

```typescript
// Focus the search/filter input
const searchInput = page.getByRole('searchbox')
await searchInput.focus()

// Type 'a' — should go into the input, NOT trigger Accept
await page.keyboard.press('a')
await expect(searchInput).toHaveValue('a')

// No action toast should appear
await expect(page.getByText(/accepted/i)).not.toBeVisible({ timeout: 1_000 })

// BUT: Escape should still work inside inputs (closes filter, per Esc hierarchy)
await page.keyboard.press('Escape')
await expect(searchInput).toHaveValue('') // filter cleared

// AND: Ctrl combos should work in inputs (Ctrl+Z = browser text undo, not review undo)
await searchInput.fill('test')
await page.keyboard.press('Control+a') // select all text in input
// Should NOT trigger "select all findings"
```

**Gotcha:** The input guard checks `event.target.tagName` (INPUT, TEXTAREA) and
`isContentEditable`. Elements with `role="textbox"` (e.g., custom rich text editors)
must also be guarded. If your component uses a `<div contenteditable>`, add
`role="textbox"` for the guard to detect it.

---

### 10.11 Anti-Patterns (Things NOT To Do)

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|-----------------|
| `page.keyboard.press('a')` without focusing grid first | Key dispatches to `<body>` or last focused element — unpredictable | Always `await grid.focus()` before hotkey presses |
| `await expect(row).toBeFocused()` for J/K navigation | J/K uses virtual focus (`aria-activedescendant`), NOT DOM focus | Assert `grid.toHaveAttribute('aria-activedescendant', rowId)` |
| `page.keyboard.type('a')` for hotkeys | `.type()` dispatches `input` event (for text entry), not just `keydown` | Use `page.keyboard.press('a')` for hotkeys |
| `locator.press('j')` for global hotkeys | `.press()` first focuses the locator, which may steal focus from grid | Use `page.keyboard.press('j')` after manually focusing grid |
| `page.keyboard.press('ctrl+z')` (lowercase) | Modifier names are case-sensitive | Use `'Control+z'` (capital C) |
| Asserting exact animation duration | CI headless timing varies by 50-200ms | Assert end-state only, use generous timeouts |
| `waitForTimeout(0)` after keyboard action | Zero timeout is unreliable — browser needs event loop tick | Use `waitForTimeout(50)` minimum, or better: `waitForSelector` / `toHaveAttribute` with retry |
| Hardcoding finding IDs in assertions | IDs are UUIDs, change every run | Read `aria-activedescendant` dynamically, use `getAttribute('id')` |
| Testing Ctrl+Z by checking DB directly | Undo is optimistic (UI reverts immediately, server sync is async) | Assert UI state (`data-status` attribute), not DB state |
| `page.keyboard.press('?')` for cheat sheet | `?` requires Shift on most keyboards — Playwright may not auto-Shift | Use `page.keyboard.press('Control+/')` (the actual binding) |

---

### 10.12 CI Considerations — Headless Browser Keyboard Quirks

1. **Focus on page load:** In headless Chromium, `document.activeElement` is `<body>` on
   page load. You MUST explicitly focus the grid before pressing hotkeys. Do not assume
   any element has focus after `page.goto()`.

2. **`driver.js` tour overlay:** The onboarding tour intercepts ALL keyboard events when
   active. Always set `setup_tour_completed` + `project_tour_completed` in E2E setup
   (existing pattern from `setUserMetadata()`).

3. **Modifier key state leaks:** If a test fails mid-modifier (e.g., Shift is held down),
   the next test inherits the modifier state. Use `page.keyboard.up('Shift')` in
   `afterEach` or isolate with fresh pages:

   ```typescript
   test.afterEach(async ({ page }) => {
     // Release any stuck modifier keys
     await page.keyboard.up('Shift')
     await page.keyboard.up('Control')
     await page.keyboard.up('Alt')
   })
   ```

4. **IME composition (Thai/CJK):** When testing Thai or CJK text input, the browser
   fires `compositionstart` / `compositionend` events. During composition,
   `event.isComposing === true`. The app's input guard must also check `isComposing`
   to prevent hotkey firing during IME input. Playwright does NOT simulate IME
   composition — use `page.keyboard.type('สวัสดี')` which dispatches individual character
   events without composition events. For IME-specific bugs, test manually.

5. **Timing between rapid keypresses:** CI environments are slower than local dev. When
   testing rapid sequences (J, J, J to skip 3 findings), add a small delay between
   presses to allow the store + DOM to update:

   ```typescript
   // Rapid navigation — needs breathing room in CI
   for (let i = 0; i < 3; i++) {
     await page.keyboard.press('j')
     await page.waitForTimeout(100) // allow store update + DOM render
   }
   ```

6. **Parallel test isolation:** Keyboard tests that modify finding states (accept/reject)
   must use `.describe.serial()` with unique test data. Parallel tests sharing the same
   findings will cause race conditions on state assertions.

---

### 10.13 Suggested Helper Functions for `e2e/helpers/keyboard.ts`

Create reusable helpers to reduce boilerplate across Epic 4 E2E specs.

```typescript
// e2e/helpers/keyboard.ts

import { expect, type Page, type Locator } from '@playwright/test'

/**
 * Focus the findings grid and return its locator.
 * MUST be called before any hotkey press in review tests.
 */
export async function focusGrid(page: Page): Promise<Locator> {
  const grid = page.getByRole('grid', { name: /findings review list/i })
  await grid.focus()
  await page.waitForTimeout(50) // allow focus to settle
  return grid
}

/**
 * Navigate to the Nth finding using J key presses.
 * Returns the id of the focused finding row.
 */
export async function navigateToFinding(
  page: Page,
  grid: Locator,
  position: number,
): Promise<string> {
  for (let i = 0; i < position; i++) {
    await page.keyboard.press('j')
    await page.waitForTimeout(100) // allow store + DOM update
  }
  const activeId = await grid.getAttribute('aria-activedescendant')
  if (!activeId) throw new Error(`No aria-activedescendant after ${position} J presses`)
  return activeId
}

/**
 * Assert that the grid's virtual focus points to a specific row ID.
 */
export async function assertVirtualFocus(
  grid: Locator,
  expectedRowId: string,
): Promise<void> {
  await expect(grid).toHaveAttribute('aria-activedescendant', expectedRowId)
}

/**
 * Assert that a finding row has a specific status attribute.
 */
export async function assertFindingStatus(
  page: Page,
  rowId: string,
  expectedStatus: string,
): Promise<void> {
  await expect(page.locator(`#${rowId}`))
    .toHaveAttribute('data-status', expectedStatus, { timeout: 3_000 })
}

/**
 * Press a hotkey and verify the aria-live announcer updated.
 * Returns the announcement text.
 */
export async function pressHotkeyAndAssertAnnouncement(
  page: Page,
  key: string,
  expectedPattern: RegExp,
): Promise<string> {
  await page.keyboard.press(key)
  const announcer = page.locator('#sr-announcer')
  await expect(announcer).toHaveText(expectedPattern, { timeout: 3_000 })
  const text = await announcer.textContent()
  return text ?? ''
}

/**
 * Assert that focus is trapped inside a dialog (Tab wraps).
 * Presses Tab from last focusable and checks focus returns to first.
 */
export async function assertFocusTrap(dialog: Locator, page: Page): Promise<void> {
  const buttons = dialog.getByRole('button')
  const firstBtn = buttons.first()
  const lastBtn = buttons.last()

  // Tab from last -> should wrap to first
  await lastBtn.focus()
  await page.keyboard.press('Tab')
  await page.waitForTimeout(50)
  await expect(firstBtn).toBeFocused()

  // Shift+Tab from first -> should wrap to last
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(50)
  await expect(lastBtn).toBeFocused()
}

/**
 * Release all modifier keys. Call in afterEach to prevent state leaks.
 */
export async function releaseModifiers(page: Page): Promise<void> {
  await page.keyboard.up('Shift')
  await page.keyboard.up('Control')
  await page.keyboard.up('Alt')
  await page.keyboard.up('Meta')
}
```

**Usage in spec files:**

```typescript
import {
  focusGrid,
  navigateToFinding,
  assertVirtualFocus,
  assertFindingStatus,
  releaseModifiers,
} from './helpers/keyboard'

test.describe.serial('Review Keyboard Navigation', () => {
  test.afterEach(async ({ page }) => {
    await releaseModifiers(page)
  })

  test('J/K navigates between findings', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    const grid = await focusGrid(page)
    const firstId = await navigateToFinding(page, grid, 1)
    const secondId = await navigateToFinding(page, grid, 1)

    // K goes back
    await page.keyboard.press('k')
    await assertVirtualFocus(grid, firstId)
  })

  test('A accepts finding and auto-advances', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    const grid = await focusGrid(page)
    const targetId = await navigateToFinding(page, grid, 1)

    await page.keyboard.press('a')
    await page.waitForTimeout(300) // auto-advance delay

    await assertFindingStatus(page, targetId, 'accepted')

    // Focus should have moved to next pending finding
    const newActiveId = await grid.getAttribute('aria-activedescendant')
    expect(newActiveId).not.toBe(targetId)
  })
})
```

---

## Quick Reference

| Gotcha | Fix |
|--------|-----|
| Supabase replica lag after signup | Retry loop until admin route reachable |
| Radix Select doesn't respond to `selectOption()` | `.click()` trigger → `.click()` option |
| `getByRole('button', { name: 'Edit' })` matches Delete | Add `exact: true` |
| Global table test data collisions | Timestamp names + position-based rows |
| Duplicate cell text → strict mode | `.first()` before `.locator('..')` |
| `router.refresh()` doubles DOM | `waitForLoadState('networkidle')` + `.first()` |
| Dialog doesn't show item name | Verify dialog content before asserting |
| Auth tests timing out | `test.setTimeout(120_000)` |
| @dnd-kit drag not triggering onDragEnd | Use keyboard reorder: `focus()` → `press('Space')` → `ArrowDown` × N → `press('Space')` |
| Hotkey fires on `<body>` instead of grid | Always `grid.focus()` before `page.keyboard.press()` |
| `toBeFocused()` fails for J/K navigation | Use `grid.toHaveAttribute('aria-activedescendant', rowId)` (virtual focus) |
| `page.keyboard.type('a')` triggers input event | Use `page.keyboard.press('a')` for hotkeys |
| Modifier key name case-sensitive | `'Control+z'` not `'ctrl+z'` |
| Toast auto-dismisses before assertion | Assert within 2s of action, or use `waitForSelector` |
| Auto-advance timing flaky in CI | `waitForTimeout(300)` after action (200ms delay + 100ms buffer) |
| Focus not restored after modal close | Add `waitForTimeout(100)` for rAF focus restore |
| Modifier key state leaks between tests | `releaseModifiers(page)` in `afterEach` |
| IME composition triggers hotkeys | App must check `event.isComposing` — cannot test via Playwright |
| Rapid J/J/J skips findings in CI | Add `waitForTimeout(100)` between presses |
