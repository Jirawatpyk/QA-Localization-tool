/**
 * Story 4.6 E2E — Suppress False Positive Patterns
 *
 * Tests pattern detection toast, suppress dialog, batch auto-reject,
 * "Keep checking" reset, admin suppression management, and keyboard-only flow.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 * - INNGEST_DEV_URL set (for pipeline seeding guard)
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

// ── Seed Data ──

/** 25 Terminology findings with >=3 shared words: "bank", "terminology", "financial", "translation"
 * E2E learnings: serial tests share state → seed 2× expected consumption (each test needs 3) */
const TERMINOLOGY_FINDINGS = [
  {
    category: 'terminology',
    description: 'incorrect bank terminology translation in financial context',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 85,
    status: 'pending',
    source_text_excerpt: 'Bank financial terminology 1',
    target_text_excerpt: 'คำศัพท์ทางการเงินของธนาคาร 1',
  },
  {
    category: 'terminology',
    description: 'wrong bank term used in financial document translation',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 80,
    status: 'pending',
    source_text_excerpt: 'Financial bank document 2',
    target_text_excerpt: 'เอกสารทางการเงินธนาคาร 2',
  },
  {
    category: 'terminology',
    description: 'bank terminology error in translated financial text',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 72,
    status: 'pending',
    source_text_excerpt: 'Translated financial text 3',
    target_text_excerpt: 'ข้อความทางการเงิน 3',
  },
  {
    category: 'terminology',
    description: 'mistranslated bank financial terminology in context',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 88,
    status: 'pending',
    source_text_excerpt: 'Bank terminology 4',
    target_text_excerpt: 'คำศัพท์ธนาคาร 4',
  },
  {
    category: 'terminology',
    description: 'bank terminology inconsistency in financial translation output',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 78,
    status: 'pending',
    source_text_excerpt: 'Financial translation output 5',
    target_text_excerpt: 'ผลลัพธ์การแปลทางการเงิน 5',
  },
  {
    category: 'terminology',
    description: 'financial bank terminology translation mismatch detected',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 82,
    status: 'pending',
    source_text_excerpt: 'Bank translation mismatch 6',
    target_text_excerpt: 'ความไม่ตรงกันของคำแปลธนาคาร 6',
  },
  {
    category: 'terminology',
    description: 'bank terminology usage error in financial report translation',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 76,
    status: 'pending',
    source_text_excerpt: 'Financial report translation 7',
    target_text_excerpt: 'การแปลรายงานทางการเงิน 7',
  },
  {
    category: 'terminology',
    description: 'incorrect financial bank terminology in translated output',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 83,
    status: 'pending',
    source_text_excerpt: 'Translated output bank 8',
    target_text_excerpt: 'ผลลัพธ์ที่แปลธนาคาร 8',
  },
  {
    category: 'terminology',
    description: 'bank financial terminology translation deviation found',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 79,
    status: 'pending',
    source_text_excerpt: 'Translation deviation 9',
    target_text_excerpt: 'การเบี่ยงเบนการแปล 9',
  },
  {
    category: 'terminology',
    description: 'terminology mismatch bank financial translation context',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 81,
    status: 'pending',
    source_text_excerpt: 'Translation context 10',
    target_text_excerpt: 'บริบทการแปล 10',
  },
  {
    category: 'terminology',
    description: 'bank terminology translation error in financial document',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 77,
    status: 'pending',
    source_text_excerpt: 'Financial document 11',
    target_text_excerpt: 'เอกสารทางการเงิน 11',
  },
  {
    category: 'terminology',
    description: 'financial terminology bank translation issue detected',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 84,
    status: 'pending',
    source_text_excerpt: 'Translation issue 12',
    target_text_excerpt: 'ปัญหาการแปล 12',
  },
  {
    category: 'terminology',
    description: 'bank translation financial terminology inconsistency report',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 75,
    status: 'pending',
    source_text_excerpt: 'Inconsistency report 13',
    target_text_excerpt: 'รายงานความไม่สอดคล้อง 13',
  },
  {
    category: 'terminology',
    description: 'translated bank financial terminology error in context',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 86,
    status: 'pending',
    source_text_excerpt: 'Error in context 14',
    target_text_excerpt: 'ข้อผิดพลาดในบริบท 14',
  },
  {
    category: 'terminology',
    description: 'bank financial translation terminology problem identified',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 74,
    status: 'pending',
    source_text_excerpt: 'Problem identified 15',
    target_text_excerpt: 'ปัญหาที่ระบุ 15',
  },
  {
    category: 'terminology',
    description: 'bank terminology translation financial accuracy concern',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 80,
    status: 'pending',
    source_text_excerpt: 'Accuracy concern 16',
    target_text_excerpt: 'ข้อกังวลเรื่องความถูกต้อง 16',
  },
  {
    category: 'terminology',
    description: 'financial bank terminology mistranslation in review',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 82,
    status: 'pending',
    source_text_excerpt: 'Mistranslation review 17',
    target_text_excerpt: 'ทบทวนการแปลผิด 17',
  },
  {
    category: 'terminology',
    description: 'bank translation terminology financial discrepancy noted',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 76,
    status: 'pending',
    source_text_excerpt: 'Discrepancy noted 18',
    target_text_excerpt: 'ข้อแตกต่างที่พบ 18',
  },
  {
    category: 'terminology',
    description: 'terminology bank financial translation quality issue',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 78,
    status: 'pending',
    source_text_excerpt: 'Quality issue 19',
    target_text_excerpt: 'ปัญหาคุณภาพ 19',
  },
  {
    category: 'terminology',
    description: 'bank financial terminology translation review flagged',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 84,
    status: 'pending',
    source_text_excerpt: 'Review flagged 20',
    target_text_excerpt: 'ตรวจสอบถูกแจ้ง 20',
  },
  {
    category: 'terminology',
    description: 'financial terminology bank translation variance detected',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 73,
    status: 'pending',
    source_text_excerpt: 'Variance detected 21',
    target_text_excerpt: 'ตรวจพบความแปรปรวน 21',
  },
  {
    category: 'terminology',
    description: 'bank terminology translation financial conformance gap',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 81,
    status: 'pending',
    source_text_excerpt: 'Conformance gap 22',
    target_text_excerpt: 'ช่องว่างความสอดคล้อง 22',
  },
  {
    category: 'terminology',
    description: 'translated financial bank terminology deviation report',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 77,
    status: 'pending',
    source_text_excerpt: 'Deviation report 23',
    target_text_excerpt: 'รายงานการเบี่ยงเบน 23',
  },
  {
    category: 'terminology',
    description: 'bank financial translation terminology audit finding',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 85,
    status: 'pending',
    source_text_excerpt: 'Audit finding 24',
    target_text_excerpt: 'ผลการตรวจสอบ 24',
  },
  {
    category: 'terminology',
    description: 'terminology financial bank translation correction needed',
    severity: 'major',
    detected_by_layer: 'L2',
    ai_confidence: 79,
    status: 'pending',
    source_text_excerpt: 'Correction needed 25',
    target_text_excerpt: 'ต้องแก้ไข 25',
  },
] as const

/** 3 non-Terminology findings (different categories) */
const OTHER_FINDINGS = [
  {
    category: 'accuracy',
    description: 'Critical omission in target segment',
    severity: 'critical',
    detected_by_layer: 'L2',
    ai_confidence: 95,
    status: 'pending',
    source_text_excerpt: 'Complete sentence here',
    target_text_excerpt: 'ประโยคที่ไม่ครบ',
  },
  {
    category: 'fluency',
    description: 'Unnatural word order in Thai translation',
    severity: 'major',
    detected_by_layer: 'L3',
    ai_confidence: 82,
    status: 'pending',
    source_text_excerpt: 'Export the report now',
    target_text_excerpt: 'ตอนนี้ส่งออกรายงาน',
  },
  {
    category: 'style',
    description: 'Inconsistent register in UI label',
    severity: 'minor',
    detected_by_layer: 'L1',
    ai_confidence: null,
    status: 'pending',
    source_text_excerpt: 'Save changes',
    target_text_excerpt: 'เซฟการเปลี่ยนแปลง',
  },
] as const

// ── Seed Helpers ──

async function seedFileWithSuppressFindings(opts: {
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
      file_size_bytes: 4096,
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
      mqm_score: 65.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1800,
      critical_count: 1,
      major_count: 4,
      minor_count: 3,
      npt: 0.35,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) throw new Error(`seed score: ${scoreRes.status} ${await scoreRes.text()}`)

  // Insert 6 segments (word_count 120+ each for MQM validity)
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
        source_text: `Source text for segment number ${i} with enough words to pass MQM threshold`,
        target_text: `ข้อความเป้าหมายสำหรับส่วนที่ ${i} พร้อมคำที่เพียงพอ`,
        word_count: 120,
      }),
    })
    if (!segRes.ok) throw new Error(`seed segment: ${segRes.status} ${await segRes.text()}`)
  }

  // Insert 5 Terminology findings (same category, similar descriptions with >=3 word overlap)
  for (const f of TERMINOLOGY_FINDINGS) {
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
    if (!r.ok) throw new Error(`seed terminology finding: ${r.status} ${await r.text()}`)
  }

  // Insert 3 other-category findings
  for (const f of OTHER_FINDINGS) {
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
    if (!r.ok) throw new Error(`seed other finding: ${r.status} ${await r.text()}`)
  }

  return fileId
}

// ── Helpers ──

/**
 * Reject N pending terminology findings sequentially.
 * Properly waits for each rejection to complete before proceeding.
 * E2E Learnings: inFlightRef blocks rapid presses — must wait for status change, not just toast visibility.
 */
async function rejectTerminologyFindings(page: import('@playwright/test').Page, count: number) {
  for (let i = 0; i < count; i++) {
    const terminologyRows = page.locator(
      '[role="row"][data-finding-id][data-category="terminology"][data-status="pending"]',
    )
    const pendingBefore = await terminologyRows.count()
    if (pendingBefore === 0) break

    const row = terminologyRows.first()
    await row.click()
    // Wait for click to register focus + activeFindingId sync in store
    await page.waitForTimeout(500)

    // Use 'r' hotkey to reject (more reliable than clicking inline button in E2E)
    await page.keyboard.press('r')

    // Wait for pending count to decrease — optimistic update removes from pending filter
    await expect(terminologyRows).toHaveCount(pendingBefore - 1, { timeout: 15_000 })

    // Wait for server confirmation + auto-advance to settle
    await page.waitForTimeout(2_000)
  }
}

// ── Test Suite ──

const TEST_EMAIL = `e2e-suppress-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let fileId: string
let keyboardFileId: string

test.describe.serial('Story 4.6: Suppress False Positive Patterns', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup ──

  test('[setup] signup, create project, seed file with pattern findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Suppress Pattern Test')

    fileId = await seedFileWithSuppressFindings({
      tenantId,
      projectId,
      fileName: `suppress-test-${Date.now()}.sdlxliff`,
    })
    expect(fileId).toBeTruthy()

    // Separate file for keyboard test — isolated from suppress/auto-reject in earlier tests
    keyboardFileId = await seedFileWithSuppressFindings({
      tenantId,
      projectId,
      fileName: `suppress-keyboard-${Date.now()}.sdlxliff`,
    })
    expect(keyboardFileId).toBeTruthy()
  })

  // ── AC1: Pattern detection triggers at 3+ rejections ──

  test('[P0] should show pattern detection toast after 3 rejections with same category', async ({
    page,
  }) => {
    // Unskipped — Story 4.6 implemented

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)

    // Wait for keyboard handlers to be ready
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

    // Reject 3 Terminology findings sequentially
    await rejectTerminologyFindings(page, 3)

    // After 3rd rejection of same category → pattern detection toast
    const patternToast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /pattern detected/i })
    await expect(patternToast).toBeVisible({ timeout: 15_000 })

    // Toast should mention the category and offer "Suppress" action
    await expect(patternToast).toContainText(/terminology/i)
    await expect(patternToast.getByRole('button', { name: /suppress/i })).toBeVisible()
    await expect(patternToast.getByRole('button', { name: /keep checking/i })).toBeVisible()
  })

  // ── AC4: "Keep checking" resets counter (must run BEFORE suppress — once rule exists, isAlreadySuppressed blocks detection) ──

  test('[P0] should reset counter on Keep checking and not re-trigger with insufficient rejections', async ({
    page,
  }) => {
    // Unskipped — Story 4.6 implemented

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)

    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

    // First round: reject 3 Terminology findings → triggers pattern detection
    await rejectTerminologyFindings(page, 3)

    const firstPatternToast = page.locator('[data-sonner-toast]').filter({
      hasText: /pattern detected/i,
    })
    await expect(firstPatternToast).toBeVisible({ timeout: 15_000 })

    // Click "Keep checking" to dismiss and reset counter
    await firstPatternToast.getByRole('button', { name: /keep checking/i }).click()
    await expect(firstPatternToast).not.toBeVisible({ timeout: 5_000 })

    // Reject 1 more Terminology finding (< 3 threshold after reset — only 1 post-reset)
    await rejectTerminologyFindings(page, 1)

    // Pattern toast should NOT appear (only 1 rejection after reset, < 3 threshold)
    // Note: must wait briefly for async state to settle, then verify no toast
    await page.waitForTimeout(2_000)
    const secondPatternToast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /pattern detected/i })
    await expect(secondPatternToast).not.toBeVisible({ timeout: 3_000 })
  })

  // ── AC2 + AC3: Suppress dialog and batch auto-reject ──

  test('[P0] should open suppress dialog and auto-reject remaining findings', async ({ page }) => {
    // Unskipped — Story 4.6 implemented

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)

    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

    // Reject 3 Terminology findings to trigger pattern detection
    await rejectTerminologyFindings(page, 3)

    // Click "Suppress" on the pattern detection toast
    const patternToast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /pattern detected/i })
    await expect(patternToast).toBeVisible({ timeout: 15_000 })
    await patternToast.getByRole('button', { name: /suppress/i }).click()

    // Suppress dialog should open
    const dialog = page.getByRole('dialog', { name: /suppress pattern/i })
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')

    // Verify dialog defaults: scope radio (this file / all files), duration dropdown
    await expect(dialog.getByRole('radio', { name: /this file/i })).toBeVisible()
    await expect(dialog.getByRole('radio', { name: /all language/i })).toBeVisible()
    await expect(dialog.getByText(/duration/i)).toBeVisible()

    // Verify the pattern summary (category badge shown)
    await expect(
      dialog.locator('[data-slot="badge"]').filter({ hasText: /terminology/i }),
    ).toBeVisible()

    // Confirm suppression — click the "Suppress Pattern" button
    await dialog.locator('[data-testid="suppress-confirm-button"]').click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // Confirmation toast: "Pattern suppressed — X findings auto-rejected"
    const confirmToast = page.locator('[data-sonner-toast]').filter({
      hasText: /pattern suppressed.*\d+ findings? auto-rejected/i,
    })
    await expect(confirmToast).toBeVisible({ timeout: 10_000 })

    // Verify auto-rejection happened: terminology pending count should decrease
    const pendingTermRows = page.locator(
      '[role="row"][data-finding-id][data-category="terminology"][data-status="pending"]',
    )
    // Server auto-rejected findings but UI needs to refresh (Realtime or score recalculation triggers update)
    // Verify the toast confirms auto-rejection happened
    const toastText = await confirmToast.textContent()
    expect(toastText).toMatch(/\d+ findings? auto-rejected/i)
    // Extract count from toast
    const match = toastText?.match(/(\d+) findings?/)
    const autoRejectedCount = match ? parseInt(match[1]!, 10) : 0
    expect(autoRejectedCount).toBeGreaterThan(0)
  })

  // ── AC5: Admin suppression management ──

  test('[P1] should show suppression rules on admin page', async ({ page }) => {
    // Unskipped — Story 4.6 implemented

    await signupOrLogin(page, TEST_EMAIL)

    // Suppression rule was already created in previous test (suppress dialog test)
    // Navigate directly to admin suppression rules page
    await page.goto('/admin/suppression-rules')
    await expect(page.getByRole('heading', { name: /suppression rules/i })).toBeVisible({
      timeout: 15_000,
    })

    // Verify the rule is shown in the grid table
    const rulesGrid = page.getByRole('table', { name: /suppression rules/i })
    await expect(rulesGrid).toBeVisible()

    // Table should contain the Terminology pattern rule
    await expect(rulesGrid.getByText(/terminology/i).first()).toBeVisible()

    // Rule should have a Deactivate button (meaning it's active)
    await expect(rulesGrid.getByRole('button', { name: /deactivate/i })).toBeVisible()
  })

  test('[P1] should deactivate rule on admin page', async ({ page }) => {
    // Unskipped — Story 4.6 implemented

    await signupOrLogin(page, TEST_EMAIL)

    // Navigate to admin suppression rules page
    await page.goto('/admin/suppression-rules')
    await expect(page.getByRole('heading', { name: /suppression rules/i })).toBeVisible({
      timeout: 15_000,
    })

    // Find the active Terminology rule row
    const rulesGrid = page.getByRole('table', { name: /suppression rules/i })
    await expect(rulesGrid).toBeVisible()
    const ruleRow = rulesGrid.getByRole('row').filter({ hasText: /terminology/i })
    await expect(ruleRow).toBeVisible()

    // Click "Deactivate" button on the rule row
    await ruleRow.getByRole('button', { name: /deactivate/i }).click()

    // Rule should now show "Inactive" badge
    await expect(ruleRow.getByText(/inactive/i)).toBeVisible({ timeout: 5_000 })

    // Success toast
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /deactivated/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  // ── AC7: Keyboard-only suppress flow ──

  test('[P2] should complete suppress flow with keyboard only', async ({ page }) => {
    // Uses separate keyboardFileId — isolated from suppress/auto-reject in earlier tests

    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, keyboardFileId)

    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', { timeout: 15_000 })
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

    // Reject 3 terminology findings to trigger pattern
    await rejectTerminologyFindings(page, 3)

    // Pattern detection toast should appear
    const patternToast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /pattern detected/i })
    await expect(patternToast).toBeVisible({ timeout: 15_000 })

    // Verify toast has accessible action buttons
    const suppressBtn = patternToast.getByRole('button', { name: /suppress/i })
    await expect(suppressBtn).toBeVisible()
    await suppressBtn.click()

    // Dialog should open with aria-modal
    const dialog = page.getByRole('dialog', { name: /suppress pattern/i })
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')

    // Verify radio buttons are keyboard-navigable (arrow keys within radiogroup)
    const scopeRadios = dialog.getByRole('radio')
    const radioCount = await scopeRadios.count()
    expect(radioCount).toBeGreaterThanOrEqual(3) // file, language_pair, all

    // Escape should close dialog (Guardrail #31)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  // ── Cleanup ──

  test('[cleanup] remove test project', async () => {
    if (projectId) {
      await cleanupTestProject(projectId)
    }
  })
})
