/**
 * Story 4.4a E2E: Bulk Operations & Decision Override
 * Tests: Shift+Click multi-select, Bulk Accept, Bulk Reject confirmation,
 *        Ctrl+A, Escape clear, Override badge, Override history panel
 *
 * TDD RED phase — all tests use test() (feature not yet implemented)
 *
 * Suite-level skip guard: requires Inngest dev server (Guardrail #43)
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-bulk-operations.spec.ts
 */
import { test, expect } from '@playwright/test'

import { cleanupTestProject, queryScore } from './helpers/pipeline-admin'
import { waitForReviewPageHydrated } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

/** Navigate to review page with retry on SSR transient failure */
async function gotoReviewPageWithRetry(
  page: import('@playwright/test').Page,
  pid: string,
  fid: string,
) {
  const url = `/projects/${pid}/review/${fid}`
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(url)
    // Debug: screenshot what we see
    await page.screenshot({ path: `test-results/debug-attempt-${attempt}.png`, fullPage: true })
    try {
      await waitForReviewPageHydrated(page)
      return
    } catch (err) {
      const bodyText = await page
        .locator('body')
        .textContent()
        .catch(() => 'unknown')
      console.log(`[retry ${attempt}] page body: ${bodyText?.slice(0, 300)}`)
      if (attempt === 2) throw new Error(`Review page failed to load after 3 attempts: ${url}`)
      await page.waitForTimeout(3_000)
    }
  }
}

// ── Seed Helper ───────────────────────────────────────────────────────────────

/**
 * Seed file + score + segments + 16 findings for bulk operation tests.
 * Needs ≥12 pending findings (serial tests share state — seed 2x expected).
 * Mix of severities for confirmation dialog breakdown assertion.
 * Returns { fileId, findingIds } for targeted assertions.
 */
async function seedFileWithFindingsForBulkOps(opts: {
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
      file_name: `bulk-ops-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 4096,
      storage_path: `e2e/bulk-ops-test-${Date.now()}.sdlxliff`,
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

  // 4. Insert 16 findings — mix of severities for bulk tests
  // 3 critical, 8 major, 5 minor — matches severity breakdown for confirmation dialog
  const findings = [
    // Critical findings (3)
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Critical mistranslation of key term',
      detected_by_layer: 'L2',
    },
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Omitted safety warning',
      detected_by_layer: 'L2',
    },
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Meaning reversal in translation',
      detected_by_layer: 'L2',
    },
    // Major findings (8)
    {
      severity: 'major',
      category: 'fluency',
      description: 'Awkward phrasing in target',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Wrong glossary term used',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'style',
      description: 'Inconsistent register level',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Number format mismatch',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'fluency',
      description: 'Unnatural word order',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Inconsistent term across segments',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Omitted sentence in paragraph',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'style',
      description: 'Formal register in casual context',
      detected_by_layer: 'L2',
    },
    // Minor findings (5)
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Extra trailing space',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Missing final period',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Double space between words',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Capitalization error',
      detected_by_layer: 'L1',
    },
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Inconsistent punctuation spacing',
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

const TEST_EMAIL = `e2e-bulk-ops-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let seededFileId: string
let seededFindingIds: string[]

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process, not Next.js runtime
test.describe.serial('Bulk Operations & Decision Override — Story 4.4a ATDD', () => {
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
    projectId = await createTestProject(tenantId, 'E2E Bulk Operations Test')
    expect(projectId).toBeTruthy()

    const seedResult = await seedFileWithFindingsForBulkOps({ tenantId, projectId })
    seededFileId = seedResult.fileId
    seededFindingIds = seedResult.findingIds
    expect(seededFileId).toBeTruthy()
    expect(seededFindingIds.length).toBe(16)
    const score = await queryScore(seededFileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
  })

  // ── AC1: Multi-Select via Shift+Click ────────────────────────────────────

  test('[P0] E-BK1: should show BulkActionBar when Shift+Click selects multiple findings', async ({
    page,
  }) => {
    test.setTimeout(180_000) // Extra time for first test — SSR + login may be slow
    console.log(
      `[E-BK1] projectId=${projectId}, fileId=${seededFileId}, findingIds=${seededFindingIds?.length}`,
    )
    expect(projectId).toBeTruthy()
    expect(seededFileId).toBeTruthy()

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')

    // Click first row (single-select — no BulkActionBar yet)
    await rows.nth(0).click()
    await expect(page.getByTestId('bulk-action-bar')).not.toBeVisible()

    // Shift+Click second row — enters bulk mode
    await rows.nth(1).click({ modifiers: ['Shift'] })

    // AC1: BulkActionBar appears with selection count
    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })
    await expect(bulkBar).toContainText('2 findings selected')

    // AC1: Selected rows show checkbox indicator + aria-selected
    await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true')

    // AC1: BulkActionBar has role="toolbar" with aria-label
    await expect(bulkBar).toHaveAttribute('role', 'toolbar')
    await expect(bulkBar).toHaveAttribute('aria-label', 'Bulk actions')

    // AC1: aria-live region announces selection count (use testid to avoid strict mode violation)
    const announcer = page.getByTestId('bulk-selection-announcer')
    await expect(announcer).toContainText(/findings selected/i)
  })

  // ── AC2: Bulk Accept (≤5 findings — no confirmation) ─────────────────────

  test('[P0] E-BK2: should bulk accept 3 findings with summary toast and score recalc', async ({
    page,
  }) => {
    const initialScore = await queryScore(seededFileId)
    expect(initialScore).not.toBeNull()
    const initialMqm = initialScore!.mqm_score

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRows = grid.locator('[role="row"][data-status="pending"]')

    // Select 3 findings via Shift+Click (≤5 threshold — no confirmation dialog)
    await pendingRows.nth(0).click()
    await pendingRows.nth(1).click({ modifiers: ['Shift'] })
    await pendingRows.nth(2).click({ modifiers: ['Shift'] })

    // Verify BulkActionBar shows 3 selected
    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })
    await expect(bulkBar).toContainText('3 findings selected')

    // Capture finding IDs before action
    const findingId0 = await pendingRows.nth(0).getAttribute('data-finding-id')
    const findingId1 = await pendingRows.nth(1).getAttribute('data-finding-id')
    const findingId2 = await pendingRows.nth(2).getAttribute('data-finding-id')

    // Click Bulk Accept — no confirmation dialog for ≤5
    await bulkBar.getByRole('button', { name: /bulk accept/i }).click()

    // AC2: Summary toast (NOT 3 individual toasts)
    await expect(page.getByText('3 findings accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // AC2: All 3 findings transitioned to accepted
    for (const fId of [findingId0, findingId1, findingId2]) {
      const targetRow = grid.locator(`[role="row"][data-finding-id="${fId}"]`)
      await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })
    }

    // AC2: Selection clears and BulkActionBar hides
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })

    // AC2: aria-live announces completion — toast says "N findings accepted"
    // Selection announcer says "Selection cleared" after bulk completes
    const announcer = page.getByTestId('bulk-selection-announcer')
    await expect(announcer).toContainText(/selection cleared/i, { timeout: 5_000 })

    // AC2: Score recalculates (single Inngest event — poll DB)
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

  // ── AC3: Bulk Reject (>5 findings — confirmation required) ───────────────

  test('[P0] E-BK3: should show confirmation dialog when bulk rejecting >5 findings', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRows = grid.locator('[role="row"][data-status="pending"]')
    const pendingCount = await pendingRows.count()
    // Need >5 pending — seed provides enough (16 total minus 3 accepted in E-BK2)
    expect(pendingCount).toBeGreaterThan(5)

    // Select 6+ findings via Shift+Click (pick first 6 pending)
    await pendingRows.nth(0).click()
    for (let i = 1; i < 6; i++) {
      await pendingRows.nth(i).click({ modifiers: ['Shift'] })
    }

    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })

    // Click Bulk Reject — should show confirmation dialog (>5 threshold)
    await bulkBar.getByRole('button', { name: /bulk reject/i }).click()

    // AC3: Confirmation dialog appears
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // AC3: Dialog title shows count
    await expect(dialog.getByRole('heading')).toContainText(/Reject \d+ findings/i)

    // AC3: Dialog body shows severity breakdown (at least one severity visible)
    // Note: after E-BK2 accepted 3 findings, remaining may not include all severities
    await expect(dialog).toContainText(/Critical|Major|Minor/i)

    // AC3: Cancel and Confirm buttons present
    const cancelBtn = dialog.getByRole('button', { name: /cancel/i })
    const confirmBtn = dialog.getByRole('button', { name: /confirm/i })
    await expect(cancelBtn).toBeVisible()
    await expect(confirmBtn).toBeVisible()

    // AC3: Focus trap — Tab stays within dialog (Guardrail #30)
    await confirmBtn.focus()
    await page.keyboard.press('Tab')
    // After last focusable, focus should wrap to first focusable in dialog
    const focusedElement = await page.evaluate(() =>
      document.activeElement?.closest('[role="dialog"]'),
    )
    expect(focusedElement).not.toBeNull()

    // AC3: Confirm → findings rejected + summary toast
    await confirmBtn.click()

    await expect(page.getByText(/\d+ findings rejected/i)).toBeVisible({
      timeout: 15_000,
    })

    // Dialog closes after confirm
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // BulkActionBar hides after completion
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })
  })

  // ── AC1: Escape clears selection ─────────────────────────────────────────

  test('[P0] E-BK4: should clear selection on Escape', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')

    // Enter bulk mode via Shift+Click
    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })

    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })

    // Press Escape — clears selection (Guardrail #31: selection layer closes)
    await page.keyboard.press('Escape')

    // BulkActionBar hides
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })

    // aria-selected removed from rows
    await expect(rows.nth(0)).not.toHaveAttribute('aria-selected', 'true')
    await expect(rows.nth(1)).not.toHaveAttribute('aria-selected', 'true')

    // aria-live announces "Selection cleared"
    const liveRegion = page
      .locator('[aria-live="polite"]')
      .filter({ hasText: /selection cleared/i })
    await expect(liveRegion).toBeVisible({ timeout: 5_000 })
  })

  // ── AC1: Ctrl+A selects all filtered findings ───────────────────────────

  test('[P1] E-BK5: should select all filtered findings with Ctrl+A', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')
    const totalRows = await rows.count()
    expect(totalRows).toBeGreaterThan(0)

    // Click a finding row first to ensure focus is in finding list (Guardrail #34)
    await rows.first().click()

    // Ctrl+A — select all filtered findings
    await page.keyboard.press('Control+a')

    // BulkActionBar shows with total count
    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })
    await expect(bulkBar).toContainText(`${totalRows} findings selected`)

    // All rows have aria-selected
    for (let i = 0; i < Math.min(totalRows, 5); i++) {
      await expect(rows.nth(i)).toHaveAttribute('aria-selected', 'true')
    }

    // Clear selection for next test
    await page.keyboard.press('Escape')
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })
  })

  // ── AC4: Override Badge after re-decision ────────────────────────────────

  test('[P1] E-BK6: should show Override badge after re-deciding a finding', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')

    // Find a pending finding and accept it first
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const findingId = await pendingRow.getAttribute('data-finding-id')
    await pendingRow.click()
    await page.keyboard.press('a')
    await expect(page.getByText('Finding accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // Now re-decide: reject the accepted finding (override)
    const acceptedRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await acceptedRow.click()
    await page.keyboard.press('r')
    await expect(page.getByText('Finding rejected', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // AC4: Override badge appears client-side (single-action now increments count)
    const targetRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await expect(targetRow.getByTestId('decision-override-badge')).toBeVisible({ timeout: 10_000 })

    // AC4: Badge has correct aria-label
    const badge = targetRow.getByTestId('decision-override-badge')
    await expect(badge).toHaveAttribute('aria-label', /decision overridden/i)
  })

  // ── AC5: Override History Panel ──────────────────────────────────────────

  test('[P1] E-BK7: should display decision history when Override badge clicked', async ({
    page,
  }) => {
    // Desktop viewport set at suite level — detail panel auto-shows
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')

    // Find the overridden finding from E-BK6 (has override-badge)
    const overriddenRow = grid
      .locator('[role="row"]')
      .filter({ has: page.getByTestId('decision-override-badge') })
      .first()
    await expect(overriddenRow).toBeVisible({ timeout: 10_000 })

    // Click the override badge — wired through FindingList → ReviewPageClient → opens detail panel
    await overriddenRow.getByTestId('decision-override-badge').click()
    await page.waitForTimeout(1_000) // Wait for detail panel to render

    // Click "Show decision history" button in the detail panel (badge click opens panel, not history directly)
    const showHistoryBtn = page.getByText(/show decision history/i)
    await expect(showHistoryBtn).toBeVisible({ timeout: 10_000 })
    await showHistoryBtn.click()

    // AC5: OverrideHistoryPanel appears in detail panel
    const historyPanel = page.getByTestId('override-history-panel')
    await expect(historyPanel).toBeVisible({ timeout: 10_000 })

    // AC5: Panel has correct aria attributes
    await expect(historyPanel).toHaveAttribute('aria-label', 'Decision history')

    // AC5: Shows at least 2 entries (initial accept + override reject)
    const historyEntries = historyPanel.getByRole('listitem')
    await expect(historyEntries).toHaveCount(2, { timeout: 5_000 })

    // AC5: Most recent entry is first (newest-first order)
    // Latest action was reject, so first entry should show "rejected"
    const firstEntry = historyEntries.first()
    await expect(firstEntry).toContainText(/rejected/i)

    // AC5: Entries show relative timestamp ("just now" or "N min ago")
    await expect(firstEntry).toContainText(/just now|ago/i)

    // AC5: Entries show state transition (previousState -> newState) — ArrowRight icon between states
    // The icon is aria-hidden, so just verify both states are present
    await expect(firstEntry).toContainText(/Accepted|Rejected/i)

    // AC5: All entries are read-only (no edit/delete buttons)
    const editButtons = historyPanel.getByRole('button', { name: /edit|delete/i })
    await expect(editButtons).toHaveCount(0)
  })

  // ── AC1: Regular click clears bulk selection ─────────────────────────────

  test('[P2] E-BK8: should return to single-select mode on regular click after bulk selection', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const rows = grid.locator('[role="row"]')

    // Enter bulk mode via Shift+Click
    await rows.nth(0).click()
    await rows.nth(1).click({ modifiers: ['Shift'] })

    const bulkBar = page.getByTestId('bulk-action-bar')
    await expect(bulkBar).toBeVisible({ timeout: 5_000 })

    // Regular click (no Shift) on a different row — exits bulk mode
    await rows.nth(3).click()

    // BulkActionBar hides — returned to single-select mode
    await expect(bulkBar).not.toBeVisible({ timeout: 5_000 })

    // Only the clicked row should be active (single-select), not aria-selected
    await expect(rows.nth(0)).not.toHaveAttribute('aria-selected', 'true')
    await expect(rows.nth(1)).not.toHaveAttribute('aria-selected', 'true')

    // The clicked row should have tabindex="0" (single-mode focus)
    await expect(rows.nth(3)).toHaveAttribute('tabindex', '0', { timeout: 5_000 })
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
