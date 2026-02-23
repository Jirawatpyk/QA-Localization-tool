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
