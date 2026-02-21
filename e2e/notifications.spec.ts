import { test, expect, type Page } from '@playwright/test'

// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// AC Coverage: AC#2 (notification bell + dropdown + mark-read)

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe('Notifications — AC#2: Bell icon + dropdown', () => {
  test('[P1] should show bell icon (notification-bell) in header after login', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    const bellIcon = page.getByTestId('notification-bell')
    await expect(bellIcon).toBeVisible({ timeout: 10000 })
  })

  test('[P1] should show unread badge on bell icon when unread notifications exist', async ({
    page,
  }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // The badge appears when there are unread notifications
    // NOTE: This test requires test data setup (a notification in the DB)
    // In green phase, use a before-hook to insert a test notification via API
    const badge = page.getByTestId('notification-badge')
    await expect(badge).toBeVisible({ timeout: 10000 })
  })

  test('[P1] should open notification dropdown when bell icon is clicked', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    await page.getByTestId('notification-bell').click()

    const dropdown = page.getByTestId('notification-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 5000 })
  })

  test('[P2] should show notification title and body in the dropdown', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    await page.getByTestId('notification-bell').click()
    const dropdown = page.getByTestId('notification-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 5000 })

    // Each notification item should show title and relative time
    // NOTE: Requires test notification data in DB
    const notificationItems = dropdown.locator('[data-testid^="notification-item-"]')
    const count = await notificationItems.count()
    expect(count).toBeGreaterThan(0)

    const firstItem = notificationItems.first()
    await expect(firstItem.locator('[data-testid="notification-title"]')).toBeVisible()
    await expect(firstItem.locator('[data-testid="notification-body"]')).toBeVisible()
  })

  test('[P1] should remove unread badge after clicking "Mark all read"', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // Open dropdown
    await page.getByTestId('notification-bell').click()
    await expect(page.getByTestId('notification-dropdown')).toBeVisible({ timeout: 5000 })

    // Click mark all read
    await page.getByTestId('notification-mark-all-read').click()

    // Badge should disappear
    await expect(page.getByTestId('notification-badge')).not.toBeVisible({ timeout: 5000 })
  })
})
