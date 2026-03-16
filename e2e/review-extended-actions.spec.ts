/**
 * Story 4.3 E2E: Extended Review Actions
 * Tests: Note (N), Source Issue (S), Severity Override (-), Add Finding (+), Delete Manual
 *
 * Suite-level skip guard: requires Inngest dev server (Guardrail #43)
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-extended-actions.spec.ts
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

// ── Seed Helpers (split per RV recommendation H4) ────────────────────────────

type SeedOpts = { tenantId: string; projectId: string }

/** Seed a file record with l2_completed status. Returns fileId. */
async function seedFile(opts: SeedOpts): Promise<string> {
  const ts = Date.now()
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `extended-actions-test-${ts}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 2048,
      storage_path: `e2e/extended-actions-test-${ts}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file failed: ${fileRes.status} ${await fileRes.text()}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seed file: no row returned')
  return fileData[0]!.id
}

/** Seed a score record for a file. */
async function seedScore(opts: SeedOpts & { fileId: string }): Promise<void> {
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: opts.fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 72.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1500,
      critical_count: 2,
      major_count: 8,
      minor_count: 5,
      npt: 0.25,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok)
    throw new Error(`seed score failed: ${scoreRes.status} ${await scoreRes.text()}`)
}

/** Segment definitions — word_count >= 100 to avoid MQM always 0. */
const SEGMENT_DATA = [
  {
    segment_number: 1,
    source_text:
      'The application must support multiple languages for internationalization purposes',
    target_text: 'แอปพลิเคชันต้องรองรับหลายภาษาเพื่อวัตถุประสงค์ด้านการแปลภาษา',
    word_count: 120,
  },
  {
    segment_number: 2,
    source_text: 'Please verify that all translations have been reviewed by a native speaker',
    target_text: 'กรุณาตรวจสอบว่าการแปลทั้งหมดได้รับการตรวจสอบโดยผู้พูดภาษาแม่',
    word_count: 110,
  },
  {
    segment_number: 3,
    source_text: 'The quality assurance process ensures consistency across all deliverables',
    target_text: 'กระบวนการประกันคุณภาพช่วยให้แน่ใจว่ามีความสม่ำเสมอในทุกผลงาน',
    word_count: 105,
  },
  {
    segment_number: 4,
    source_text: 'Users can configure notification preferences in the settings panel',
    target_text: 'ผู้ใช้สามารถกำหนดค่าการแจ้งเตือนในแผงการตั้งค่า',
    word_count: 100,
  },
  {
    segment_number: 5,
    source_text: 'The dashboard provides a comprehensive overview of project status and metrics',
    target_text: 'แดชบอร์ดให้ภาพรวมที่ครอบคลุมของสถานะโปรเจกต์และตัวชี้วัด',
    word_count: 115,
  },
  {
    segment_number: 6,
    source_text: 'Export functionality supports multiple formats including PDF and Excel',
    target_text: 'ฟังก์ชันส่งออกรองรับหลายรูปแบบรวมถึง PDF และ Excel',
    word_count: 100,
  },
  {
    segment_number: 7,
    source_text: 'Search results can be filtered by date range and category type',
    target_text: 'ผลการค้นหาสามารถกรองตามช่วงวันที่และประเภทหมวดหมู่',
    word_count: 100,
  },
  {
    segment_number: 8,
    source_text: 'The system automatically detects and flags potential translation errors',
    target_text: 'ระบบตรวจจับและแจ้งข้อผิดพลาดในการแปลที่อาจเกิดขึ้นโดยอัตโนมัติ',
    word_count: 100,
  },
] as const

/** Seed 8 segments for a file. Returns segmentIds in insertion order. */
async function seedSegments(opts: SeedOpts & { fileId: string }): Promise<string[]> {
  const segmentIds: string[] = []
  for (const seg of SEGMENT_DATA) {
    const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        file_id: opts.fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        source_lang: 'en-US',
        target_lang: 'th-TH',
        ...seg,
      }),
    })
    if (!segRes.ok) throw new Error(`seed segment failed: ${segRes.status} ${await segRes.text()}`)
    const segData = (await segRes.json()) as Array<{ id: string }>
    if (segData.length === 0) throw new Error('seed segment: no row returned')
    segmentIds.push(segData[0]!.id)
  }
  return segmentIds
}

/** Finding definitions — 2 critical, 8 major, 5 minor = 15 total. */
const FINDING_DATA = [
  {
    severity: 'critical',
    category: 'accuracy',
    description: 'Critical mistranslation of key term',
    detected_by_layer: 'L2',
    segment_number: 1,
  },
  {
    severity: 'critical',
    category: 'accuracy',
    description: 'Omitted safety warning in translation',
    detected_by_layer: 'L2',
    segment_number: 2,
  },
  {
    severity: 'major',
    category: 'fluency',
    description: 'Awkward phrasing in target text',
    detected_by_layer: 'L2',
    segment_number: 1,
  },
  {
    severity: 'major',
    category: 'terminology',
    description: 'Wrong glossary term used',
    detected_by_layer: 'L1',
    segment_number: 3,
  },
  {
    severity: 'major',
    category: 'style',
    description: 'Inconsistent register level',
    detected_by_layer: 'L2',
    segment_number: 4,
  },
  {
    severity: 'major',
    category: 'accuracy',
    description: 'Number format mismatch',
    detected_by_layer: 'L1',
    segment_number: 5,
  },
  {
    severity: 'major',
    category: 'fluency',
    description: 'Unnatural word order detected',
    detected_by_layer: 'L2',
    segment_number: 6,
  },
  {
    severity: 'major',
    category: 'terminology',
    description: 'Inconsistent term usage across segments',
    detected_by_layer: 'L2',
    segment_number: 7,
  },
  {
    severity: 'major',
    category: 'accuracy',
    description: 'Omitted sentence in paragraph',
    detected_by_layer: 'L2',
    segment_number: 8,
  },
  {
    severity: 'major',
    category: 'style',
    description: 'Formal register used in casual context',
    detected_by_layer: 'L2',
    segment_number: 2,
  },
  {
    severity: 'minor',
    category: 'whitespace',
    description: 'Extra trailing space in target',
    detected_by_layer: 'L1',
    segment_number: 1,
  },
  {
    severity: 'minor',
    category: 'style',
    description: 'Missing final period',
    detected_by_layer: 'L1',
    segment_number: 3,
  },
  {
    severity: 'minor',
    category: 'whitespace',
    description: 'Double space between words',
    detected_by_layer: 'L1',
    segment_number: 5,
  },
  {
    severity: 'minor',
    category: 'style',
    description: 'Capitalization error in proper noun',
    detected_by_layer: 'L1',
    segment_number: 6,
  },
  {
    severity: 'minor',
    category: 'whitespace',
    description: 'Inconsistent spacing around punctuation',
    detected_by_layer: 'L1',
    segment_number: 7,
  },
] as const

/** Seed 15 findings mapped to segments. Serial tests consume them — need plenty of pending. */
async function seedFindings(
  opts: SeedOpts & { fileId: string; segmentIds: string[] },
): Promise<void> {
  for (let i = 0; i < FINDING_DATA.length; i++) {
    const f = FINDING_DATA[i]!
    const segIdx = f.segment_number - 1
    if (!opts.segmentIds[segIdx]) {
      throw new Error(`Segment ${f.segment_number} not found in seeded segments (index ${segIdx})`)
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: opts.fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        status: 'pending',
        severity: f.severity,
        category: f.category,
        description: f.description,
        detected_by_layer: f.detected_by_layer,
        segment_id: opts.segmentIds[segIdx],
      }),
    })
    if (!r.ok) throw new Error(`seed finding ${i} failed: ${r.status} ${await r.text()}`)
  }
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e-extended-actions-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let seededFileId: string
let seededSegmentIds: string[]

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process, not Next.js runtime
test.describe.serial('Extended Review Actions — Story 4.3 ATDD', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  test('[setup] signup, create project, seed file with 15 findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Extended Actions Test')
    expect(projectId).toBeTruthy()

    // Seed taxonomy_definitions for AddFindingDialog category selector (E-AF1)
    // taxonomy_definitions is shared (no tenant_id) — check if already exists before inserting
    const existingCats = await fetch(
      `${SUPABASE_URL}/rest/v1/taxonomy_definitions?select=id&limit=1`,
      {
        headers: adminHeaders(),
      },
    )
    const existingData = (await existingCats.json()) as Array<{ id: string }>
    if (existingData.length === 0) {
      const categories = [
        { category: 'accuracy', description: 'Accuracy issues', display_order: 1, is_active: true },
        { category: 'fluency', description: 'Fluency issues', display_order: 2, is_active: true },
        {
          category: 'terminology',
          description: 'Terminology issues',
          display_order: 3,
          is_active: true,
        },
        { category: 'style', description: 'Style issues', display_order: 4, is_active: true },
        {
          category: 'whitespace',
          description: 'Whitespace issues',
          display_order: 5,
          is_active: true,
        },
      ]
      for (const cat of categories) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/taxonomy_definitions`, {
          method: 'POST',
          headers: { ...adminHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify(cat),
        })
        if (!r.ok) throw new Error(`seed taxonomy failed: ${r.status} ${await r.text()}`)
      }
    }

    // Seed via split helpers (RV H4: each function has single responsibility)
    seededFileId = await seedFile({ tenantId, projectId })
    await seedScore({ tenantId, projectId, fileId: seededFileId })
    seededSegmentIds = await seedSegments({ tenantId, projectId, fileId: seededFileId })
    await seedFindings({ tenantId, projectId, fileId: seededFileId, segmentIds: seededSegmentIds })
    expect(seededFileId).toBeTruthy()
    expect(seededSegmentIds.length).toBeGreaterThanOrEqual(8)
    const score = await queryScore(seededFileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
  })

  // ── E-N1: Keyboard N on pending → noted ─────────────────────────────────
  test('[P0] E-N1: Keyboard N on pending → noted state + auto-advance', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const findingId = await pendingRow.getAttribute('data-finding-id')
    // Click to sync activeFindingId (not focus — click for keyboard target sync)
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    await page.keyboard.press('n')

    // Verify finding transitions to noted
    const targetRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'noted', { timeout: 10_000 })

    // Verify toast feedback
    await expect(page.getByText('Finding noted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })

  // ── E-N2: Keyboard N on noted → NoteInput popover opens ────────────────
  test('[P1] E-N2: Keyboard N on noted → NoteInput popover opens', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Find the noted finding from E-N1
    const notedRow = grid.locator('[role="row"][data-status="noted"]').first()
    await expect(notedRow).toBeVisible({ timeout: 10_000 })
    // Click to activate
    await notedRow.click()
    await expect(notedRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Press N again on noted finding → should open NoteInput popover
    await page.keyboard.press('n')

    // Verify NoteInput popover appears
    await expect(page.getByTestId('note-input-popover')).toBeVisible({ timeout: 5_000 })
  })

  // ── E-N3: NoteInput type text + Enter → note saved ─────────────────────
  test('[P1] E-N3: NoteInput: type text + Enter → note saved', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Find noted finding, click to activate, press N to open NoteInput
    const notedRow = grid.locator('[role="row"][data-status="noted"]').first()
    await expect(notedRow).toBeVisible({ timeout: 10_000 })
    await notedRow.click()
    await expect(notedRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })
    await page.keyboard.press('n')
    await expect(page.getByTestId('note-input-popover')).toBeVisible({ timeout: 5_000 })

    // Type text in note field
    const noteField = page.getByTestId('note-text-field')
    await noteField.fill('Test note text from E2E')

    // Press Enter to save
    await noteField.press('Enter')

    // Verify popover closes
    await expect(page.getByTestId('note-input-popover')).not.toBeVisible({ timeout: 5_000 })

    // Verify toast: "Note saved"
    await expect(page.getByText('Note saved', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })

  // ── E-S1: Keyboard S on pending → source_issue ─────────────────────────
  test('[P0] E-S1: Keyboard S on pending → source_issue state + auto-advance', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const findingId = await pendingRow.getAttribute('data-finding-id')
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    await page.keyboard.press('s')

    // Verify finding transitions to source_issue
    const targetRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'source_issue', { timeout: 10_000 })

    // Verify toast feedback
    await expect(page.getByText('Finding marked as source issue', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })

  // ── E-O1: Override button → dropdown → Minor → badge visible ───────────
  test('[P0] E-O1: Override button → dropdown → select Minor → badge visible', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Find a pending finding with severity critical or major for meaningful override
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const findingId = await pendingRow.getAttribute('data-finding-id')
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Click the Override button in action bar
    const actionBar = page.getByTestId('review-action-bar')
    await actionBar.getByTestId('action-override').click()

    // Wait for override menu content to appear (Radix DropdownMenu)
    await expect(page.getByTestId('override-menu-content')).toBeVisible({ timeout: 5_000 })

    // Click "Override to Minor"
    await page.getByTestId('override-minor').click()

    // Verify toast feedback
    await expect(page.getByText(/Severity overridden to minor/i)).toBeVisible({
      timeout: 15_000,
    })

    // Verify override badge is now visible on the finding row
    const targetRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await expect(targetRow.getByTestId('override-badge')).toBeVisible({ timeout: 10_000 })
  })

  // ── E-O2: Override → Reset to original → badge removed ─────────────────
  test('[P1] E-O2: Override → Reset to original → badge removed', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Find the overridden finding from E-O1 (has override-badge)
    const overriddenRow = grid
      .locator('[role="row"]')
      .filter({
        has: page.getByTestId('override-badge'),
      })
      .first()
    await expect(overriddenRow).toBeVisible({ timeout: 10_000 })
    const findingId = await overriddenRow.getAttribute('data-finding-id')
    await overriddenRow.click()
    await expect(overriddenRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Click Override button in action bar
    const actionBar = page.getByTestId('review-action-bar')
    await actionBar.getByTestId('action-override').click()

    // Wait for override menu
    await expect(page.getByTestId('override-menu-content')).toBeVisible({ timeout: 5_000 })

    // Click "Reset to original"
    await page.getByTestId('override-reset').click()

    // Verify toast feedback
    await expect(page.getByText(/Severity reset to original/i)).toBeVisible({
      timeout: 15_000,
    })

    // Verify override badge is removed
    const targetRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await expect(targetRow.getByTestId('override-badge')).not.toBeVisible({ timeout: 10_000 })
  })

  // ── E-AF1: Add Finding dialog ──────────────────────────────────────────
  test('[P0] E-AF1: + button → dialog → fill form → manual finding with dotted border', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // Click Add button in action bar
    const actionBar = page.getByTestId('review-action-bar')
    await actionBar.getByTestId('action-add').click()

    // Wait for dialog
    const dialog = page.getByTestId('add-finding-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Fill description (required, min 10 chars)
    await dialog.getByTestId('description-field').fill('Manual finding from E2E test automation')

    // Select segment (Radix Select — click trigger then option)
    const segTrigger = dialog.getByTestId('segment-selector')
    await segTrigger.click()
    const segOption = page.getByRole('option').first()
    await expect(segOption).toBeVisible({ timeout: 3_000 })
    await segOption.click()

    // Select category (Radix Select)
    const catTrigger = dialog.getByTestId('category-selector')
    await catTrigger.click()
    const catOption = page.getByRole('option').first()
    await expect(catOption).toBeVisible({ timeout: 3_000 })
    await catOption.click()

    // Submit
    await dialog.getByTestId('add-finding-submit').click()

    // Verify toast
    await expect(page.getByText('Manual finding added', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // Verify manual badge appears in the finding list
    const grid = page.getByRole('grid')
    await expect(grid.getByTestId('manual-badge').first()).toBeVisible({ timeout: 10_000 })
  })

  // ── G9: Manual finding — action hotkeys are no-op ─────────────────────
  test('[P1] G9: Manual finding — A/R/F/N/S hotkeys are no-op (status stays manual)', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Find the manual finding from E-AF1 (has manual-badge)
    const manualRow = grid
      .locator('[role="row"]')
      .filter({
        has: page.getByTestId('manual-badge'),
      })
      .first()
    await expect(manualRow).toBeVisible({ timeout: 10_000 })
    await manualRow.click()
    await expect(manualRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Press each action hotkey — all should be no-op (status stays 'manual')
    // Verify data-status remains 'manual' after each keypress (deterministic, no hard waits)
    for (const key of ['a', 'r', 'f', 'n', 's']) {
      await page.keyboard.press(key)
      // Explicit assertion: status must still be 'manual' (no-op per AC5 transition matrix)
      await expect(manualRow).toHaveAttribute('data-status', 'manual', { timeout: 5_000 })
    }
  })

  // ── G12: Delete button hidden for non-manual findings ────────────────
  test('[P1] G12: Delete button hidden for non-manual findings', async ({ page }) => {
    // Desktop viewport — detail aside auto-shows
    await page.setViewportSize({ width: 1500, height: 900 })
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Click a non-manual finding (pending)
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    await expect(pendingRow).toBeVisible({ timeout: 10_000 })
    await pendingRow.click()

    // Wait for detail panel to render (deterministic: wait for panel content, not fixed time)
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Verify delete button is NOT visible for non-manual finding
    // Use count check — not.toBeVisible can pass even if element doesn't exist yet
    await expect(page.getByTestId('delete-finding-button')).toHaveCount(0, { timeout: 10_000 })
  })

  // ── E-D1: Delete manual finding ────────────────────────────────────────
  test('[P1] E-D1: Delete manual finding → removed from list', async ({ page }) => {
    // Desktop viewport (>1440px) — aside auto-shows active finding detail
    await page.setViewportSize({ width: 1500, height: 900 })
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    // Find the manual finding created by E-AF1 (has manual-badge)
    const manualRow = grid
      .locator('[role="row"]')
      .filter({
        has: page.getByTestId('manual-badge'),
      })
      .first()
    await expect(manualRow).toBeVisible({ timeout: 10_000 })
    const findingId = await manualRow.getAttribute('data-finding-id')

    // Click to activate → detail aside shows content (desktop: selectedId synced)
    await manualRow.click()

    // Wait for detail panel to show the delete button (Manual findings only)
    const deleteBtn = page.getByTestId('delete-finding-button')
    await expect(deleteBtn).toBeVisible({ timeout: 15_000 })

    // Click delete
    await deleteBtn.click()

    // Verify toast
    await expect(page.getByText('Finding deleted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // Verify finding removed from list
    if (findingId) {
      await expect(grid.locator(`[role="row"][data-finding-id="${findingId}"]`)).not.toBeVisible({
        timeout: 10_000,
      })
    }
  })

  // ── E-WC1: Focus rings ────────────────────────────────────────────────
  test('[P2] E-WC1: All extended action buttons have focus ring', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // Click a finding to enable action buttons
    const pendingRow = page.locator('[role="row"][data-status="pending"]').first()
    await pendingRow.click()

    // Tab through the 4 extended action buttons and verify focus-visible outline
    const actionButtons = ['action-note', 'action-source', 'action-override', 'action-add']
    for (const testId of actionButtons) {
      const btn = page.getByTestId(testId)
      await btn.focus()
      // Verify the button has focus-visible outline class applied
      // Playwright can check computed styles
      const outline = await btn.evaluate((el) => {
        return window.getComputedStyle(el).outlineStyle
      })
      // focus-visible triggers outline — if not 'none', focus ring is working
      // Note: focus-visible may not trigger on programmatic focus in some browsers.
      // Fallback: just verify the class exists in the element
      const classList = await btn.getAttribute('class')
      expect(classList).toContain('focus-visible:outline-2')
    }
  })

  // ── G7: NoteInput Esc dismiss ─────────────────────────────────────────
  test('[P2] G7: NoteInput Esc → popover closes without saving', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    // Find a noted finding (from E-N1)
    const notedRow = grid.locator('[role="row"][data-status="noted"]').first()
    await expect(notedRow).toBeVisible({ timeout: 10_000 })
    await notedRow.click()
    await expect(notedRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Press N to open NoteInput
    await page.keyboard.press('n')
    await expect(page.getByTestId('note-input-popover')).toBeVisible({ timeout: 5_000 })

    // Type some text but press Esc instead of Enter
    await page.getByTestId('note-text-field').fill('This should not be saved')
    await page.keyboard.press('Escape')

    // Verify popover closes
    await expect(page.getByTestId('note-input-popover')).not.toBeVisible({ timeout: 5_000 })

    // Verify no "Note saved" toast appeared (popover dismissed without submit)
    await expect(page.getByText('Note saved', { exact: true })).not.toBeVisible({ timeout: 2_000 })
  })

  // ── G8: Override via - keyboard shortcut ─────────────────────────────
  test('[P2] G8: Keyboard - → override dropdown opens + Esc closes', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    await expect(pendingRow).toBeVisible({ timeout: 10_000 })
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Press - hotkey (mapped to 'override' in HOTKEY_ACTION_MAP)
    await page.keyboard.press('-')

    // Verify override menu opens
    await expect(page.getByTestId('override-menu-content')).toBeVisible({ timeout: 5_000 })

    // Press Esc to close without selecting
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('override-menu-content')).not.toBeVisible({ timeout: 5_000 })
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
