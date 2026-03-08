import path from 'node:path'
import fs from 'node:fs'

import { test, expect } from '@playwright/test'

import { FIXTURES_DIR, gotoProjectUpload, uploadSingleFile } from './helpers/fileUpload'
import { cleanupTestProject, queryFileByName } from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

/**
 * Story 2.1 — Upload Rejection (E2E)
 *
 * 2.1-E2E-003 [P2]: Upload unsupported file format → error displayed in UI
 *
 * NOTE: The HTML <input accept="..."> attribute restricts native file chooser,
 * but Playwright's setInputFiles bypasses that filter, so the client-side
 * validation in useFileUpload (getFileType check) handles rejection.
 *
 * Prerequisites:
 * - Next.js dev server (`npm run dev`) on port 3000
 * - Supabase running (local or cloud)
 */

const TEST_EMAIL = `e2e-upload-reject-${Date.now()}@test.local`

let projectId: string
let tenantId: string

const UNSUPPORTED_PDF_PATH = path.join(FIXTURES_DIR, 'invalid', 'test-document.pdf')

test.describe.serial('Upload Rejection (Story 2.1)', () => {
  // ── Setup: Auth + Project + fixture files ───────────────────────────────
  test('[setup] signup/login, create project, and prepare fixtures', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'Upload Rejection E2E')

    // Create invalid fixture files if they don't exist
    const invalidDir = path.join(FIXTURES_DIR, 'invalid')
    if (!fs.existsSync(invalidDir)) {
      fs.mkdirSync(invalidDir, { recursive: true })
    }
    const txtPath = path.join(invalidDir, 'not-a-translation-file.txt')
    if (!fs.existsSync(txtPath)) {
      fs.writeFileSync(txtPath, 'This is not a translation file.')
    }
    if (!fs.existsSync(UNSUPPORTED_PDF_PATH)) {
      fs.writeFileSync(UNSUPPORTED_PDF_PATH, '%PDF-1.4 dummy content for E2E test')
    }
  })

  // ── Test: Unsupported .txt file → error in UI ─────────────────────────
  test('[P2] upload unsupported .txt file → error displayed', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)

    const txtPath = path.join(FIXTURES_DIR, 'invalid', 'not-a-translation-file.txt')

    // Upload the unsupported .txt file
    await uploadSingleFile(page, txtPath)

    // Error message should appear from UploadProgressList rendering 'UNSUPPORTED_FORMAT'
    const errorMsg = page.getByText('Unsupported file format', { exact: false })
    await expect(errorMsg).toBeVisible({ timeout: 10_000 })

    // The upload row should show error state
    const fileRow = page.getByTestId('upload-row-not-a-translation-file.txt')
    await expect(fileRow).toBeVisible()

    // Verify the file was NOT saved to the database
    const fileRecord = await queryFileByName(projectId, 'not-a-translation-file.txt')
    expect(fileRecord).toBeNull()
  })

  // ── Test: Unsupported .pdf file → error in UI ─────────────────────────
  test('[P2] upload unsupported .pdf file → error displayed', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)

    // Upload the .pdf file — Playwright bypasses HTML accept filter
    await uploadSingleFile(page, UNSUPPORTED_PDF_PATH)

    // Error message should appear
    const errorMsg = page.getByText('Unsupported file format', { exact: false })
    await expect(errorMsg).toBeVisible({ timeout: 10_000 })

    // Upload row should exist with error state
    const fileRow = page.getByTestId('upload-row-test-document.pdf')
    await expect(fileRow).toBeVisible()

    // Verify file was NOT persisted to DB
    const fileRecord = await queryFileByName(projectId, 'test-document.pdf')
    expect(fileRecord).toBeNull()
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
