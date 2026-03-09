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

/**
 * Wait for the review page to fully hydrate — finding grid + rows visible.
 * This confirms React hydration completed and all useEffect callbacks
 * (including keyboard binding registration) have executed.
 *
 * Use this before testing keyboard shortcuts that depend on useEffect hooks.
 */
export async function waitForReviewPageHydrated(page: Page) {
  await waitForReviewPageReady(page)

  // Finding rows are populated via useEffect → Zustand store → render,
  // so their presence confirms all effects (including keyboard bindings) have run
  const grid = page.getByRole('grid', { name: /finding/i })
  await expect(grid).toBeVisible({ timeout: 30_000 })
  await expect(grid.getByRole('row').first()).toBeVisible({ timeout: 10_000 })

  // Ensure the page has keyboard focus (headless Chromium may not auto-focus
  // after navigation). Use focus() instead of click() to avoid triggering
  // unintended side effects (dismiss tooltips, close popovers)
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement)?.blur()
    document.body.focus()
  })
}
