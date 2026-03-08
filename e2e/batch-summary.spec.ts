import { test, expect } from '@playwright/test'

import { cleanupTestProject, type SeedFileStatus } from './helpers/pipeline-admin'
import {
  SUPABASE_URL,
  adminHeaders,
  createTestProject,
  getUserInfo,
  setUserMetadata,
  signupOrLogin,
} from './helpers/supabase-admin'

/**
 * Story 2.7 — Batch Summary Page (E2E)
 *
 * AC Coverage:
 *   AC #1: Batch summary with Recommended Pass / Need Review groups
 *   AC #2: FileStatusCard click navigates to review
 *   AC #6: Responsive layout (desktop / tablet / mobile)
 *
 * Routes under test:
 *   /projects/[projectId]/batches           — batch list
 *   /projects/[projectId]/batches/[batchId] — batch summary detail
 */

const TEST_EMAIL = `e2e-batch-${Date.now()}@test.local`

let projectId: string
let tenantId: string
let batchId: string

async function seedBatch(pId: string, tId: string, fileCount: number): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/upload_batches`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: pId,
      tenant_id: tId,
      file_count: fileCount,
    }),
  })
  if (!res.ok) throw new Error(`Failed to seed batch: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Array<{ id: string }>
  if (!data || data.length === 0) throw new Error(`Seed batch returned empty for project ${pId}`)
  return data[0].id
}

async function seedFile(
  pId: string,
  tId: string,
  bId: string,
  name: string,
  status: SeedFileStatus,
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: pId,
      tenant_id: tId,
      batch_id: bId,
      file_name: name,
      file_type: 'sdlxliff',
      file_size_bytes: 2048,
      storage_path: `uploads/${pId}/${name}`,
      status,
    }),
  })
  if (!res.ok) throw new Error(`Failed to seed file: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Array<{ id: string }>
  if (!data || data.length === 0) throw new Error(`Seed file returned empty: ${name}`)
  return data[0].id
}

async function seedScore(
  fileId: string,
  pId: string,
  tId: string,
  mqmScore: number,
  criticalCount: number,
  majorCount: number,
  minorCount: number,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: pId,
      tenant_id: tId,
      mqm_score: mqmScore,
      total_words: 500,
      critical_count: criticalCount,
      major_count: majorCount,
      minor_count: minorCount,
      npt: 100 - mqmScore,
      layer_completed: 'L1',
      status: 'calculated',
    }),
  })
  if (!res.ok) throw new Error(`Failed to seed score: ${res.status} ${await res.text()}`)
}

test.describe.configure({ mode: 'serial' })

test.describe('Batch Summary Page (Story 2.7)', () => {
  test('[setup] signup/login and create project with batch data', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    // Suppress onboarding tours so driver.js overlay doesn't intercept clicks
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'Batch Summary E2E')

    // Create batch with 3 files
    batchId = await seedBatch(projectId, tenantId, 3)

    // Seed files linked to batch
    // pass-file: score 97, 0 criticals → Recommended Pass (default threshold 95)
    const fileIdPass = await seedFile(
      projectId,
      tenantId,
      batchId,
      'pass-file.sdlxliff',
      'l1_completed',
    )
    await seedScore(fileIdPass, projectId, tenantId, 97, 0, 1, 3)

    // review-file1: score 85, 0 criticals → Need Review (below threshold 95)
    const fileIdReview1 = await seedFile(
      projectId,
      tenantId,
      batchId,
      'review-file1.sdlxliff',
      'l1_completed',
    )
    await seedScore(fileIdReview1, projectId, tenantId, 85, 0, 3, 5)

    // review-file2: score 98, 1 critical → Need Review (critical found despite high score)
    const fileIdReview2 = await seedFile(
      projectId,
      tenantId,
      batchId,
      'review-file2.sdlxliff',
      'l1_completed',
    )
    await seedScore(fileIdReview2, projectId, tenantId, 98, 1, 0, 2)
  })

  test('[P1] should display batch summary with Recommended Pass and Need Review groups', async ({
    page,
  }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/batches/${batchId}`)

    // BatchSummaryHeader shows aggregate stats
    const header = page.getByTestId('batch-summary-header')
    await expect(header).toBeVisible({ timeout: 10_000 })

    // Stats cards (scoped to header to avoid matching mobile summary text)
    await expect(header.getByText(/Total Files/i)).toBeVisible()
    await expect(header.getByText(/Passed/i)).toBeVisible()
    await expect(header.getByText(/Needs? Review/i)).toBeVisible()

    // Two groups exist
    await expect(page.getByRole('heading', { name: /Recommended Pass/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Need Review/i })).toBeVisible()
  })

  test('[P1] should navigate to batch page via ProjectSubNav Batches tab', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/upload`)

    const projectNav = page.getByLabel('Project navigation')
    const batchesTab = projectNav.getByRole('link', { name: 'Batches' })
    await expect(batchesTab).toBeVisible({ timeout: 10_000 })

    await batchesTab.click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/batches`))

    // Batch list should show the seeded batch (use heading to avoid matching breadcrumb/nav/card)
    await expect(page.getByRole('heading', { name: 'Batches' })).toBeVisible({ timeout: 10_000 })
  })

  test('[P2] should display file cards with filename, score badge, status, and severity counts', async ({
    page,
  }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/batches/${batchId}`)

    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10_000 })

    // File cards visible in the grid (desktop viewport)
    const grid = page.getByTestId('batch-summary-grid')
    await expect(grid).toBeVisible()

    // File names
    await expect(grid.getByText('pass-file.sdlxliff')).toBeVisible()
    await expect(grid.getByText('review-file1.sdlxliff')).toBeVisible()
    await expect(grid.getByText('review-file2.sdlxliff')).toBeVisible()

    // Score badges
    const scoreBadges = grid.locator('[data-testid="score-badge"]')
    const badgeCount = await scoreBadges.count()
    expect(badgeCount).toBe(3)

    // Severity text (Critical / Major / Minor)
    await expect(grid.getByText(/Critical/i).first()).toBeVisible()
    await expect(grid.getByText(/Major/i).first()).toBeVisible()
    await expect(grid.getByText(/Minor/i).first()).toBeVisible()
  })

  test('[P2] should have file cards with links to review page', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/batches/${batchId}`)

    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10_000 })

    // File cards are links — verify href pattern points to review route
    const grid = page.getByTestId('batch-summary-grid')
    const fileLinks = grid.getByRole('link')
    const linkCount = await fileLinks.count()
    expect(linkCount).toBeGreaterThan(0)

    for (let i = 0; i < Math.min(linkCount, 3); i++) {
      const href = await fileLinks.nth(i).getAttribute('href')
      // Href should point to review route: /projects/[projectId]/review/[fileId]
      expect(href).toMatch(/\/projects\/[^/]+\/review\/[^/]+/)
    }
  })

  test('[P2] should show ScoreBadge with numeric score values', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/batches/${batchId}`)

    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10_000 })

    const grid = page.getByTestId('batch-summary-grid')
    const scoreBadges = grid.locator('[data-testid="score-badge"]')
    const badgeCount = await scoreBadges.count()
    expect(badgeCount).toBeGreaterThan(0)

    // Each badge should display a numeric score (e.g., "97.0", "85.0", "98.0")
    for (let i = 0; i < badgeCount; i++) {
      const badge = scoreBadges.nth(i)
      const text = await badge.textContent()
      expect(text).toMatch(/\d+/)
    }
  })

  test('[P3] should show only summary counts on mobile viewport (< 768px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/batches/${batchId}`)

    // Summary header should be visible (scoped to header to avoid matching mobile summary text)
    const header = page.getByTestId('batch-summary-header')
    await expect(header.getByText(/Total Files/i)).toBeVisible({ timeout: 10_000 })
    await expect(header.getByText(/Passed/i)).toBeVisible()
    await expect(header.getByText(/Needs? Review/i)).toBeVisible()

    // Grid with file cards should be hidden on mobile (hidden md:grid)
    const grid = page.getByTestId('batch-summary-grid')
    await expect(grid).not.toBeVisible()

    // Mobile summary text should be visible: "N passed, N need review"
    await expect(page.getByText(/passed.*need review/i)).toBeVisible()
  })

  test('[P3] should show file cards on tablet viewport (>= 768px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/batches/${batchId}`)

    // Summary header visible
    await expect(page.getByTestId('batch-summary-header')).toBeVisible({ timeout: 10_000 })

    // Grid should be visible at tablet/desktop width
    const grid = page.getByTestId('batch-summary-grid')
    await expect(grid).toBeVisible()

    // Score badges should be visible within the grid
    const scoreBadges = grid.locator('[data-testid="score-badge"]')
    await expect(scoreBadges.first()).toBeVisible()
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
