import { test, expect, type Page } from '@playwright/test'

import { setUserMetadata, signupOrLogin } from './helpers/supabase-admin'

// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// AC Coverage: AC#3 (first-time tour), AC#6 (returning user resume + restart)
//
// KEY FACTS:
// - driver.js overlay selector: .driver-popover
// - Tour resume is 0-indexed: dismissed_at_step (1-based) -> drive(step - 1) (0-based)

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'
const FIRST_TIME_EMAIL = process.env.E2E_FIRST_TIME_EMAIL || 'e2e-firsttime17@test.local'
const RETURNING_EMAIL = process.env.E2E_RETURNING_EMAIL || 'e2e-returning17@test.local'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin17@test.local'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

// AC#3 — First-time user onboarding tour
test.describe.serial('Onboarding Tour — AC#3: First-time user', () => {
  test('[setup] create first-time user and reset metadata', async ({ page }) => {
    test.setTimeout(60000)
    await signupOrLogin(page, FIRST_TIME_EMAIL, TEST_PASSWORD, 'First Time User')
    // Ensure metadata is clean (null = tour never completed, no dismissed step)
    await setUserMetadata(FIRST_TIME_EMAIL, null)
  })

  test('[P1] should show driver.js overlay for first-time user (metadata=null)', async ({
    page,
  }) => {
    await loginAs(page, FIRST_TIME_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    // driver.js overlay must appear
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })
  })

  test('[P1] should show "Welcome" as the first tour step title', async ({ page }) => {
    await loginAs(page, FIRST_TIME_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toBeVisible({ timeout: 10000 })
    await expect(popoverTitle).toContainText('Welcome')
  })

  test('[P2] should advance to step 2 when Next button is clicked in tour', async ({ page }) => {
    await loginAs(page, FIRST_TIME_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })

    // Capture step 1 title text
    const popoverTitle = page.locator('.driver-popover-title')
    const step1Title = await popoverTitle.textContent()

    // Click Next button
    await page.locator('.driver-popover-next-btn').click()

    // Use auto-waiting assertion — textContent() returns immediately without waiting
    await expect(popoverTitle).not.toHaveText(step1Title!, { timeout: 5000 })
  })

  test('[P1] should close overlay when "Skip All" / close button is clicked', async ({ page }) => {
    await loginAs(page, FIRST_TIME_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.driver-popover')).toBeVisible({ timeout: 10000 })

    // Click the close/skip button
    await page.locator('.driver-popover-close-btn').click()

    // Overlay must disappear
    await expect(page.locator('.driver-popover')).not.toBeVisible({ timeout: 5000 })
  })

  test('[P1] should NOT show tour again after Skip All (setup_tour_completed set)', async ({
    page,
  }) => {
    // Set ADMIN user as having completed tour
    await signupOrLogin(page, ADMIN_EMAIL, TEST_PASSWORD, 'Admin Tester')
    await setUserMetadata(ADMIN_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
    })

    // Re-login as admin user
    await page.context().clearCookies()
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    // Tour should NOT appear for a user who has already completed it
    await page.waitForTimeout(2000) // give tour time to appear if it's broken
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).not.toBeVisible()
  })
})

// AC#6 — Returning user tour resume
test.describe.serial('Onboarding Tour — AC#6: Returning user resume', () => {
  test('[setup] create returning user with dismissed_at_step metadata', async ({ page }) => {
    test.setTimeout(60000)
    // Create returning user and set metadata to simulate dismissed at step 2
    await signupOrLogin(page, RETURNING_EMAIL, TEST_PASSWORD, 'Returning User')
    await setUserMetadata(RETURNING_EMAIL, {
      dismissed_at_step: { setup: 2 },
    })

    // Ensure admin user exists with completed tour
    await page.context().clearCookies()
    await signupOrLogin(page, ADMIN_EMAIL, TEST_PASSWORD, 'Admin Tester')
    await setUserMetadata(ADMIN_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
    })
  })

  test('[P1] should resume tour at step 2 for user who dismissed at step 2', async ({ page }) => {
    await loginAs(page, RETURNING_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })

    // Tour must show step 2 title (NOT "Welcome" which is step 1)
    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toBeVisible()
    const title = await popoverTitle.textContent()
    expect(title).not.toBe('Welcome') // Step 1 title - must NOT be shown
    // Step 2 should be "Create a Project" based on tour steps
    expect(title).toContain('Create')
  })

  test('[P2] should show "Restart Tour" option in Help menu when tour has been completed', async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    // Open help menu
    const helpMenuTrigger = page.getByTestId('help-menu-trigger')
    await expect(helpMenuTrigger).toBeVisible({ timeout: 10000 })
    await helpMenuTrigger.click()

    // "Restart Tour" option must be visible
    const restartBtn = page.getByTestId('restart-tour-btn')
    await expect(restartBtn).toBeVisible({ timeout: 5000 })
    await expect(restartBtn).toContainText('Restart Tour')
  })

  test('[P2] should restart tour from step 1 when "Restart Tour" is clicked', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD)
    await page.waitForLoadState('networkidle')

    // Open help menu and click Restart Tour
    await page.getByTestId('help-menu-trigger').click()
    await page.getByTestId('restart-tour-btn').click()

    // Wait for page refresh (router.refresh()) and tour to appear
    await page.waitForLoadState('networkidle')

    // Tour must restart from step 1 ("Welcome")
    const driverPopover = page.locator('.driver-popover')
    await expect(driverPopover).toBeVisible({ timeout: 10000 })

    const popoverTitle = page.locator('.driver-popover-title')
    await expect(popoverTitle).toContainText('Welcome')
  })
})
