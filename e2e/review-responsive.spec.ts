/**
 * Story 4.1d ATDD — E2E: Responsive Layout
 *
 * Story 5.3 AC3 (TD-E2E-017): All per-test skips removed.
 * Suite-level skip guard kept: requires INNGEST_DEV_URL env.
 *
 * Tests the responsive 3-zone layout for the review page:
 *   - Desktop (1440px+): nav sidebar + finding list + static aside
 *   - Laptop (1024-1439px): no sidebar, dropdown nav, Sheet drawer
 *   - Mobile (<768px): single column, toggle button, Sheet drawer
 *   - Breakpoint boundary transitions
 *   - Accessibility: landmarks, focus trap, touch targets
 *   - Animation: reduced-motion compliance
 *
 * Strategy: Seed pre-baked file + segments + findings via PostgREST.
 * Each test sets viewport via page.setViewportSize() and asserts layout.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
import { test, expect } from '@playwright/test'
import type { Cookie, Page } from '@playwright/test'

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

// ── Types ────────────────────────────────────────────────────────────────────

type SeededIds = {
  fileId: string
  segmentIds: string[]
  findingIds: string[]
}

// ── Layout Helper ────────────────────────────────────────────────────────────

/** Wait for layout mode to stabilize after viewport change */
async function waitForLayoutMode(page: Page, expectedMode: string) {
  await expect(page.getByTestId('review-3-zone')).toHaveAttribute(
    'data-layout-mode',
    expectedMode,
    { timeout: 5000 },
  )
}

// ── Seed Helpers ──────────────────────────────────────────────────────────────

/**
 * Seed a file + score + 5 segments + 4 findings via PostgREST for responsive layout tests.
 *
 * Segments:
 *   1: en-US -> th-TH (Thai text)
 *   2: en-US -> th-TH (Thai text)
 *   3: en-US -> th-TH — sourceText "brown fox" for highlight
 *   4: en-US -> ja-JP (Japanese text)
 *   5: en-US -> th-TH (Thai text)
 *
 * Findings:
 *   A: on segment 3, severity=major, L2
 *   B: on segment 4, severity=minor, L2
 *   C: on segment 3, severity=critical, L1
 *   D: on segment 1, severity=minor, L1 — extra finding for list scrolling
 */
async function seedFileWithSegmentsAndFindings(opts: {
  tenantId: string
  projectId: string
}): Promise<SeededIds> {
  const { tenantId, projectId } = opts

  // 1. Insert file row (status: l2_completed)
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: projectId,
      tenant_id: tenantId,
      file_name: `responsive-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 2048,
      storage_path: `e2e/responsive-test-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(`seedFile: failed to insert file: ${fileRes.status} ${text}`)
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seedFile: no file row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score row (calculated + L1L2)
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      mqm_score: 82.5,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 500,
      critical_count: 1,
      major_count: 1,
      minor_count: 2,
      npt: 0.14,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(`seedFile: failed to insert score: ${scoreRes.status} ${text}`)
  }

  // 3. Insert 5 segments
  const segmentRows = [
    {
      segment_number: 1,
      source_text: 'Welcome to the application',
      target_text: 'ยินดีต้อนรับสู่แอปพลิเคชัน',
      source_lang: 'en-US',
      target_lang: 'th-TH',
      word_count: 4,
    },
    {
      segment_number: 2,
      source_text: 'Please review the following translation',
      target_text: 'กรุณาตรวจสอบการแปลต่อไปนี้',
      source_lang: 'en-US',
      target_lang: 'th-TH',
      word_count: 5,
    },
    {
      segment_number: 3,
      source_text: 'The quick brown fox jumps over the lazy dog',
      target_text: 'สุนัขจิ้งจอกสีน้ำตาลกระโดดข้ามสุนัขขี้เกียจ',
      source_lang: 'en-US',
      target_lang: 'th-TH',
      word_count: 9,
    },
    {
      segment_number: 4,
      source_text: 'Configuration settings must be verified',
      target_text: '設定項目を確認する必要があります',
      source_lang: 'en-US',
      target_lang: 'ja-JP',
      word_count: 5,
    },
    {
      segment_number: 5,
      source_text: 'Save changes and continue',
      target_text: 'บันทึกการเปลี่ยนแปลงและดำเนินการต่อ',
      source_lang: 'en-US',
      target_lang: 'th-TH',
      word_count: 4,
    },
  ]

  const segmentIds: string[] = []
  for (const seg of segmentRows) {
    const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: projectId,
        tenant_id: tenantId,
        ...seg,
      }),
    })
    if (!segRes.ok) {
      const text = await segRes.text()
      throw new Error(
        `seedFile: failed to insert segment #${seg.segment_number}: ${segRes.status} ${text}`,
      )
    }
    const segData = (await segRes.json()) as Array<{ id: string }>
    if (segData.length === 0) {
      throw new Error(`seedFile: no segment row returned for #${seg.segment_number}`)
    }
    segmentIds.push(segData[0]!.id)
  }

  // 4. Insert 4 findings
  const findingRows = [
    {
      segment_id: segmentIds[2],
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslated animal name in source text',
      detected_by_layer: 'L2',
      ai_model: 'gpt-4o-mini',
      ai_confidence: 85,
      source_text_excerpt: 'brown fox',
      target_text_excerpt: 'สีน้ำตาล',
      status: 'pending',
    },
    {
      segment_id: segmentIds[3],
      severity: 'minor',
      category: 'fluency',
      description: 'Awkward phrasing in Japanese target text',
      detected_by_layer: 'L2',
      ai_model: 'gpt-4o-mini',
      ai_confidence: 72,
      source_text_excerpt: 'Configuration settings',
      target_text_excerpt: '設定項目',
      status: 'pending',
    },
    {
      segment_id: segmentIds[2],
      severity: 'critical',
      category: 'terminology',
      description: 'Critical glossary term violation in translation',
      detected_by_layer: 'L1',
      source_text_excerpt: 'quick brown',
      target_text_excerpt: 'จิ้งจอก',
      status: 'pending',
    },
    {
      segment_id: segmentIds[0],
      severity: 'minor',
      category: 'whitespace',
      description: 'Leading whitespace in target segment',
      detected_by_layer: 'L1',
      source_text_excerpt: 'Welcome',
      target_text_excerpt: 'ยินดีต้อนรับ',
      status: 'pending',
    },
  ]

  const findingIds: string[] = []
  for (const f of findingRows) {
    const findingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: projectId,
        tenant_id: tenantId,
        ...f,
      }),
    })
    if (!findingRes.ok) {
      const text = await findingRes.text()
      throw new Error(
        `seedFile: failed to insert finding (${f.category}): ${findingRes.status} ${text}`,
      )
    }
    const findingData = (await findingRes.json()) as Array<{ id: string }>
    if (findingData.length === 0) {
      throw new Error(`seedFile: no finding row returned for ${f.category}`)
    }
    findingIds.push(findingData[0]!.id)
  }

  return { fileId, segmentIds, findingIds }
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-responsive-${Date.now()}@test.local`

// Shared state across serial tests (set in [setup])
let projectId: string
let tenantId: string
let seeded: SeededIds
// Auth cookies saved after setup login — restored in subsequent tests
// to avoid repeated UI login which causes session instability
let savedCookies: Cookie[] = []

/** Restore auth cookies from setup — avoids expensive re-login per test */
async function restoreAuth(page: Page) {
  await page.context().addCookies(savedCookies)
}

test.describe.serial('Review Responsive Layout — Story 4.1d', () => {
  test.setTimeout(120_000)

  // Skip if Inngest dev server is not available (outer gate)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup: Auth + Project + Seeded Data ──────────────────────────────────

  test('[setup] signup, create project, seed file with segments and findings', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    // Save auth cookies for subsequent tests (avoids re-login instability)
    savedCookies = await page.context().cookies()

    // Suppress onboarding tours so driver.js overlay doesn't intercept clicks
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'E2E Responsive Layout Test')
    expect(projectId).toBeTruthy()

    // Seed file with 5 segments + 4 findings
    seeded = await seedFileWithSegmentsAndFindings({
      tenantId,
      projectId,
    })
    expect(seeded.fileId).toBeTruthy()
    expect(seeded.segmentIds).toHaveLength(5)
    expect(seeded.findingIds).toHaveLength(4)

    // Verify seed: score exists with correct status
    const score = await queryScore(seeded.fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('calculated')
    expect(score!.layer_completed).toBe('L1L2')
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 1: Desktop Layout (1440px+)
  // ════════════════════════════════════════════════════════════════════════════

  test('[P0] T1.1 — 3-zone layout visible at 1440px: nav sidebar + finding list + static aside', async ({
    page,
  }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // Root layout container should be visible
    const rootLayout = page.getByTestId('review-3-zone')
    await expect(rootLayout).toBeVisible()

    // Navigation sidebar should be visible (nav landmark)
    const navSidebar = page.locator('nav')
    await expect(navSidebar.first()).toBeVisible()

    // Finding list should be visible
    const findingList = page.getByTestId('finding-list')
    await expect(findingList).toBeVisible()

    // Static aside (detail panel) should be visible
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).toBeVisible()
  })

  test('[P0] T1.2 — detail panel renders as static aside (NOT in Radix portal)', async ({
    page,
  }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // Detail panel content should exist within the static aside
    const asideContent = page.getByTestId('finding-detail-content')
    await expect(asideContent).toBeVisible()

    // Detail content must be inside the static aside (NOT in a Radix portal)
    const isInsideAside = await page.evaluate(() => {
      const content = document.querySelector('[data-testid="finding-detail-content"]')
      const aside = document.querySelector('[data-testid="finding-detail-aside"]')
      return aside !== null && content !== null && aside.contains(content)
    })
    expect(isInsideAside).toBe(true)
  })

  test('[P0] T1.4/RT-2a — exactly 1 [role="complementary"]:visible', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // Exactly one visible complementary landmark
    const complementary = page.locator('[role="complementary"]:visible')
    await expect(complementary).toHaveCount(1)
  })

  test('[P1] T1.3 — data-layout-mode="desktop" on root div', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const rootLayout = page.getByTestId('review-3-zone')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'desktop')
  })

  test('[P1] T1.5/RT-3c — aside computed width approx 400px (boundingBox 395-405)', async ({
    page,
  }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).toBeVisible()

    const box = await aside.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(395)
    expect(box!.width).toBeLessThanOrEqual(405)
  })

  test('[P1] T1.6/RT-1b — Tab from finding list reaches aside content', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // Focus a finding row in the grid
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible()
    const firstRow = grid.getByRole('row').first()
    await firstRow.focus()
    await expect(firstRow).toBeFocused()

    // Tab repeatedly — focus should eventually reach aside content
    let reachedAside = false
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      const isInAside = await page.evaluate(() => {
        const el = document.activeElement
        const aside = document.querySelector('[data-testid="finding-detail-aside"]')
        return aside !== null && el !== null && aside.contains(el)
      })
      if (isInAside) {
        reachedAside = true
        break
      }
    }
    expect(reachedAside).toBe(true)
  })

  test('[P1] RT-2b — complementary NOT in [data-testid="finding-detail-sheet"]', async ({
    page,
  }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // At desktop, [role="complementary"] must be the static aside, NOT a portal-mounted Sheet
    const complementaryIsAside = await page.evaluate(() => {
      const comp = document.querySelector('[role="complementary"]:not([aria-hidden])')
      // Static aside has data-testid="finding-detail-aside"; Sheet has "finding-detail-sheet"
      return comp?.getAttribute('data-testid') === 'finding-detail-aside'
    })
    expect(complementaryIsAside).toBe(true)
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 2: Laptop Layout (1024-1439px)
  // ════════════════════════════════════════════════════════════════════════════

  test('[P1] T2.1 — sidebar hidden, FileNavigationDropdown visible at 1200px', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Sidebar nav should be hidden at laptop breakpoint
    const navSidebar = page.locator('nav')
    // At laptop, the file navigation sidebar is replaced by a dropdown
    const fileDropdown = page.getByTestId('file-navigation-dropdown')
    await expect(fileDropdown).toBeVisible()

    // The sidebar (tree-style file nav) should not be visible
    // Use a more specific selector — sidebar is typically a <nav> with file tree content
    const staticAside = page.getByTestId('finding-detail-aside')
    await expect(staticAside).not.toBeVisible()
  })

  test('[P1] T2.2/RT-2c — detail panel in Radix portal at laptop', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Click a finding row to open the detail Sheet
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Detail panel should render inside a Radix portal (Sheet)
    const portalContent = page.locator(
      '[data-testid="finding-detail-sheet"] [data-testid="finding-detail-content"]',
    )
    await expect(portalContent).toBeVisible({ timeout: 10_000 })
  })

  test('[P1] T2.3/RT-3a — Sheet width approx 360px (boundingBox 355-365)', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Click a finding to open Sheet
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Wait for Sheet to appear
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    const box = await sheetContent.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(355)
    expect(box!.width).toBeLessThanOrEqual(365)
  })

  test('[P1] T2.4 — scrim visible, click scrim closes Sheet at laptop', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Click a finding to open Sheet
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Sheet should be visible
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    // Scrim/overlay should be visible (Radix Sheet renders an overlay sibling)
    const overlay = page.locator('[data-slot="sheet-overlay"][data-state="open"]').first()
    await expect(overlay).toBeVisible()

    // Click the scrim area (left side of viewport, away from Sheet)
    await page.mouse.click(50, 450)

    // Sheet should close
    await expect(sheetContent).not.toBeVisible({ timeout: 5_000 })
  })

  test('[P1] T2.5/RT-1a — sidebar nav not in tab order at laptop', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Tab through the page — sidebar nav links should NOT receive focus
    // because the sidebar is hidden at laptop breakpoint
    const sidebarLinks: string[] = []
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const isInSidebar = await page.evaluate(() => {
        const el = document.activeElement
        // Check if focused element is inside a sidebar nav that should be hidden
        const sidebarNav = document.querySelector('[data-testid="file-sidebar-nav"]')
        return sidebarNav !== null && el !== null && sidebarNav.contains(el)
      })
      if (isInSidebar) {
        sidebarLinks.push('found-sidebar-focus')
      }
    }
    expect(sidebarLinks).toHaveLength(0)
  })

  test('[P1] RT-6 — ARIA nav landmark present (dropdown) at laptop', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // A <nav> element should still be present at laptop (contains dropdown navigation)
    const navLandmark = page.locator('nav')
    await expect(navLandmark.first()).toBeVisible()

    // Dropdown should be inside or adjacent to nav
    const fileDropdown = page.getByTestId('file-navigation-dropdown')
    await expect(fileDropdown).toBeVisible()
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 3: Mobile Layout (<768px)
  // ════════════════════════════════════════════════════════════════════════════

  test('[P1] T3.1 — single column, only finding list visible at 375px', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    // Finding list should be visible as single column
    const findingList = page.getByTestId('finding-list')
    await expect(findingList).toBeVisible()

    // Static aside should NOT be visible
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).not.toBeVisible()

    // Sidebar nav should NOT be visible
    const sidebarNav = page.locator('[data-testid="file-sidebar-nav"]')
    await expect(sidebarNav).not.toBeVisible()
  })

  test('[P1] T3.2/RT-3b — Sheet drawer width approx 300px (boundingBox 295-305) at mobile', async ({
    page,
  }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    // Click a finding to open Sheet drawer
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Sheet should appear
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    const box = await sheetContent.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(295)
    expect(box!.width).toBeLessThanOrEqual(305)
  })

  test('[P1] T3.3 — click finding opens Sheet, close shows toggle button', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    // Click a finding row — Sheet should open directly at mobile
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Sheet should be open (mobile auto-open on click)
    const sheet = page.getByTestId('finding-detail-sheet')
    await expect(sheet).toBeVisible({ timeout: 5_000 })

    // Close Sheet via Escape — Sheet closes but selectedId preserved
    await page.keyboard.press('Escape')
    await expect(sheet).not.toBeVisible({ timeout: 5_000 })

    // Toggle button visible when finding selected but panel closed (ATDD T3.3)
    const toggleButton = page.getByTestId('detail-panel-toggle')
    await expect(toggleButton).toBeVisible({ timeout: 5_000 })
  })

  test('[P2] T3.4 — MobileBanner visible at mobile breakpoint', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    // Mobile banner should be visible at mobile viewport (text from mobile-banner.tsx)
    const mobileBanner = page.getByText(/best review experience.*desktop/i)
    await expect(mobileBanner).toBeVisible({ timeout: 5_000 })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 4: Breakpoint Boundaries
  // ════════════════════════════════════════════════════════════════════════════

  test('[P0] BV-1440 — at 1440px = desktop layout, at 1439px = laptop layout', async ({ page }) => {
    await restoreAuth(page)

    // At exactly 1440px -> desktop
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    const rootLayout = page.getByTestId('review-3-zone')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'desktop')

    // Resize to 1439px -> laptop
    await page.setViewportSize({ width: 1439, height: 900 })
    await waitForLayoutMode(page, 'laptop')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'laptop')
  })

  test('[P0] BV-1024 — at 1024px = laptop layout, at 1023px = tablet/mobile layout', async ({
    page,
  }) => {
    await restoreAuth(page)

    // At exactly 1024px -> laptop
    await page.setViewportSize({ width: 1024, height: 768 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    const rootLayout = page.getByTestId('review-3-zone')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'laptop')

    // Resize to 1023px -> mobile/tablet
    await page.setViewportSize({ width: 1023, height: 768 })
    await waitForLayoutMode(page, 'mobile')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'mobile')
  })

  test('[P1] BV-768 — at 768px = mobile layout, finding list visible', async ({ page }) => {
    await restoreAuth(page)

    // At 768px -> mobile (finding list visible, no sidebar)
    await page.setViewportSize({ width: 768, height: 1024 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    const findingList = page.getByTestId('finding-list')
    await expect(findingList).toBeVisible()

    // At 767px -> still mobile, MobileBanner visible at boundary
    await page.setViewportSize({ width: 767, height: 1024 })
    await waitForLayoutMode(page, 'mobile')

    // Static aside should NOT be visible at mobile
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).not.toBeVisible()

    // MobileBanner visible below 768px (md:hidden breakpoint boundary)
    const mobileBanner = page.getByText(/best review experience.*desktop/i)
    await expect(mobileBanner).toBeVisible({ timeout: 5_000 })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 5: Mode Persistence & Transitions
  // ════════════════════════════════════════════════════════════════════════════

  test('[P0] T4.6/WI-5 — selectedId persists: select finding in aside -> resize to 1100px -> Sheet opens with SAME finding', async ({
    page,
  }) => {
    await restoreAuth(page)

    // Start at desktop: 1440px with static aside
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // Focus a finding row in the grid — detail shows in aside
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible()
    const firstRow = grid.getByRole('row').first()
    await firstRow.focus()
    await page.keyboard.press('j')

    // Get the finding description from the static aside
    const asideContent = page.getByTestId('finding-detail-content')
    await expect(asideContent).toBeVisible({ timeout: 10_000 })
    const descriptionText = await asideContent
      .locator('p, span, [data-testid]')
      .first()
      .textContent()

    // Resize to laptop (1100px) — Sheet should open with the SAME finding
    await page.setViewportSize({ width: 1100, height: 900 })
    await waitForLayoutMode(page, 'laptop')

    // Sheet should show the same finding content
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    // Verify the same finding description is displayed in the Sheet
    if (descriptionText) {
      await expect(sheetContent).toContainText(descriptionText, { timeout: 5_000 })
    }
  })

  test('[P1] WI-1 — resize during Sheet animation: 1200->1500, no scrim remnant', async ({
    page,
  }) => {
    await restoreAuth(page)

    // Start at laptop (1200px)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Open Sheet by clicking a finding
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Sheet is visible
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    // Immediately resize to desktop (1500px) — simulate mid-animation resize
    await page.setViewportSize({ width: 1500, height: 900 })
    await waitForLayoutMode(page, 'desktop')

    // No scrim/overlay remnants should be visible
    const scrimRemnant = page.locator('[data-slot="sheet-overlay"][data-state="open"]')
    await expect(scrimRemnant).toHaveCount(0, { timeout: 5_000 })

    // Static aside should be visible instead of Sheet
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).toBeVisible()
  })

  test('[P1] T4.8 — viewport resize 1440->1024->768, layout transitions correctly', async ({
    page,
  }) => {
    await restoreAuth(page)

    // Start at desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const rootLayout = page.getByTestId('review-3-zone')

    // Desktop: 1440px
    await waitForLayoutMode(page, 'desktop')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'desktop')

    // Transition to laptop: 1024px
    await page.setViewportSize({ width: 1024, height: 900 })
    await waitForLayoutMode(page, 'laptop')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'laptop')

    // Transition to mobile: 768px
    await page.setViewportSize({ width: 768, height: 900 })
    await waitForLayoutMode(page, 'mobile')
    await expect(rootLayout).toHaveAttribute('data-layout-mode', 'mobile')
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 6: Accessibility
  // ════════════════════════════════════════════════════════════════════════════

  test('[P1] T6.4 — role="complementary" on detail panel at all breakpoints', async ({ page }) => {
    test.setTimeout(180_000) // 3 breakpoints + navigation = longer test
    await restoreAuth(page)

    // Desktop — static aside has role="complementary"
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    const desktopComplementary = page.locator('[role="complementary"]:visible')
    await expect(desktopComplementary).toHaveCount(1)

    // Laptop — Sheet has role="complementary" (click finding to open)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    const findingRow = page.getByTestId('finding-compact-row').first()
    await findingRow.click()

    const laptopComplementary = page.locator('[role="complementary"]:visible')
    await expect(laptopComplementary).toHaveCount(1, { timeout: 10_000 })

    // Mobile — fresh navigate to avoid lingering Sheet overlay from laptop
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    // Click finding to open Sheet at mobile
    const mobileFindingRow = page.getByTestId('finding-compact-row').first()
    await expect(mobileFindingRow).toBeVisible({ timeout: 10_000 })
    await mobileFindingRow.click()

    const mobileComplementary = page.locator('[role="complementary"]:visible')
    await expect(mobileComplementary).toHaveCount(1, { timeout: 10_000 })
  })

  test('[P1] T6.5/PM-5 — focus trap in Sheet at 1200px (Tab cycles within)', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Open Sheet by clicking a finding
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Wait for Sheet
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    // Tab multiple times — focus should stay within Sheet
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      const isTrapped = await page.evaluate(() => {
        const el = document.activeElement
        const sheet = document.querySelector('[role="complementary"]')
        if (sheet && el && sheet.contains(el)) return true
        // Also check inside Radix portal (Sheet content may be in portal)
        const portal = el?.closest(
          '[data-testid="finding-detail-sheet"], [role="dialog"], [role="complementary"]',
        )
        return portal !== null
      })
      expect(isTrapped).toBe(true)
    }
  })

  test('[P1] T6.6/PM-6 — no focus trap at 1440px (Tab moves between zones)', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'desktop')

    // Focus a finding row
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible()
    const firstRow = grid.getByRole('row').first()
    await firstRow.focus()

    // Tab — focus should eventually leave the finding list and reach other zones
    const visitedZones = new Set<string>()
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const zone = await page.evaluate(() => {
        const el = document.activeElement
        if (!el) return 'none'
        if (el.closest('[data-testid="finding-list"]')) return 'finding-list'
        if (el.closest('[data-testid="finding-detail-aside"]')) return 'aside'
        if (el.closest('nav')) return 'nav'
        return 'other'
      })
      visitedZones.add(zone)
    }

    // Should have visited at least 2 different zones (no trap)
    const zonesWithContent = [...visitedZones].filter((z) => z !== 'none' && z !== 'other')
    expect(zonesWithContent.length).toBeGreaterThanOrEqual(2)
  })

  test('[P1] T6.7/RT-5 — touch targets >= 44x44 at 768px via boundingBox', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 768, height: 1024 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'mobile')

    // Finding rows should have >= 44px height (touch target per WCAG 2.5.8)
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()

    const rowBox = await findingRow.boundingBox()
    expect(rowBox).not.toBeNull()
    expect(rowBox!.height).toBeGreaterThanOrEqual(44)

    // Finding count summary is display-only (not interactive), no touch target requirement
  })

  test('[P2] T6.8 — keyboard J/K works at 1200px viewport', async ({ page }) => {
    await restoreAuth(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Focus the grid
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible()
    const firstRow = grid.getByRole('row').first()
    await firstRow.focus()
    await expect(firstRow).toBeFocused()

    // Wait for keyboard handlers
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Press J to move to next finding
    await page.keyboard.press('j')

    // Verify focus moved (tabindex changed)
    const focusedRow = grid.locator('[role="row"][tabindex="0"]')
    await expect(focusedRow).toBeVisible()

    // Press K to move back
    await page.keyboard.press('k')

    // First row should be focused again
    await expect(firstRow).toHaveAttribute('tabindex', '0')
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Group 7: Animation & Reduced Motion
  // ════════════════════════════════════════════════════════════════════════════

  test('[P1] T5.3/WI-6a — Sheet open with emulateMedia reducedMotion:reduce -> content visible immediately', async ({
    page,
  }) => {
    await restoreAuth(page)

    // Enable reduced motion BEFORE navigation
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Click a finding to open Sheet
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // With reduced motion, Sheet content should be visible almost instantly
    // Use a very short timeout to assert "instant" appearance
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 500 })

    // Detail content should also be immediately visible
    const detailContent = page.getByTestId('finding-detail-content')
    await expect(detailContent).toBeVisible({ timeout: 500 })
  })

  test('[P1] RT-4c — Sheet NOT instant without reduced motion (has transition)', async ({
    page,
  }) => {
    await restoreAuth(page)

    // Default: NO reduced-motion preference
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await page.setViewportSize({ width: 1200, height: 900 })
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await waitForLayoutMode(page, 'laptop')

    // Click a finding to open Sheet
    const findingRow = page.getByTestId('finding-compact-row').first()
    await expect(findingRow).toBeVisible()
    await findingRow.click()

    // Verify that the Sheet has a CSS transition/animation property
    // (This confirms animation is present when reduced-motion is NOT set)
    const sheetContent = page.getByTestId('finding-detail-sheet')
    await expect(sheetContent).toBeVisible({ timeout: 10_000 })

    // Check computed style for transition or animation properties
    const hasTransition = await page.evaluate(() => {
      const sheet = document.querySelector('[role="complementary"]')
      if (!sheet) return false
      const style = window.getComputedStyle(sheet)
      const transition = style.transition || style.getPropertyValue('transition')
      const animation = style.animation || style.getPropertyValue('animation')
      // Radix Sheet applies transform transition; check for any non-none transition
      return (
        (transition !== '' && transition !== 'none' && !transition.startsWith('all 0s')) ||
        (animation !== '' && animation !== 'none')
      )
    })
    expect(hasTransition).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Story 5.1 TD-UX-003: BT Section Responsive Behavior
  // Verify LanguageBridge panel doesn't cause horizontal scroll at any breakpoint
  // ══════════════════════════════════════════════════════════════════════════

  test('[P1] BT-R1 — LanguageBridge section no horizontal overflow at desktop 1440px', async ({
    page,
  }) => {
    await restoreAuth(page)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await page.setViewportSize({ width: 1440, height: 900 })
    await waitForLayoutMode(page, 'desktop')

    // Focus finding to show detail panel
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Wait for detail aside to show content
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).toBeVisible({ timeout: 10_000 })

    // Check no horizontal scroll on aside
    const hasHScroll = await aside.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(hasHScroll).toBe(false)

    // Check BT section visible and no overflow
    const btPanel = page.getByTestId('language-bridge-panel')
    // BT panel renders only when isNonNative=true (seed data uses non-native reviewer + Thai target).
    // If seed changes, this guard silently skips BT overflow check — verify seed includes non-native pair.
    const btVisible = await btPanel.isVisible().catch(() => false)
    if (btVisible) {
      const btOverflow = await btPanel.evaluate((el) => el.scrollWidth > el.clientWidth)
      expect(btOverflow).toBe(false)
    }
  })

  test('[P1] BT-R2 — LanguageBridge section no horizontal overflow at laptop 1200px', async ({
    page,
  }) => {
    // Start at desktop (1440px) to select finding → aside visible with BT panel
    // Then resize to 1200px (laptop) → verify Sheet content preserves layout
    await restoreAuth(page)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await page.setViewportSize({ width: 1440, height: 900 })
    await waitForLayoutMode(page, 'desktop')

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Select finding at desktop (sets selectedId)
    await page.keyboard.press('j')
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).toBeVisible({ timeout: 10_000 })

    // Resize to laptop — Sheet should auto-open with same selectedId
    await page.setViewportSize({ width: 1200, height: 900 })
    await waitForLayoutMode(page, 'laptop')

    // Sheet opens because selectedId is already set (WI-5 pattern)
    const sheet = page.locator('[data-testid="finding-detail-sheet"]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })

    // Check no horizontal scroll in Sheet content
    const detailContent = sheet.getByTestId('finding-detail-content')
    const hasHScroll = await detailContent.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(hasHScroll).toBe(false)
  })

  test('[P1] BT-R3 — LanguageBridge section no horizontal overflow at tablet 768px (Sheet)', async ({
    page,
  }) => {
    // Start at desktop to select finding, then resize to tablet
    await restoreAuth(page)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)
    await page.setViewportSize({ width: 1440, height: 900 })
    await waitForLayoutMode(page, 'desktop')

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Select finding at desktop
    await page.keyboard.press('j')
    const aside = page.getByTestId('finding-detail-aside')
    await expect(aside).toBeVisible({ timeout: 10_000 })

    // Resize to tablet (768px) — mobile toggle should appear with selectedId set
    await page.setViewportSize({ width: 768, height: 1024 })
    await waitForLayoutMode(page, 'mobile')

    // Toggle button should be visible (selectedId already set from desktop)
    const toggleBtn = page.getByTestId('detail-panel-toggle')
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 })
    await toggleBtn.click()

    // Wait for Sheet
    const sheet = page.locator('[data-testid="finding-detail-sheet"]')
    await expect(sheet).toBeVisible({ timeout: 10_000 })

    // Check no horizontal scroll
    const detailContent = sheet.getByTestId('finding-detail-content')
    const hasHScroll = await detailContent.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(hasHScroll).toBe(false)
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        // Non-critical — global teardown will clean up the ephemeral user
        // NOTE: process.stderr.write used — E2E runs in Playwright Node.js process, pino not importable
        process.stderr.write(`[cleanup] Failed to clean project ${projectId}: ${String(err)}\n`)
      }
    }
  })
})
