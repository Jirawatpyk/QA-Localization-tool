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
 */

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'
const TEST_EMAIL = `e2e-tax16-${Date.now()}@test.local`

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
  test('[setup] signup and navigate to /admin/taxonomy via tab nav', async ({ page }) => {
    // Given: A new admin user signs up
    await page.goto('/signup')
    await page.getByLabel('Display Name').fill('Taxonomy Admin Tester')
    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })

    // SignupForm calls refreshSession() before redirecting — JWT already has admin role.
    // Navigate to /admin directly. If Supabase replica hasn't synced yet (rare), the admin page
    // redirects → proxy sends authenticated user to /dashboard. Retry with fresh login.
    await page.goto('/admin')
    if (!page.url().includes('/admin')) {
      // Replica lag: clear session, wait, re-login to force a fresh token via the hook
      await page.context().clearCookies()
      await page.waitForTimeout(3000)
      await login(page)
      await page.goto('/admin')
    }

    // When: Admin navigates to /admin
    await expect(page.getByTestId('admin-tab-users')).toBeVisible({ timeout: 10000 })

    // Then: A "Taxonomy Mapping" tab is visible in the admin sub-navigation
    await expect(page.getByTestId('admin-tab-taxonomy')).toBeVisible()

    // When: Admin clicks the "Taxonomy Mapping" tab
    await page.getByTestId('admin-tab-taxonomy').click()

    // Then: URL changes to /admin/taxonomy
    await page.waitForURL('**/admin/taxonomy', { timeout: 5000 })
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

    // And: Pre-seeded data is shown (spot-check first row from seed)
    // Seed row #1: internal_name="Missing text", category="Accuracy", severity="critical"
    await expect(page.getByRole('cell', { name: 'Missing text', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Accuracy', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'critical', exact: true }).first()).toBeVisible()

    // And: The table has multiple rows (36 seeded entries + 1 header)
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

    // Then: Admin tab navigation is visible
    await expect(page.getByTestId('admin-tab-users')).toBeVisible()
    await expect(page.getByTestId('admin-tab-taxonomy')).toBeVisible()

    // And: "User Management" tab is active by default
    await expect(page.getByTestId('admin-tab-users')).toHaveAttribute('aria-current', 'page')
  })

  // -------------------------------------------------------------------------
  // AC2: Edit mapping inline
  // -------------------------------------------------------------------------

  test('[P0] AC2 — should edit internal_name inline and save successfully', async ({ page }) => {
    // Given: Admin is on /admin/taxonomy with mapping table loaded
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // When: Admin clicks Edit on the "Missing text" row
    const missingTextRow = page
      .getByRole('cell', { name: 'Missing text', exact: true })
      .locator('..')
    await missingTextRow.getByRole('button', { name: 'Edit' }).click()

    // Then: The row becomes editable
    // NOTE: After clicking Edit, the cell now contains <Input> instead of text —
    // use page-level locator (aria-label on the input) to avoid stale cell locator
    const internalNameInput = page.getByRole('textbox', { name: /QA Cosmetic name/i })
    await expect(internalNameInput).toBeVisible()

    // When: Admin changes the internal_name
    await internalNameInput.clear()
    await internalNameInput.fill('Missing Translation (edited)')

    // And: Clicks Save
    await page.getByRole('button', { name: 'Save' }).click()

    // Then: Success toast appears
    await expect(page.getByText('Mapping updated')).toBeVisible({ timeout: 10000 })

    // And: Updated value is visible in the table
    await expect(
      page.getByRole('cell', { name: 'Missing Translation (edited)', exact: true }),
    ).toBeVisible()
  })

  test('[P1] AC2 — should edit severity level inline and save successfully', async ({ page }) => {
    // Given: Admin is on /admin/taxonomy
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    // When: Admin clicks Edit on the "Texts truncated" row (severity: critical)
    const truncatedRow = page
      .getByRole('cell', { name: 'Texts truncated', exact: true })
      .locator('..')
    await truncatedRow.getByRole('button', { name: 'Edit' }).click()

    // Then: Severity select becomes visible
    // NOTE: Use page-level locator — row locator may become stale after edit mode activates
    const severitySelect = page.getByRole('combobox', { name: /severity/i })
    await expect(severitySelect).toBeVisible()

    // When: Admin changes severity to "major"
    await severitySelect.selectOption('major')

    // And: Clicks Save
    await page.getByRole('button', { name: 'Save' }).click()

    // Then: Success toast appears
    await expect(page.getByText('Mapping updated')).toBeVisible({ timeout: 10000 })

    // And: Updated severity is visible
    await expect(page.getByRole('cell', { name: 'major', exact: true }).first()).toBeVisible()
  })

  test('[P1] AC2 — should cancel inline edit without saving changes', async ({ page }) => {
    // Given: Admin clicks Edit on a row
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    const row = page.getByRole('cell', { name: 'Punctuation', exact: true }).locator('..')
    await row.getByRole('button', { name: 'Edit' }).click()

    // When: Admin modifies the field but clicks Cancel
    // NOTE: Use page-level locator after edit mode activates
    const nameInput = page.getByRole('textbox', { name: /QA Cosmetic name/i })
    await nameInput.fill('This should not be saved')
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Then: Original value is restored, no toast
    await expect(page.getByRole('cell', { name: 'Punctuation', exact: true })).toBeVisible()
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
    await dialog.getByTestId('internal-name-input').fill('E2E Test Error Category')
    await dialog.getByTestId('mqm-category-input').fill('Accuracy')
    await dialog.getByTestId('severity-select').selectOption('major')
    await dialog.getByTestId('description-input').fill('E2E test description for this category')

    // And: Clicks Submit
    await dialog.getByTestId('submit-add-mapping').click()

    // Then: Dialog closes
    await expect(dialog).not.toBeVisible()

    // And: Success toast appears
    await expect(page.getByText('Mapping created')).toBeVisible({ timeout: 10000 })

    // And: New mapping row is visible in the table
    await expect(
      page.getByRole('cell', { name: 'E2E Test Error Category', exact: true }),
    ).toBeVisible()
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

    // Then: Validation errors appear (internal_name is required)
    await expect(dialog.getByText(/QA Cosmetic name is required/i)).toBeVisible()

    // And: Dialog stays open (not submitted)
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

    // And: "E2E Test Error Category" exists (created in AC3 test — run serially)
    const targetRow = page
      .getByRole('cell', { name: 'E2E Test Error Category', exact: true })
      .locator('..')

    // When: Admin clicks Delete on that row
    await targetRow.getByRole('button', { name: 'Delete' }).click()

    // Then: Confirmation AlertDialog appears
    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()
    await expect(alertDialog.getByText(/E2E Test Error Category/)).toBeVisible()

    // When: Admin confirms deletion
    await alertDialog.getByTestId('confirm-delete-mapping').click()

    // Then: Success toast appears
    await expect(page.getByText('Mapping deleted')).toBeVisible({ timeout: 10000 })

    // And: The deleted row is no longer visible (soft delete = hidden in active view)
    await expect(
      page.getByRole('cell', { name: 'E2E Test Error Category', exact: true }),
    ).not.toBeVisible()
  })

  test('[P1] AC4 — should cancel deletion when user dismisses confirmation', async ({ page }) => {
    // Given: Admin opens delete confirmation for "Capitalization" row
    await login(page)
    await page.goto('/admin/taxonomy')
    await expect(page.getByTestId('taxonomy-mapping-table')).toBeVisible({ timeout: 10000 })

    const capRow = page.getByRole('cell', { name: 'Capitalization', exact: true }).locator('..')
    await capRow.getByRole('button', { name: 'Delete' }).click()

    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()

    // When: Admin clicks Cancel
    await alertDialog.getByRole('button', { name: 'Cancel' }).click()

    // Then: Dialog closes, row still visible, no toast
    await expect(alertDialog).not.toBeVisible()
    await expect(page.getByRole('cell', { name: 'Capitalization', exact: true })).toBeVisible()
  })
})
