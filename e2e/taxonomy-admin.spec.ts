import { test, expect, type Page } from '@playwright/test'

/**
 * Story 1.6 — Taxonomy Mapping Editor (E2E ATDD)
 *
 * Coverage:
 *  AC1 — Pre-populated mapping table visible on page load
 *  AC2 — Inline edit: internal_name, MQM category, severity
 *  AC3 — Add new mapping via dialog
 *  AC4 — Soft-delete mapping with confirmation dialog
 *  Auth — Non-admin user redirected from /admin/taxonomy
 *
 * data-testid requirements for Dev team: see ATDD checklist 1-6.md
 *
 * NOTE on global taxonomy data:
 *  taxonomy_definitions is a shared table (no tenant_id).
 *  Tests use position-based row targeting (nth) for AC2 and unique
 *  timestamp names for AC3/AC4 to remain resilient across runs.
 */

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'
// Fixed email — reused across runs to avoid accumulating test users in the DB
const TEST_EMAIL = process.env.E2E_TAX16_EMAIL ?? 'e2e-tax16@test.local'
// Unique names scoped to this run — avoids conflicts from prior incomplete runs
const E2E_MAPPING_NAME = `E2E Test ${Date.now()}`
const E2E_EDIT_NAME = `E2E Edit ${Date.now()}`

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 10000 })
}

// ---------------------------------------------------------------------------
// Auth Gate — Non-admin should be redirected
// ---------------------------------------------------------------------------

test.describe('Taxonomy Admin — Auth Gate', () => {
  test('[P0] should redirect unauthenticated user from /admin/taxonomy to /login', async ({
    page,
  }) => {
    // Given: Unauthenticated user
    // When: they navigate to /admin/taxonomy
    await page.goto('/admin/taxonomy')

    // Then: redirected to login
    await expect(page).toHaveURL(/\/login/)
  })
})

// ---------------------------------------------------------------------------
// Main: Story 1.6 — Serial flow (login once, stay logged in)
// ---------------------------------------------------------------------------

test.describe.serial('Story 1.6 — Taxonomy Mapping Editor', () => {
  test('[setup] signup or login as admin user', async ({ page }) => {
    test.setTimeout(120000) // retry loop may take up to ~60s for replica sync

    // Login-first: reuse existing test user to avoid accumulating users per run.
    // Falls back to signup if the user doesn't exist yet (first run only).
    await page.goto('/login')
    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    let loginSucceeded = true
    try {
      await page.waitForURL('**/dashboard', { timeout: 8000 })
    } catch {
      loginSucceeded = false
    }

    if (!loginSucceeded) {
      // First run: user doesn't exist yet — sign up
      await page.goto('/signup')
      await page.getByLabel('Display Name').fill('Taxonomy Admin Tester')
      await page.getByLabel('Email').fill(TEST_EMAIL)
      await page.getByLabel('Password').fill(TEST_PASSWORD)
      await page.getByRole('button', { name: 'Create account' }).click()
      await page.waitForURL('**/dashboard', { timeout: 15000 })
    }

    // Confirm admin access with retry loop.
    // Supabase custom_access_token_hook queries a read replica that may not yet have the
    // user_roles row → JWT minted with user_role='none' → /admin redirects to /dashboard.
    // Re-logging in mints a fresh JWT from the hook. Repeat until /admin is reachable.
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')
      if (page.url().includes('/admin')) return // admin access confirmed
      // Still redirected — re-login to get a fresh JWT
      await page.goto('/login')
      await page.getByLabel('Email').fill(TEST_EMAIL)
      await page.getByLabel('Password').fill(TEST_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/dashboard', { timeout: 10000 })
      await page.waitForTimeout(2000) // brief pause for replica to sync
    }
    // Final check — fail explicitly if admin is still unreachable
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/admin/)
  })

  // -------------------------------------------------------------------------
  // AC1: Pre-populated mapping table
  // -------------------------------------------------------------------------

  test('[P0] AC1 — should show pre-populated taxonomy mapping table on page load', async ({
    page,
  }) => {
    // Given: Admin navigates to /admin/taxonomy
    await login(page)
    await page.goto('/admin/taxonomy')

    // Then: The mapping table is visible
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // And: The table has multiple rows (36 seeded entries + 1 header)
    // NOTE: We do not assert specific cell values here because taxonomy_definitions is a
    // global shared table — AC2 tests permanently modify internalName/severity values,
    // causing exact-value assertions to fail on subsequent CI runs.
    const rows = page.getByTestId('taxonomy-mapping-table').getByRole('row')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(37) // at least 1 header + 36 data rows
  })

  test('[P0] AC1 — should show admin sub-navigation with Taxonomy Mapping tab', async ({
    page,
  }) => {
    // Given: Admin is on /admin
    await login(page)
    await page.goto('/admin')
    // Wait for AuthListener's router.refresh() RSC transition to settle.
    // During the transition, the nav briefly has 2 copies in DOM (old + new RSC fiber).
    await page.waitForLoadState('networkidle')

    // Then: Admin tab navigation is visible (use .first() in case RSC transition is mid-flight)
    await expect(page.getByTestId('admin-tab-users').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('admin-tab-taxonomy').first()).toBeVisible()

    // And: "User Management" tab is active by default
    await expect(page.getByTestId('admin-tab-users').first()).toHaveAttribute(
      'aria-current',
      'page',
    )

    // When: Admin clicks the "Taxonomy Mapping" tab
    await page.getByTestId('admin-tab-taxonomy').click()

    // Then: URL changes to /admin/taxonomy
    await page.waitForURL('**/admin/taxonomy', { timeout: 5000 })
  })

  // -------------------------------------------------------------------------
  // AC2: Edit mapping inline
  // -------------------------------------------------------------------------

  test('[P0] AC2 — should edit internal_name inline and save successfully', async ({ page }) => {
    // Given: Admin is on /admin/taxonomy with mapping table loaded
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // When: Admin clicks Edit on the first data row (position-based — avoids relying on
    // a specific internalName value that may have been changed by a previous test run)
    const firstDataRow = page.getByTestId('taxonomy-mapping-table').getByRole('row').nth(1)
    await firstDataRow.getByRole('button', { name: 'Edit', exact: true }).click()

    // Then: The row becomes editable
    // NOTE: After clicking Edit, the cell now contains <Input> instead of text —
    // use page-level locator (aria-label on the input) to avoid stale cell locator
    const internalNameInput = page.getByRole('textbox', { name: /QA Cosmetic name/i })
    await expect(internalNameInput).toBeVisible()

    // When: Admin changes the internal_name to a unique value
    await internalNameInput.clear()
    await internalNameInput.fill(E2E_EDIT_NAME)

    // And: Clicks Save
    await page.getByRole('button', { name: 'Save' }).click()

    // Then: Success toast appears
    await expect(page.getByText('Mapping updated')).toBeVisible({ timeout: 10000 })

    // And: Updated value is visible in the table
    await expect(page.getByRole('cell', { name: E2E_EDIT_NAME, exact: true })).toBeVisible()
  })

  test('[P1] AC2 — should edit severity level inline and save successfully', async ({ page }) => {
    // Given: Admin is on /admin/taxonomy
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // When: Admin clicks Edit on the second data row (position-based)
    const secondDataRow = page.getByTestId('taxonomy-mapping-table').getByRole('row').nth(2)
    await secondDataRow.getByRole('button', { name: 'Edit', exact: true }).click()

    // Then: Severity combobox becomes visible
    // NOTE: Use page-level locator — row locator may become stale after edit mode activates
    // NOTE: Radix UI <Select> renders a <button role="combobox">, not a <select> element —
    // must click to open dropdown then click the option (selectOption() does not work)
    const severityTrigger = page.getByRole('combobox', { name: /severity/i })
    await expect(severityTrigger).toBeVisible()

    // When: Admin changes severity to "major"
    await severityTrigger.click()
    await page.getByRole('option', { name: 'major' }).click()

    // And: Clicks Save
    await page.getByRole('button', { name: 'Save' }).click()

    // Then: Success toast appears
    await expect(page.getByText('Mapping updated')).toBeVisible({ timeout: 10000 })

    // And: "major" severity is visible somewhere in the table
    await expect(page.getByRole('cell', { name: 'major', exact: true }).first()).toBeVisible()
  })

  test('[P1] AC2 — should cancel inline edit without saving changes', async ({ page }) => {
    // Given: Admin clicks Edit on a row (use 5th data row to avoid rows used in other AC2 tests)
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    const row = page.getByTestId('taxonomy-mapping-table').getByRole('row').nth(5)
    await row.getByRole('button', { name: 'Edit', exact: true }).click()

    // When: Admin modifies the field but clicks Cancel
    // NOTE: Use page-level locator after edit mode activates
    const nameInput = page.getByRole('textbox', { name: /QA Cosmetic name/i })
    await nameInput.fill('This should not be saved')
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Then: The typed value was not saved (original row is restored)
    await expect(page.getByRole('cell', { name: 'This should not be saved' })).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // AC3: Add new mapping
  // -------------------------------------------------------------------------

  test('[P0] AC3 — should add a new taxonomy mapping via dialog', async ({ page }) => {
    // Given: Admin is on /admin/taxonomy
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // When: Admin clicks "Add Mapping" button
    await page.getByTestId('add-mapping-btn').click()

    // Then: Add mapping dialog appears
    const dialog = page.getByTestId('add-mapping-dialog')
    await expect(dialog).toBeVisible()

    // When: Admin fills in all required fields
    // NOTE: E2E_MAPPING_NAME is unique per run to avoid conflicts with prior incomplete runs
    await dialog.getByTestId('internal-name-input').fill(E2E_MAPPING_NAME)
    await dialog.getByTestId('mqm-category-input').fill('Accuracy')
    // NOTE: Radix UI <Select> — click trigger to open, then click option
    await dialog.getByTestId('severity-select').click()
    await page.getByRole('option', { name: /major/i }).click()
    await dialog.getByTestId('description-input').fill('E2E test description for this category')

    // And: Clicks Submit
    await dialog.getByTestId('submit-add-mapping').click()

    // Then: Dialog closes
    await expect(dialog).not.toBeVisible()

    // And: Success toast appears
    await expect(page.getByText('Mapping created')).toBeVisible({ timeout: 10000 })

    // And: New mapping row is visible in the table
    await expect(page.getByRole('cell', { name: E2E_MAPPING_NAME, exact: true })).toBeVisible()
  })

  test('[P1] AC3 — should show validation error when required fields are missing', async ({
    page,
  }) => {
    // Given: Admin opens the Add Mapping dialog
    await login(page)
    await page.goto('/admin/taxonomy')
    await page.getByTestId('add-mapping-btn').click()

    const dialog = page.getByTestId('add-mapping-dialog')
    await expect(dialog).toBeVisible()

    // When: Admin submits without filling required fields
    await dialog.getByTestId('submit-add-mapping').click()

    // Then: Dialog stays open (HTML5 required attribute prevents form submission)
    // Note: internalName uses required attribute — browser native validation, no DOM error text
    await expect(dialog).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // AC4: Soft delete mapping
  // -------------------------------------------------------------------------

  test('[P0] AC4 — should soft-delete a mapping with confirmation dialog', async ({ page }) => {
    // Given: Admin is on /admin/taxonomy with table loaded
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // And: E2E_MAPPING_NAME exists (created in AC3 test — run serially)
    const targetRow = page.getByRole('cell', { name: E2E_MAPPING_NAME, exact: true }).locator('..')

    // When: Admin clicks Delete on that row
    await targetRow.getByRole('button', { name: 'Delete' }).click()

    // Then: Confirmation AlertDialog appears
    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()
    // Note: the dialog shows a generic "Delete Mapping?" message without the mapping name

    // When: Admin confirms deletion
    await alertDialog.getByTestId('confirm-delete-mapping').click()

    // Then: Success toast appears
    await expect(page.getByText('Mapping deleted')).toBeVisible({ timeout: 10000 })

    // And: The deleted row is no longer visible (soft delete = hidden in active view)
    await expect(page.getByRole('cell', { name: E2E_MAPPING_NAME, exact: true })).not.toBeVisible()
  })

  test('[P1] AC4 — should cancel deletion when user dismisses confirmation', async ({ page }) => {
    // Given: Admin opens delete confirmation for "Capitalization" row
    // "Capitalization" (displayOrder 7) is safe to use: no other test permanently modifies it
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // NOTE: the "Capitalization" row has both internalName and parentCategory = "Capitalization"
    // — use .first() to avoid strict mode violation (2 matching cells in the same row)
    const capRow = page
      .getByRole('cell', { name: 'Capitalization', exact: true })
      .first()
      .locator('..')
    await capRow.getByRole('button', { name: 'Delete' }).click()

    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()

    // When: Admin clicks Cancel
    await alertDialog.getByRole('button', { name: 'Cancel' }).click()

    // Then: Dialog closes, row still visible, no toast
    await expect(alertDialog).not.toBeVisible()
    await expect(
      page.getByRole('cell', { name: 'Capitalization', exact: true }).first(),
    ).toBeVisible()
  })
})
