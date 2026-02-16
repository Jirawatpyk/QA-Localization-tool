import { test, expect } from '@playwright/test'

// E3: Accept/reject finding → score recalculate (populated in Epic 4)
test.describe('Review to Score', () => {
  test.skip('should recalculate score after finding action', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveTitle(/QA Localization Tool/)
  })
})
