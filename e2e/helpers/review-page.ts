/**
 * Review Page E2E helpers — shared utilities for review-keyboard and review-score specs.
 */
import type { Locator, Page } from '@playwright/test'
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
 * Wait for the review page to fully hydrate — finding grid + rows visible
 * AND keyboard handlers registered.
 *
 * SSR renders finding rows as HTML before React effects run. The
 * `data-keyboard-ready` attribute is set by FindingList's useEffect after
 * J/K/Arrow handlers are registered, guaranteeing the page is interactive.
 *
 * Use this before testing keyboard shortcuts that depend on useEffect hooks.
 */
export async function waitForReviewPageHydrated(page: Page) {
  await waitForReviewPageReady(page)

  // Finding rows are populated via useEffect → Zustand store → render.
  // Story 4.1a: minor findings are inside a collapsed accordion, so we
  // must wait for findings to load + expand accordion before checking rows.
  await waitForFindingsVisible(page)

  // Wait for keyboard handler registration to complete (set by FindingList useEffect)
  await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', {
    timeout: 15_000,
  })

  // Wait for review action hotkeys (A/R/F) — registered in parent (ReviewPageClient)
  // effect which fires AFTER child effects. Without this, E2E presses keys before handlers exist.
  await page.waitForSelector('[data-testid="review-3-zone"][data-review-actions-ready="true"]', {
    timeout: 5_000,
  })

  // Ensure the page has keyboard focus (headless Chromium may not auto-focus
  // after navigation). Use focus() instead of click() to avoid triggering
  // unintended side effects (dismiss tooltips, close popovers)
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement)?.blur()
    document.body.focus()
  })
}

/**
 * Wait for findings to load in the Zustand store, expand minor accordion
 * if needed, and return the finding rows locator.
 *
 * Fixes race condition: store populates async via useEffect, accordion
 * visibility check runs before findings appear → misses the expand →
 * finding-compact-row elements stay hidden in collapsed accordion.
 *
 * Pattern:
 *  1. Wait for finding-list container
 *  2. Wait for finding-count-summary to show non-zero Total (store populated)
 *  3. Expand minor accordion if all/some findings are minor
 *  4. Assert finding rows are visible
 */
export async function waitForFindingsVisible(page: Page): Promise<Locator> {
  // 1. Wait for finding-list container
  const findingList = page.getByTestId('finding-list')
  await expect(findingList).toBeVisible({ timeout: 15_000 })

  // 2. Wait for findings to load in the store
  //    finding-count-summary shows "Total: N" — wait until N > 0
  const countSummary = page.getByTestId('finding-count-summary')
  await expect(countSummary).not.toContainText('Total: 0', { timeout: 15_000 })

  // 3. Expand minor accordion if present (Story 4.1a: minor findings hidden by default)
  const minorAccordion = page.getByText(/Minor \(\d+\)/i)
  if (await minorAccordion.isVisible().catch(() => false)) {
    await minorAccordion.click()
    await page.waitForTimeout(500)
  }

  // 4. Finding rows should now be visible
  const findingRows = page.getByTestId('finding-compact-row')
  await expect(findingRows.first()).toBeVisible({ timeout: 10_000 })

  return findingRows
}
