import { test, expect } from '@playwright/test'

/**
 * Visual regression: Login page
 *
 * Why this page first:
 * - Public route — no auth setup required (fastest baseline)
 * - Stable design — login form rarely changes
 * - Multiple states (empty, validation error) — covers UX state checklist
 *
 * Update baselines:
 *   npx playwright test --project=visual --update-snapshots
 *
 * Run only this test:
 *   npx playwright test --project=visual login.visual
 */

test.describe('Login page — visual', () => {
  test('empty state', async ({ page }) => {
    await page.goto('/login')
    // Wait for form to be interactive (avoids capturing skeleton)
    await page.getByLabel('Email').waitFor({ state: 'visible' })
    await expect(page).toHaveScreenshot('login-empty.png', { fullPage: true })
  })

  test('email validation error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: /sign in/i }).click()
    // Wait for error message to render
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('login-validation-error.png', { fullPage: true })
  })
})
