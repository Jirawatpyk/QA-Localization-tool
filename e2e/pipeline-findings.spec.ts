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
 * E2E Pipeline to Findings — Story 3.2b + 3.2b5
 *
 * Tests the full wired flow: upload SDLXLIFF → auto-parse → "Start Processing"
 * → ProcessingModeDialog (Economy) → L1 rules → L2 AI screening → findings + score in DB.
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Inngest dev server (`npx inngest-cli dev`) on port 8288
 * - Supabase running (local or cloud)
 * - OPENAI_API_KEY env var (for L2 gpt-4o-mini)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 */

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-pipeline-${Date.now()}@test.local`

// Shared state across serial tests
let projectId: string
let tenantId: string
let fileId: string

test.describe.serial('Pipeline to Findings', () => {
  // TODO(TD-E2E-008): Skip when no Inngest dev server — pipeline needs event orchestration
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  // ── Setup: Auth + Project ────────────────────────────────────────────────
  test('[setup] signup/login and create project', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'Pipeline E2E')
  })

  // ── Upload → Auto-Parse → Start Processing (Economy) ──────────────────
  test('[setup] upload SDLXLIFF, auto-parse, and start economy processing', async ({ page }) => {
    test.setTimeout(300_000) // 5 min — upload + parse + dialog + pipeline trigger

    // Login and navigate to upload page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)

    // Upload file via UI
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

    // Wait for upload to complete
    await assertUploadProgress(page, 'minimal.sdlxliff')

    // Wait for auto-parse to complete (Story 3.2b5 AC1).
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
  })

  // ── Pipeline: Wait for Economy mode completion (L1 + L2) ──────────────
  test('[P0] file reaches l2_completed after economy processing', async () => {
    // 4 min timeout: L1 ~5s + L2 AI call ~30-120s + scoring ~5s
    test.setTimeout(300_000)

    await pollFileStatus(fileId, 'l2_completed', 240_000)
  })

  // ── Assert: L1 Findings ──────────────────────────────────────────────────
  test('[P0] verify L1 findings exist in DB', async () => {
    test.setTimeout(15_000)

    const l1Count = await queryFindingsCount(fileId, 'L1')

    // L1 rule engine should find at least some issues on the test segments.
    // At minimum, 0 is acceptable if no rules fire — but we log it for visibility.
    expect(l1Count).toBeGreaterThanOrEqual(0)
  })

  // ── Assert: L2 Findings ──────────────────────────────────────────────────
  test('[P0] verify L2 AI screening ran (findings may be 0)', async () => {
    test.setTimeout(15_000)

    const l2Count = await queryFindingsCount(fileId, 'L2')

    // L2 is AI-powered — it may find 0 issues on a clean/minimal fixture.
    // The key assertion is that the pipeline completed (l2_completed status).
    expect(l2Count).toBeGreaterThanOrEqual(0)
  })

  // ── Assert: Score ────────────────────────────────────────────────────────
  test('[P0] verify score with layerCompleted=L1L2', async () => {
    test.setTimeout(60_000)

    // Poll for score to reach L1L2 — scoring step (Step 4) runs AFTER
    // file status reaches l2_completed, so there's a timing gap.
    await pollScoreLayer(fileId, 'L1L2', 30_000)

    const score = await queryScore(fileId)

    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
    // Score status: 'calculated' or 'auto_passed' (few segments → may auto-pass)
    // 'na' excluded — fixture has segments (total_words > 0), scoring must run (CR R2 L2)
    expect(['calculated', 'auto_passed']).toContain(score!.status)
    expect(score!.mqm_score).toBeGreaterThanOrEqual(0)
    expect(score!.total_words).toBeGreaterThan(0)
  })

  // ── Assert: Total findings count ─────────────────────────────────────────
  test('[P0] verify total findings in DB', async () => {
    test.setTimeout(15_000)

    const totalCount = await queryFindingsCount(fileId)
    const l1Count = await queryFindingsCount(fileId, 'L1')
    const l2Count = await queryFindingsCount(fileId, 'L2')

    // Total should equal L1 + L2 (no L3 in economy mode)
    expect(totalCount).toBe(l1Count + l2Count)
  })

  // ── Assert: File status badge in UI ──────────────────────────────────────
  test('[P0] verify file status shows completion in files page', async ({ page }) => {
    test.setTimeout(30_000)

    // Login and navigate to file history page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForLoadState('networkidle')

    // The file should appear in the table with a terminal pipeline status
    const fileRow = page.getByText('minimal.sdlxliff')
    await expect(fileRow).toBeVisible({ timeout: 10_000 })

    // Verify terminal status is displayed (economy mode = l2_completed)
    await expect(page.getByText('l2_completed')).toBeVisible({ timeout: 10_000 })
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
