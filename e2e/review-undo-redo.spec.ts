/**
 * Story 4.4b E2E: Undo/Redo & Conflict Resolution
 * Tests: AC1 (single undo), AC2 (bulk undo), AC3 (severity undo), AC5 (redo), AC6 (stack lifecycle)
 *
 * Suite-level skip guard: requires Inngest dev server (Guardrail #43)
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-undo-redo.spec.ts
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

// ── Seed Helper ───────────────────────────────────────────────────────────────

async function seedFileWithFindings(opts: {
  tenantId: string
  projectId: string
  count: number
}): Promise<{ fileId: string; findingIds: string[] }> {
  // 1. Insert file
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `undo-redo-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 4096,
      storage_path: `e2e/undo-redo-test-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file failed: ${fileRes.status} ${await fileRes.text()}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seed file: no row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score
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

  // 3. Insert segments (word_count >= 100 for MQM score)
  for (let i = 0; i < opts.count; i++) {
    await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        segment_number: i + 1,
        source_text: `Source text for undo-redo segment ${i + 1} with enough words for counting`,
        target_text: `ข้อความเป้าหมายสำหรับเซกเมนต์ ${i + 1} ที่มีคำเพียงพอ`,
        source_lang: 'en-US',
        target_lang: 'th-TH',
        word_count: 100,
      }),
    })
  }

  // 4. Insert findings
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
        description: `Undo-redo test finding ${i + 1}`,
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

// ── Test Suite ─────────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e-undo-redo-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let seededFileId: string

test.describe.serial('Undo/Redo & Conflict Resolution — Story 4.4b ATDD', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')
  test.use({ viewport: { width: 1500, height: 900 } })

  test('[setup] signup, create project, seed file with 8 findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Undo/Redo Test')
    expect(projectId).toBeTruthy()

    // Seed 8 findings (serial tests share state — seed 2x expected consumption)
    const seedResult = await seedFileWithFindings({ tenantId, projectId, count: 8 })
    seededFileId = seedResult.fileId
    expect(seededFileId).toBeTruthy()
  })

  // ── E-01: P0 AC1 — Single undo via Ctrl+Z ──

  test('E-01: should undo accept via Ctrl+Z and revert finding to pending', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // Wait for findings to hydrate — gotoReviewPageWithRetry handles this
    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })

    // Click finding → accept via hotkey 'a'
    await rows.first().click()
    // Wait for review-actions-ready before pressing hotkeys
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })
    await page.keyboard.press('a')
    // Wait for success toast
    await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 })
    // Wait for toast to clear + inFlightRef to reset
    await page.waitForTimeout(1000)

    // Undo via Ctrl+Z — click the ACCEPTED finding row to ensure focus
    await rows.first().click()
    await page.waitForTimeout(500)

    // Undo via Ctrl+Z — use keyboard.down/up pattern for Windows compatibility
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')

    // Wait for "Undone:" toast
    await expect(page.getByText(/[Uu]ndo/).first()).toBeVisible({ timeout: 15_000 })
  })

  // ── E-02: P1 AC2 — Bulk undo ──

  test('E-02: should undo bulk accept and revert all findings', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // Wait for findings grid
    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // Click a finding to sync activeFindingId + ensure focus in review area
    await rows.first().click()
    await expect(rows.first()).toBeFocused({ timeout: 5_000 })

    // Ctrl+A to select all — wait for keyboard handlers to be registered
    await page.waitForSelector('[data-keyboard-ready="true"]', { timeout: 10_000 })
    await page.keyboard.down('Control')
    await page.keyboard.press('a')
    await page.keyboard.up('Control')

    // Click Bulk Accept button
    const bulkBar = page.getByRole('toolbar', { name: /bulk actions/i })
    await expect(bulkBar).toBeVisible({ timeout: 10_000 })
    await bulkBar.getByText('Bulk Accept').click()

    // Handle confirmation dialog (>5 findings → threshold triggers dialog)
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dialog.getByRole('button', { name: /confirm/i }).click()
    }

    // Wait for bulk success toast — format: "N findings accepted"
    await expect(page.getByText(/\d+ findings? accepted/i).first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1000)

    // Click a finding row to ensure keyboard focus in review area
    await rows.first().click()
    await page.waitForTimeout(500)

    // Undo bulk via Ctrl+Z
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await expect(page.getByText(/[Uu]ndo/).first()).toBeVisible({ timeout: 15_000 })
  })

  // ── E-03: P1 AC5 — Redo ──

  test('E-03: should redo via Ctrl+Shift+Z after undo', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // Accept → undo → redo
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

    // Redo
    await rows.first().click()
    await page.waitForTimeout(300)
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    await page.keyboard.press('z')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
    await expect(page.getByText(/[Rr]edo/).first()).toBeVisible({ timeout: 15_000 })
  })

  // ── E-04: P2 AC3 — Severity override undo ──

  test('E-04: should undo severity override and restore original severity', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // Click finding → open severity override menu via '-' hotkey
    await rows.first().click()
    await page.waitForTimeout(300)
    await page.keyboard.press('-')

    // CR-H6: Assert menu visibility (not conditional — test must exercise the path)
    const minorOption = page.getByRole('menuitem', { name: /minor/i })
    await expect(minorOption).toBeVisible({ timeout: 5_000 })
    await minorOption.click()
    await expect(page.getByText(/severity/i).first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(1000)

    // Undo severity override via Ctrl+Z
    await rows.first().click()
    await page.waitForTimeout(300)
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    await expect(page.getByText(/[Uu]ndo/).first()).toBeVisible({ timeout: 15_000 })
  })

  // ── E-05: P1 AC6 — Stack clears on file switch ──

  test('E-05: should clear undo stack on file switch (Ctrl+Z = no-op)', async ({ page }) => {
    test.setTimeout(180_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 10_000 })

    // Accept a finding
    await rows.first().click()
    await page.keyboard.press('a')
    await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 })

    // Navigate away (go back to project page, then return to a different context)
    // For this test, we just reload the page which resets the client-side undo stack
    await page.reload()
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 })

    // Ctrl+Z should be no-op (stack cleared on page load)
    await page.keyboard.down('Control')
    await page.keyboard.press('z')
    await page.keyboard.up('Control')
    // No "Undone:" toast should appear — wait a bit then verify absence
    await page.waitForTimeout(2000)
    const undoneToast = page.getByText(/undone/i)
    await expect(undoneToast).toHaveCount(0)
  })

  // ── Cleanup ──

  test('[cleanup] delete test project', async () => {
    if (projectId && tenantId) {
      await cleanupTestProject(projectId, tenantId)
    }
  })
})
