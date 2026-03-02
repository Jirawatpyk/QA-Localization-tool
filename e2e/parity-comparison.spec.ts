import path from 'node:path'

import { test, expect } from '@playwright/test'

import { cleanupTestProject } from './helpers/pipeline-admin'
import { createTestProject, getUserInfo, signupOrLogin } from './helpers/supabase-admin'

/**
 * Story 2.7 — Parity Comparison Tool (E2E)
 *
 * AC Coverage:
 *   AC #4: Upload Xbench xlsx report → parity comparison results
 *
 * Route under test:
 *   /projects/[projectId]/parity — ParityComparisonView
 */

// E2E runs in Node (Playwright worker) — process.env access is safe here (not client bundle)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const TEST_EMAIL = `e2e-parity-${Date.now()}@test.local`

let projectId: string
let tenantId: string

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const XBENCH_REPORT_FIXTURE = path.join(FIXTURES_DIR, 'excel', 'bilingual-sample.xlsx')
const INVALID_FILE_FIXTURE = path.join(FIXTURES_DIR, 'sdlxliff', 'minimal.sdlxliff')

function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  }
}

async function seedFinding(
  pId: string,
  tId: string,
  data: {
    severity: string
    category: string
    description: string
    sourceTextExcerpt?: string
    targetTextExcerpt?: string
  },
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      project_id: pId,
      tenant_id: tId,
      severity: data.severity,
      category: data.category,
      description: data.description,
      detected_by_layer: 'L1',
      source_text_excerpt: data.sourceTextExcerpt ?? 'test source',
      target_text_excerpt: data.targetTextExcerpt ?? 'test target',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to seed finding: ${res.status} ${text}`)
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Parity Comparison Tool (Story 2.7)', () => {
  test('[setup] signup/login and create project with findings', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'Parity E2E')

    // Seed L1 findings for comparison
    await seedFinding(projectId, tenantId, {
      severity: 'major',
      category: 'Key Term Mismatch',
      description: 'Term mismatch: expected "application" but found "app"',
      sourceTextExcerpt: 'The application is ready',
      targetTextExcerpt: 'แอปพร้อมแล้ว',
    })
    await seedFinding(projectId, tenantId, {
      severity: 'minor',
      category: 'Number Mismatch',
      description: 'Number format mismatch: 1,000 vs 1000',
    })
  })

  test('[P1] should navigate to parity page via ProjectSubNav Parity tab', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/upload`)

    const projectNav = page.getByLabel('Project navigation')
    const parityTab = projectNav.getByRole('link', { name: 'Parity' })
    await expect(parityTab).toBeVisible({ timeout: 10_000 })

    await parityTab.click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/parity`))

    // Parity page content should load (use specific heading to avoid strict mode from .or())
    await expect(page.getByRole('heading', { name: /Xbench Parity Comparison/i })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('[P1] should upload Xbench xlsx report and display parity comparison results', async ({
    page,
  }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)

    // Upload zone should be visible
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    // Upload the xlsx report
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)

    // Compare button should appear after file selection
    const compareButton = page.getByRole('button', { name: /Compare/i })
    await expect(compareButton).toBeVisible()
    await compareButton.click()

    // Wait for results — 3 sections should appear
    await expect(page.getByRole('heading', { name: /Both Found/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('heading', { name: /Tool Only/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Xbench Only/i })).toBeVisible()
  })

  test('[P2] should display section headings with finding counts', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)

    await page.getByRole('button', { name: /Compare/i }).click()

    // Each section heading includes count in format "Title (N)"
    const bothFoundHeading = page.getByRole('heading', { name: /Both Found/i })
    await expect(bothFoundHeading).toBeVisible({ timeout: 30_000 })
    const bothText = await bothFoundHeading.textContent()
    expect(bothText).toMatch(/Both Found \(\d+\)/)

    const toolOnlyHeading = page.getByRole('heading', { name: /Tool Only/i })
    const toolText = await toolOnlyHeading.textContent()
    expect(toolText).toMatch(/Tool Only \(\d+\)/)

    const xbenchOnlyHeading = page.getByRole('heading', { name: /Xbench Only/i })
    const xbenchText = await xbenchOnlyHeading.textContent()
    expect(xbenchText).toMatch(/Xbench Only \(\d+\)/)
  })

  test('[P2] should display correct color styling for each section', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)

    await page.getByRole('button', { name: /Compare/i }).click()

    // Wait for results
    await expect(page.getByRole('heading', { name: /Both Found/i })).toBeVisible({
      timeout: 30_000,
    })

    // Both Found = green (text-success class)
    const bothFoundHeading = page.getByRole('heading', { name: /Both Found/i })
    await expect(bothFoundHeading).toHaveClass(/text-success/)

    // Tool Only = blue (text-info class)
    const toolOnlyHeading = page.getByRole('heading', { name: /Tool Only/i })
    await expect(toolOnlyHeading).toHaveClass(/text-info/)

    // Xbench Only = red (text-destructive class)
    const xbenchOnlyHeading = page.getByRole('heading', { name: /Xbench Only/i })
    await expect(xbenchOnlyHeading).toHaveClass(/text-destructive/)
  })

  test('[P2] should show Compare button only after file is selected', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    // Compare button should NOT be visible initially
    await expect(page.getByRole('button', { name: /Compare/i })).not.toBeVisible()

    // Select a file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(XBENCH_REPORT_FIXTURE)

    // Compare button should now appear
    await expect(page.getByRole('button', { name: /Compare/i })).toBeVisible()
  })

  test('[P2] should show error state when invalid file is uploaded', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    // Upload a non-xlsx file (SDLXLIFF — wrong format for Xbench report)
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(INVALID_FILE_FIXTURE)

    const compareButton = page.getByRole('button', { name: /Compare/i })
    await expect(compareButton).toBeVisible()
    await compareButton.click()

    // Error toast should appear (action returns error when xlsx parsing fails)
    const errorMessage = page
      .getByText(/Failed to parse.*xlsx/i)
      .or(page.getByText(/not a valid.*Xbench/i))
      .or(page.getByText(/Comparison failed/i))
    await expect(errorMessage).toBeVisible({ timeout: 10_000 })
  })

  test('[P2] should submit Report Missing Check dialog successfully (T3.4)', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    // Click "Report Missing Check" button
    await page.getByRole('button', { name: /Report Missing Check/i }).click()

    // Dialog should open
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Fill in the form
    await dialog.locator('#fileReference').fill('test-file.sdlxliff')
    await dialog.locator('#segmentNumber').fill('42')
    await dialog.locator('#description').fill('Missing consistency check for repeated terms')

    // Select Check Type via custom dropdown
    await dialog.locator('#checkType').click()
    await dialog.getByRole('option', { name: 'Consistency' }).click()

    // Submit
    await dialog.getByRole('button', { name: /Submit Report/i }).click()

    // Success toast should appear with tracking reference
    await expect(page.getByText(/Report submitted.*MCR-/i)).toBeVisible({ timeout: 10_000 })

    // Dialog should close after success
    await expect(dialog).not.toBeVisible()
  })

  test('[P2] should show validation errors in Report Missing Check dialog (T3.5)', async ({
    page,
  }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/parity`)
    await expect(page.getByText(/Upload Xbench/i)).toBeVisible({ timeout: 10_000 })

    // Click "Report Missing Check" button
    await page.getByRole('button', { name: /Report Missing Check/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Submit without filling any fields
    await dialog.getByRole('button', { name: /Submit Report/i }).click()

    // Validation errors should appear
    await expect(dialog.getByText(/File Reference is required/i)).toBeVisible()
    await expect(dialog.getByText(/Segment Number is required/i)).toBeVisible()
    await expect(dialog.getByText(/Description is required/i)).toBeVisible()
    await expect(dialog.getByText(/Check Type is required/i)).toBeVisible()

    // Dialog should remain open
    await expect(dialog).toBeVisible()
  })

  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch {
        // Non-critical — global teardown handles user cleanup
      }
    }
  })
})
