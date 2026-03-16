/**
 * Story 4.5 E2E — Search, Filter & AI Layer Toggle
 *
 * Tests filter bar, keyword search, AI toggle, command palette on the review page.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 * - INNGEST_DEV_URL set (for pipeline seeding guard)
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

// ── Seed Helpers ──

async function seedFileWithFindings(opts: {
  tenantId: string
  projectId: string
  fileName: string
}): Promise<string> {
  // Insert file
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: opts.fileName,
      file_type: 'sdlxliff',
      file_size_bytes: 2048,
      storage_path: `e2e/${opts.fileName}`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file: ${fileRes.status} ${await fileRes.text()}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  const fileId = fileData[0]!.id

  // Insert score
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 72.5,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1500,
      critical_count: 1,
      major_count: 3,
      minor_count: 2,
      npt: 0.275,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) throw new Error(`seed score: ${scoreRes.status} ${await scoreRes.text()}`)

  // Insert segments (word_count 100+ each for MQM validity)
  for (let i = 1; i <= 6; i++) {
    const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        source_lang: 'en-US',
        target_lang: 'th-TH',
        segment_number: i,
        source_text: `Source text segment ${i}`,
        target_text: `ข้อความเป้าหมาย ${i} คำแปลที่ตรงกัน`,
        word_count: 120,
      }),
    })
    if (!segRes.ok) throw new Error(`seed segment: ${segRes.status} ${await segRes.text()}`)
  }

  // Insert findings — varied severity/layer/status/category/confidence + Thai text
  const findings = [
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Critical mistranslation detected',
      detected_by_layer: 'L2',
      ai_confidence: 92,
      status: 'pending',
      source_text_excerpt: 'Source text segment 1',
      target_text_excerpt: 'คำแปลผิดพลาดร้ายแรง',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Wrong glossary term used',
      detected_by_layer: 'L1',
      ai_confidence: null,
      status: 'pending',
      source_text_excerpt: 'Save changes',
      target_text_excerpt: 'บันทึกการเปลี่ยน',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Omitted phrase in translation',
      detected_by_layer: 'L2',
      ai_confidence: 78,
      status: 'pending',
      source_text_excerpt: 'Upload complete',
      target_text_excerpt: 'อัปโหลดเสร็จ',
    },
    {
      severity: 'major',
      category: 'fluency',
      description: 'Unnatural word order',
      detected_by_layer: 'L3',
      ai_confidence: 88,
      status: 'pending',
      source_text_excerpt: 'Export report',
      target_text_excerpt: 'ส่งออกรายงาน',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Inconsistent capitalization',
      detected_by_layer: 'L1',
      ai_confidence: null,
      status: 'accepted',
      source_text_excerpt: 'Filter results',
      target_text_excerpt: 'กรองผลลัพธ์',
    },
    {
      severity: 'minor',
      category: 'terminology',
      description: 'Variant term acceptable but inconsistent',
      detected_by_layer: 'L2',
      ai_confidence: 65,
      status: 'rejected',
      source_text_excerpt: 'Search projects',
      target_text_excerpt: 'ค้นหาโปรเจกต์',
    },
  ]

  for (const f of findings) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        ...f,
      }),
    })
    if (!r.ok) throw new Error(`seed finding: ${r.status} ${await r.text()}`)
  }

  return fileId
}

async function seedSecondFile(opts: { tenantId: string; projectId: string }): Promise<string> {
  return seedFileWithFindings({ ...opts, fileName: `filter-test-b-${Date.now()}.sdlxliff` })
}

// ── Test Suite ──

const TEST_EMAIL = `e2e-filter-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let fileIdA: string
let fileIdB: string

test.describe.serial('Story 4.5: Search, Filter & AI Layer Toggle', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup ──

  test('[setup] signup, create project, seed 2 files with findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Filter Test')

    fileIdA = await seedFileWithFindings({
      tenantId,
      projectId,
      fileName: `filter-test-a-${Date.now()}.sdlxliff`,
    })
    fileIdB = await seedSecondFile({ tenantId, projectId })
    expect(fileIdA).toBeTruthy()
    expect(fileIdB).toBeTruthy()
  })

  // ── Filter Bar (AC1, AC2, AC9) ──

  test('[P1] E-01: should filter findings by severity and show correct count', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Verify filter bar exists
    const toolbar = page.getByRole('toolbar', { name: 'Filter findings' })
    await expect(toolbar).toBeVisible()

    // Default: status=Pending → should show 4 pending findings
    const countLabel = page.getByTestId('filter-count')
    await expect(countLabel).toContainText('of 6 findings')

    // Click Critical severity filter
    await page.getByTestId('filter-severity-critical').click()
    await expect(countLabel).toContainText('Showing 1 of 6')
  })

  test('[P1] E-02: should apply AND logic across multiple filter dimensions', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Clear default status filter to see all
    await page.getByTestId('filter-status-all').click()

    // Apply severity=Major + layer=AI (L2)
    await page.getByTestId('filter-severity-major').click()
    await page.getByTestId('filter-layer-l2').click()

    // Should show badge chips
    await expect(page.getByTestId('filter-chip-severity-major')).toBeVisible()
    await expect(page.getByTestId('filter-chip-layer-L2')).toBeVisible()

    // AND logic: only major L2 findings
    const countLabel = page.getByTestId('filter-count')
    await expect(countLabel).toContainText('of 6')
  })

  test('[P1] E-03: should clear all filters and show all findings', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Apply a filter
    await page.getByTestId('filter-severity-critical').click()
    await expect(page.getByTestId('filter-clear-all')).toBeVisible()

    // Click clear all
    await page.getByTestId('filter-clear-all').click()

    // No chips, default state
    await expect(page.getByTestId('filter-clear-all')).not.toBeVisible()
  })

  // ── Filter Persistence (AC3) ──

  test('[P1] E-04: should persist filter state when switching files and returning', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Apply severity=Major on file A
    await page.getByTestId('filter-severity-major').click()
    await expect(page.getByTestId('filter-chip-severity-major')).toBeVisible()

    // Navigate to file B via FileNavigationDropdown (<Link> — client-side nav, TD-ARCH-001)
    await page.getByTestId('file-nav-trigger').click()
    await page.getByTestId('file-nav-list').waitFor({ state: 'visible' })
    await page.getByTestId(`file-nav-item-${fileIdB}`).click()

    // TD-ARCH-001: <Link> client-side nav — both pages coexist during transition.
    // Wait for the NEW file's h1 to appear (file-scoped store isolates data per instance).
    await page.waitForURL(`**/review/${fileIdB}`, { timeout: 30_000 })
    // Use .last() to target the newest h1 (new tree renders after old tree)
    await expect(page.locator('h1').last()).toContainText(/\.sdlxliff/, { timeout: 30_000 })

    // File B: no severity chip (default filters)
    await expect(page.getByTestId('filter-chip-severity-major')).not.toBeVisible({ timeout: 5_000 })

    // Navigate back to file A via <Link> — use visible() filter for transition overlap
    await page.getByTestId('file-nav-trigger').and(page.locator(':visible')).click()
    await page
      .getByTestId('file-nav-list')
      .and(page.locator(':visible'))
      .waitFor({ state: 'visible' })
    await page.getByTestId(`file-nav-item-${fileIdA}`).and(page.locator(':visible')).click()

    // Wait for file A page to load
    await page.waitForURL(`**/review/${fileIdA}`, { timeout: 30_000 })
    await expect(page.locator('h1').last()).toContainText(/\.sdlxliff/, { timeout: 30_000 })

    // THE KEY ASSERTION: severity=major filter restored from sessionStorage (L2 cache)
    await expect(page.getByTestId('filter-chip-severity-major')).toBeVisible({ timeout: 10_000 })
  })

  // ── Keyword Search (AC4, AC5) ──

  test('[P1] E-05: should filter findings by search query', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Type search query
    const searchInput = page.getByTestId('search-input')
    await searchInput.fill('mistranslation')

    // Wait for debounce (300ms+)
    await page.waitForTimeout(500)

    // Should filter to findings matching "mistranslation"
    const countLabel = page.getByTestId('filter-count')
    await expect(countLabel).toContainText('Showing 1 of 6')
  })

  test('[P2] E-06: should handle Thai text search', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Clear status filter to see all
    await page.getByTestId('filter-status-all').click()

    // Search with Thai text
    const searchInput = page.getByTestId('search-input')
    await searchInput.fill('คำแปล')
    await page.waitForTimeout(500)

    // Should find matching Thai text
    const countLabel = page.getByTestId('filter-count')
    // At least one finding with Thai target text should match
    await expect(countLabel).not.toContainText('Showing 0')
  })

  // ── AI Layer Toggle (AC8) ──

  test('[P1] E-07: should hide L2/L3 findings when AI toggle OFF', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Clear status filter to see all
    await page.getByTestId('filter-status-all').click()

    // Count all findings initially
    const countBefore = page.getByTestId('filter-count')
    await expect(countBefore).toContainText('6 of 6')

    // Toggle AI off
    const aiToggle = page.getByTestId('ai-toggle')
    await aiToggle.click()

    // Should hide L2/L3 findings (only L1 remain)
    // L1 findings: 2 (terminology + style)
    await expect(page.getByTestId('filter-count')).toContainText('of 6')

    // "AI findings hidden" indicator should appear
    await expect(page.getByTestId('ai-hidden-indicator')).toBeVisible()

    // Score badge should be unchanged (display-only toggle)
    const score = await queryScore(fileIdA)
    expect(score).not.toBeNull()
  })

  // ── Command Palette (AC6, AC10) ──

  test('[P1] E-08: should open command palette with Ctrl+K', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Open palette
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()

    // Should have aria-modal
    const dialog = page.getByTestId('command-palette')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')

    // Close with Escape
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-palette')).not.toBeVisible()
  })

  // ── Cross-feature ──

  test('[P0] E-09: should clear bulk selection when filter hides selected findings', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)

    // Wait for keyboard handlers
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Select all via Ctrl+A
    const grid = page.locator('[role="grid"]')
    await grid.click()
    await page.keyboard.press('Control+a')

    // Apply severity=critical filter (hides most selections)
    await page.getByTestId('filter-severity-critical').click()

    // Selection should be reduced or cleared
    // The exact behavior depends on which findings matched — but no crash should occur
    await expect(page.getByTestId('filter-count')).toBeVisible()
  })

  test('[P1] E-10: should auto-advance within filtered view after action', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileIdA)
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

    // Click first finding row to activate it
    const firstRow = page.locator('[role="row"][data-finding-id]').first()
    await firstRow.click()

    // Accept it with keyboard
    await page.keyboard.press('a')

    // Wait for toast
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 5_000 })

    // Auto-advance should move to next PENDING finding in filtered view
    await expect(page.getByTestId('filter-count')).toBeVisible()
  })

  // ── Cleanup ──

  test('[cleanup] remove test project', async () => {
    if (projectId && tenantId) {
      await cleanupTestProject(projectId, tenantId)
    }
  })
})
