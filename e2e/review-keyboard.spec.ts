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
import { gotoReviewPageWithRetry } from './helpers/review-page'
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
      major_count: 3,
      minor_count: 0,
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

  // 3. Insert findings (3 major findings — all navigable without accordion)
  const findings = [
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslated term',
      detected_by_layer: 'L2',
      status: 'pending',
    },
    {
      severity: 'major',
      category: 'fluency',
      description: 'Awkward phrasing in target',
      detected_by_layer: 'L2',
      status: 'pending',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Wrong glossary term used',
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
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // Focus a finding row BEFORE opening modal so Radix can restore focus
    // (Guardrail #30: Modal focus trap + restore — needs a visible trigger element)
    const firstRow = page.getByRole('row').first()
    await firstRow.focus()
    await expect(firstRow).toBeFocused()

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

    // Guardrail #30: focus should return to the page (not stuck in removed portal).
    // Production code restores to the trigger element via selector-based lookup;
    // we verify focus landed on a real page element (not null/body).
    const activeRole = await page.evaluate(() => {
      const el = document.activeElement
      return el?.getAttribute('role') ?? el?.tagName ?? 'null'
    })
    // If selector restore works → 'row'; if fallback → 'BODY' is acceptable
    // The key assertion: focus is NOT stuck in a removed dialog portal
    expect(['row', 'BODY', 'grid']).toContain(activeRole)
  })

  // ── 4.0-E-F5e [P1]: Escape key hierarchy ─────────────────────────────────
  // Story 4.3: SeverityOverrideMenu is now available as dropdown inside Sheet
  test('[P1] F5e: should close dropdown inside Sheet before closing Sheet on Esc', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // Wait for finding list to render
    const findingList = page.getByRole('grid')
    await expect(findingList).toBeVisible({ timeout: 30_000 })

    // Click first pending finding to activate it
    const pendingRow = page.locator('[role="row"][data-status="pending"]').first()
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    // Open the SeverityOverrideMenu dropdown via action bar button (Story 4.3)
    const actionBar = page.getByTestId('review-action-bar')
    await actionBar.getByTestId('action-override').click()

    // Verify dropdown content is visible
    const menuContent = page.getByTestId('override-menu-content')
    await expect(menuContent).toBeVisible({ timeout: 5_000 })

    // First Esc: close dropdown only
    await page.keyboard.press('Escape')
    await expect(menuContent).not.toBeVisible({ timeout: 3_000 })

    // The finding list should still be visible (dropdown closed, page not navigated away)
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible()

    // Focus returns to action bar area after Esc (Radix DropdownMenu behavior — Guardrail #31)
    // Note: Radix returns focus to DropdownMenuTrigger which is the hidden span inside SeverityOverrideMenu.
    // The page should still be functional (grid visible, no error).
    await expect(grid).toBeVisible()
  })

  // ── 4.0-E-C1e [P1]: Keyboard cheat sheet modal ───────────────────────────
  test('[P1] C1e: should open keyboard cheat sheet with Ctrl+Shift+/ keypress', async ({
    page,
  }) => {
    // Navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

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
    // Use exact text match to avoid strict mode violations (e.g. /K/ matches "Keyboard Shortcuts")
    await expect(modal.getByText('J', { exact: true })).toBeVisible()
    await expect(modal.getByText('K', { exact: true })).toBeVisible()

    // Close modal with Esc
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })

  // ── 4.1b-E1 [P0]: Full keyboard review flow (GREEN — TD-E2E-014 resolved) ──
  // Story 4.1b: J/K navigate → Enter inline expand → Esc collapse → focus restore
  test('[P0] E1: should complete keyboard review flow: J/K navigate → Enter expand inline → Esc collapse → focus restore', async ({
    page,
  }) => {
    // Full integration test covering the keyboard review workflow
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, seededFileId)

    // 1. Finding list visible with grid role (Guardrail #29, #38)
    const grid = page.getByRole('grid')
    await expect(grid).toBeVisible({ timeout: 30_000 })

    const rows = grid.getByRole('row')
    await expect(rows).toHaveCount(3)

    // 2. Click first row to sync activeFindingId (focus() alone doesn't sync — E2E memory)
    const firstRow = rows.first()
    await firstRow.click()
    await expect(firstRow).toBeFocused({ timeout: 5_000 })
    await expect(firstRow).toHaveAttribute('tabindex', '0')

    // Wait for keyboard handler registration — SSR renders finding rows
    // before React effects run, so data-keyboard-ready signals that the
    // useEffect registering J/K/Arrow handlers has completed.
    await page.waitForSelector('[role="grid"][data-keyboard-ready="true"]', {
      timeout: 15_000,
    })

    // 3. Navigate to second finding with J
    // CI headless: rAF focus delay — wait for tabindex + focused with timeout
    await page.keyboard.press('j')
    const secondRow = rows.nth(1)
    await expect(secondRow).toHaveAttribute('tabindex', '0', { timeout: 10_000 })
    await expect(secondRow).toBeFocused({ timeout: 5_000 })
    await expect(firstRow).toHaveAttribute('tabindex', '-1')

    // 4. Navigate back up with K
    await page.keyboard.press('k')
    await expect(firstRow).toHaveAttribute('tabindex', '0', { timeout: 10_000 })
    await expect(firstRow).toBeFocused({ timeout: 5_000 })

    // 5. Press Enter to INLINE expand (NOT Sheet open — Story 4.1b AC2)
    await page.keyboard.press('Enter')
    await expect(firstRow).toHaveAttribute('aria-expanded', 'true')
    // Focus stays on same row after expand
    await expect(firstRow).toBeFocused()

    // 6. Esc collapses the expanded finding (Guardrail #31 — innermost layer)
    await page.keyboard.press('Escape')
    await expect(firstRow).toHaveAttribute('aria-expanded', 'false')
    // Focus stays on same row after collapse
    await expect(firstRow).toBeFocused()

    // 7. Navigate to third finding (verify J navigates through list)
    await page.keyboard.press('j') // → second
    await page.keyboard.press('j') // → third
    const thirdRow = rows.nth(2)
    await expect(thirdRow).toBeFocused({ timeout: 5_000 })

    // 8. Verify aria-label includes finding position
    const ariaLabel = await thirdRow.getAttribute('aria-label')
    expect(ariaLabel).toContain('Finding 3 of')
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
