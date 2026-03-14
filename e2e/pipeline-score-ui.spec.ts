/**
 * Epic 3 P0-11 (R3-019): E2E Pipeline to Score UI
 *
 * Tests the REAL pipeline flow (not seeded data) to verify that after
 * L2 processing completes, the score badge on the review page shows
 * "AI Screened" with a real calculated MQM score.
 *
 * Flow:
 *   Upload SDLXLIFF -> auto-parse -> Start Economy (L1 + L2) -> poll completion
 *   -> navigate to review page -> assert score badge "AI Screened" + numeric score
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Inngest dev server (`npx inngest-cli dev`) on port 8288
 * - Supabase running (local or cloud)
 * - OPENAI_API_KEY env var (for L2 gpt-4o-mini)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 */

import { test, expect } from '@playwright/test'

import {
  FIXTURE_FILES,
  gotoProjectUpload,
  uploadSingleFile,
  assertUploadProgress,
} from './helpers/fileUpload'
import {
  cleanupTestProject,
  pollFileStatus,
  pollScoreLayer,
  queryFileByName,
  queryScore,
} from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-pipeline-score-${Date.now()}@test.local`

// Shared state across serial tests
let projectId: string
let tenantId: string
let fileId: string

// ── Page-Ready Guard ──────────────────────────────────────────────────────────

async function waitForReviewPageReady(page: import('@playwright/test').Page) {
  const heading = page.locator('h1')
  await expect(heading).toBeVisible({ timeout: 30_000 })

  const errorText = page.locator('.text-destructive')
  const errorCount = await errorText.count()
  if (errorCount > 0) {
    const msg = await errorText.first().textContent()
    throw new Error(`Review page SSR error: "${msg}"`)
  }
}

test.describe.serial('Pipeline Score UI — Epic 3 P0-11 (R3-019)', () => {
  // TODO(TD-E2E-008): Skip when no Inngest dev server — pipeline needs event orchestration
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  // ── Setup: Auth + Project ──────────────────────────────────────────────────
  test('[setup] signup/login and create project', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'Pipeline Score UI E2E')
    expect(projectId).toBeTruthy()
  })

  // ── Setup: Upload + Pipeline ───────────────────────────────────────────────
  test('[setup] upload SDLXLIFF and start economy processing', async ({ page }) => {
    test.setTimeout(300_000)

    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)
    await assertUploadProgress(page, 'minimal.sdlxliff')

    // Wait for auto-parse → "Start Processing" button
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 60_000 })
    await expect(startBtn).toBeEnabled()
    await startBtn.click()

    // ProcessingModeDialog — Economy mode is default
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    const confirmBtn = dialog.getByRole('button', { name: 'Start Processing', exact: true })
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // Get fileId from DB
    const fileRecord = await queryFileByName(projectId, 'minimal.sdlxliff')
    expect(fileRecord).not.toBeNull()
    fileId = fileRecord!.id

    // Wait for pipeline completion
    await pollFileStatus(fileId, 'l2_completed', 240_000)
    await pollScoreLayer(fileId, 'L1L2', 60_000)

    // Verify score exists
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
    expect(['calculated', 'auto_passed']).toContain(score!.status)
  })

  // ── P0: Score badge shows "AI Screened" after real L2 processing ─────────
  test('[P0] score badge shows "AI Screened" with real calculated score', async ({ page }) => {
    test.setTimeout(60_000)

    // Login — fresh page context, same user
    await signupOrLogin(page, TEST_EMAIL)

    // Wait for auth session to fully establish before SSR navigation
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Navigate to review page
    await page.goto(`/projects/${projectId}/review/${fileId}`)
    await waitForReviewPageReady(page)

    // Assert: ScoreBadge is visible
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 30_000 })

    // Assert: Shows "AI Screened" (L1L2 = Economy pipeline complete)
    await expect(scoreBadge).toContainText(/ai screened/i)

    // Assert: MQM score is a real number
    await expect(scoreBadge).toContainText(/\d+/)

    // Assert: Score from DB is valid
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.mqm_score).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(score!.mqm_score)).toBe(false)

    // Assert: Approve button state matches score status
    if (score!.status === 'calculated') {
      const approveBtn = page.getByRole('button', { name: /approve/i })
      await expect(approveBtn).toBeVisible({ timeout: 15_000 })
      await expect(approveBtn).toBeEnabled()
    }
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        console.warn(`[cleanup] Failed to clean project ${projectId}:`, err)
      }
    }
  })
})
