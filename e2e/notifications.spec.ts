import { test, expect, type Page } from '@playwright/test'

import { createNotification, getUserInfo, signupOrLogin } from './helpers/supabase-admin'

// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// AC Coverage: AC#2 (notification bell + dropdown + mark-read)

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-notif17@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe.serial('Notifications — AC#2: Bell icon + dropdown', () => {
  test('[setup] signup user and seed notification data', async ({ page }) => {
    test.setTimeout(60000)

    await signupOrLogin(page, TEST_EMAIL, TEST_PASSWORD, 'Notification Tester')

    // Insert test notification via PostgREST (service role key bypasses RLS)
    const userInfo = await getUserInfo(TEST_EMAIL)
    if (userInfo) {
      await createNotification(
        userInfo.id,
        userInfo.tenantId,
        'E2E Test Notification',
        'This is a test notification for E2E testing.',
      )
    }
  })

  test('[P1] should show bell icon (notification-bell) in header after login', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    const bellIcon = page.getByTestId('notification-bell')
    await expect(bellIcon).toBeVisible({ timeout: 10000 })
  })

  test('[P1] should show unread badge on bell icon when unread notifications exist', async ({
    page,
  }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

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

    // Each notification item should show title and body
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
