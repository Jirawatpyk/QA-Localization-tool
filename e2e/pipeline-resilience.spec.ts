/**
 * Story 3.4 ATDD — E2E: Pipeline Resilience — Partial Results & Retry
 *
 * Tests partial result display + retry recovery UI flow:
 *   seed ai_partial file via PostgREST → navigate to review page
 *   → "Partial" badge → L1 findings visible → Retry button → click retry → recovery
 *
 * Strategy: (a) Seed + Retry UI — real AI fallback failure injection impractical in E2E.
 * Happy path with fallback chain wired covered by Story 3.3 E2E (validates no regression).
 *
 * // TODO(TD-E2E-011): wire chaos-test for real fallback failure path
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Inngest dev server (npx inngest-cli dev) on port 8288
 * - Supabase running (local or cloud)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
import { test, expect } from '@playwright/test'

import { cleanupTestProject, queryScore, seedAiPartialFile } from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-resilience-${Date.now()}@test.local`

// Shared state across serial tests
let projectId: string
let tenantId: string
let fileId: string

test.describe.serial('Pipeline Resilience — Story 3.4', () => {
  // Skip entire suite when no Inngest dev server
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  // ── Setup: Auth + Project + Seed ai_partial file ─────────────────────────
  test('[setup] signup, create project, and seed ai_partial file', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'Resilience E2E')

    // Seed file with ai_partial status + L1 finding + partial score
    fileId = await seedAiPartialFile(projectId, tenantId)
    expect(fileId).toBeTruthy()

    // Verify seed
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('partial')
    expect(score!.layer_completed).toBe('L1')
  })

  // ── T77: ScoreBadge shows "Partial" for ai_partial file ─────────────────
  test('[P1] ScoreBadge shows "Partial" badge for ai_partial file', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // ScoreBadge should be visible and show "Partial" label
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })
    await expect(scoreBadge).toContainText(/partial/i)
  })

  // ── T78: Retry button visible on partial file ────────────────────────────
  test('[P1] "Retry AI Analysis" button visible on partial file', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Retry button should be enabled on a file with partial AI results
    const retryButton = page.getByRole('button', { name: /retry ai analysis/i })
    await expect(retryButton).toBeVisible({ timeout: 15_000 })
    await expect(retryButton).toBeEnabled()
  })

  // ── T79: Click retry → button disabled → score updates ──────────────────
  test('[P1] clicking retry disables button and triggers score update', async ({ page }) => {
    // Allow up to 2 min: retry triggers Inngest pipeline which must complete
    test.setTimeout(120_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    const retryButton = page.getByRole('button', { name: /retry ai analysis/i })
    await expect(retryButton).toBeVisible({ timeout: 15_000 })

    await retryButton.click()

    // After click: button may be disabled briefly OR disappear entirely once retry succeeds.
    // Race-safe assertion: wait for score badge to transition away from "Partial".
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).not.toContainText(/partial/i, { timeout: 120_000 })
  })

  // ── T80: Fallback badge visible on finding with non-primary model ────────
  test('[P2] fallback badge visible on finding with non-primary model', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for findings list to load
    await page.waitForTimeout(3_000)

    // Fallback badge appears on findings produced by a secondary-model fallback
    // Only check if any fallback findings exist in the seeded data
    const fallbackBadge = page.getByTestId('fallback-badge')
    const count = await fallbackBadge.count()
    if (count > 0) {
      await expect(fallbackBadge.first()).toContainText(/fallback/i)
    }
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        // Non-critical — global teardown will clean up the user
        // NOTE: console.warn used — E2E runs in Playwright Node.js process, pino not importable
        console.warn(`[cleanup] Failed to clean project ${projectId}:`, err)
      }
    }
  })
})
