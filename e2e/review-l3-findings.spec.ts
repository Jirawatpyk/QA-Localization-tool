/**
 * Story 3.3 ATDD — E2E: L3 Deep Analysis Pipeline & Review Display — RED PHASE (TDD)
 *
 * Tests Thorough mode pipeline -> L3 complete -> review page display:
 *   upload SDLXLIFF -> auto-parse -> Thorough pipeline (L1+L2+L3) -> navigate to review
 *   -> "Deep Analyzed" badge -> L3 findings visible -> confirm/contradict badges
 *
 * This is a **critical flow** (upload->parse->pipeline->findings->score->review with L3).
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Inngest dev server (`npx inngest-cli dev`) on port 8288
 * - Supabase running (local or cloud)
 * - OPENAI_API_KEY env var (for L2 gpt-4o-mini)
 * - ANTHROPIC_API_KEY env var (for L3 claude-sonnet)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 *
 * NOTE: All tests are `test()` — TDD RED phase. Will FAIL until Story 3.3 is implemented.
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
  queryFindingsCount,
  queryScore,
} from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-l3-review-${Date.now()}@test.local`

// Shared state across serial tests
let projectId: string
let tenantId: string
let fileId: string

test.describe.serial('Review L3 Findings — Story 3.3', () => {
  // Skip entire suite when no Inngest dev server (TD-E2E-008 resolved — secrets wired in CI)
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  // ── Setup: Auth + Project ────────────────────────────────────────────────
  test('[setup] signup, login and create project', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'L3 Deep Analysis E2E')
  })

  // ── Setup: Upload + Thorough Pipeline ──────────────────────────────────
  test('[setup] upload SDLXLIFF and start thorough pipeline (L1+L2+L3)', async ({ page }) => {
    // L3 pipeline is slower than Economy — allow up to 8 min
    test.setTimeout(480_000)

    // Each Playwright test gets a fresh page — must re-authenticate
    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)

    // Upload a minimal SDLXLIFF file
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

    // Wait for upload to complete
    await assertUploadProgress(page, 'minimal.sdlxliff')

    // After upload, auto-parse triggers automatically (Story 3.2b5 AC1).
    // "Parsing..." state is transient — wait for terminal "Start Processing" button
    // which only appears when parsedFileIds > 0 (i.e., parse succeeded).
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 60_000 })
    await expect(startBtn).toBeEnabled()
    await startBtn.click()

    // ProcessingModeDialog opens
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Select Thorough mode (NOT Economy — Economy is default)
    const thoroughOption = dialog.getByRole('radio', { name: /thorough/i })
    await expect(thoroughOption).toBeVisible()
    await thoroughOption.click()

    // Click Start Processing in dialog footer
    const confirmBtn = dialog.getByRole('button', { name: 'Start Processing', exact: true })
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // Dialog closes after submission
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // Get fileId from DB for subsequent assertion tests
    const fileRecord = await queryFileByName(projectId, 'minimal.sdlxliff')
    expect(fileRecord).not.toBeNull()
    fileId = fileRecord!.id

    // Wait for pipeline to complete (Thorough mode = L1 + L2 + L3)
    // L3 uses claude-sonnet which is slower — 5 min timeout
    await pollFileStatus(fileId, 'l3_completed', 300_000)

    // Wait for score to reach L1L2L3 — scoring step runs AFTER file status update
    await pollScoreLayer(fileId, 'L1L2L3', 30_000)
  })

  // ── P1: ScoreBadge shows "Deep Analyzed" for Thorough mode ────────────
  test('[P1] ScoreBadge shows "Deep Analyzed" badge after L3 completion', async ({ page }) => {
    test.setTimeout(60_000)

    // Verify pipeline and score are in expected state (sanity check)
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2L3')

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // ScoreBadge should be visible
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })

    // For Thorough mode (L1+L2+L3), badge should show "Deep Analyzed" (gold)
    // Economy mode shows "AI Screened" — L3 upgrades to "Deep Analyzed"
    await expect(scoreBadge).toContainText(/deep analyzed/i)
  })

  // ── P1: ReviewProgress shows all 3 layers completed ────────────────────
  test('[P1] ReviewProgress shows L1, L2, L3 checkmarks for thorough mode', async ({ page }) => {
    test.setTimeout(60_000)

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // ReviewProgress component should be visible
    const reviewProgress = page.getByTestId('review-progress')
    await expect(reviewProgress).toBeVisible({ timeout: 15_000 })

    // L1 layer should show completed (checkmark)
    const l1Status = reviewProgress.getByTestId('layer-status-L1')
    await expect(l1Status).toBeVisible()
    await expect(l1Status).toHaveAttribute('data-completed', 'true')

    // L2 layer should show completed (checkmark)
    const l2Status = reviewProgress.getByTestId('layer-status-L2')
    await expect(l2Status).toBeVisible()
    await expect(l2Status).toHaveAttribute('data-completed', 'true')

    // L3 layer should show completed (checkmark) — NOT "N/A" like in Economy mode
    const l3Status = reviewProgress.getByTestId('layer-status-L3')
    await expect(l3Status).toBeVisible()
    await expect(l3Status).toHaveAttribute('data-completed', 'true')
    // Ensure it does NOT say "N/A"
    await expect(l3Status).not.toHaveText(/N\/A/i)
  })

  // ── P1: Score layer_completed matches DB ────────────────────────────────
  test('[P1] displayed score matches DB with L1L2L3 layer', async ({ page }) => {
    test.setTimeout(60_000)

    // Query expected score from DB
    const dbScore = await queryScore(fileId)
    expect(dbScore).not.toBeNull()
    expect(dbScore!.layer_completed).toBe('L1L2L3')

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Score badge should contain the actual MQM score from DB
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })

    const scoreText = await scoreBadge.textContent()
    expect(scoreText).not.toBeNull()

    // The displayed score should match the DB score (allowing for display formatting)
    const dbScoreInt = Math.floor(dbScore!.mqm_score)
    expect(scoreText).toContain(String(dbScoreInt))
  })

  // ── P1: L3 findings display in review page ────────────────────────────
  test('[P1] L3 findings display with confidence badges in review page', async ({ page }) => {
    test.setTimeout(60_000)

    // Check how many L3 findings were produced
    const l3Count = await queryFindingsCount(fileId, 'L3')

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    if (l3Count > 0) {
      // At least one finding should be visible
      const findingItems = page.getByTestId('finding-list-item')
      await expect(findingItems.first()).toBeVisible({ timeout: 15_000 })

      // L3 findings should display a confidence badge
      const confidenceBadge = page.getByTestId('confidence-badge')
      await expect(confidenceBadge.first()).toBeVisible({ timeout: 15_000 })

      // Confidence value should display a percentage pattern (e.g., "92%")
      const confidenceText = await confidenceBadge.first().textContent()
      expect(confidenceText).toMatch(/\d+%/)
    }
  })

  // ── P1: L3 findings show layer badge "AI" ──────────────────────────────
  test('[P1] L3 findings display detection layer badge', async ({ page }) => {
    test.setTimeout(60_000)

    const l3Count = await queryFindingsCount(fileId, 'L3')

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    if (l3Count > 0) {
      // Each L3 finding should display a layer badge with "AI"
      const layerBadge = page.getByTestId('layer-badge')
      await expect(layerBadge.first()).toBeVisible({ timeout: 15_000 })

      // L3 findings are AI-detected — badge should show "AI"
      const layerText = await layerBadge.first().textContent()
      expect(layerText).toMatch(/^AI$/)
    }
  })

  // ── P1: L3 confirm/contradict badges visible ──────────────────────────
  test('[P1] L3 findings show confirm/contradict badges for L2 cross-referencing', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    // L3 deep analysis may confirm or contradict L2 findings.
    // If L3 processed and L2 findings exist, cross-reference badges should appear.
    const l2Count = await queryFindingsCount(fileId, 'L2')
    const l3Count = await queryFindingsCount(fileId, 'L3')

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    if (l2Count > 0 && l3Count > 0) {
      // Look for confirm/contradict indicators on L2 findings
      // L3 analysis cross-references L2 findings and marks them with badges
      const confirmBadge = page.getByTestId('l3-confirm-badge')
      const disagreeBadge = page.getByTestId('l3-disagree-badge')

      // At least some L2 findings should have L3 cross-reference status
      const confirmCount = await confirmBadge.count()
      const disagreeCount = await disagreeBadge.count()

      // At least one cross-reference badge should be visible (confirm or disagree)
      expect(confirmCount + disagreeCount).toBeGreaterThan(0)

      if (confirmCount > 0) {
        await expect(confirmBadge.first()).toContainText(/Confirmed by L3/i)
      }
      if (disagreeCount > 0) {
        await expect(disagreeBadge.first()).toContainText(/L3 disagrees/i)
      }
    }
  })

  // ── P1: Total findings count includes L3 ──────────────────────────────
  test('[P1] total findings count includes all layers (L1+L2+L3)', async ({ page }) => {
    test.setTimeout(60_000)

    // Count findings per layer from DB
    const l1Count = await queryFindingsCount(fileId, 'L1')
    const l2Count = await queryFindingsCount(fileId, 'L2')
    const l3Count = await queryFindingsCount(fileId, 'L3')
    const totalCount = l1Count + l2Count + l3Count

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    if (totalCount > 0) {
      // Finding list items should be visible
      const findingItems = page.getByTestId('finding-list-item')
      await expect(findingItems.first()).toBeVisible({ timeout: 15_000 })

      // Rendered count should match total across all layers
      const renderedCount = await findingItems.count()
      expect(renderedCount).toBe(totalCount)
    }
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        // Non-critical — global teardown will clean up the user
        console.warn(`[cleanup] Failed to clean project ${projectId}:`, err)
      }
    }
  })
})
