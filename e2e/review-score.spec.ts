/**
 * Story 4.0 ATDD — E2E: Review to Score Integration
 *
 * Tests the review page displays score badge and finding count summary
 * after pipeline completion. This replaces the original placeholder stub
 * (TD-E2E-007) with proper red-phase test stubs.
 *
 * Strategy: Seed pre-baked file+score+findings via PostgREST.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 * - Inngest dev server for pipeline (optional — tests seed via PostgREST)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
import { test, expect } from '@playwright/test'

import { cleanupTestProject, queryScore } from './helpers/pipeline-admin'
import { waitForReviewPageReady } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// ── Seed Helpers ──────────────────────────────────────────────────────────────

/**
 * Seed a file + score + findings via PostgREST for review-score tests.
 * Returns the seeded fileId.
 */
async function seedFileWithScoreForReview(opts: {
  tenantId: string
  projectId: string
}): Promise<string> {
  // 1. Insert file row
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `review-score-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: `e2e/review-score-test-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(`seedFileWithScoreForReview: failed to insert file: ${fileRes.status} ${text}`)
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seedFileWithScoreForReview: no file row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score row (calculated + L1L2, score = 88.0)
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 88.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1000,
      critical_count: 0,
      major_count: 2,
      minor_count: 3,
      npt: 0.12,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(
      `seedFileWithScoreForReview: failed to insert score: ${scoreRes.status} ${text}`,
    )
  }

  // 3. Insert findings (5 findings for count summary)
  const findings = [
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslated term A',
      detected_by_layer: 'L2',
      status: 'pending',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslated term B',
      detected_by_layer: 'L2',
      status: 'pending',
    },
    {
      severity: 'minor',
      category: 'fluency',
      description: 'Awkward phrasing',
      detected_by_layer: 'L1',
      status: 'pending',
    },
    {
      severity: 'minor',
      category: 'Whitespace',
      description: 'Trailing whitespace',
      detected_by_layer: 'L1',
      status: 'pending',
    },
    {
      severity: 'minor',
      category: 'Punctuation',
      description: 'Missing period',
      detected_by_layer: 'L1',
      status: 'pending',
    },
  ]

  for (const f of findings) {
    const findingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        ...f,
      }),
    })
    if (!findingRes.ok) {
      const text = await findingRes.text()
      throw new Error(
        `seedFileWithScoreForReview: failed to insert finding: ${findingRes.status} ${text}`,
      )
    }
  }

  return fileId
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-review-score-${Date.now()}@test.local`

// Shared state across serial tests (set in [setup])
let projectId: string
let tenantId: string
let seededFileId: string

test.describe.serial('Review to Score — Story 4.0 ATDD', () => {
  test.setTimeout(120_000)

  // Skip if Inngest dev server is not available (outer gate)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup: Auth + Project + Seeded Data ──────────────────────────────────
  test('[setup] signup, create project, seed file with score', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'E2E Score Test')
    expect(projectId).toBeTruthy()

    // Seed file with score and findings
    seededFileId = await seedFileWithScoreForReview({
      tenantId,
      projectId,
    })
    expect(seededFileId).toBeTruthy()

    // Verify seed
    const score = await queryScore(seededFileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('calculated')
    expect(score!.layer_completed).toBe('L1L2')
  })

  // ── 4.0-E-TD1 [P1]: Review page with score badge ────────────────────────
  test('[P1] TD1: should display review page with score badge visible', async ({ page }) => {
    // TD-E2E-007: Unskipped review-score E2E test (proper red-phase stub)
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageReady(page)

    // Score badge should be visible with MQM score value
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 30_000 })
    // Seeded score = 88.0 — badge should show a numeric value
    await expect(scoreBadge).toContainText(/\d+/)

    // Finding count summary should be visible
    const countSummary = page.getByTestId('finding-count-summary')
    await expect(countSummary).toBeVisible()
    // Should show counts matching seeded data (2 major, 3 minor = 5 total)
    await expect(countSummary).toContainText(/5/)
  })

  // ── 4.0-E-TD2 [P1]: Score recalculate after finding action ──────────────
  // TODO(TD-E2E-015): Unskip when Story 4.2 implements accept/reject review actions
  test.skip('[P1] TD2: should recalculate score after finding action on review page', async ({
    page,
  }) => {
    // TD-E2E-007: Full review→accept→score recalculate flow
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageReady(page)

    // Wait for finding list to render
    const findingList = page.getByRole('grid')
    await expect(findingList).toBeVisible({ timeout: 30_000 })

    // Record initial score
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible()
    const initialScoreText = await scoreBadge.textContent()

    // Click first pending finding row
    const firstRow = page
      .getByRole('row')
      .filter({ hasText: /pending/i })
      .first()
    await firstRow.click()

    // Accept the finding via action button
    const acceptBtn = page.getByRole('button', { name: /accept/i })
    await expect(acceptBtn).toBeVisible({ timeout: 5_000 })
    await acceptBtn.click()

    // Wait for score recalculation (toast or badge update)
    // Score should update after recalculation completes
    await expect(scoreBadge).not.toContainText(initialScoreText ?? '', { timeout: 30_000 })
  })

  // ── 4.0-E-TD3 [P1]: Finding list shows severity icons + text ─────────────
  test('[P1] TD3: should display findings with severity icons and text labels', async ({
    page,
  }) => {
    // Guardrail #25: Color never sole information carrier
    // Guardrail #36: Severity display — icon shape + text + color
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageReady(page)

    // Wait for finding list
    const findingList = page.getByRole('grid')
    await expect(findingList).toBeVisible({ timeout: 30_000 })

    // Seeded findings include 'major' and 'minor' severities
    // Each should have both text label and icon (Guardrail #36)
    await expect(page.getByText(/major/i).first()).toBeVisible()
    await expect(page.getByText(/minor/i).first()).toBeVisible()

    // Icons should have aria-hidden (text label is accessible name — Guardrail #36)
    const severityIcons = page.locator('[aria-hidden="true"]').filter({ has: page.locator('svg') })
    const iconCount = await severityIcons.count()
    expect(iconCount).toBeGreaterThan(0)
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
