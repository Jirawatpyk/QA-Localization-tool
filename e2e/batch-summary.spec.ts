import { test, expect, type Page } from '@playwright/test'

import { signupOrLogin } from './helpers/supabase-admin'

/**
 * Story 2.7 — Batch Summary Page (E2E — RED PHASE)
 *
 * AC Coverage:
 *   AC #1: Batch summary with Recommended Pass / Need Review groups
 *   AC #2: FileStatusCard click navigates to review
 *   AC #6: Responsive layout (desktop / tablet / mobile)
 *
 * Prerequisites:
 *   - Project with a completed batch (L1 processed files)
 *   - Auth setup via signupOrLogin helper
 *
 * Routes under test (DO NOT EXIST YET):
 *   /projects/[projectId]/batches        — batch list / latest batch
 *   /projects/[projectId]/batches/[batchId] — batch summary detail
 */

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-batch27@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

// Placeholder IDs — will be replaced with real IDs when pages exist
const PROJECT_ID = 'placeholder-project-id'
const BATCH_ID = 'placeholder-batch-id'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe('Batch Summary Page (Story 2.7)', () => {
  test.skip('[P1] should display batch summary with Recommended Pass and Need Review groups', async ({
    page,
  }) => {
    // Setup: login and navigate to batch summary
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/batches/${BATCH_ID}`)

    // AC #1: BatchSummaryHeader shows aggregate stats
    const header = page.getByRole('banner').or(page.getByTestId('batch-summary-header'))
    await expect(header).toBeVisible({ timeout: 10000 })

    // Total files count
    await expect(page.getByText(/Total Files/i)).toBeVisible()

    // Passed count (score >= threshold + 0 Critical)
    await expect(page.getByText(/Passed/i)).toBeVisible()

    // Needs review count
    await expect(page.getByText(/Need(?:s)? Review/i)).toBeVisible()

    // Processing time
    await expect(page.getByText(/Processing Time/i)).toBeVisible()

    // AC #1: Two groups exist
    // "Recommended Pass" section — files sorted by score DESC
    const recommendedPassSection = page
      .getByRole('region', { name: /Recommended Pass/i })
      .or(page.getByTestId('batch-group-recommended-pass'))
    await expect(recommendedPassSection).toBeVisible()

    // "Need Review" section — files sorted by score ASC (worst first)
    const needReviewSection = page
      .getByRole('region', { name: /Need Review/i })
      .or(page.getByTestId('batch-group-need-review'))
    await expect(needReviewSection).toBeVisible()
  })

  test.skip('[P1] should navigate to batch page via ProjectSubNav Batches tab', async ({
    page,
  }) => {
    // Setup: login and navigate to an existing project page
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/upload`)

    // ProjectSubNav should have a "Batches" tab (added in Task 3.4)
    const projectNav = page.getByLabel('Project navigation')
    const batchesTab = projectNav.getByRole('link', { name: 'Batches' })
    await expect(batchesTab).toBeVisible({ timeout: 10000 })

    // Click the Batches tab
    await batchesTab.click()

    // URL should change to /projects/[projectId]/batches
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}/batches`))

    // Batch list or most recent batch should be displayed
    const batchContent = page.getByTestId('batch-summary-header').or(page.getByText(/No batches/i))
    await expect(batchContent).toBeVisible({ timeout: 10000 })
  })

  test.skip('[P2] should display FileStatusCard with filename, score badge, status, and severity counts', async ({
    page,
  }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/batches/${BATCH_ID}`)

    // Wait for batch summary to load
    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10000 })

    // AC #1: Each file shows a FileStatusCard
    const fileCards = page.locator('[data-testid^="file-status-card-"]')
    const cardCount = await fileCards.count()
    expect(cardCount).toBeGreaterThan(0)

    // Verify first card has required elements
    const firstCard = fileCards.first()

    // Filename
    await expect(firstCard.getByTestId('file-status-card-filename')).toBeVisible()

    // ScoreBadge (color-coded score)
    await expect(firstCard.getByTestId('score-badge')).toBeVisible()

    // Status text (e.g., "L1 Complete", "Failed")
    await expect(firstCard.getByTestId('file-status-card-status')).toBeVisible()

    // Severity counts — critical / major / minor
    await expect(firstCard.getByText(/Critical/i)).toBeVisible()
    await expect(firstCard.getByText(/Major/i)).toBeVisible()
    await expect(firstCard.getByText(/Minor/i)).toBeVisible()
  })

  test.skip('[P2] should navigate to review page when FileStatusCard is clicked', async ({
    page,
  }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/batches/${BATCH_ID}`)

    // Wait for cards to load
    const fileCards = page.locator('[data-testid^="file-status-card-"]')
    await expect(fileCards.first()).toBeVisible({ timeout: 10000 })

    // AC #2: Click a FileStatusCard → navigate to review route
    // Note: Review route is DEFERRED to Epic 4 — will 404 but href should be correct
    const firstCard = fileCards.first()

    // Get the link element — card should be an <a> or contain a link
    const cardLink = firstCard.getByRole('link').or(firstCard.locator('a'))
    const href = await cardLink.getAttribute('href')

    // Href should point to review route: /projects/[projectId]/review/[fileId]
    expect(href).toMatch(/\/projects\/[^/]+\/review\/[^/]+/)

    // Click the card
    await firstCard.click()

    // URL should change to the review route (even if it 404s)
    await expect(page).toHaveURL(/\/projects\/[^/]+\/review\/[^/]+/)
  })

  test.skip('[P2] should show ScoreBadge with correct color for different score ranges', async ({
    page,
  }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/batches/${BATCH_ID}`)

    // Wait for batch summary to load
    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10000 })

    // AC #1: ScoreBadge color-coding per tokens.css design tokens
    const scoreBadges = page.locator('[data-testid="score-badge"]')
    const badgeCount = await scoreBadges.count()
    expect(badgeCount).toBeGreaterThan(0)

    // Verify badge has data attributes or classes indicating score range
    // Score >= 95 → green (success variant)
    // Score 80-94 → yellow (warning variant)
    // Score < 80 → red (destructive variant)
    // No score → gray (muted variant)
    for (let i = 0; i < badgeCount; i++) {
      const badge = scoreBadges.nth(i)
      const variant = await badge.getAttribute('data-variant')

      // Each badge should have one of the valid variants
      expect(['success', 'warning', 'destructive', 'muted']).toContain(variant)
    }
  })

  test.skip('[P3] should show only summary counts on mobile viewport (< 768px)', async ({
    page,
  }) => {
    // AC #6: < 768px shows only summary counts, no individual file cards
    await page.setViewportSize({ width: 375, height: 667 })
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/batches/${BATCH_ID}`)

    // Summary counts should be visible
    await expect(page.getByText(/Total Files/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Passed/i)).toBeVisible()
    await expect(page.getByText(/Need(?:s)? Review/i)).toBeVisible()

    // Individual FileStatusCards should NOT be visible on mobile
    const fileCards = page.locator('[data-testid^="file-status-card-"]')
    const visibleCount = await fileCards.filter({ has: page.locator(':visible') }).count()
    expect(visibleCount).toBe(0)
  })

  test.skip('[P3] should show compact layout on tablet viewport (1024px)', async ({ page }) => {
    // AC #6: >= 1024px shows FileStatusCards in compact mode
    await page.setViewportSize({ width: 1024, height: 768 })
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/batches/${BATCH_ID}`)

    // Summary header visible
    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10000 })

    // FileStatusCards should be visible (compact mode — some columns hidden)
    const fileCards = page.locator('[data-testid^="file-status-card-"]')
    await expect(fileCards.first()).toBeVisible()

    // Filename and score should still be visible in compact mode
    const firstCard = fileCards.first()
    await expect(firstCard.getByTestId('file-status-card-filename')).toBeVisible()
    await expect(firstCard.getByTestId('score-badge')).toBeVisible()
  })
})
