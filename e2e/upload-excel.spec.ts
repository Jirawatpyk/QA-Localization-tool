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
  querySegmentsCount,
  queryFirstSegment,
} from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

/**
 * E2E: Excel Bilingual Upload — Story 2.3
 *
 * Tests the Excel upload flow: upload .xlsx → Column Mapping Dialog
 * → auto-detect columns → Confirm & Parse → verify segments in DB.
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Supabase running (local or cloud)
 * - E2E fixture file: e2e/fixtures/excel/bilingual-sample.xlsx
 */

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-upload-excel-${Date.now()}@test.local`

let projectId: string
let cancelProjectId: string
let tenantId: string

test.describe.serial('Excel Upload Flow', () => {
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

    projectId = await createTestProject(tenantId, 'Excel Upload E2E')
  })

  // ── Test P1: Upload xlsx → Column Mapping → Confirm & Parse → verify ───
  test('[P1] upload xlsx → auto-detect columns → Confirm & Parse → verify segments → Start Processing', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // Each Playwright test gets a fresh page — must re-authenticate
    await signupOrLogin(page, TEST_EMAIL)

    // Navigate to upload page
    await gotoProjectUpload(page, projectId)

    // Upload the Excel bilingual fixture
    await uploadSingleFile(page, FIXTURE_FILES.excelBilingual)

    // Wait for upload to complete (progress bar disappears)
    await assertUploadProgress(page, 'bilingual-sample.xlsx')

    // Column Mapping Dialog should auto-open for xlsx files
    const dialog = page.getByRole('dialog', { name: /column mapping/i })
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Preview table should show data rows
    // The fixture has 5 data rows — verify at least one preview row is visible
    const previewTable = dialog.locator('table')
    await expect(previewTable).toBeVisible({ timeout: 10_000 })

    // Verify headers are shown (Source, Target, Segment ID)
    await expect(dialog.getByRole('columnheader', { name: 'Source' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: 'Target' })).toBeVisible()
    await expect(dialog.getByRole('columnheader', { name: 'Segment ID' })).toBeVisible()

    // Auto-detect should have pre-filled Source and Target columns
    // Verified by the "✓ auto" badge text near each label
    await expect(dialog.getByText('✓ auto').first()).toBeVisible()

    // Verify the Source Column select shows "Source" (auto-detected)
    const sourceTrigger = dialog.getByRole('combobox', { name: 'Source Column' })
    await expect(sourceTrigger).toBeVisible()
    await expect(sourceTrigger).toHaveText(/Source/)

    // Verify the Target Column select shows "Target" (auto-detected)
    const targetTrigger = dialog.getByRole('combobox', { name: 'Target Column' })
    await expect(targetTrigger).toBeVisible()
    await expect(targetTrigger).toHaveText(/Target/)

    // "Confirm & Parse" button should be enabled (both required columns selected)
    const confirmBtn = dialog.getByRole('button', { name: 'Confirm & Parse' })
    await expect(confirmBtn).toBeEnabled()

    // Click "Confirm & Parse"
    await confirmBtn.click()

    // Dialog should close after successful parse
    await expect(dialog).not.toBeVisible({ timeout: 30_000 })

    // Toast should show success message with segment count
    await expect(page.getByText(/parsed 5 segments successfully/i)).toBeVisible({ timeout: 10_000 })

    // Verify segments in DB via PostgREST
    const fileRecord = await queryFileByName(projectId, 'bilingual-sample.xlsx')
    expect(fileRecord).not.toBeNull()

    // Segment count should be 5 (fixture has 5 data rows)
    const segmentCount = await querySegmentsCount(fileRecord!.id)
    expect(segmentCount).toBe(5)

    // First segment should match fixture row 1: 'Hello' / 'สวัสดี'
    const firstSegment = await queryFirstSegment(fileRecord!.id)
    expect(firstSegment).not.toBeNull()
    expect(firstSegment!.source_text).toBe('Hello')
    expect(firstSegment!.target_text).toBe('สวัสดี')

    // "Start Processing" button should appear with correct file count
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
    await expect(startBtn).toBeEnabled()
    await expect(startBtn).toHaveText(/1 files/i)
  })

  // ── Test P2: Upload xlsx → column mapping dialog → cancel → file stays ──
  test('[P2] upload xlsx → column mapping dialog → cancel → file stays', async ({ page }) => {
    test.setTimeout(120_000)

    // Use a fresh project to avoid duplicate detection from P1
    cancelProjectId = await createTestProject(tenantId, 'Excel Cancel E2E')

    // Each Playwright test gets a fresh page — must re-authenticate
    await signupOrLogin(page, TEST_EMAIL)

    // Navigate to the fresh project's upload page
    await gotoProjectUpload(page, cancelProjectId)

    // Upload the Excel bilingual fixture (fresh project = no duplicate)
    await uploadSingleFile(page, FIXTURE_FILES.excelBilingual)

    // Wait for upload to complete
    await assertUploadProgress(page, 'bilingual-sample.xlsx')

    // Column Mapping Dialog should auto-open for xlsx files
    const dialog = page.getByRole('dialog', { name: /column mapping/i })
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Click "Cancel" — dialog should close, file stays in uploaded status
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel', exact: true })
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // File row should still be visible (cancel does NOT delete the uploaded file)
    const fileRow = page.getByTestId('upload-row-bilingual-sample.xlsx')
    await expect(fileRow).toBeVisible()

    // No error toast should appear
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
  })

  // ── Test P3: Duplicate rerun → re-upload succeeds → column mapping opens ─
  test('[P3] duplicate rerun → re-upload succeeds → column mapping dialog opens', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // Re-authenticate (fresh page in serial mode)
    await signupOrLogin(page, TEST_EMAIL)

    // Navigate to same project as P1 (file already parsed there)
    await gotoProjectUpload(page, projectId)

    // Re-upload same file — triggers duplicate detection
    await uploadSingleFile(page, FIXTURE_FILES.excelBilingual)

    // Duplicate detection dialog should appear
    const rerunBtn = page.getByRole('button', { name: 'Re-run QA' })
    await expect(rerunBtn).toBeVisible({ timeout: 30_000 })

    // Confirm re-run — this previously caused "Storage error" (route handler bug)
    await confirmDuplicateRerun(page)

    // Wait for re-upload to complete (should succeed now with route handler fix)
    await assertUploadProgress(page, 'bilingual-sample.xlsx')

    // Column Mapping Dialog should auto-open for the re-uploaded xlsx
    const dialog = page.getByRole('dialog', { name: /column mapping/i })
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // No error toast should appear
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)

    // Cancel — we already tested Confirm & Parse in P1
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel', exact: true })
    await cancelBtn.click()
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    const projectIds = [projectId, cancelProjectId].filter(Boolean)
    for (const pid of projectIds) {
      try {
        await cleanupTestProject(pid)
      } catch (err) {
        // Non-critical — global teardown will clean up the user
        console.warn(`[cleanup] Failed to clean project ${pid}:`, err)
      }
    }
  })
})
