import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

import { signupOrLogin } from './helpers/supabase-admin'

/**
 * Story 2.7 — Parity Comparison Tool (E2E — RED PHASE)
 *
 * AC Coverage:
 *   AC #4: Upload Xbench xlsx report → parity comparison results
 *   AC #5: Report Missing Check dialog with tracking reference
 *
 * Prerequisites:
 *   - Project with completed L1 processing (findings in DB)
 *   - Xbench xlsx report fixture for comparison
 *   - Auth setup via signupOrLogin helper
 *
 * Route under test (DOES NOT EXIST YET):
 *   /projects/[projectId]/parity — Parity Comparison tool
 */

const TEST_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-parity27@test.local'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

// Placeholder ID — will be replaced with real ID when page exists
const PROJECT_ID = 'placeholder-project-id'

// Fixture paths — Xbench reports are xlsx format
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const XBENCH_REPORT_FIXTURE = path.join(FIXTURES_DIR, 'excel', 'bilingual-sample.xlsx')
const INVALID_FILE_FIXTURE = path.join(FIXTURES_DIR, 'sdlxliff', 'minimal.sdlxliff')

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

test.describe('Parity Comparison Tool (Story 2.7)', () => {
  test.skip('[P1] should navigate to parity page via ProjectSubNav Parity tab', async ({
    page,
  }) => {
    // Setup: login and navigate to an existing project page
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/upload`)

    // ProjectSubNav should have a "Parity" tab (added in Task 7.10)
    const projectNav = page.getByLabel('Project navigation')
    const parityTab = projectNav.getByRole('link', { name: 'Parity' })
    await expect(parityTab).toBeVisible({ timeout: 10000 })

    // Click the Parity tab
    await parityTab.click()

    // URL should change to /projects/[projectId]/parity
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}/parity`))

    // Parity page content should load — upload zone or empty state
    const parityContent = page
      .getByTestId('parity-upload-zone')
      .or(page.getByText(/Upload.*Xbench/i))
    await expect(parityContent).toBeVisible({ timeout: 10000 })
  })

  test.skip('[P1] should upload Xbench xlsx report and display parity comparison results', async ({
    page,
  }) => {
    // Setup: login and navigate to parity page
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/parity`)

    // AC #4: Upload zone for Xbench xlsx file
    const uploadZone = page.getByTestId('parity-upload-zone')
    await expect(uploadZone).toBeVisible({ timeout: 10000 })

    // Upload the Xbench xlsx report via file input
    const fileInput = page
      .locator('[data-testid="parity-file-input"]')
      .or(uploadZone.locator('input[type="file"]'))
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)

    // Wait for comparison to complete (server action processes xlsx + compares)
    await expect(
      page.getByTestId('parity-results-table').or(page.getByText(/Comparison Results/i)),
    ).toBeVisible({ timeout: 30000 })

    // AC #4: ParityResultsTable shows 3 sections
    // [Both Found] — findings matched between tool and Xbench
    const bothFoundSection = page
      .getByTestId('parity-section-both-found')
      .or(page.getByRole('region', { name: /Both Found/i }))
    await expect(bothFoundSection).toBeVisible()

    // [Tool Only] — findings in tool but not in Xbench
    const toolOnlySection = page
      .getByTestId('parity-section-tool-only')
      .or(page.getByRole('region', { name: /Tool Only/i }))
    await expect(toolOnlySection).toBeVisible()

    // [Xbench Only] — findings in Xbench but not in tool (parity gaps)
    const xbenchOnlySection = page
      .getByTestId('parity-section-xbench-only')
      .or(page.getByRole('region', { name: /Xbench Only/i }))
    await expect(xbenchOnlySection).toBeVisible()

    // Each section should show a count
    await expect(bothFoundSection.getByTestId('parity-section-count')).toBeVisible()
    await expect(toolOnlySection.getByTestId('parity-section-count')).toBeVisible()
    await expect(xbenchOnlySection.getByTestId('parity-section-count')).toBeVisible()
  })

  test.skip('[P2] should highlight Xbench Only findings as parity gaps with correct styling', async ({
    page,
  }) => {
    // Setup: login and navigate to parity page with completed comparison
    // (assumes previous test uploaded a report, or pre-seeded data exists)
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/parity`)

    // Upload report first to trigger comparison
    const fileInput = page
      .locator('[data-testid="parity-file-input"]')
      .or(page.locator('input[type="file"]'))
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)

    // Wait for results
    await expect(
      page.getByTestId('parity-results-table').or(page.getByText(/Comparison Results/i)),
    ).toBeVisible({ timeout: 30000 })

    // AC #4: Visual treatment per section
    // [Xbench Only] — red/destructive styling (parity gaps)
    const xbenchOnlySection = page.getByTestId('parity-section-xbench-only')
    await expect(xbenchOnlySection).toBeVisible()
    const xbenchVariant = await xbenchOnlySection.getAttribute('data-variant')
    expect(xbenchVariant).toBe('destructive')

    // [Both Found] — green/success styling
    const bothFoundSection = page.getByTestId('parity-section-both-found')
    await expect(bothFoundSection).toBeVisible()
    const bothVariant = await bothFoundSection.getAttribute('data-variant')
    expect(bothVariant).toBe('success')

    // [Tool Only] — blue/info styling
    const toolOnlySection = page.getByTestId('parity-section-tool-only')
    await expect(toolOnlySection).toBeVisible()
    const toolVariant = await toolOnlySection.getAttribute('data-variant')
    expect(toolVariant).toBe('info')
  })

  test.skip('[P2] should open Report Missing Check dialog and submit report', async ({ page }) => {
    // Setup: login and navigate to parity page with Xbench Only results
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/parity`)

    // Upload report to get results
    const fileInput = page
      .locator('[data-testid="parity-file-input"]')
      .or(page.locator('input[type="file"]'))
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)
    await expect(
      page.getByTestId('parity-results-table').or(page.getByText(/Comparison Results/i)),
    ).toBeVisible({ timeout: 30000 })

    // AC #5: Click "Report Missing Check" button on an Xbench Only finding
    const xbenchOnlySection = page.getByTestId('parity-section-xbench-only')
    const reportButton = xbenchOnlySection
      .getByRole('button', { name: /Report Missing Check/i })
      .first()
    await reportButton.click()

    // Dialog opens with form fields
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // AC #5: Form fields — file reference, segment number, description, check type
    const fileReferenceInput = dialog.getByLabel(/File Reference/i)
    await expect(fileReferenceInput).toBeVisible()
    await fileReferenceInput.fill('test-file.sdlxliff')

    const segmentNumberInput = dialog.getByLabel(/Segment Number/i)
    await expect(segmentNumberInput).toBeVisible()
    await segmentNumberInput.fill('42')

    const descriptionInput = dialog.getByLabel(/Description/i)
    await expect(descriptionInput).toBeVisible()
    await descriptionInput.fill('Missing tag mismatch check for inline <bpt> elements')

    const checkTypeInput = dialog.getByLabel(/Check Type/i)
    await expect(checkTypeInput).toBeVisible()
    await checkTypeInput.fill('Tag Mismatch')

    // Submit the report
    await dialog.getByRole('button', { name: /Submit/i }).click()

    // AC #5: Success toast with tracking reference (MCR-YYYYMMDD-XXXXXX format)
    const successToast = page.getByText(/MCR-\d{8}-[A-Z0-9]{6}/i)
    await expect(successToast).toBeVisible({ timeout: 10000 })

    // Dialog should close after successful submission
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })

  test.skip('[P2] should show validation errors in Report Missing Check dialog', async ({
    page,
  }) => {
    // Setup: login and navigate to parity page with results
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/parity`)

    // Upload report to get results
    const fileInput = page
      .locator('[data-testid="parity-file-input"]')
      .or(page.locator('input[type="file"]'))
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)
    await expect(
      page.getByTestId('parity-results-table').or(page.getByText(/Comparison Results/i)),
    ).toBeVisible({ timeout: 30000 })

    // Open Report Missing Check dialog
    const xbenchOnlySection = page.getByTestId('parity-section-xbench-only')
    const reportButton = xbenchOnlySection
      .getByRole('button', { name: /Report Missing Check/i })
      .first()
    await reportButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Submit without filling any fields
    await dialog.getByRole('button', { name: /Submit/i }).click()

    // Validation error messages should appear for required fields
    await expect(
      dialog.getByText(/File reference is required/i).or(dialog.getByText(/required/i).first()),
    ).toBeVisible({ timeout: 5000 })

    // Dialog should remain open (not close on validation failure)
    await expect(dialog).toBeVisible()
  })

  test.skip('[P2] should show error state when invalid file is uploaded', async ({ page }) => {
    // Setup: login and navigate to parity page
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    await page.goto(`/projects/${PROJECT_ID}/parity`)

    // AC #4: Upload a non-xlsx file (e.g., SDLXLIFF — wrong format for Xbench report)
    const uploadZone = page.getByTestId('parity-upload-zone')
    await expect(uploadZone).toBeVisible({ timeout: 10000 })

    const fileInput = page
      .locator('[data-testid="parity-file-input"]')
      .or(uploadZone.locator('input[type="file"]'))
    await fileInput.setInputFiles(INVALID_FILE_FIXTURE)

    // Error message should be displayed (not a crash)
    const errorMessage = page
      .getByText(/Invalid.*file/i)
      .or(page.getByText(/not a valid.*xlsx/i))
      .or(page.getByText(/upload.*xlsx/i))
    await expect(errorMessage).toBeVisible({ timeout: 10000 })

    // The parity results table should NOT appear
    await expect(page.getByTestId('parity-results-table')).not.toBeVisible()
  })
})
