import { test, expect } from '@playwright/test'

// E2: Run QA → see findings + score (populated in Epic 2-3)
test.describe('Pipeline to Findings', () => {
  test.skip('should show findings and score after QA run', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveTitle(/QA Localization Tool/)
  })
})
