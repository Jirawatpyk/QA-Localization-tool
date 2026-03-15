/**
 * Epic 3 P1 Tests — L3 Resilience: Fallback Chain Recovery (P1-15, R3-011)
 *
 * Tests the REAL pipeline: Thorough mode with L3 pinned model set to a
 * non-existent model. The fallback chain activates and L3 completes
 * successfully with a fallback provider — proving Story 3.4 resilience works.
 *
 * Additionally, tests the UI rendering of partial score state via seeded data
 * (separate test) to cover the ai_partial UI path without needing all providers to fail.
 *
 * Strategy:
 *   1. Create project, pin L3 to 'non-existent-model-e2e-test'
 *   2. Upload SDLXLIFF, start Thorough processing
 *   3. L1 + L2 succeed (system default), L3 pinned fails → fallback succeeds
 *   4. Verify: l3_completed + Deep Analyzed badge + full score
 *   5. Separate seeded-data test for ai_partial UI rendering
 *
 * Prerequisites:
 * - Next.js dev server on port 3000
 * - Inngest dev server on port 8288
 * - Supabase running
 * - OPENAI_API_KEY (for L2), ANTHROPIC_API_KEY (for L3 fallback)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
import { test, expect } from '@playwright/test'

import {
  FIXTURE_FILES,
  gotoProjectUpload,
  uploadSingleFile,
  assertUploadProgress,
} from './helpers/fileUpload'
import {
  cleanupTestProject,
  pollScoreLayer,
  queryFileByName,
  queryScore,
} from './helpers/pipeline-admin'
import { gotoReviewPageReadyWithRetry } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

const TEST_EMAIL = `e2e-l3-resilience-${Date.now()}@test.local`

let projectId: string
let tenantId: string
let fileId: string

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pin project's L3 model to a non-existent model via PostgREST */
async function pinL3ToFakeModel(projId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ l3_pinned_model: 'non-existent-model-e2e-test' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`pinL3ToFakeModel failed: ${res.status} ${text}`)
  }
}

/** Seed a file with pre-baked partial score (for UI test without real pipeline) */
async function seedFileWithPartialScore(opts: {
  tenantId: string
  projectId: string
}): Promise<string> {
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `l3-partial-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: `e2e/l3-partial-${Date.now()}.sdlxliff`,
      status: 'ai_partial',
    }),
  })
  if (!fileRes.ok) throw new Error(`seedFile failed: ${fileRes.status}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seedFile: no row returned')
  const seededFileId = fileData[0]!.id

  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: seededFileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 88.5,
      status: 'partial',
      layer_completed: 'L1L2',
      total_words: 500,
      critical_count: 0,
      major_count: 3,
      minor_count: 7,
      npt: 11.5,
      auto_pass_rationale: null,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) throw new Error(`seedScore failed: ${scoreRes.status}`)

  return seededFileId
}

/** Poll until file status reaches a Thorough-mode terminal state */
async function pollFileTerminalThorough(fId: string, timeoutMs: number = 120_000): Promise<string> {
  const terminalStatuses = ['l3_completed', 'ai_partial', 'failed']
  const start = Date.now()
  const interval = 3_000

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fId}&select=status`, {
      headers: adminHeaders(),
    })
    if (res.ok) {
      const rows = (await res.json()) as Array<{ status: string }>
      if (rows.length > 0 && terminalStatuses.includes(rows[0]!.status)) {
        return rows[0]!.status
      }
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`pollFileTerminalThorough timed out after ${timeoutMs}ms`)
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test.describe.serial('L3 Resilience + Partial Score UI (P1-15, R3-011)', () => {
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  // ── Setup ──────────────────────────────────────────────────────────────────
  test('[setup] signup/login, create project, pin L3 to fake model', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'L3 Resilience E2E')
    expect(projectId).toBeTruthy()

    // Pin L3 to fake model — fallback chain should rescue
    await pinL3ToFakeModel(projectId)
  })

  // ── Test 1: Fallback chain recovers L3 (REAL pipeline) ─────────────────────
  test('[P1] pinned model fails → fallback succeeds → L3 completed with Deep Analyzed', async ({
    page,
  }) => {
    test.setTimeout(300_000)

    await signupOrLogin(page, TEST_EMAIL)
    await gotoProjectUpload(page, projectId)
    await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)
    await assertUploadProgress(page, 'minimal.sdlxliff')

    const startBtn = page.getByRole('button', { name: /start processing/i })
    await expect(startBtn).toBeVisible({ timeout: 60_000 })
    await expect(startBtn).toBeEnabled()
    await startBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    // Wait for word count fetch to complete (dialog shows loading skeleton → cost estimate)
    // Without this, clicking Thorough too early can race with useEffect re-render
    await expect(dialog.getByTestId('cost-estimate')).toBeVisible({ timeout: 10_000 })

    // Click Thorough mode card (role="radio")
    const thoroughRadio = dialog.getByRole('radio', { name: /thorough/i })
    await thoroughRadio.click()
    // Verify selection took effect before clicking Start
    await expect(thoroughRadio).toHaveAttribute('aria-checked', 'true')
    const confirmBtn = dialog.getByRole('button', { name: 'Start Processing', exact: true })
    await confirmBtn.click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    const fileRecord = await queryFileByName(projectId, 'minimal.sdlxliff')
    expect(fileRecord).not.toBeNull()
    fileId = fileRecord!.id

    // Wait for full pipeline (L1L2L3) — fallback should rescue L3
    const terminalStatus = await pollFileTerminalThorough(fileId, 240_000)

    // Assert: L3 COMPLETED despite pinned model being fake (fallback rescued)
    expect(terminalStatus).toBe('l3_completed')

    // Wait for score to update after L3 (scoring runs AFTER file status update)
    await pollScoreLayer(fileId, 'L1L2L3', 60_000)

    // Assert: score = calculated with L1L2L3
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(['calculated', 'auto_passed']).toContain(score!.status)
    expect(score!.layer_completed).toBe('L1L2L3')
    expect(score!.mqm_score).toBeGreaterThanOrEqual(0)

    // Re-authenticate — session may expire during long pipeline wait (~2 min).
    // Go to login page; if still authenticated, it redirects to dashboard (no fill needed).
    await page.goto('/login')
    // Wait for either login form or dashboard redirect
    await Promise.race([
      page.waitForURL('**/dashboard', { timeout: 10_000 }).catch(() => null),
      page
        .getByLabel('Email')
        .waitFor({ timeout: 10_000 })
        .catch(() => null),
    ])
    // If login form is visible, fill credentials
    const emailField = page.getByLabel('Email')
    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(TEST_EMAIL)
      await page.getByLabel('Password').fill('TestPassword123!')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/dashboard', { timeout: 15_000 })
    }

    // Navigate to review page (with retry for transient SSR errors)
    await gotoReviewPageReadyWithRetry(page, projectId, fileId)

    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 30_000 })
    // L1L2L3 complete → "Deep Analyzed" badge (or auto_passed shows rationale instead)
    await expect(scoreBadge).toContainText(/deep analyzed|auto.*pass/i)
    await expect(scoreBadge).toContainText(/\d+/)
  })

  // ── Test 2: Partial score UI rendering (SEEDED data) ───────────────────────
  test('[P1] partial score badge renders correctly when L3 failed (seeded)', async ({ page }) => {
    test.setTimeout(60_000)

    // Seed file with pre-baked partial score (no real pipeline needed)
    const partialFileId = await seedFileWithPartialScore({ tenantId, projectId })

    const score = await queryScore(partialFileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('partial')

    await signupOrLogin(page, TEST_EMAIL)
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await gotoReviewPageReadyWithRetry(page, projectId, partialFileId)

    // Assert: ScoreBadge shows partial state
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 30_000 })
    await expect(scoreBadge).toContainText(/partial|unavailable/i)

    // Assert: MQM score preserved
    await expect(scoreBadge).toContainText(/\d+/)

    // Assert: Approve button disabled for partial score.
    // Guard: partial-score files may not render the Approve button at all
    // (UI hides it when score.status is not 'calculated'). When present, it must be disabled.
    const approveBtn = page.getByRole('button', { name: /approve/i })
    const btnCount = await approveBtn.count()
    if (btnCount > 0) {
      await expect(approveBtn).toBeDisabled()
    }
  })

  // ── Cleanup ────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        console.warn(`[cleanup] Failed to clean project ${projectId}:`, err)
      }
    }
  })
})
