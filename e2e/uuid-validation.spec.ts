import { expect, test } from '@playwright/test'

import { signupOrLogin, TEST_PASSWORD } from './helpers/supabase-admin'

// S-FIX-1 D2: E2E test for UUID validation on route params
// Verifies that invalid UUIDs show not-found page instead of Postgres errors

const TEST_EMAIL = `e2e-uuid-${Date.now()}@test.local`

test.describe('UUID validation on route params', () => {
  test.beforeEach(async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('should show not-found page for invalid projectId', async ({ page }) => {
    await page.goto('/projects/not-a-uuid/files')

    await expect(page.getByText('Project not found')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: 'Back to Projects' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible()
  })

  test('should show not-found page for SQL injection in projectId', async ({ page }) => {
    await page.goto("/projects/'; DROP TABLE--/files")

    await expect(page.getByText('Project not found')).toBeVisible({ timeout: 10_000 })
  })

  test('should show not-found page for invalid fileId in review route', async ({ page }) => {
    // Use a valid-format UUID for projectId (layout will pass) but invalid fileId
    await page.goto('/projects/00000000-0000-0000-0000-000000000000/review/not-a-uuid')

    // Either project not found (if project doesn't exist) or file not found
    // Both are acceptable — the key is no Postgres error is exposed
    const notFoundOrError = page.getByText(/(not found|couldn't load)/i)
    await expect(notFoundOrError).toBeVisible({ timeout: 10_000 })
  })

  test('should show not-found page for invalid batchId', async ({ page }) => {
    await page.goto('/projects/00000000-0000-0000-0000-000000000000/batches/not-a-uuid')

    const notFoundOrError = page.getByText(/(not found|couldn't load)/i)
    await expect(notFoundOrError).toBeVisible({ timeout: 10_000 })
  })

  test('should not expose Postgres errors in page content', async ({ page }) => {
    await page.goto('/projects/not-a-uuid/files')

    // Verify no database error messages are visible
    await expect(page.getByText(/postgres/i)).not.toBeVisible()
    await expect(page.getByText(/invalid input syntax/i)).not.toBeVisible()
    await expect(page.getByText(/uuid/i)).not.toBeVisible()
  })
})
