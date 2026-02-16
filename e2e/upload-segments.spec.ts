import { test, expect } from '@playwright/test'

// E1: Upload SDLXLIFF → see segments (populated in Epic 2)
test.describe('Upload to Segments', () => {
  test.skip('should display segments after file upload', async ({ page }) => {
    await page.goto('/projects')
    await expect(page).toHaveTitle(/QA Localization Tool/)
  })
})
