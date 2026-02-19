import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

/**
 * Story 1.4 — Glossary Import & Management (E2E)
 *
 * Full user journey: signup → create project → import glossary → CRUD terms → delete glossary
 * Uses accessible selectors (getByRole, getByLabel, getByText) per Playwright best practices.
 */

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'
const TEST_EMAIL = `e2e-g14-${Date.now()}@test.local`
const PROJECT_NAME = `Glossary E2E ${Date.now()}`
const FIXTURE_CSV = path.resolve(__dirname, 'fixtures', 'glossary-sample.csv')

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 10000 })
}

test.describe.serial('Story 1.4 — Glossary Import & Management', () => {
  let glossaryUrl: string

  test('[setup] signup, create project, navigate to glossary', async ({ page }) => {
    // Sign up
    await page.goto('/signup')
    await page.getByLabel('Display Name').fill('Glossary Tester')
    await page.getByLabel('Email').fill(TEST_EMAIL)
    await page.getByLabel('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })

    // Create project (EN → TH)
    await page.goto('/projects')
    await page.getByRole('button', { name: /Create Project/ }).click()

    const dialog = page.getByRole('dialog')
    await dialog.locator('#project-name').fill(PROJECT_NAME)
    await dialog.locator('#source-lang').click()
    await page.getByRole('option', { name: /English/ }).click()
    await dialog.getByText('Thai', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Create Project' }).click()

    await expect(page.getByText('Project created')).toBeVisible({ timeout: 10000 })
    await expect(dialog).not.toBeVisible()

    // Navigate: project card Settings → Glossary tab
    await expect(page.getByText(PROJECT_NAME)).toBeVisible({ timeout: 10000 })
    await page.getByRole('link', { name: /Settings/ }).click()
    await page.waitForURL('**/settings')
    await page.getByRole('link', { name: 'Glossary' }).click()
    await page.waitForURL('**/glossary')

    glossaryUrl = page.url()
    await expect(page.getByText('No glossaries imported yet.')).toBeVisible()
  })

  test('[P2] should import CSV glossary and display results', async ({ page }) => {
    await login(page)
    await page.goto(glossaryUrl)
    await expect(page.getByText('No glossaries imported yet.')).toBeVisible()

    // Open import dialog
    await page.getByRole('button', { name: 'Import Glossary' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Step 1: Upload file
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE_CSV)
    await expect(dialog.locator('#glossary-name')).toHaveValue('glossary-sample')

    // Click Next
    await dialog.getByRole('button', { name: /Next/ }).click()

    // Step 2: Column mapping — defaults match our CSV ("source", "target")
    await dialog.getByRole('button', { name: 'Import' }).click()

    // Step 3: Results
    await expect(dialog.getByText(/Imported: 5 terms/)).toBeVisible({ timeout: 15000 })

    // Close dialog
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click()
    await expect(dialog).not.toBeVisible()

    // Glossary appears in list
    await expect(page.getByRole('cell', { name: 'glossary-sample', exact: true })).toBeVisible()
    await expect(page.getByText('No glossaries imported yet.')).not.toBeVisible()
  })

  test('[P2] should add a new term to glossary', async ({ page }) => {
    await login(page)
    await page.goto(glossaryUrl)

    // Expand glossary row to show terms
    await page.getByRole('cell', { name: 'glossary-sample', exact: true }).click()
    await expect(page.getByRole('columnheader', { name: 'Source Term' })).toBeVisible({
      timeout: 10000,
    })

    // Click Add Term
    await page.getByRole('button', { name: 'Add Term' }).click()

    // Fill term in dialog
    const dialog = page.getByRole('dialog', { name: 'Add term' })
    await dialog.locator('#source-term').fill('Unit Test')
    await dialog.locator('#target-term').fill('การทดสอบหน่วย')
    await dialog.getByRole('button', { name: 'Add Term' }).click()

    // Success toast
    await expect(page.getByText('Term created')).toBeVisible({ timeout: 10000 })

    // New term visible in table
    await expect(page.getByRole('cell', { name: 'Unit Test', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'การทดสอบหน่วย', exact: true })).toBeVisible()
  })

  test('[P2] should edit a term and see updated value', async ({ page }) => {
    await login(page)
    await page.goto(glossaryUrl)

    // Expand glossary
    await page.getByRole('cell', { name: 'glossary-sample', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Unit Test', exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Click Edit on "Unit Test" row (use cell→parent to avoid matching outer colspan row)
    const termRow = page.getByRole('cell', { name: 'Unit Test', exact: true }).locator('..')
    await termRow.getByRole('button', { name: 'Edit' }).click()

    // Change target term in dialog
    const dialog = page.getByRole('dialog', { name: 'Edit term' })
    const targetInput = dialog.locator('#target-term')
    await targetInput.clear()
    await targetInput.fill('ยูนิตเทส')
    await dialog.getByRole('button', { name: 'Save Changes' }).click()

    // Success toast
    await expect(page.getByText('Term updated')).toBeVisible({ timeout: 10000 })

    // Updated value visible
    await expect(page.getByRole('cell', { name: 'ยูนิตเทส', exact: true })).toBeVisible()
  })

  test('[P2] should delete a term', async ({ page }) => {
    await login(page)
    await page.goto(glossaryUrl)

    // Expand glossary
    await page.getByRole('cell', { name: 'glossary-sample', exact: true }).click()
    await expect(page.getByRole('cell', { name: 'Unit Test', exact: true })).toBeVisible({
      timeout: 10000,
    })

    // Click Delete on "Unit Test" row (use cell→parent to avoid matching outer colspan row)
    const termRow = page.getByRole('cell', { name: 'Unit Test', exact: true }).locator('..')
    await termRow.getByRole('button', { name: 'Delete' }).click()

    // Confirm in AlertDialog
    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()
    await alertDialog.getByRole('button', { name: 'Delete' }).click()

    // Success toast + term removed
    await expect(page.getByText('Term deleted')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('cell', { name: 'Unit Test', exact: true })).not.toBeVisible()
  })

  test('[P2] should delete glossary and return to empty state', async ({ page }) => {
    await login(page)
    await page.goto(glossaryUrl)

    // Click Delete on glossary row (use cell→parent to avoid matching outer colspan row)
    const glossaryRow = page
      .getByRole('cell', { name: 'glossary-sample', exact: true })
      .locator('..')
    await glossaryRow.getByRole('button', { name: 'Delete' }).click()

    // Confirm in AlertDialog
    const alertDialog = page.getByRole('alertdialog')
    await expect(alertDialog).toBeVisible()
    await expect(alertDialog.getByText(/glossary-sample/)).toBeVisible()
    await alertDialog.getByRole('button', { name: 'Delete' }).click()

    // Success toast + empty state restored
    await expect(page.getByText('Glossary deleted')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('No glossaries imported yet.')).toBeVisible()
  })
})
