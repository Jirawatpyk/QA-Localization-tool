import { test, expect } from '@playwright/test'

import {
  FIXTURE_FILES,
  gotoProjectUpload,
  uploadMultipleFiles,
  assertAllUploadsComplete,
} from './helpers/fileUpload'
import { cleanupTestProject, queryFileByName } from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

/**
 * Story 2.1 — Multi-file Upload (E2E)
 *
 * 2.1-E2E-001 [P1]: Upload multiple SDLXLIFF files simultaneously
 * → all complete → auto-parse → verify segments > 0
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Supabase running (local or cloud)
 * - E2E fixture files in e2e/fixtures/sdlxliff/
 */

const TEST_EMAIL = `e2e-upload-multi-${Date.now()}@test.local`

let projectId: string
let tenantId: string

test.describe.serial('Multi-file Upload (Story 2.1)', () => {
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

    projectId = await createTestProject(tenantId, 'Multi Upload E2E')
  })

  // ── Test: Multi-file upload → auto-parse → segments > 0 ────────────────
  test('[P1] upload multiple SDLXLIFF files → auto-parse → segments visible', async ({ page }) => {
    test.setTimeout(120_000)

    // Each Playwright test gets a fresh page — must re-authenticate
    await signupOrLogin(page, TEST_EMAIL)

    // Navigate to upload page
    await gotoProjectUpload(page, projectId)

    // Upload 2 SDLXLIFF files simultaneously
    await uploadMultipleFiles(page, [
      FIXTURE_FILES.sdlxliffMinimal,
      FIXTURE_FILES.sdlxliffWithNamespaces,
    ])

    // Wait for all uploads to complete (progress bar disappears)
    await assertAllUploadsComplete(page, ['minimal.sdlxliff', 'with-namespaces.sdlxliff'])

    // After upload, auto-parse should trigger automatically.
    // "Parsing..." state is transient (may pass too quickly for CI to observe),
    // so we wait for the terminal indicator: "Start Processing" button appears
    // (which requires parsedFileIds > 0).
    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 60_000 })

    // Verify both files show "Parsed (N segments)" in the upload progress list.
    const minimalRow = page.getByTestId('upload-row-minimal.sdlxliff')
    await expect(minimalRow).toBeVisible()
    await expect(minimalRow.getByText(/Parsed \(\d+ segments?\)/)).toBeVisible({ timeout: 10_000 })

    const namespacesRow = page.getByTestId('upload-row-with-namespaces.sdlxliff')
    await expect(namespacesRow).toBeVisible()
    await expect(namespacesRow.getByText(/Parsed \(\d+ segments?\)/)).toBeVisible({
      timeout: 10_000,
    })

    // Verify files exist in DB with parsed status via PostgREST
    const minimalFile = await queryFileByName(projectId, 'minimal.sdlxliff')
    expect(minimalFile).not.toBeNull()
    expect(minimalFile!.status).toBe('parsed')

    const namespacesFile = await queryFileByName(projectId, 'with-namespaces.sdlxliff')
    expect(namespacesFile).not.toBeNull()
    expect(namespacesFile!.status).toBe('parsed')
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
