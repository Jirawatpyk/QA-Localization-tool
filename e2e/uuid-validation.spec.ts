import { expect, test } from '@playwright/test'

import { signupOrLogin, TEST_PASSWORD } from './helpers/supabase-admin'

// S-FIX-1 D2: E2E test for UUID validation on route params
// Verifies that invalid UUIDs show not-found page instead of Postgres errors
// Note: notFound() in layout.tsx triggers the GLOBAL not-found ("Page not found"),
// not the project-level not-found.tsx — this is Next.js App Router behavior.

const TEST_EMAIL = `e2e-uuid-${Date.now()}@test.local`

test.describe.serial('UUID validation on route params', () => {
  test('[setup] signup or login as test user', async ({ page }) => {
    test.setTimeout(60_000)
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD, 'UUID Test User')
  })

  test('should show not-found page for invalid projectId', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto('/projects/not-a-uuid/files')

    // notFound() in layout triggers global not-found → "Page not found"
    await expect(page.getByText(/(Page not found|Project not found)/)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toBeVisible()
  })

  test('should show not-found page for SQL injection in projectId', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto("/projects/'; DROP TABLE--/files")

    await expect(page.getByText(/(Page not found|Project not found)/)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('should show not-found page for invalid fileId in review route', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto('/projects/00000000-0000-0000-0000-000000000000/review/not-a-uuid')

    // Either project not found (nil UUID doesn't exist) or file not found
    // Both acceptable — no Postgres error exposed
    const notFoundOrError = page.getByText(/(not found|couldn't load)/i)
    await expect(notFoundOrError).toBeVisible({ timeout: 10_000 })
  })

  test('should show not-found page for invalid batchId', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto('/projects/00000000-0000-0000-0000-000000000000/batches/not-a-uuid')

    const notFoundOrError = page.getByText(/(not found|couldn't load)/i)
    await expect(notFoundOrError).toBeVisible({ timeout: 10_000 })
  })

  test('should not expose Postgres errors in page content', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto('/projects/not-a-uuid/files')

    // Wait for not-found page to render
    await expect(page.getByText(/(Page not found|Project not found)/)).toBeVisible({
      timeout: 10_000,
    })

    // Verify no database error messages are visible
    await expect(page.getByText(/postgres/i)).not.toBeVisible()
    await expect(page.getByText(/invalid input syntax/i)).not.toBeVisible()
  })
})
