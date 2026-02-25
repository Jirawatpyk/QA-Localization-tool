import { test, expect, type Page } from '@playwright/test'

import { signupOrLogin } from './helpers/supabase-admin'

/**
 * Story 2.7 — File History Page (E2E — RED PHASE)
 *
 * AC Coverage:
 *   AC #3: File history table with filtering by status
 *
 * Prerequisites:
 *   - Project with multiple files at various statuses (passed, needs review, failed)
 *   - Auth setup via signupOrLogin helper
 *
 * Route under test (DOES NOT EXIST YET):
 *   /projects/[projectId]/files — File History table
 */

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-filehist27@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

// Placeholder ID — will be replaced with real ID when page exists
const PROJECT_ID = 'placeholder-project-id'

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe('File History Page (Story 2.7)', () => {
  test.skip('[P1] should display file history table with all project files', async ({ page }) => {
    // Setup: login and navigate to file history page
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/files`)

    // AC #3: Table with required columns
    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10000 })

    // Column headers
    await expect(page.getByRole('columnheader', { name: /Filename/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Upload Date/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Score/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Last Reviewer/i })).toBeVisible()

    // At least one row of data (or empty state)
    const rows = table.getByRole('row')
    const rowCount = await rows.count()
    // First row is header, so data rows start at index 1
    // Either there are data rows or an empty state message
    if (rowCount <= 1) {
      await expect(page.getByText(/No files/i)).toBeVisible()
    } else {
      expect(rowCount).toBeGreaterThan(1)
    }
  })

  test.skip('[P1] should navigate to file history via ProjectSubNav History tab', async ({
    page,
  }) => {
    // Setup: login and navigate to an existing project page
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/upload`)

    // ProjectSubNav should have a "History" tab (added in Task 5.4)
    const projectNav = page.getByLabel('Project navigation')
    const historyTab = projectNav.getByRole('link', { name: 'History' })
    await expect(historyTab).toBeVisible({ timeout: 10000 })

    // Click the History tab
    await historyTab.click()

    // URL should change to /projects/[projectId]/files
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}/files`))

    // Table or empty state should appear
    const content = page.getByRole('table').or(page.getByText(/No files/i))
    await expect(content).toBeVisible({ timeout: 10000 })
  })

  test.skip('[P1] should filter files by status when filter buttons clicked', async ({ page }) => {
    // Setup: login and navigate to file history
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/files`)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

    // AC #3: Filter by status — filter buttons above the table
    // Default: "All" filter active
    const allFilter = page.getByRole('button', { name: 'All', exact: true })
    await expect(allFilter).toBeVisible()

    // Count total rows before filtering
    const allRows = page.getByRole('table').getByRole('row')
    const totalCount = await allRows.count()

    // Click "Passed" filter
    const passedFilter = page.getByRole('button', { name: /Passed/i })
    await passedFilter.click()

    // Table should update — only passed files shown
    // (auto_passed or score >= threshold with 0 critical)
    await page.waitForLoadState('networkidle')
    const passedRows = page.getByRole('table').getByRole('row')
    const passedCount = await passedRows.count()
    expect(passedCount).toBeLessThanOrEqual(totalCount)

    // Click "Needs Review" filter
    const needsReviewFilter = page.getByRole('button', { name: /Need(?:s)? Review/i })
    await needsReviewFilter.click()
    await page.waitForLoadState('networkidle')

    // Click "Failed" filter
    const failedFilter = page.getByRole('button', { name: /Failed/i })
    await failedFilter.click()
    await page.waitForLoadState('networkidle')

    // Click "All" to reset
    await allFilter.click()
    await page.waitForLoadState('networkidle')
    const resetRows = page.getByRole('table').getByRole('row')
    const resetCount = await resetRows.count()
    expect(resetCount).toBe(totalCount)
  })

  test.skip('[P2] should display last reviewer name for reviewed files', async ({ page }) => {
    // Setup: login and navigate to file history
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/files`)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

    // AC #3: "Last Reviewer" column
    // Files that have been reviewed show the reviewer's display name
    // Files not yet reviewed show empty or dash
    const table = page.getByRole('table')
    const dataRows = table.getByRole('row').filter({ hasNot: page.getByRole('columnheader') })
    const rowCount = await dataRows.count()

    if (rowCount > 0) {
      // At least verify the reviewer column cell exists for each row
      for (let i = 0; i < Math.min(rowCount, 5); i++) {
        const row = dataRows.nth(i)
        // The reviewer cell should exist (may contain text or dash)
        const reviewerCell = row.getByTestId('file-history-reviewer').or(
          row.locator('td').nth(4), // fallback to 5th column (0-indexed)
        )
        await expect(reviewerCell).toBeVisible()
      }
    }
  })

  test.skip('[P3] should paginate when files exceed 50', async ({ page }) => {
    // Setup: login and navigate to file history for a project with >50 files
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/files`)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

    // PAGE_SIZE = 50 (from Task 5.3)
    const table = page.getByRole('table')
    const dataRows = table.getByRole('row').filter({ hasNot: page.getByRole('columnheader') })
    const firstPageCount = await dataRows.count()

    // If >50 files exist, pagination controls should be visible
    if (firstPageCount >= 50) {
      // Pagination controls
      const nextButton = page
        .getByRole('button', { name: /Next/i })
        .or(page.getByTestId('pagination-next'))
      await expect(nextButton).toBeVisible()

      // Click next page
      await nextButton.click()
      await page.waitForLoadState('networkidle')

      // Second page should show remaining files
      const secondPageRows = table
        .getByRole('row')
        .filter({ hasNot: page.getByRole('columnheader') })
      const secondPageCount = await secondPageRows.count()
      expect(secondPageCount).toBeGreaterThan(0)

      // Previous button should now be visible
      const prevButton = page
        .getByRole('button', { name: /Previous/i })
        .or(page.getByTestId('pagination-prev'))
      await expect(prevButton).toBeVisible()
    }
  })
})
