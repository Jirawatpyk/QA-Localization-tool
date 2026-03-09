/**
 * Story 4.0 ATDD — E2E: Review Keyboard & Focus Management
 *
 * Tests keyboard interactions and focus management on the review page:
 *   - Modal focus trap (Tab stays within modal, Esc closes + restores focus)
 *   - Escape key hierarchy (innermost layer closes first)
 *   - Keyboard cheat sheet modal (Ctrl+Shift+/)
 *   - Full keyboard review flow (navigate → open Sheet → Esc → focus restore)
 *
 * Strategy: Seed pre-baked file+score+findings via PostgREST (same as score-lifecycle).
 * Each test operates on the same review page URL.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 * - Inngest dev server for pipeline seeding (optional — tests seed via PostgREST)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
import { test, expect } from '@playwright/test'

import { cleanupTestProject, queryScore } from './helpers/pipeline-admin'
import { waitForReviewPageHydrated, waitForReviewPageReady } from './helpers/review-page'
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
 * Seed a file + score + findings via PostgREST for keyboard review tests.
 * Returns the seeded fileId.
 */
async function seedFileWithFindingsForKeyboard(opts: {
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
      file_name: `keyboard-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: `e2e/keyboard-test-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(
      `seedFileWithFindingsForKeyboard: failed to insert file: ${fileRes.status} ${text}`,
    )
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0)
    throw new Error('seedFileWithFindingsForKeyboard: no file row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score row (calculated + L1L2)
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 91.5,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 800,
      critical_count: 0,
      major_count: 1,
      minor_count: 3,
      npt: 0.085,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(
      `seedFileWithFindingsForKeyboard: failed to insert score: ${scoreRes.status} ${text}`,
    )
  }

  // 3. Insert findings (3 findings for keyboard navigation testing)
  const findings = [
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslated term',
      detected_by_layer: 'L2',
      status: 'pending',
    },
    {
      severity: 'minor',
      category: 'fluency',
      description: 'Awkward phrasing in target',
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
        `seedFileWithFindingsForKeyboard: failed to insert finding: ${findingRes.status} ${text}`,
      )
    }
  }

  return fileId
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-review-kb-${Date.now()}@test.local`

// Shared state across serial tests (set in [setup])
let projectId: string
let tenantId: string
let seededFileId: string

test.describe.serial('Review Keyboard & Focus — Story 4.0 ATDD', () => {
  test.setTimeout(120_000)

  // Skip if Inngest dev server is not available (outer gate)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup: Auth + Project + Seeded Data ──────────────────────────────────
  test('[setup] signup, create project, seed file with findings', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'E2E Keyboard Test')
    expect(projectId).toBeTruthy()

    // Seed file with findings for all subsequent keyboard tests
    seededFileId = await seedFileWithFindingsForKeyboard({
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

  // ── 4.0-E-F1e [P0]: Modal focus trap ──────────────────────────────────────
  test('[P0] F1e: should trap Tab within modal on review page', async ({ page }) => {
    // Navigate to review page with seeded findings
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    // Wait for full hydration (finding grid + keyboard bindings registered)
    await waitForReviewPageHydrated(page)

    // Open keyboard cheat sheet modal (Ctrl+Shift+/ = Ctrl+?)
    // Use explicit key down/up sequence for cross-platform reliability
    // (headless Chromium on Linux may handle modifier+key combos differently)
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    await page.keyboard.press('/')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
    const modal = page.getByRole('dialog', { name: /keyboard shortcuts/i })
    await expect(modal).toBeVisible({ timeout: 10_000 })

    // Tab through modal — focus should stay inside
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Focus should still be within the modal (not escaped to background)
    const focusedInsideModal = modal.locator(':focus')
    await expect(focusedInsideModal).toBeVisible()

    // Esc closes modal
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()

    // Focus should return to the element that triggered the modal
    // (Guardrail #30: Modal focus trap + restore)
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  // ── 4.0-E-F5e [P1]: Escape key hierarchy ─────────────────────────────────
  // TODO(TD-E2E-013): Unskip when Story 4.2 adds dropdown controls inside FindingDetailSheet
  test.skip('[P1] F5e: should close dropdown inside Sheet before closing Sheet on Esc', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageReady(page)

    // Wait for finding list to render
    const findingList = page.getByRole('grid')
    await expect(findingList).toBeVisible({ timeout: 30_000 })

    // Click first finding to open detail Sheet
    const firstFindingRow = page.getByRole('row').first()
    await firstFindingRow.click()

    const sheet = page.getByRole('complementary')
    await expect(sheet).toBeVisible({ timeout: 5_000 })

    // Open a dropdown inside the sheet (e.g., severity override dropdown)
    const dropdownTrigger = sheet.getByRole('combobox').first()
    const hasDropdown = (await dropdownTrigger.count()) > 0
    if (hasDropdown) {
      await dropdownTrigger.click()

      // First Esc: close dropdown only, Sheet stays open
      await page.keyboard.press('Escape')
      await expect(sheet).toBeVisible()

      // Second Esc: close the Sheet
      await page.keyboard.press('Escape')
      await expect(sheet).not.toBeVisible()
    } else {
      // If no dropdown in Sheet yet, just test Sheet Esc close
      await page.keyboard.press('Escape')
      await expect(sheet).not.toBeVisible()
    }

    // Focus should return to the finding row (Guardrail #30)
    const focusedRow = findingList.getByRole('row').locator(':focus')
    await expect(focusedRow).toBeVisible()
  })

  // ── 4.0-E-C1e [P1]: Keyboard cheat sheet modal ───────────────────────────
  test('[P1] C1e: should open keyboard cheat sheet with Ctrl+Shift+/ keypress', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    // Wait for full hydration (finding grid + keyboard bindings registered)
    await waitForReviewPageHydrated(page)

    // Press Ctrl+Shift+/ (produces Ctrl+? in most keyboard layouts)
    // Use explicit key sequence for cross-platform reliability
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    await page.keyboard.press('/')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')

    const modal = page.getByRole('dialog', { name: /keyboard shortcuts/i })
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Verify cheat sheet has expected categories (Guardrail #28: scoped hotkeys)
    await expect(modal.getByText(/Navigation/i)).toBeVisible()
    await expect(modal.getByText(/Review Actions/i)).toBeVisible()

    // Verify at least some hotkey entries are listed
    // J/K for navigation, A for accept, R for reject
    await expect(modal.getByText(/J/)).toBeVisible()
    await expect(modal.getByText(/K/)).toBeVisible()

    // Close modal with Esc
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  // ── 4.0-E-E1 [P0]: Full keyboard review flow ─────────────────────────────
  // TODO(TD-E2E-014): Unskip when Story 4.1a wires J/K roving tabindex navigation
  test.skip('[P0] E1: should complete keyboard review flow: page load → hotkey → Sheet → Esc → focus restore', async ({
    page,
  }) => {
    // Full integration test covering the keyboard review workflow
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageReady(page)

    // 1. Finding list visible with grid role (Guardrail #29, #38)
    const findingList = page.getByRole('grid', { name: /finding/i })
    await expect(findingList).toBeVisible({ timeout: 30_000 })

    // 2. Score badge visible (seeded score = 91.5)
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 10_000 })

    // 3. Navigate with J key (roving tabindex pattern — Guardrail #29)
    await page.keyboard.press('j')

    // 4. First finding row should receive focus (tabindex="0")
    const rows = findingList.getByRole('row')
    const firstRow = rows.first()
    await expect(firstRow).toBeFocused({ timeout: 5_000 })

    // 5. Press Enter to open detail Sheet
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('complementary')
    await expect(sheet).toBeVisible({ timeout: 5_000 })

    // 6. Sheet should show finding details
    await expect(sheet.getByText(/accuracy|fluency|whitespace/i)).toBeVisible()

    // 7. Esc closes Sheet (single layer — Guardrail #31)
    await page.keyboard.press('Escape')
    await expect(sheet).not.toBeVisible()

    // 8. Focus returns to the finding row that opened the Sheet (Guardrail #30)
    await expect(firstRow).toBeFocused({ timeout: 5_000 })

    // 9. Navigate down with J key
    await page.keyboard.press('j')
    const secondRow = rows.nth(1)
    await expect(secondRow).toBeFocused({ timeout: 5_000 })

    // 10. Navigate up with K key
    await page.keyboard.press('k')
    await expect(firstRow).toBeFocused({ timeout: 5_000 })
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
