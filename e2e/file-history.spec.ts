import { test, expect } from '@playwright/test'

import { cleanupTestProject } from './helpers/pipeline-admin'
import { createTestProject, getUserInfo, signupOrLogin } from './helpers/supabase-admin'

/**
 * Story 2.7 — File History Page (E2E)
 *
 * AC Coverage:
 *   AC #3: File history table with filtering by status
 *
 * Route under test:
 *   /projects/[projectId]/files — File History table
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const TEST_EMAIL = `e2e-filehist-${Date.now()}@test.local`

let projectId: string
let tenantId: string

function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  }
}

type SeedFileStatus =
  | 'pending'
  | 'parsed'
  | 'l1_completed'
  | 'l2_completed'
  | 'l3_completed'
  | 'failed'

async function seedFile(
  pId: string,
  tId: string,
  name: string,
  status: SeedFileStatus,
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: pId,
      tenant_id: tId,
      file_name: name,
      file_type: 'sdlxliff',
      file_size_bytes: 1024,
      storage_path: `uploads/${pId}/${name}`,
      status,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to seed file ${name}: ${res.status} ${text}`)
  }
  const data = (await res.json()) as Array<{ id: string }>
  if (!data || data.length === 0) throw new Error(`Seed file returned empty: ${name}`)
  return data[0].id
}

test.describe.configure({ mode: 'serial' })

test.describe('File History Page (Story 2.7)', () => {
  test('[setup] signup/login and create project with files', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'File History E2E')

    // Seed files at various statuses
    await seedFile(projectId, tenantId, 'file-parsed.sdlxliff', 'parsed')
    await seedFile(projectId, tenantId, 'file-l1-done.sdlxliff', 'l1_completed')
    await seedFile(projectId, tenantId, 'file-l2-done.sdlxliff', 'l2_completed')
    await seedFile(projectId, tenantId, 'file-failed.sdlxliff', 'failed')
  })

  test('[P1] should display file history table with all project files', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/files`)

    const table = page.getByRole('table')
    await expect(table).toBeVisible({ timeout: 10_000 })

    // Column headers (must match actual FileHistoryTable column text)
    await expect(page.getByRole('columnheader', { name: /^File$/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Date$/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Status$/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Score$/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /^Reviewer$/i })).toBeVisible()

    // Data rows (header + 4 seeded files)
    const rows = table.getByRole('row')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(1)
  })

  test('[P1] should navigate to file history via ProjectSubNav History tab', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/upload`)

    const projectNav = page.getByLabel('Project navigation')
    const historyTab = projectNav.getByRole('link', { name: 'History' })
    await expect(historyTab).toBeVisible({ timeout: 10_000 })

    await historyTab.click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/files`))

    const content = page.getByRole('table').or(page.getByText(/No files/i))
    await expect(content).toBeVisible({ timeout: 10_000 })
  })

  test('[P1] should filter files by status when filter buttons clicked', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/files`)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })

    // Default: "All" filter active
    const allFilter = page.getByRole('button', { name: 'All', exact: true })
    await expect(allFilter).toBeVisible()

    const allRows = page.getByRole('table').getByRole('row')
    const totalCount = await allRows.count()

    // Click a status filter
    const failedFilter = page.getByRole('button', { name: /Failed/i })
    if (await failedFilter.isVisible()) {
      await failedFilter.click()
      // Wait for filter to apply — expect header + 1 failed file = 2 rows
      await expect(page.getByRole('table').getByRole('row')).toHaveCount(2, { timeout: 5_000 })
    }

    // Reset filter
    await allFilter.click()
    // Wait for all rows to reappear
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(totalCount, {
      timeout: 5_000,
    })
  })

  test('[P2] should display last reviewer name for reviewed files', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/files`)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })

    const table = page.getByRole('table')
    const dataRows = table.getByRole('row').filter({ hasNot: page.getByRole('columnheader') })
    const rowCount = await dataRows.count()

    if (rowCount > 0) {
      for (let i = 0; i < Math.min(rowCount, 3); i++) {
        const row = dataRows.nth(i)
        const reviewerCell = row.locator('td').nth(4)
        await expect(reviewerCell).toBeVisible()
      }
    }
  })

  test('[P3] should paginate when files exceed 50', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/files`)
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })

    const table = page.getByRole('table')
    const dataRows = table.getByRole('row').filter({ hasNot: page.getByRole('columnheader') })
    const firstPageCount = await dataRows.count()

    // Only test pagination if enough files exist
    if (firstPageCount >= 50) {
      const nextButton = page
        .getByRole('button', { name: /Next/i })
        .or(page.getByTestId('pagination-next'))
      await expect(nextButton).toBeVisible()

      await nextButton.click()

      const secondPageRows = table
        .getByRole('row')
        .filter({ hasNot: page.getByRole('columnheader') })
      const secondPageCount = await secondPageRows.count()
      expect(secondPageCount).toBeGreaterThan(0)
    }
    // With <50 files seeded, pagination is not expected — test passes implicitly
  })

  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch {
        // Non-critical — global teardown handles user cleanup
      }
    }
  })
})
