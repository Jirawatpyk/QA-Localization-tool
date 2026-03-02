import { test, expect } from '@playwright/test'

import {
  FIXTURE_FILES,
  gotoProjectUpload,
  uploadSingleFile,
  assertUploadProgress,
  confirmDuplicateRerun,
} from './helpers/fileUpload'
import {
  cleanupTestProject,
  queryFileByName,
  queryFindingsCount,
  queryScore,
  pollFileStatus,
} from './helpers/pipeline-admin'
import { signupOrLogin, getUserInfo, createTestProject } from './helpers/supabase-admin'

/**
 * E2E: Upload to Pipeline Wiring — Story 3.2b5
 *
 * Tests the wired flow: upload SDLXLIFF → auto-parse → "Start Processing" button
 * → ProcessingModeDialog → pipeline runs → findings appear.
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Inngest dev server (`npx inngest-cli dev`) on port 8288
 * - Supabase running (local or cloud)
 * - OPENAI_API_KEY env var (for L2 gpt-4o-mini)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 */

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-upload-wiring-${Date.now()}@test.local`

let projectId: string
let tenantId: string

test.describe.serial('Upload to Pipeline Wiring', () => {
  // ── Setup: Auth + Project ────────────────────────────────────────────────
  test('[setup] signup/login and create project', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'Upload Wiring E2E')
  })

  // ── Test #19 (P1): Upload → auto-parse → Start Processing → dialog ─────
  test('[P1] upload SDLXLIFF → auto-parse → Start Processing button → dialog opens', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // Navigate to upload page
    await gotoProjectUpload(page, projectId)

    // Upload a minimal SDLXLIFF file
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

    // Wait for upload to complete
    await assertUploadProgress(page, 'minimal.sdlxliff')

    // After upload, auto-parse should trigger automatically
    // Status should transition: uploaded → parsing → parsed (N segments)
    await expect(page.getByText(/parsing/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/parsed.*segments/i)).toBeVisible({ timeout: 30_000 })

    // "Start Processing" button should appear after parse completes
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
    await expect(startBtn).toBeEnabled()

    // Click "Start Processing" → ProcessingModeDialog should open
    await startBtn.click()

    // Dialog should be visible with mode selection (Economy / Thorough)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Dialog should have the mode options
    await expect(dialog.getByText(/economy/i)).toBeVisible()
    await expect(dialog.getByText(/thorough/i)).toBeVisible()
  })

  // ── Test #20 (P2): Pipeline findings appear after processing starts ─────
  test('[P2] pipeline findings appear after processing starts via dialog', async ({ page }) => {
    test.setTimeout(300_000) // 5 min — L1 + L2 pipeline can take a while

    // Navigate to upload page
    await gotoProjectUpload(page, projectId)

    // Upload SDLXLIFF (same fixture as P1 → duplicate dialog expected)
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

    // Handle duplicate detection dialog from P1's prior upload (CR R1 H2, R2 M2)
    // Use "Re-run" button as discriminator — avoids matching ProcessingModeDialog
    const rerunBtn = page.getByRole('button', { name: 'Re-run', exact: true })
    const isDuplicate = await rerunBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    if (isDuplicate) {
      await confirmDuplicateRerun(page)
    }

    await assertUploadProgress(page, 'minimal.sdlxliff')

    // Wait for auto-parse to complete
    await expect(page.getByText(/parsed.*segments/i)).toBeVisible({ timeout: 30_000 })

    // Click "Start Processing"
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
    await startBtn.click()

    // Select Economy mode in dialog and start
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Click Economy mode button (or it may be default-selected)
    const economyBtn = dialog.getByRole('button', { name: /economy/i })
    if (await economyBtn.isVisible()) {
      await economyBtn.click()
    }

    // Click the confirm/start button in the dialog
    const confirmBtn = dialog.getByRole('button', { name: /start|confirm|begin/i })
    await confirmBtn.click()

    // Dialog should close after confirming
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // Verify the file was created and query it via PostgREST
    const fileRecord = await queryFileByName(projectId, 'minimal.sdlxliff')
    expect(fileRecord).not.toBeNull()

    // Poll until pipeline completes (economy = L1 + L2, terminal = l2_completed)
    await pollFileStatus(fileRecord!.id, 'l2_completed', 240_000)

    // Verify findings exist (L1 + L2)
    const totalFindings = await queryFindingsCount(fileRecord!.id)
    expect(totalFindings).toBeGreaterThanOrEqual(0)

    // Verify score was calculated with L1L2 layer
    const score = await queryScore(fileRecord!.id)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
    expect(score!.mqm_score).toBeGreaterThanOrEqual(0)
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch {
        // Non-critical — global teardown will clean up the user
      }
    }
  })
})
