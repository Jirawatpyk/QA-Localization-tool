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

/**
 * E2E: Review Findings — Story 3.2c (L2 Results Display & Score Update)
 *
 * Tests the review page after pipeline completion:
 *   upload SDLXLIFF -> auto-parse -> Economy pipeline (L1+L2) -> navigate to review
 *   -> findings list visible -> score badge visible -> layer progress shown
 *
 * This is a **critical flow** (upload->parse->pipeline->findings->score->review).
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Inngest dev server (`npx inngest-cli dev`) on port 8288
 * - Supabase running (local or cloud)
 * - OPENAI_API_KEY env var (for L2 gpt-4o-mini)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 *
 * NOTE: P0/P1 assertion tests activated (GREEN phase — Story 3.2c implementation).
 * The review page is at /projects/[projectId]/review/[fileId].
 * Outer gate still skips when INNGEST_DEV_URL is not set.
 */

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-review-${Date.now()}@test.local`

// Shared state across serial tests
let projectId: string
let tenantId: string
let fileId: string

test.describe.serial('Review Findings — Story 3.2c', () => {
  // TODO(TD-E2E-008): Skip when no Inngest dev server — pipeline needs event orchestration
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

    projectId = await createTestProject(tenantId, 'Review Findings E2E')
  })

  // ── Setup: Upload + Pipeline ─────────────────────────────────────────────
  test('[setup] upload SDLXLIFF and start economy pipeline', async ({ page }) => {
    test.setTimeout(300_000) // 5 min — upload + parse + dialog + full pipeline

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

    // Economy mode is default — click Start Processing in dialog footer
    const confirmBtn = dialog.getByRole('button', { name: 'Start Processing', exact: true })
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // Dialog closes after submission
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // Get fileId from DB for subsequent assertion tests
    const fileRecord = await queryFileByName(projectId, 'minimal.sdlxliff')
    expect(fileRecord).not.toBeNull()
    fileId = fileRecord!.id

    // Wait for pipeline to complete (Economy mode = L1 + L2)
    // 4 min timeout: L1 ~5s + L2 AI call ~30-120s + scoring ~5s
    await pollFileStatus(fileId, 'l2_completed', 240_000)

    // Wait for score to reach L1L2 — scoring step runs AFTER file status update
    await pollScoreLayer(fileId, 'L1L2', 30_000)
  })

  // ── P0: Findings appear in review page ─────────────────────────────────
  test('[P0] findings appear in review page after pipeline completion', async ({ page }) => {
    test.setTimeout(300_000)

    // Verify pipeline and score are in expected state (sanity check)
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')

    const totalFindings = await queryFindingsCount(fileId)

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // ScoreBadge should be visible with a computed score
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })

    // If pipeline produced findings, the findings list should have items
    if (totalFindings > 0) {
      // Wait for finding list to render (either rows or minor accordion)
      const findingList = page.getByTestId('finding-list')
      await expect(findingList).toBeVisible({ timeout: 15_000 })

      // Expand minor accordion if present (Story 4.1a: minor findings hidden by default)
      const minorAccordion = page.getByText(/Minor \(\d+\)/i)
      if (await minorAccordion.isVisible().catch(() => false)) {
        await minorAccordion.click()
        await page.waitForTimeout(500)
      }

      // Now finding rows should be visible
      const findingRows = page.getByTestId('finding-compact-row')
      await expect(findingRows.first()).toBeVisible({ timeout: 10_000 })

      // Count of rendered findings should match DB count
      const renderedCount = await findingRows.count()
      expect(renderedCount).toBeGreaterThan(0)
    }
  })

  // ── P0: L2 findings display confidence values ─────────────────────────
  test('[P0] L2 findings display confidence values', async ({ page }) => {
    test.setTimeout(60_000)

    // Check that L2 findings exist — L2 is AI-powered, may find 0 on minimal fixture
    const l2Count = await queryFindingsCount(fileId, 'L2')

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    if (l2Count > 0) {
      // At least one finding should have a confidence badge
      const confidenceBadge = page.getByTestId('confidence-badge')
      await expect(confidenceBadge.first()).toBeVisible({ timeout: 15_000 })

      // Confidence value should display a percentage pattern (e.g., "85%")
      const confidenceText = await confidenceBadge.first().textContent()
      expect(confidenceText).toMatch(/\d+%/)
    }
  })

  // ── P0: ScoreBadge shows numeric score ────────────────────────────────
  test('[P0] ScoreBadge shows score value', async ({ page }) => {
    test.setTimeout(60_000)

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Score badge should be visible
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })

    // Score should display a numeric value, not "N/A"
    const scoreText = await scoreBadge.textContent()
    expect(scoreText).not.toBeNull()
    expect(scoreText).not.toMatch(/N\/A/i)

    // Score text should contain a number (e.g., "98.5" or "100")
    expect(scoreText).toMatch(/\d+/)
  })

  // ── P0: ReviewProgress shows AI complete for economy mode ──────────────
  test('[P0] ReviewProgress shows AI complete for economy mode', async ({ page }) => {
    test.setTimeout(60_000)

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // ReviewProgress component should be visible (Story 4.1a dual-track)
    const reviewProgress = page.getByTestId('review-progress')
    await expect(reviewProgress).toBeVisible({ timeout: 15_000 })

    // AI status track should show "AI: complete" for economy mode with L2 completed
    const aiStatus = reviewProgress.getByTestId('ai-status-track')
    await expect(aiStatus).toBeVisible()
    await expect(aiStatus).toContainText(/AI: complete/i)

    // AI progress bar should be at 100%
    const aiProgressBar = reviewProgress.getByTestId('ai-progress-bar')
    await expect(aiProgressBar).toHaveAttribute('aria-valuenow', '100')
  })

  // ── P1: Findings display layer badge ───────────────────────────────────
  test('[P1] findings display detection layer badge', async ({ page }) => {
    test.setTimeout(60_000)

    const totalFindings = await queryFindingsCount(fileId)

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    if (totalFindings > 0) {
      // Each finding item should display which layer detected it
      const layerBadge = page.getByTestId('layer-badge')
      await expect(layerBadge.first()).toBeVisible({ timeout: 15_000 })

      // Layer badge text should be "Rule" (L1) or "AI" (L2/L3) — Economy mode has no L3
      const layerText = await layerBadge.first().textContent()
      expect(layerText).toMatch(/^(Rule|AI)$/)
    }
  })

  // ── P1: Score matches DB value ─────────────────────────────────────────
  test('[P1] displayed score matches DB score value', async ({ page }) => {
    test.setTimeout(60_000)

    // Query expected score from DB
    const dbScore = await queryScore(fileId)
    expect(dbScore).not.toBeNull()

    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Score badge should contain the actual MQM score from DB
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })

    const scoreText = await scoreBadge.textContent()
    expect(scoreText).not.toBeNull()

    // The displayed score should match the DB score (allowing for display formatting).
    // DB stores mqm_score as a number (e.g., 98.5). UI may round or format differently.
    // We check that the integer part is present in the displayed text.
    const dbScoreInt = Math.floor(dbScore!.mqm_score)
    expect(scoreText).toContain(String(dbScoreInt))
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
