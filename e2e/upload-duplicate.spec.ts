import { test, expect } from '@playwright/test'

import {
  FIXTURE_FILES,
  gotoProjectUpload,
  uploadSingleFile,
  assertUploadProgress,
  assertDuplicateDetected,
  confirmDuplicateRerun,
} from './helpers/fileUpload'
import { cleanupTestProject } from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

/**
 * Story 2.1 — Duplicate Detection (E2E)
 *
 * 2.1-E2E-002 [P1]: Upload same file twice → duplicate dialog → confirm re-run → upload proceeds
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Supabase running (local or cloud)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 */

const TEST_EMAIL = `e2e-upload-dup-${Date.now()}@test.local`

let projectId: string
let tenantId: string

test.describe.serial('Duplicate File Detection (Story 2.1)', () => {
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

    projectId = await createTestProject(tenantId, 'Duplicate Upload E2E')
  })

  // ── Test: First upload succeeds ────────────────────────────────────────
  test('[P1] first upload completes successfully and auto-parses', async ({ page }) => {
    test.setTimeout(120_000)

    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)

    // Upload the minimal SDLXLIFF file
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

    // Wait for upload to complete
    await assertUploadProgress(page, 'minimal.sdlxliff')

    // Wait for auto-parse to finish — "Start Processing" button is the terminal indicator
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 60_000 })
  })

  // ── Test: Duplicate detection → dialog → confirm re-run ───────────────
  test('[P1] second upload triggers duplicate dialog → re-run succeeds', async ({ page }) => {
    test.setTimeout(120_000)

    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)

    // Upload the SAME file again → duplicate detection should trigger
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

    // Duplicate detection dialog should appear with upload date and score info
    await assertDuplicateDetected(page)

    // Confirm re-run
    await confirmDuplicateRerun(page)

    // After re-run confirmation, upload should proceed.
    // Wait for upload to complete (progress bar disappears).
    await assertUploadProgress(page, 'minimal.sdlxliff')

    // After upload completes, auto-parse should trigger again.
    // Wait for "Start Processing" button as terminal indicator.
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 60_000 })
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
