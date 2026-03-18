/**
 * Story 4.4a E2E (extended): Bulk Reject Confirm + Execute + Score Recalc,
 *                             Bulk Accept <=5 without confirmation dialog
 *
 * Separate file from review-bulk-operations.spec.ts to avoid serial data
 * consumption conflicts — seeds its own 16 findings independently.
 *
 * Coverage gaps filled:
 *   E-BK9  — Bulk reject confirm + execute + score recalc (P1)
 *   E-BK10 — Bulk accept <=5 without confirmation dialog (P1)
 *
 * Suite-level skip guard: requires Inngest dev server (Guardrail #43)
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-bulk-operations-extended.spec.ts
 */
import { test, expect } from '@playwright/test'

import { cleanupTestProject, queryScore } from './helpers/pipeline-admin'
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

/**
 * Seed file + score + segments + 16 findings for extended bulk operation tests.
 * Same structure as the main bulk-ops spec but with its own isolated data.
 * Mix of severities: 3 critical, 8 major, 5 minor.
 */
async function seedFileWithFindingsForExtendedBulkOps(opts: {
  tenantId: string
  projectId: string
}): Promise<{ fileId: string; findingIds: string[] }> {
  // 1. Insert file
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `bulk-ops-ext-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 4096,
      storage_path: `e2e/bulk-ops-ext-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file failed: ${fileRes.status} ${await fileRes.text()}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seed file: no row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 65.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1600,
      critical_count: 3,
      major_count: 8,
      minor_count: 5,
      npt: 0.3,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok)
    throw new Error(`seed score failed: ${scoreRes.status} ${await scoreRes.text()}`)

  // 3. Insert 16 segments (word_count >= 100 for MQM score tests)
  const segmentData = Array.from({ length: 16 }, (_, i) => ({
    segment_number: i + 1,
    source_text: `Source text for segment ${i + 1} with enough words to ensure proper counting`,
    target_text: `ข้อความเป้าหมายสำหรับเซกเมนต์ ${i + 1} ที่มีคำเพียงพอเพื่อให้การนับถูกต้อง`,
    word_count: 100,
  }))

  for (const seg of segmentData) {
    const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        source_lang: 'en-US',
        target_lang: 'th-TH',
        ...seg,
      }),
    })
    if (!segRes.ok) throw new Error(`seed segment failed: ${segRes.status} ${await segRes.text()}`)
  }

  // 4. Insert 16 findings — mix of severities
  const findings = [
    // Critical (3)
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Critical term mistranslation',
      detected_by_layer: 'L2',
    },
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Safety warning omitted',
      detected_by_layer: 'L2',
    },
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Meaning reversed in output',
      detected_by_layer: 'L2',
    },
    // Major (8)
    {
      severity: 'major',
      category: 'fluency',
      description: 'Awkward target phrasing',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Glossary term mismatch',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'style',
      description: 'Register level inconsistency',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Number format error',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'fluency',
      description: 'Unnatural word ordering',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Cross-segment term inconsistency',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Paragraph sentence omitted',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'style',
      description: 'Formal register in casual text',
      detected_by_layer: 'L2',
    },
    // Minor (5)
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Trailing space detected',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Missing final punctuation',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Double space in text',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Capitalization issue',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Punctuation spacing error',
      detected_by_layer: 'L1',
    },
  ]

  const findingIds: string[] = []
  for (const f of findings) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        status: 'pending',
        ...f,
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

const TEST_EMAIL = `e2e-bulk-ext-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let seededFileId: string
let seededFindingIds: string[]

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process, not Next.js runtime
test.describe.serial('Bulk Operations Extended — Story 4.4a E-BK9/E-BK10', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')
  // Desktop viewport required — bulk selection uses selectedId which syncs only on desktop
  test.use({ viewport: { width: 1500, height: 900 } })

  test('[setup] signup, create project, seed file with 16 findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Bulk Operations Extended')
    expect(projectId).toBeTruthy()

    const seedResult = await seedFileWithFindingsForExtendedBulkOps({ tenantId, projectId })
    seededFileId = seedResult.fileId
    seededFindingIds = seedResult.findingIds
    expect(seededFileId).toBeTruthy()
    expect(seededFindingIds.length).toBe(16)
    const score = await queryScore(seededFileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
  })

  // ── E-BK10: Bulk Accept <=5 without confirmation dialog ─────────────────
  // Run FIRST so we consume only 3 findings, leaving 13 pending for E-BK9

  test('[P1] E-BK10: should bulk accept <=5 findings without confirmation dialog', async ({
    page,
  }) => {
    test.setTimeout(180_000) // Extra time for first navigation — SSR + login may be slow
    expect(projectId).toBeTruthy()
    expect(seededFileId).toBeTruthy()

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRows = grid.locator('[role="row"][data-status="pending"]')

    // Verify we have enough pending findings
    const pendingCount = await pendingRows.count()
    expect(pendingCount).toBeGreaterThanOrEqual(3)

    // Select 3 findings via Shift+Click (<=5 threshold — no confirmation expected)
    await pendingRows.nth(0).click()
    await pendingRows.nth(1).click({ modifiers: ['Shift'] })
    await pendingRows.nth(2).click({ modifiers: ['Shift'] })

    // Capture finding IDs before action
    const findingId0 = await pendingRows.nth(0).getAttribute('data-finding-id')
    const findingId1 = await pendingRows.nth(1).getAttribute('data-finding-id')
    const findingId2 = await pendingRows.nth(2).getAttribute('data-finding-id')

    // Verify BulkActionBar shows 3 selected
    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })
    await expect(bulkBar).toContainText('3 findings selected')

    // Click Bulk Accept
    await bulkBar.getByRole('button', { name: /bulk accept/i }).click()

    // AC: NO confirmation dialog should appear for <=5 findings
    const dialog = page.getByRole('dialog')
    // Give a short window to confirm dialog does NOT appear
    await expect(dialog).not.toBeVisible({ timeout: 2_000 })

    // AC: Summary toast shows "3 findings accepted" (single toast, not 3 individual)
    await expect(page.getByText('3 findings accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // AC: All 3 findings transitioned to accepted
    // Switch to 'all' filter to see accepted findings
    await page.getByTestId('filter-status-all').click()
    await expect(grid.getByRole('row').first()).toBeVisible({ timeout: 5_000 })

    for (const fId of [findingId0, findingId1, findingId2]) {
      const targetRow = grid.locator(`[role="row"][data-finding-id="${fId}"]`)
      await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })
    }

    // AC: Selection clears and BulkActionBar hides
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })

    // AC: aria-live announces selection cleared
    const announcer = page.getByTestId('bulk-selection-announcer')
    await expect(announcer).toContainText(/selection cleared/i, { timeout: 5_000 })
  })

  // ── E-BK9: Bulk Reject Confirm + Execute + Score Recalc ─────────────────

  test('[P1] E-BK9: should bulk reject >5 findings with confirmation dialog, execute, and recalc score', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    expect(projectId).toBeTruthy()
    expect(seededFileId).toBeTruthy()

    // Capture initial score for recalc comparison
    const initialScore = await queryScore(seededFileId)
    expect(initialScore).not.toBeNull()
    const initialMqm = initialScore!.mqm_score

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRows = grid.locator('[role="row"][data-status="pending"]')
    const pendingCount = await pendingRows.count()
    // After E-BK10 accepted 3, we should have 13 pending
    expect(pendingCount).toBeGreaterThan(5)

    // Select 7 pending findings via Shift+Click (>5 — requires confirmation)
    const selectCount = 7
    await pendingRows.nth(0).click()
    for (let i = 1; i < selectCount; i++) {
      await pendingRows.nth(i).click({ modifiers: ['Shift'] })
    }

    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })
    await expect(bulkBar).toContainText(`${selectCount} findings selected`)

    // Capture finding IDs of selected rows for post-action verification
    const selectedFindingIds: string[] = []
    for (let i = 0; i < selectCount; i++) {
      const fId = await pendingRows.nth(i).getAttribute('data-finding-id')
      if (fId) selectedFindingIds.push(fId)
    }
    expect(selectedFindingIds.length).toBe(selectCount)

    // Click Bulk Reject — should trigger confirmation dialog (>5 threshold)
    await bulkBar.getByRole('button', { name: /bulk reject/i }).click()

    // AC: Confirmation dialog appears with severity breakdown
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // AC: Dialog title shows reject count
    await expect(dialog.getByRole('heading')).toContainText(/Reject \d+ findings/i)

    // AC: Severity breakdown visible (at least one severity label with count)
    const dialogText = await dialog.textContent()
    const severityPattern = /(Critical|Major|Minor)\s*\d+/i
    expect(dialogText).toMatch(severityPattern)

    // AC: Confirm button present
    const confirmBtn = dialog.getByRole('button', { name: /confirm/i })
    await expect(confirmBtn).toBeVisible()

    // AC: Click Confirm — execute the bulk reject
    await confirmBtn.click()

    // AC: Dialog closes after confirm
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // AC: Summary toast shows "X findings rejected"
    await expect(page.getByText(`${selectCount} findings rejected`, { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // AC: BulkActionBar hides after completion
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })

    // AC: All selected findings transitioned to rejected
    // Switch to 'all' filter to see rejected findings
    await page.getByTestId('filter-status-all').click()
    await expect(grid.getByRole('row').first()).toBeVisible({ timeout: 5_000 })

    for (const fId of selectedFindingIds) {
      const targetRow = grid.locator(`[role="row"][data-finding-id="${fId}"]`)
      await expect(targetRow).toHaveAttribute('data-status', 'rejected', { timeout: 10_000 })
    }

    // AC: Score recalculates — poll DB for MQM score change
    // Rejecting findings should cause score recalc via single Inngest event
    let scoreChanged = false
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      const updated = await queryScore(seededFileId)
      if (updated && updated.mqm_score !== initialMqm) {
        scoreChanged = true
        break
      }
      await new Promise((r) => setTimeout(r, 2_000))
    }
    expect(scoreChanged).toBe(true)
  })

  // ── Cleanup ─────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        process.stderr.write(`[cleanup] Failed to clean project ${projectId}: ${String(err)}\n`)
      }
    }
  })
})
