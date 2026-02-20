import { test, expect, type Page } from '@playwright/test'

// ATDD RED PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// These tests are intentionally FAILING (test.skip) until feature is implemented.
// Remove test.skip() after implementing dashboard UI to run green phase.
//
// AC Coverage: AC#1 (dashboard display), AC#5 (mobile layout)

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe('Dashboard — Unauthenticated access', () => {
  test('[P1] should redirect unauthenticated user from /dashboard to /login', async ({ page }) => {
    // This test should pass (regression guard from Story 1.2) — NOT skipped
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Dashboard — AC#1: Dashboard display', () => {
  test.skip('[P2] should show 4 metric cards after login', async ({ page }) => {
    // THIS TEST WILL FAIL — DashboardMetricCards component not implemented yet
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    await expect(page.getByTestId('dashboard-metric-recent-files')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('dashboard-metric-pending-reviews')).toBeVisible()
    await expect(page.getByTestId('dashboard-metric-auto-pass')).toBeVisible()
    await expect(page.getByTestId('dashboard-metric-team-activity')).toBeVisible()
  })

  test.skip('[P2] should show "Auto-pass setup pending" placeholder in auto-pass card', async ({
    page,
  }) => {
    // THIS TEST WILL FAIL — DashboardMetricCards auto-pass placeholder not implemented yet
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    const autoPassCard = page.getByTestId('dashboard-metric-auto-pass')
    await expect(autoPassCard).toBeVisible({ timeout: 10000 })
    await expect(autoPassCard).toContainText('Auto-pass setup pending')
  })

  test.skip('[P2] should show recent files table on dashboard', async ({ page }) => {
    // THIS TEST WILL FAIL — RecentFilesTable component not implemented yet
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    await expect(page.getByTestId('dashboard-recent-files-table')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Dashboard — AC#5: Mobile layout', () => {
  test.skip('[P2] should show mobile desktop-suggestion banner at 375px viewport', async ({
    page,
  }) => {
    // THIS TEST WILL FAIL — mobile banner component not implemented yet
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    const mobileBanner = page.getByTestId('mobile-desktop-banner')
    await expect(mobileBanner).toBeVisible({ timeout: 10000 })
    await expect(mobileBanner).toContainText(
      'For the best review experience, use a desktop browser',
    )
  })

  test.skip('[P2] should NOT show onboarding tour overlay on mobile (< 768px)', async ({
    page,
  }) => {
    // THIS TEST WILL FAIL — OnboardingTour mobile suppression not implemented yet
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // driver.js overlay should NOT appear on mobile
    await page.waitForLoadState('networkidle')
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).not.toBeVisible({ timeout: 5000 })
  })
})
