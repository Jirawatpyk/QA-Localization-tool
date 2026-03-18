/**
 * Story 4.7 E2E — Add to Glossary from Review
 *
 * Smoke tests: happy path + button visibility + duplicate detection.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
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
      mqm_score: 80.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1200,
      critical_count: 0,
      major_count: 2,
      minor_count: 1,
      npt: 0.15,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) throw new Error(`seed score: ${scoreRes.status} ${await scoreRes.text()}`)

  // Insert 3 segments
  for (let i = 1; i <= 3; i++) {
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
        source_text: `Source text for segment ${i} with enough words for MQM threshold scoring`,
        target_text: `ข้อความเป้าหมายสำหรับส่วนที่ ${i} พร้อมคำเพียงพอ`,
        word_count: 120,
      }),
    })
    if (!segRes.ok) throw new Error(`seed segment: ${segRes.status} ${await segRes.text()}`)
  }

  // Insert Terminology finding (for happy path + glossary test)
  const termFindingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      category: 'terminology',
      description: 'Incorrect glossary term: "financial institution" should be "สถาบันการเงิน"',
      severity: 'major',
      detected_by_layer: 'L1',
      ai_confidence: null,
      status: 'pending',
      source_text_excerpt: 'financial institution',
      target_text_excerpt: 'สถาบันทางการเงิน',
      suggested_fix: 'สถาบันการเงิน',
    }),
  })
  if (!termFindingRes.ok)
    throw new Error(`seed term finding: ${termFindingRes.status} ${await termFindingRes.text()}`)

  // Insert Accuracy finding (for non-terminology visibility test)
  const accFindingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      category: 'accuracy',
      description: 'Critical omission in target segment',
      severity: 'critical',
      detected_by_layer: 'L2',
      ai_confidence: 95,
      status: 'pending',
      source_text_excerpt: 'Complete sentence here',
      target_text_excerpt: 'ประโยคที่ไม่ครบ',
    }),
  })
  if (!accFindingRes.ok)
    throw new Error(`seed acc finding: ${accFindingRes.status} ${await accFindingRes.text()}`)

  return fileId
}

// ── Test Suite ──

const TEST_EMAIL = `e2e-glossary-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let fileId: string

test.describe.serial('Story 4.7: Add to Glossary from Review', () => {
  test.setTimeout(120_000)

  // Desktop viewport (≥1440px) — detail panel renders in static aside, not Sheet
  test.use({ viewport: { width: 1440, height: 900 } })

  // ── Setup ──

  test('[setup] signup, create project, seed file with findings', async ({ page }) => {
    test.setTimeout(90_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Glossary Test')

    fileId = await seedFileWithFindings({
      tenantId,
      projectId,
      fileName: `glossary-test-${Date.now()}.sdlxliff`,
    })
    expect(fileId).toBeTruthy()
  })

  // ── AC1, AC2: Happy path — add term from Terminology finding ──

  test('[P0] should show "Add to Glossary" button for Terminology finding and add term (AC1, AC2)', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)

    // Click a Terminology finding
    const findingRows = page.locator('[role="row"][data-finding-id]')
    const terminologyRow = findingRows.filter({ hasText: /terminology/i }).first()
    await expect(terminologyRow).toBeVisible({ timeout: 15_000 })
    await terminologyRow.click()

    // Wait for detail panel to render (desktop aside)
    const detailContent = page.getByTestId('finding-detail-content')
    await expect(detailContent).toBeVisible({ timeout: 10_000 })

    // Verify "Add to Glossary" button is visible in detail panel
    const addButton = page.getByRole('button', { name: /Add to Glossary/i })
    await expect(addButton).toBeVisible({ timeout: 5_000 })

    // Click "Add to Glossary"
    await addButton.click()

    // Verify dialog opens
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByText(/Add to Glossary/i)).toBeVisible()

    // Verify pre-filled source term
    const sourceInput = dialog.locator('#atg-source-term')
    await expect(sourceInput).toHaveValue('financial institution')

    // Submit the form
    await dialog.getByRole('button', { name: /Add Term/i }).click()

    // Verify success toast
    await expect(page.getByText(/Added to glossary/i)).toBeVisible({ timeout: 10_000 })

    // Verify "future QA runs" info note (AC5)
    await expect(page.getByText(/future QA runs/i)).toBeVisible({ timeout: 5_000 })
  })

  // ── AC4: Button NOT shown for non-Terminology finding ──

  test('[P0] should NOT show "Add to Glossary" button for non-Terminology finding (AC4)', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)

    // Click a non-Terminology finding (accuracy category)
    const findingRows = page.locator('[role="row"][data-finding-id]')
    const accuracyRow = findingRows.filter({ hasText: /accuracy/i }).first()
    await expect(accuracyRow).toBeVisible({ timeout: 15_000 })
    await accuracyRow.click()

    // Wait for detail panel to render
    const detailContent = page.getByTestId('finding-detail-content')
    await expect(detailContent).toBeVisible({ timeout: 10_000 })

    // Verify "Add to Glossary" button is NOT visible
    const addButton = page.getByRole('button', { name: /Add to Glossary/i })
    await expect(addButton).not.toBeVisible()
  })

  // ── AC3: Duplicate detection ──

  test('[P1] should show duplicate warning when term already exists (AC3)', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)

    // Click the same Terminology finding
    const findingRows = page.locator('[role="row"][data-finding-id]')
    const terminologyRow = findingRows.filter({ hasText: /terminology/i }).first()
    await expect(terminologyRow).toBeVisible({ timeout: 15_000 })
    await terminologyRow.click()

    // Wait for detail panel
    const detailContent = page.getByTestId('finding-detail-content')
    await expect(detailContent).toBeVisible({ timeout: 10_000 })

    // Click "Add to Glossary" — should detect duplicate from first test
    const addButton = page.getByRole('button', { name: /Add to Glossary/i })
    await addButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Submit to trigger duplicate check
    await dialog.getByRole('button', { name: /Add Term/i }).click()

    // Verify duplicate warning appears
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10_000 })

    // Click "Update existing"
    await page.getByRole('button', { name: /Update existing/i }).click()

    // Verify success toast for update
    await expect(page.getByText(/Updated glossary term/i)).toBeVisible({ timeout: 10_000 })
  })

  // ── Cleanup ──

  test.afterAll(async () => {
    if (projectId && tenantId) {
      try {
        await cleanupTestProject(projectId, tenantId)
      } catch {
        // Best-effort cleanup
      }
    }
  })
})
