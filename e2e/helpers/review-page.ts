/**
 * Review Page E2E helpers — shared utilities for review-keyboard and review-score specs.
 */
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Wait for the review page to fully render by checking for a positive indicator.
 * Fails fast on SSR errors instead of timing out.
 */
export async function waitForReviewPageReady(page: Page) {
  const heading = page.locator('h1')
  await expect(heading).toBeVisible({ timeout: 30_000 })

  // Fail fast if SSR returned an error
  const errorText = page.locator('.text-destructive')
  const errorCount = await errorText.count()
  if (errorCount > 0) {
    const msg = await errorText.first().textContent()
    throw new Error(`Review page SSR error: "${msg}"`)
  }
}
