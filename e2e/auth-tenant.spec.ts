import { test, expect } from '@playwright/test'

// E4: Auth flow — signup, login, protected routes, admin access
// Runs against live Supabase Cloud (mailer_autoconfirm: true)

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'
const TEST_EMAIL = `e2e-${Date.now()}@test.local`
const TEST_DISPLAY_NAME = 'E2E Test User'

test.describe('Unauthenticated access', () => {
  test('should redirect /dashboard to /login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect /admin to /login when not authenticated', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe.serial('Auth flow', () => {
  test('should signup and redirect to dashboard', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveTitle(/Sign Up/)

    // Fill signup form
    await page.getByLabel('Display Name').fill(TEST_DISPLAY_NAME)
    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)

    // Submit
    await page.getByRole('button', { name: 'Create account' }).click()

    // Wait for redirect to dashboard (setupNewUser + refreshSession + redirect)
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await expect(page.getByText('Welcome to QA Localization Tool').first()).toBeVisible()
  })

  test('should login with created account', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Sign In/)

    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await page.waitForURL('**/dashboard', { timeout: 10000 })
    await expect(page.getByText('Welcome to QA Localization Tool').first()).toBeVisible()
  })

  test('should show error toast for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('nonexistent@test.local')
    await page.getByLabel('Password').fill('WrongPassword999!')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Sonner toast appears with Supabase error message
    await expect(page.getByText(/Invalid login credentials/i)).toBeVisible({ timeout: 10000 })
  })

  test('should redirect authenticated user from /login to /dashboard', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard', { timeout: 10000 })

    // Now visit /login again — should redirect back to /dashboard
    await page.goto('/login')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
  })

  test('should access admin page as admin user', async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard', { timeout: 10000 })

    // Navigate to admin
    await page.goto('/admin')
    await expect(page.getByTestId('admin-tab-users')).toBeVisible({ timeout: 10000 })
    // Should see at least the current user in the table
    await expect(page.getByText(TEST_EMAIL)).toBeVisible()
  })
})
