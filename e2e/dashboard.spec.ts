import { test, expect, type Page } from '@playwright/test'

import { signupOrLogin } from './helpers/supabase-admin'

// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// AC Coverage: AC#1 (dashboard display), AC#5 (mobile layout)

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-dash17@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe('Dashboard — Unauthenticated access', () => {
  test('[P1] should redirect unauthenticated user from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe.serial('Dashboard — AC#1: Dashboard display', () => {
  test('[setup] signup or login as dashboard test user', async ({ page }) => {
    test.setTimeout(60000)
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD, 'Dashboard Tester')
  })

  test('[P2] should show 4 metric cards after login', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    await expect(page.getByTestId('dashboard-metric-recent-files')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('dashboard-metric-pending-reviews')).toBeVisible()
    await expect(page.getByTestId('dashboard-metric-auto-pass')).toBeVisible()
    await expect(page.getByTestId('dashboard-metric-team-activity')).toBeVisible()
  })

  test('[P2] should show "Auto-pass setup pending" placeholder in auto-pass card', async ({
    page,
  }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    const autoPassCard = page.getByTestId('dashboard-metric-auto-pass')
    await expect(autoPassCard).toBeVisible({ timeout: 10000 })
    await expect(autoPassCard).toContainText('Auto-pass setup pending')
  })

  test('[P2] should show recent files section on dashboard', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // New user may have empty state or data table — accept either
    const recentFiles = page
      .getByTestId('dashboard-recent-files-table')
      .or(page.getByTestId('recent-files-empty'))
    await expect(recentFiles).toBeVisible({ timeout: 10000 })
  })
})

test.describe.serial('Dashboard — AC#5: Mobile layout', () => {
  test('[setup] signup or login as mobile test user', async ({ page }) => {
    test.setTimeout(60000)
    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD, 'Dashboard Tester')
  })

  test('[P2] should show mobile desktop-suggestion banner at 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    const mobileBanner = page.getByTestId('mobile-desktop-banner')
    await expect(mobileBanner).toBeVisible({ timeout: 10000 })
    await expect(mobileBanner).toContainText(
      'For the best review experience, use a desktop browser',
    )
  })

  test('[P2] should NOT show onboarding tour overlay on mobile (< 768px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // driver.js overlay should NOT appear on mobile
    await page.waitForLoadState('networkidle')
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).not.toBeVisible({ timeout: 5000 })
  })
})
