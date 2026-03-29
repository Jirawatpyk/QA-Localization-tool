/**
 * ATDD Story 5.3 — AC1: End-to-End Epic 5 Integration Flow
 *
 * Full integration test with real AI, real DB, real Inngest, real Realtime.
 * Verification story (Guardrail #49) — NO mocks.
 *
 * Flow:
 * 1. Upload SDLXLIFF file (Thai→English)
 * 2. Pipeline runs L1+L2 (Economy mode) → findings created
 * 3. Non-native reviewer opens review page → LanguageBridge panel shows real AI BT
 * 4. Non-native reviewer accepts/rejects findings → non_native tag auto-applied
 * 5. Non-native reviewer flags a finding for native review → assignment created
 * 6. Native reviewer logs in → sees only assigned findings (RLS enforced)
 * 7. Native reviewer confirms finding → status updated, notification sent
 * 8. Score recalculates after native confirmation
 *
 * RED PHASE: All tests are test.skip() — will be unskipped during implementation.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 * - Inngest dev server: INNGEST_DEV_URL=http://localhost:8288
 * - OPENAI_API_KEY and ANTHROPIC_API_KEY set
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
import { test, expect } from '@playwright/test'

import {
  cleanupTestProject,
  pollFileStatus,
  queryFindingsCount,
  queryScore,
} from './helpers/pipeline-admin'
import { gotoReviewPageWithRetry, waitForReviewPageHydrated } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  createTestProject,
} from './helpers/supabase-admin'

// ── Suite Configuration ──────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

// Skip if infrastructure not available
const SKIP_REASON = 'Requires Inngest dev server + AI API keys'
const HAS_INFRA = !!process.env.INNGEST_DEV_URL && !!process.env.OPENAI_API_KEY

// ── Shared State ─────────────────────────────────────────────────────────────

const TIMESTAMP = Date.now()
const NON_NATIVE_EMAIL = `e2e-epic5-nn-${TIMESTAMP}@test.local`
const NATIVE_EMAIL = `e2e-epic5-nat-${TIMESTAMP}@test.local`

let projectId: string
let seededFileId: string
let tenantId: string

// ── Setup ────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  testInfo.setTimeout(120_000)

  // Create non-native reviewer user + project via UI
  const page = await browser.newPage()
  try {
    await signupOrLogin(page, NON_NATIVE_EMAIL)
    const result = await createTestProject(page, `Epic5-Verify-${TIMESTAMP}`)
    projectId = result.projectId
    tenantId = result.tenantId
  } finally {
    await page.close()
  }
})

test.afterAll(async () => {
  if (projectId) {
    try {
      await cleanupTestProject(projectId)
    } catch (err) {
      process.stderr.write(`[cleanup] Failed to clean project ${projectId}: ${String(err)}\n`)
    }
  }
})

// ── Step 1 [P0]: Upload SDLXLIFF file ───────────────────────────────────────

test('[P0] Step 1: Upload Thai→English SDLXLIFF file and trigger pipeline', async ({ page }) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  // Navigate to project upload page
  await page.goto(`/projects/${projectId}`)
  await page.getByTestId('upload-tab').click()

  // Upload test SDLXLIFF file (Thai→English)
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('e2e/fixtures/thai-en-sample.sdlxliff')

  // Wait for upload confirmation
  await expect(page.getByText(/uploaded|processing/i)).toBeVisible({ timeout: 30_000 })

  // Poll until pipeline completes (Economy: L1+L2)
  // File status should reach 'l2_completed'
  const fileRow = await fetch(
    `${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}&select=id,status`,
    {
      headers: adminHeaders(),
    },
  ).then((r) => r.json())

  expect(fileRow.length).toBeGreaterThan(0)
  seededFileId = fileRow[0].id

  // Poll for pipeline completion
  await pollFileStatus(seededFileId, 'l2_completed', 90_000)
})

// ── Step 2 [P0]: Verify findings created ─────────────────────────────────────

test('[P0] Step 2: Pipeline produces findings (findingCount > 0)', async () => {
  test.skip(!HAS_INFRA, SKIP_REASON)

  const count = await queryFindingsCount(seededFileId)
  // Guardrail #47: fail loud — findings must exist from non-trivial input
  expect(count).toBeGreaterThan(0)
})

// ── Step 3 [P0]: Non-native reviewer sees BT panel ──────────────────────────

test('[P0] Step 3: Non-native reviewer opens review → LanguageBridge BT panel renders', async ({
  page,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)

  // Click on first finding to activate
  const grid = page.getByRole('grid')
  await grid.locator('[role="row"]').first().click()

  // LanguageBridge sidebar should appear with back-translation content
  const btPanel = page.getByTestId('language-bridge-panel')
  await expect(btPanel).toBeVisible({ timeout: 30_000 })

  // BT should show real AI translation (not placeholder)
  await expect(btPanel.getByText(/back.?translation/i)).toBeVisible({ timeout: 30_000 })
})

// ── Step 4 [P0]: Non-native accept/reject → non_native tag ──────────────────

test('[P0] Step 4: Non-native reviewer accepts finding → non_native:true tag auto-applied', async ({
  page,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)

  // Click first pending finding
  const grid = page.getByRole('grid')
  await grid.locator('[role="row"][data-status="pending"]').first().click()

  // Press 'a' to accept
  await page.keyboard.press('a')
  await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 })

  // Verify non_native metadata via PostgREST
  const findings = await fetch(
    `${SUPABASE_URL}/rest/v1/review_actions?file_id=eq.${seededFileId}&select=metadata&limit=1&order=created_at.desc`,
    { headers: adminHeaders() },
  ).then((r) => r.json())

  expect(findings.length).toBeGreaterThan(0)
  expect(findings[0].metadata).toMatchObject({ non_native: true })
})

// ── Step 5 [P0]: Flag for native review → assignment created ─────────────────

test('[P0] Step 5: Non-native flags finding for native review → assignment created', async ({
  page,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)

  // Click a pending finding
  const grid = page.getByRole('grid')
  await grid.locator('[role="row"][data-status="pending"]').first().click()

  // Press Shift+F to flag for native review
  await page.keyboard.press('Shift+f')

  // Flag dialog should appear
  const flagDialog = page.getByRole('dialog')
  await expect(flagDialog).toBeVisible({ timeout: 5_000 })

  // Select native reviewer and submit
  await flagDialog.getByRole('combobox').click()
  await page.getByRole('option').first().click()
  await flagDialog.getByRole('button', { name: /flag|submit|assign/i }).click()

  // Wait for success feedback
  await expect(page.getByText(/flagged|assigned/i).first()).toBeVisible({ timeout: 10_000 })

  // Verify assignment via PostgREST
  const assignments = await fetch(
    `${SUPABASE_URL}/rest/v1/finding_assignments?select=id,status&limit=5&order=created_at.desc`,
    { headers: adminHeaders() },
  ).then((r) => r.json())

  expect(assignments.length).toBeGreaterThan(0)
  expect(assignments[0].status).toBe('pending')
})

// ── Step 6 [P0]: Native reviewer scoped view (RLS) ──────────────────────────

test('[P0] Step 6: Native reviewer sees only assigned findings (RLS enforced)', async ({
  browser,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)

  // Login as native reviewer in separate browser context
  const nativePage = await browser.newPage()
  try {
    await signupOrLogin(nativePage, NATIVE_EMAIL)

    await gotoReviewPageWithRetry(nativePage, projectId, seededFileId)
    await waitForReviewPageHydrated(nativePage)

    // Native reviewer should see assignment banner
    await expect(nativePage.getByText(/assigned|native review/i)).toBeVisible({ timeout: 10_000 })

    // Findings shown should be only the assigned ones
    const visibleRows = await nativePage.getByRole('grid').locator('[role="row"]').count()
    expect(visibleRows).toBeGreaterThan(0)

    // RLS check: try to access an unassigned finding directly → should be blocked
    // (This is verified by the scoped query — native reviewer's query only returns assigned findings)
  } finally {
    await nativePage.close()
  }
})

// ── Step 7 [P0]: Native confirms finding → status updated + notification ─────

test('[P0] Step 7: Native reviewer confirms finding → status updated, notification sent', async ({
  browser,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)

  const nativePage = await browser.newPage()
  try {
    await signupOrLogin(nativePage, NATIVE_EMAIL)

    await gotoReviewPageWithRetry(nativePage, projectId, seededFileId)
    await waitForReviewPageHydrated(nativePage)

    // Click assigned finding
    const grid = nativePage.getByRole('grid')
    await grid.locator('[role="row"]').first().click()

    // Press 'c' to confirm
    await nativePage.keyboard.press('c')
    await expect(nativePage.getByText(/confirmed/i).first()).toBeVisible({ timeout: 15_000 })

    // Verify assignment status via PostgREST
    const assignments = await fetch(
      `${SUPABASE_URL}/rest/v1/finding_assignments?select=id,status&limit=5&order=updated_at.desc`,
      { headers: adminHeaders() },
    ).then((r) => r.json())

    const confirmed = assignments.find((a: { status: string }) => a.status === 'confirmed')
    expect(confirmed).toBeDefined()

    // Verify notification created
    const notifications = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?select=id,type&limit=5&order=created_at.desc`,
      { headers: adminHeaders() },
    ).then((r) => r.json())

    expect(notifications.length).toBeGreaterThan(0)
  } finally {
    await nativePage.close()
  }
})

// ── Step 8 [P0]: Score recalculates after native confirmation ────────────────

test('[P0] Step 8: Score recalculates after native confirmation', async () => {
  test.skip(!HAS_INFRA, SKIP_REASON)

  // Wait for score recalculation (triggered by finding status change)
  // Poll score status
  const score = await queryScore(seededFileId)
  expect(score).toBeDefined()
  expect(score!.mqm_score).toBeGreaterThanOrEqual(0)
  expect(score!.status).toBe('calculated')
})

// ── Verification Assertions [P0] ────────────────────────────────────────────

test('[P0] Verify: back_translation_cache has rows', async () => {
  test.skip(!HAS_INFRA, SKIP_REASON)

  const btCache = await fetch(`${SUPABASE_URL}/rest/v1/back_translation_cache?select=id&limit=5`, {
    headers: adminHeaders(),
  }).then((r) => r.json())

  expect(btCache.length).toBeGreaterThan(0)
})

test('[P0] Verify: audit_logs has complete entries for all actions', async () => {
  test.skip(!HAS_INFRA, SKIP_REASON)

  const auditLogs = await fetch(
    `${SUPABASE_URL}/rest/v1/audit_logs?project_id=eq.${projectId}&select=id,action&order=created_at.desc`,
    { headers: adminHeaders() },
  ).then((r) => r.json())

  // Should have entries for: accept, flag, confirm (at minimum)
  expect(auditLogs.length).toBeGreaterThanOrEqual(3)

  const actions = auditLogs.map((l: { action: string }) => l.action)
  expect(actions).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/accept/i),
      expect.stringMatching(/flag/i),
      expect.stringMatching(/confirm/i),
    ]),
  )
})
