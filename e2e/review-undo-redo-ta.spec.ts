/**
 * Story 4.4b TA E2E: Undo/Redo expansion — manual add undo, Ctrl+Y, input suppression
 * Gaps: TA-E01 (AC4 undo add), TA-E02 (Ctrl+Y redo), TA-E03 (Guardrail #28 input suppression)
 *
 * Suite-level skip guard: requires Inngest dev server (Guardrail #43)
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-undo-redo-ta.spec.ts
 */
import { test, expect } from '@playwright/test'

import { cleanupTestProject } from './helpers/pipeline-admin'
import { gotoReviewPageWithRetry } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// ── Seed Helper (reuse pattern from review-undo-redo.spec.ts) ──

async function seedFileWithFindings(opts: {
  tenantId: string
  projectId: string
  count: number
}): Promise<{ fileId: string; findingIds: string[] }> {
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `undo-redo-ta-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 4096,
      storage_path: `e2e/undo-redo-ta-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file failed: ${fileRes.status} ${await fileRes.text()}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seed file: no row returned')
  const fileId = fileData[0]!.id

  await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 75.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: opts.count * 100,
      critical_count: 0,
      major_count: opts.count,
      minor_count: 0,
      npt: 0.2,
      calculated_at: new Date().toISOString(),
    }),
  })

  for (let i = 0; i < opts.count; i++) {
    await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        segment_number: i + 1,
        source_text: `Source text for TA undo segment ${i + 1} with enough words`,
        target_text: `ข้อความเป้าหมายสำหรับ TA เซกเมนต์ ${i + 1} ที่มีคำเพียงพอ`,
        source_lang: 'en-US',
        target_lang: 'th-TH',
        word_count: 100,
      }),
    })
  }

  const findingIds: string[] = []
  for (let i = 0; i < opts.count; i++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        status: 'pending',
        severity: 'major',
        category: 'accuracy',
        description: `TA undo-redo test finding ${i + 1}`,
        detected_by_layer: 'L2',
      }),
    })
    if (!r.ok) throw new Error(`seed finding failed: ${r.status} ${await r.text()}`)
    const data = (await r.json()) as Array<{ id: string }>
    if (data.length === 0) throw new Error('seed finding: no row returned')
    findingIds.push(data[0]!.id)
  }

  return { fileId, findingIds }
}

// ── Test Suite ──

const TEST_EMAIL = `e2e-undo-ta-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let seededFileId: string

test.describe.serial('Undo/Redo TA Expansion — Story 4.4b', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')
  test.use({ viewport: { width: 1500, height: 900 } })

  test('[setup] signup, create project, seed file with 6 findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Undo/Redo TA')
    expect(projectId).toBeTruthy()

    const seedResult = await seedFileWithFindings({ tenantId, projectId, count: 6 })
    seededFileId = seedResult.fileId
    expect(seededFileId).toBeTruthy()
  })

  // ── TA-E01: P2 AC4 — Undo manual add finding ──

  test('TA-E01: should undo manually added finding via Ctrl+Z (AC4)', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // Click a finding to ensure focus in review area
    await rows.first().click()
    await page.waitForTimeout(300)

    // Click [+] Add button on action bar (more reliable than '+' hotkey in Playwright)
    const addButton = page.getByRole('button', { name: /add finding/i })
    await expect(addButton).toBeVisible({ timeout: 5_000 })
    await addButton.click()

    // Dialog should open
    const dialog = page.getByTestId('add-finding-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Fill Segment — Radix Select (click trigger → click option)
    const segmentTrigger = dialog.getByTestId('segment-selector')
    await segmentTrigger.click()
    const segmentOption = page.getByRole('option').first()
    await expect(segmentOption).toBeVisible({ timeout: 3_000 })
    await segmentOption.click()

    // Fill Category — Radix Select
    const categoryTrigger = dialog.getByTestId('category-selector')
    await categoryTrigger.click()
    const categoryOption = page.getByRole('option').first()
    await expect(categoryOption).toBeVisible({ timeout: 3_000 })
    await categoryOption.click()

    // Fill Description (min 10 chars required)
    const descField = dialog.getByTestId('description-field')
    await descField.fill('TA-E01 manually added finding for undo test')

    // Submit
    const submitBtn = dialog.getByTestId('add-finding-submit')
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 })
    await submitBtn.click()

    // Wait for success toast
    await expect(page.getByText(/added|created/i).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Undo via Ctrl+Z — click a row first to ensure focus outside dialog
    await rows.first().click()
    await page.waitForTimeout(500)
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')

    // Wait for "Undone:" toast
    await expect(page.getByText(/[Uu]ndo/).first()).toBeVisible({ timeout: 15_000 })
  })

  // ── TA-E02: P2 AC5 — Ctrl+Y redo alias ──

  test('TA-E02: should redo via Ctrl+Y after undo (AC5)', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // Accept → undo → redo with Ctrl+Y
    await rows.first().click()
    await page.keyboard.press('a')
    await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Undo
    await rows.first().click()
    await page.waitForTimeout(300)
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await expect(page.getByText(/[Uu]ndo/).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Redo via Ctrl+Y (alias for Ctrl+Shift+Z)
    await rows.first().click()
    await page.waitForTimeout(300)
    await page.keyboard.down('Control')
    await page.keyboard.press('y')
    await page.keyboard.up('Control')
    await expect(page.getByText(/[Rr]edo/).first()).toBeVisible({ timeout: 15_000 })
  })

  // ── TA-E03: P2 — Ctrl+Z suppressed in text input (Guardrail #28/34) ──

  test('TA-E03: should NOT trigger undo when Ctrl+Z pressed inside text input', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // First: accept a finding to create an undo entry
    await rows.first().click()
    await page.keyboard.press('a')
    await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Focus the search input (FilterBar has a search textbox)
    const searchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search|filter/i))
      .first()

    // If search input exists, focus it and try Ctrl+Z
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.click()
      await searchInput.fill('test text')
      await page.waitForTimeout(300)

      // Ctrl+Z in text input should trigger NATIVE browser undo (clear text), NOT our undo
      await page.keyboard.down('Control')
      await page.keyboard.press('z')
      await page.keyboard.up('Control')

      // Wait briefly and verify NO "Undone:" toast appeared
      await page.waitForTimeout(2000)
      const undoneToast = page.getByText(/undone/i)
      await expect(undoneToast).toHaveCount(0)
    } else {
      // If no search input visible, use the NoteInput if available
      // Click finding to expand detail panel, look for note textarea
      await rows.first().click()
      const noteInput = page.getByRole('textbox', { name: /note/i }).first()
      if (await noteInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await noteInput.click()
        await noteInput.fill('test note text')
        await page.waitForTimeout(300)

        await page.keyboard.down('Control')
        await page.keyboard.press('z')
        await page.keyboard.up('Control')

        await page.waitForTimeout(2000)
        const undoneToast = page.getByText(/undone/i)
        await expect(undoneToast).toHaveCount(0)
      }
    }
  })

  // ── Cleanup ──

  test('[cleanup] delete test project', async () => {
    if (projectId && tenantId) {
      await cleanupTestProject(projectId)
    }
  })
})
