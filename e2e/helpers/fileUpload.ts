/**
 * File Upload E2E Helpers — Epic 2 Preparation (P3)
 *
 * Owner: Dana (QA Engineer)
 * Created: 2026-02-23 (Epic 1 Retrospective — Preparation Task P3)
 *
 * Covers:
 * - Single and multiple file upload via Playwright
 * - Upload progress bar assertions
 * - Large file rejection (>15MB)
 * - Duplicate file detection UI
 * - File status polling (uploaded → parsing → parsed)
 *
 * Usage: import these helpers into upload-segments.spec.ts (Story 2.1 E2E)
 */

import path from 'node:path'
import { expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches NFR8 and Architecture Decision 1.6 */
export const MAX_FILE_SIZE_MB = 15

/** Directory containing E2E fixture files */
export const FIXTURES_DIR = path.resolve(__dirname, '../fixtures')

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Navigate to the file upload area for a given project.
 * Requires the user to already be logged in.
 */
export async function gotoProjectUpload(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/upload`)
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// Single File Upload
// ---------------------------------------------------------------------------

/**
 * Upload a single file via the file input and wait for the upload to complete.
 *
 * @param page        Playwright Page
 * @param filePath    Absolute path to the file (use FIXTURES_DIR)
 * @param triggerSelector  data-testid of the upload trigger button (opens file chooser)
 *
 * NOTE: Next.js Route Handler processes the multipart form. The file chooser is
 * triggered by a button click — use browser_file_upload AFTER triggering the chooser.
 *
 * Pattern:
 *   1. Click the upload button (triggers file chooser)
 *   2. Use page.setInputFiles() on the hidden <input type="file"> directly
 *      (more reliable than waiting for the chooser dialog in CI)
 */
export async function uploadSingleFile(
  page: Page,
  filePath: string,
  inputSelector = '[data-testid="file-input"]',
): Promise<void> {
  await page.setInputFiles(inputSelector, filePath)
}

// ---------------------------------------------------------------------------
// Multiple File Upload
// ---------------------------------------------------------------------------

/**
 * Upload multiple files simultaneously via the file input.
 * Each file is tracked independently with its own status row.
 */
export async function uploadMultipleFiles(
  page: Page,
  filePaths: string[],
  inputSelector = '[data-testid="file-input"]',
): Promise<void> {
  await page.setInputFiles(inputSelector, filePaths)
}

// ---------------------------------------------------------------------------
// Progress Bar Assertions
// ---------------------------------------------------------------------------

/**
 * Assert that an upload progress bar is visible and reaches 100%.
 *
 * The progress bar should:
 * - Appear immediately after upload starts
 * - Update at least every 100ms (NFR requirement)
 * - Reach 100% and then show a success state
 *
 * @param filename  The filename as shown in the UI upload list
 */
export async function assertUploadProgress(page: Page, filename: string): Promise<void> {
  // Progress bar should be visible for this file
  const fileRow = page.getByTestId(`upload-row-${filename}`)
  await expect(fileRow).toBeVisible()

  const progressBar = fileRow.getByRole('progressbar')
  await expect(progressBar).toBeVisible()

  // Wait for upload to complete (progress bar disappears or shows success)
  await expect(fileRow.getByTestId('upload-status-success')).toBeVisible({
    timeout: 30_000,
  })
}

/**
 * Assert that all files in a batch upload complete successfully.
 */
export async function assertAllUploadsComplete(page: Page, filenames: string[]): Promise<void> {
  await Promise.all(filenames.map((name) => assertUploadProgress(page, name)))
}

// ---------------------------------------------------------------------------
// Large File Rejection (>15MB)
// ---------------------------------------------------------------------------

/**
 * Assert that a file exceeding MAX_FILE_SIZE_MB is rejected BEFORE being read
 * into memory. The rejection should happen at the Route Handler level.
 *
 * Expected error message (from Architecture Decision 1.6):
 * "File exceeds maximum size of 15MB. Please split the file in your CAT tool"
 */
export async function assertLargeFileRejected(page: Page, filename: string): Promise<void> {
  const errorMsg = page.getByText(
    'File exceeds maximum size of 15MB. Please split the file in your CAT tool',
    { exact: false },
  )
  await expect(errorMsg).toBeVisible({ timeout: 10_000 })

  // Confirm the file did NOT appear in the processed file list
  const fileRow = page.getByTestId(`upload-row-${filename}`)
  await expect(fileRow).not.toBeVisible()
}

/**
 * Assert that a file between 10–15MB shows the size warning but proceeds.
 *
 * Expected warning message:
 * "Large file — processing may be slower"
 */
export async function assertLargeFileWarning(page: Page): Promise<void> {
  await expect(
    page.getByText('Large file — processing may be slower', { exact: false }),
  ).toBeVisible({ timeout: 5_000 })
}

// ---------------------------------------------------------------------------
// Duplicate File Detection
// ---------------------------------------------------------------------------

/**
 * Assert that uploading the same file twice triggers the duplicate detection UI.
 *
 * Expected dialog options (FR6):
 * - "Re-run" button
 * - "Cancel" button
 * - Shows original upload date and previous score
 *
 * @param expectedScore  Optional: assert the previous score is shown in the dialog
 */
export async function assertDuplicateDetected(page: Page, expectedScore?: number): Promise<void> {
  // Duplicate detection dialog should appear
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  // Should show "was uploaded on [date]" text
  await expect(dialog.getByText('This file was uploaded on', { exact: false })).toBeVisible()

  // Should have Re-run and Cancel options
  await expect(dialog.getByRole('button', { name: 'Re-run', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()

  // Optionally assert the previous score is shown
  if (expectedScore !== undefined) {
    await expect(dialog.getByText(`Score ${expectedScore}`, { exact: false })).toBeVisible()
  }
}

/**
 * Confirm re-run on the duplicate detection dialog.
 */
export async function confirmDuplicateRerun(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Re-run', exact: true }).click()
  // Dialog should close after confirmation
  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
}

/**
 * Cancel on the duplicate detection dialog.
 */
export async function cancelDuplicateRerun(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
}

// ---------------------------------------------------------------------------
// File Status Polling (DB-level status)
// ---------------------------------------------------------------------------

/**
 * Wait for a file's processing status to reach a target state.
 * The UI should reflect the status via Supabase Realtime or polling.
 *
 * Status progression: uploaded → parsing → parsed (or failed)
 *
 * @param filename      The filename as displayed in the UI
 * @param targetStatus  The status to wait for: 'parsing' | 'parsed' | 'failed'
 * @param timeout       Max wait in ms (default 60s — parsing can be slow for large files)
 */
export async function waitForFileStatus(
  page: Page,
  filename: string,
  targetStatus: 'parsing' | 'parsed' | 'failed',
  timeout = 60_000,
): Promise<void> {
  const fileRow = page.getByTestId(`upload-row-${filename}`)
  await expect(fileRow).toBeVisible()

  const statusBadge = fileRow.getByTestId('file-status-badge')
  await expect(statusBadge).toHaveText(targetStatus, {
    ignoreCase: true,
    timeout,
  })
}

// ---------------------------------------------------------------------------
// Fixture File Paths (for tests to import)
// ---------------------------------------------------------------------------

export const FIXTURE_FILES = {
  /** Minimal SDLXLIFF file — valid, small, fast to process */
  sdlxliffMinimal: path.join(FIXTURES_DIR, 'sdlxliff', 'minimal.sdlxliff'),
  /** SDLXLIFF with sdl: namespaces and inline tags */
  sdlxliffWithNamespaces: path.join(FIXTURES_DIR, 'sdlxliff', 'with-namespaces.sdlxliff'),
  /** Standard XLIFF 1.2 */
  xliff12: path.join(FIXTURES_DIR, 'xliff', 'standard.xliff'),
  /** Excel bilingual format */
  excelBilingual: path.join(FIXTURES_DIR, 'excel', 'bilingual.xlsx'),
  /** Text file — should be rejected (wrong format) */
  invalidFormat: path.join(FIXTURES_DIR, 'invalid', 'not-a-translation-file.txt'),
} as const
