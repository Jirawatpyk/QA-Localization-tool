import { test, expect } from '@playwright/test'

// E4: Login → see only own tenant data (populated in Epic 1 Story 1.2)
test.describe('Auth and Tenant Isolation', () => {
  test.skip('should only show own tenant data after login', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/QA Localization Tool/)
  })
})
