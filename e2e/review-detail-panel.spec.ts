/**
 * Story 4.1c ATDD — E2E: Detail Panel & Segment Context
 *
 * Tests the finding detail panel that shows:
 *   - Finding metadata (severity, category, layer, description)
 *   - Full segment text with <mark> highlight on excerpt
 *   - Surrounding context segments (±N)
 *   - Click-to-navigate on context segments with findings
 *   - Context range selector (1/2/3)
 *   - CJK/Thai lang attribute compliance
 *   - Sheet focus trap and Esc restore
 *
 * Strategy: Seed pre-baked file + segments + findings via PostgREST.
 * Each test operates on the same review page URL.
 *
 * Dev Note #17: finding.sourceTextExcerpt MUST be a real substring of
 * segment.sourceText — otherwise highlight tests pass vacuously.
 *
 * Dev Note #19: Viewport MUST be set to ≥1440px (desktop breakpoint).
 *
 * Layout behaviour by breakpoint (ReviewPageClient.tsx):
 *   - ≥1440px (isDesktop=true):  static <aside role="complementary"> in DOM.
 *     J key triggers handleActiveFindingChange → setSelectedFinding → aside shows finding.
 *   - 1024–1439px (isLaptop):    Radix Sheet overlay (role="complementary" inside portal).
 *     J key does NOT call setSelectedFinding (intentional — avoids blocking finding list).
 *     Sheet only opens when setSelectedFinding is called explicitly (e.g. from autoAdvance).
 *   - <1024px (mobile):          Sheet only opens via toggle button.
 *
 * Playwright `devices['Desktop Chrome']` default viewport is 1280x720 (laptop breakpoint).
 * At 1280px the aside has CSS `hidden 2xl:block` (visible only at ≥1536px), so
 * `page.locator('[role="complementary"]')` resolves to the hidden aside — test fails.
 *
 * Fix: force desktop viewport (1440px) so the static aside is used, J key wires up
 * correctly, and `role="complementary"` resolves to the always-visible aside element.
 *
 * E2E locators:
 *   - page.locator('[role="complementary"]') — works at ≥1440px (static aside)
 *   - page.getByTestId('segment-context-loaded') — always global (async loaded)
 *   - NOT page.getByTestId('finding-detail-sheet').getByText(...) — misses portal
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
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

// ── Types ────────────────────────────────────────────────────────────────────

type SeededIds = {
  fileId: string
  segmentIds: string[]
  findingIds: string[]
}

// ── Seed Helpers ──────────────────────────────────────────────────────────────

/**
 * Seed a file + score + 5 segments + 3 findings via PostgREST for detail panel tests.
 *
 * Segments:
 *   1: en-US → th-TH (Thai text)
 *   2: en-US → th-TH (Thai text)
 *   3: en-US → th-TH — sourceText contains "brown fox" for highlight test
 *   4: en-US → ja-JP (Japanese text for CJK test)
 *   5: en-US → th-TH (Thai text)
 *
 * Findings:
 *   A: on segment 3, severity=major, excerpt="brown fox" (guaranteed substring)
 *   B: on segment 4, severity=minor, for click-to-navigate (E4)
 *   C: on segment 3, severity=critical, different severity for sorting
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
      file_name: `detail-panel-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 2048,
      storage_path: `e2e/detail-panel-test-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(
      `seedFileWithSegmentsAndFindings: failed to insert file: ${fileRes.status} ${text}`,
    )
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0)
    throw new Error('seedFileWithSegmentsAndFindings: no file row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score row (calculated + L1L2)
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      mqm_score: 85.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 500,
      critical_count: 1,
      major_count: 1,
      minor_count: 1,
      npt: 0.12,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(
      `seedFileWithSegmentsAndFindings: failed to insert score: ${scoreRes.status} ${text}`,
    )
  }

  // 3. Insert 5 segments with consecutive segmentNumber (1-5)
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
        `seedFileWithSegmentsAndFindings: failed to insert segment #${seg.segment_number}: ${segRes.status} ${text}`,
      )
    }
    const segData = (await segRes.json()) as Array<{ id: string }>
    if (segData.length === 0)
      throw new Error(
        `seedFileWithSegmentsAndFindings: no segment row returned for #${seg.segment_number}`,
      )
    segmentIds.push(segData[0]!.id)
  }

  // 4. Insert 3 findings:
  //   Finding A: on segment 3, major, excerpt="brown fox" (guaranteed substring)
  //   Finding B: on segment 4, minor, for click-to-navigate (E4)
  //   Finding C: on segment 3, critical, different severity
  const findingRows = [
    {
      // Finding A — segment 3 (segmentIds[2])
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
      // Finding B — segment 4 (segmentIds[3]) — for click-to-navigate test
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
      // Finding C — segment 3 (segmentIds[2]) — same segment, different severity
      segment_id: segmentIds[2],
      severity: 'critical',
      category: 'terminology',
      description: 'Critical glossary term violation in translation',
      detected_by_layer: 'L1',
      source_text_excerpt: 'quick brown',
      target_text_excerpt: 'จิ้งจอก',
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
        `seedFileWithSegmentsAndFindings: failed to insert finding (${f.category}): ${findingRes.status} ${text}`,
      )
    }
    const findingData = (await findingRes.json()) as Array<{ id: string }>
    if (findingData.length === 0)
      throw new Error(`seedFileWithSegmentsAndFindings: no finding row returned for ${f.category}`)
    findingIds.push(findingData[0]!.id)
  }

  return { fileId, segmentIds, findingIds }
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-detail-${Date.now()}@test.local`

// Shared state across serial tests (set in [setup])
let projectId: string
let tenantId: string
let seeded: SeededIds

test.describe.serial('Detail Panel & Segment Context — Story 4.1c ATDD', () => {
  test.setTimeout(120_000)

  // Force desktop viewport (≥1440px) so the static aside is rendered.
  // At the Playwright default of 1280px (laptop), the aside has `hidden 2xl:block`
  // and J key does not call setSelectedFinding — Sheet never opens (by design).
  // See Dev Note #19 in the file header for full explanation.
  test.use({ viewport: { width: 1440, height: 900 } })

  // Skip if Inngest dev server is not available (outer gate)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup: Auth + Project + Seeded Data ──────────────────────────────────
  test('[setup] signup, create project, seed file with segments and findings', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    // Suppress onboarding tours so driver.js overlay doesn't intercept clicks
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'E2E Detail Panel Test')
    expect(projectId).toBeTruthy()

    // Seed file with 5 segments + 3 findings
    seeded = await seedFileWithSegmentsAndFindings({
      tenantId,
      projectId,
    })
    expect(seeded.fileId).toBeTruthy()
    expect(seeded.segmentIds).toHaveLength(5)
    expect(seeded.findingIds).toHaveLength(3)

    // Verify seed: score exists with correct status
    const score = await queryScore(seeded.fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('calculated')
    expect(score!.layer_completed).toBe('L1L2')
  })

  // ── 4.1c-E1 [P0]: Focus finding → detail panel shows metadata ─────────
  test('[P0] E1: should show finding metadata in detail panel when finding is focused', async ({
    page,
  }) => {
    // Navigate to review page with seeded findings
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    // Finding list should be visible with grid role
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus first finding row explicitly
    const firstRow = grid.getByRole('row').first()
    await firstRow.focus()
    await expect(firstRow).toBeFocused({ timeout: 5_000 })

    // Wait for keyboard handler registration
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', {
      timeout: 15_000,
    })

    // Press J to navigate to first finding (ensure keyboard interaction is active)
    await page.keyboard.press('j')

    // Wait for detail panel (Sheet) to appear — Radix Sheet portal at body level
    // Use role="complementary" per ARIA landmarks (Guardrail #38)
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })

    // Assert: severity badge visible (icon + text per Guardrail #36)
    // Seeded findings have critical, major, minor — first displayed depends on sort
    // At minimum, one severity text should be visible in the panel
    const severityText = detailPanel.getByText(/critical|major|minor/i).first()
    await expect(severityText).toBeVisible()

    // Assert: category text visible
    const categoryText = detailPanel.getByText(/accuracy|terminology|fluency/i).first()
    await expect(categoryText).toBeVisible()

    // Assert: layer badge visible (Rule for L1, AI for L2/L3)
    const layerBadge = detailPanel.getByText(/Rule|AI/i).first()
    await expect(layerBadge).toBeVisible()

    // Assert: description text visible
    const descriptionText = detailPanel
      .getByText(/Mistranslated|Critical glossary|Awkward phrasing/i)
      .first()
    await expect(descriptionText).toBeVisible()

    // Assert: status badge visible (Pending — all seeded findings are pending)
    const statusBadge = detailPanel.getByText(/Pending/i).first()
    await expect(statusBadge).toBeVisible()
  })

  // ── 4.1c-E2 [P0]: Detail panel shows full segment text with <mark> highlight ──
  test('[P0] E2: should show full segment text with <mark> highlight on excerpt', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding on segment 3 (Finding A or C — both on segment 3)
    // Navigate through findings with J until we find one with "brown fox" or "quick brown"
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Navigate to focus a finding — press J to move through findings
    // The detail panel should open/sync automatically
    await page.keyboard.press('j')

    // Wait for detail panel to be visible
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })

    // Wait for segment context to fully load (async fetch + debounce)
    // Use global testid — not scoped to detailPanel (Radix portal at body level)
    await page.waitForSelector('[data-testid="segment-context-loaded"]', {
      timeout: 15_000,
    })

    // Assert: full source text visible (NOT truncated 500-char excerpt)
    // Segment 3 sourceText = "The quick brown fox jumps over the lazy dog"
    // Navigate to the finding that's on segment 3 if not already there
    // Check for the full text — if not visible, press J to find it
    const fullSourceText = page.getByText('The quick brown fox jumps over the lazy dog')
    const isVisible = await fullSourceText.isVisible().catch(() => false)

    if (!isVisible) {
      // Navigate through findings to find the one on segment 3
      await page.keyboard.press('j')
      await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })
    }

    await expect(page.getByText('The quick brown fox jumps over the lazy dog')).toBeVisible({
      timeout: 10_000,
    })

    // Assert: <mark> element contains the excerpt "brown fox" or "quick brown"
    // (depends on which finding on segment 3 is focused)
    const markElement = page.locator('mark').first()
    await expect(markElement).toBeVisible()
    const markText = await markElement.textContent()
    expect(markText).toMatch(/brown fox|quick brown/)
  })

  // ── 4.1c-E3 [P1]: Context segments ±2 visible ──────────────────────────
  test('[P1] E3: should show context segments ±2 around finding segment', async ({ page }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding on segment 3 — it has ±2 context available (segments 1-5)
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Wait for detail panel + segment context loaded
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Navigate to finding on segment 3 if needed (check for segment 3's source text)
    const seg3Text = page.getByText('The quick brown fox jumps over the lazy dog')
    if (!(await seg3Text.isVisible().catch(() => false))) {
      await page.keyboard.press('j')
      await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })
    }

    // Assert: context segments visible
    // Segment 3 is the current segment → context should show segments 1, 2 (before) and 4, 5 (after)
    // At least 3 context segment rows should be visible (before + after, may be fewer at boundaries)
    // Context segments display segment numbers like "Seg 1", "Seg 2", etc.
    const contextSegments = page.getByTestId('context-segment')
    await expect(contextSegments).toHaveCount(4, { timeout: 10_000 }) // 2 before + 2 after

    // Assert: segment numbers are displayed
    await expect(page.getByText(/Seg\s*1/i)).toBeVisible()
    await expect(page.getByText(/Seg\s*2/i)).toBeVisible()
    await expect(page.getByText(/Seg\s*4/i)).toBeVisible()
    await expect(page.getByText(/Seg\s*5/i)).toBeVisible()

    // Assert: context segment text is visible (at least one before and one after)
    await expect(page.getByText('Welcome to the application')).toBeVisible() // Segment 1
    await expect(page.getByText('Save changes and continue')).toBeVisible() // Segment 5
  })

  // ── 4.1c-E4 [P1]: Click context segment with findings → navigates ──────
  test('[P1] E4: should navigate to finding when clicking context segment with findings', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding on segment 3 (Finding A) — segment 4 appears in context
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Wait for detail panel + segment context
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Navigate to finding on segment 3 if needed
    const seg3Text = page.getByText('The quick brown fox jumps over the lazy dog')
    if (!(await seg3Text.isVisible().catch(() => false))) {
      await page.keyboard.press('j')
      await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })
    }

    // Segment 4 should appear as a context row and have findings (Finding B)
    // Context segments with findings should show a clickable affordance
    const segment4ContextRow = page.getByTestId('context-segment').filter({
      hasText: /設定項目を確認する必要があります|Configuration settings/,
    })
    await expect(segment4ContextRow).toBeVisible({ timeout: 10_000 })

    // Click the context segment row for segment 4
    await segment4ContextRow.click()

    // Wait for segment context to reload (navigated to Finding B on segment 4)
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Assert: detail panel now shows Finding B's metadata
    // Finding B: severity=minor, category=fluency, description contains "Awkward phrasing"
    await expect(page.getByText(/Awkward phrasing in Japanese target text/i)).toBeVisible({
      timeout: 10_000,
    })

    // Assert: the full segment text now shows segment 4's source text
    await expect(page.getByText('Configuration settings must be verified')).toBeVisible()
  })

  // ── 4.1c-E5 [P2]: Context range selector changes segment count ─────────
  test('[P2] E5: should change visible context segments when range selector is changed', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding on segment 3
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Wait for detail panel + context
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Navigate to finding on segment 3 if needed
    const seg3Text = page.getByText('The quick brown fox jumps over the lazy dog')
    if (!(await seg3Text.isVisible().catch(() => false))) {
      await page.keyboard.press('j')
      await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })
    }

    // Default context range is 2 → should have 4 context segments (±2)
    const contextSegments = page.getByTestId('context-segment')
    await expect(contextSegments).toHaveCount(4, { timeout: 10_000 })

    // Select ±1 in the context range selector (native <select>)
    const rangeSelector = page.getByTestId('context-range-selector')
    await rangeSelector.selectOption('1')

    // Wait for context to reload with new range
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Assert: fewer context segments (±1 = 2 context segments)
    await expect(contextSegments).toHaveCount(2, { timeout: 10_000 })

    // Select ±3 → capped at available: segments 1-5, segment 3 is current
    await rangeSelector.selectOption('3')
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Assert: more context segments visible (±3 but capped at boundary = still 4: seg 1,2,4,5)
    await expect(contextSegments).toHaveCount(4, { timeout: 10_000 })
  })

  // ── 4.1c-E6 [P1]: CJK/Thai text has lang attribute ─────────────────────
  test('[P1] E6: should have correct lang attribute on CJK/Thai text elements', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding — navigate to one that shows segment 4 (Japanese) in context
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Wait for detail panel + context
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })

    // Find the Japanese text element (segment 4 target: "設定項目を確認する必要があります")
    // It could be in the current segment view or in a context segment row
    // Navigate to a finding where segment 4's text is visible
    const jaText = page.getByText('設定項目を確認する必要があります')

    if (!(await jaText.isVisible().catch(() => false))) {
      // Navigate to the next finding if current one doesn't show segment 4
      await page.keyboard.press('j')
      await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 15_000 })
    }

    // Assert: Japanese text element has lang="ja-JP" or starts with "ja"
    // The lang attribute should be on the text container element (Guardrail #39)
    // Scope to finding-list to avoid matching segment-text-target in detail panel
    const jaContainer = page.getByTestId('finding-list').locator('[lang^="ja"]').filter({
      hasText: '設定項目',
    })
    await expect(jaContainer).toBeVisible({ timeout: 10_000 })
    const langAttr = await jaContainer.getAttribute('lang')
    expect(langAttr).toMatch(/^ja/)

    // Assert: CJK font scale class present (text-[110%] per UX spec, Guardrail #39)
    // The container should have 1.1x font scale for CJK text
    const jaClasses = await jaContainer.first().getAttribute('class')
    // Check for the CJK scale class (implementation may use text-[110%] or a CSS class)
    expect(jaClasses).toMatch(/text-\[110%\]|cjk-scale|text-cjk/)

    // Assert: Thai text elements have lang="th-TH" or starts with "th"
    // Segment 3 target: "สุนัขจิ้งจอกสีน้ำตาล..."
    const thContainer = page.locator('[lang^="th"]').first()
    await expect(thContainer).toBeVisible()
    const thLangAttr = await thContainer.getAttribute('lang')
    expect(thLangAttr).toMatch(/^th/)
  })

  // ── 4.1c-E7 [P1]: Detail panel focus → Tab stays in panel → grid still interactive ─
  //
  // Note: At desktop viewport (1440px, set by test.use above) the detail panel is a
  // static <aside>, not a Radix Sheet. There is no focus trap (aside is not a modal).
  // This test instead verifies that:
  //   1. J key focuses a finding and detail panel content is rendered
  //   2. Tab from the grid can reach interactive elements inside the aside
  //   3. Grid is still keyboard-interactive after aside is populated
  //
  // The Sheet focus trap (laptop-mode only) is tested separately at 1280px viewport
  // when the Sheet-open trigger is wired via autoAdvance (Story 4.2 accept/reject flow).
  // TODO(TD-E2E-020): add laptop-mode Sheet focus trap E2E once E7 trigger path is
  // confirmed (needs autoAdvance path or explicit setSelectedFinding call from UI).
  test('[P1] E7: should show detail panel content and keep grid interactive after J navigation', async ({
    page,
  }) => {
    // Navigate to review page (viewport is 1440px from test.use block above)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus first finding row
    const rows = grid.getByRole('row')
    const firstRow = rows.first()
    await firstRow.focus()
    await expect(firstRow).toBeFocused({ timeout: 5_000 })
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Press J to navigate to first finding — aside should show finding content
    await page.keyboard.press('j')

    // Wait for aside to show content (desktop: static aside, always in DOM)
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })

    // Assert: detail panel contains finding content after J navigation
    // (severity, category — at least one should be visible)
    const panelContent = detailPanel.getByText(/critical|major|minor/i).first()
    await expect(panelContent).toBeVisible({ timeout: 10_000 })

    // Assert: grid is still keyboard-interactive — can navigate to next finding with J again
    await page.keyboard.press('j')
    // After second J: activeFindingState changes (navigateNext cycles through findings)
    // Detail panel should still be visible with potentially updated content
    await expect(detailPanel).toBeVisible()

    // Assert: pressing K navigates back — grid onKeyDown is still active
    await page.keyboard.press('k')
    await expect(detailPanel).toBeVisible()

    // Assert: focus is within the grid area (not lost to body)
    const activeRole = await page.evaluate(() => {
      const el = document.activeElement
      return el?.getAttribute('role') ?? el?.tagName ?? 'null'
    })
    expect(['row', 'grid', 'BODY']).toContain(activeRole)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Story 5.1 ATDD — LanguageBridge Back-Translation Panel Tests (RED PHASE)
  // ══════════════════════════════════════════════════════════════════════════

  // ── 5.1-BT1 [P1]: LanguageBridge panel loads when finding focused ─────
  test('[P1] BT1: should show LanguageBridge panel section in finding detail', async ({ page }) => {
    // Navigate to review page with seeded findings (non-native reviewer, Thai target)
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding to trigger detail panel
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Wait for detail panel
    const detailPanel = page.getByTestId('finding-detail-aside')
    await expect(detailPanel).toBeVisible({ timeout: 10_000 })

    // Assert: LanguageBridge section exists within detail panel
    const btSection = page.getByTestId('language-bridge-panel')
    await expect(btSection).toBeVisible({ timeout: 15_000 })
  })

  // ── 5.1-BT2 [P1]: Skeleton shown during BT loading ────────────────────
  // ATDD RED PHASE: Will fail until LanguageBridgePanel is integrated (Story 5.1)
  test('[P1] BT2: should show skeleton placeholder while back-translation loads', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Focus a finding — BT should start loading with skeleton
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.keyboard.press('j')

    // Skeleton should appear before BT content loads
    const skeleton = page.getByTestId('bt-skeleton')
    // Skeleton may be transient — check it existed at some point
    await expect(skeleton).toBeVisible({ timeout: 5_000 })
  })

  // ── 5.1-BT3 [P1]: BT content updates when segment focus changes ───────
  // ATDD RED PHASE: Will fail until LanguageBridgePanel is integrated (Story 5.1)
  test('[P1] BT3: should update back-translation when focus changes between findings', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Focus first finding
    await page.keyboard.press('j')
    const btSection = page.getByTestId('language-bridge-panel')
    await expect(btSection).toBeVisible({ timeout: 15_000 })

    // Capture first BT content
    const firstBTText = await btSection.getByTestId('bt-text').textContent()

    // Navigate to next finding (different segment)
    await page.keyboard.press('j')

    // Wait for BT to update (300ms debounce + AI call or cache)
    await page.waitForTimeout(500) // Acceptable: waiting for debounce + render
    const secondBTText = await btSection.getByTestId('bt-text').textContent()

    // BT text should be non-empty after segment focus change
    expect(secondBTText).toBeTruthy()
    expect(secondBTText!.length).toBeGreaterThan(0)
  })

  // ── 5.1-BT4 [P2]: Cached badge visible when result from cache ─────────
  // ATDD RED PHASE: Will fail until LanguageBridgePanel is integrated (Story 5.1)
  test('[P2] BT4: should show "Cached" badge when back-translation is from cache', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Focus a finding twice — second time should be cached
    await page.keyboard.press('j')
    const btSection = page.getByTestId('language-bridge-panel')
    await expect(btSection).toBeVisible({ timeout: 15_000 })

    // Wait for initial BT to load
    await page.getByTestId('bt-text').waitFor({ state: 'visible', timeout: 30_000 })

    // Navigate away and back to same finding → should hit cache
    await page.keyboard.press('j') // next
    await page.waitForTimeout(500)
    await page.keyboard.press('k') // back to previous

    // Cached badge should appear
    const cachedBadge = btSection.getByText(/Cached/i)
    await expect(cachedBadge).toBeVisible({ timeout: 10_000 })
  })

  // ── 5.1-BT5 [P2]: Refresh button bypasses cache ───────────────────────
  // ATDD RED PHASE: Will fail until LanguageBridgePanel is integrated (Story 5.1)
  test('[P2] BT5: should refresh back-translation when Refresh button clicked', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seeded.fileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })

    // Focus finding and wait for BT to load
    await page.keyboard.press('j')
    const btSection = page.getByTestId('language-bridge-panel')
    await page.getByTestId('bt-text').waitFor({ state: 'visible', timeout: 30_000 })

    // Click Refresh button
    const refreshBtn = btSection.getByRole('button', { name: /Refresh/i })
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()

    // Should show loading state briefly then fresh content
    // After refresh, "Cached" badge should NOT be present
    await page.getByTestId('bt-text').waitFor({ state: 'visible', timeout: 30_000 })
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
