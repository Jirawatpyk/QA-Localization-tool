/**
 * Story 4.2 ATDD — E2E: Core Review Actions (Accept / Reject / Flag)
 *
 * GREEN phase — implementation complete (server actions, optimistic UI,
 * auto-advance, toast, keyboard shortcuts). Tests unskipped.
 *
 * Strategy: Seed pre-baked file+score+5 findings via PostgREST (NOT UI-based).
 */

import { test, expect } from '@playwright/test'

import { cleanupTestProject, queryScore } from './helpers/pipeline-admin'
import { waitForReviewPageHydrated } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// ── Seed Helper ───────────────────────────────────────────────────────────────

/** Seed file + score + 5 findings (1 critical, 3 major, 1 minor) all pending. */
async function seedFileWithFindingsForActions(opts: {
  tenantId: string
  projectId: string
}): Promise<string> {
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `actions-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 1024,
      storage_path: `e2e/actions-test-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file failed: ${fileRes.status} ${await fileRes.text()}`)
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seed file: no row returned')
  const fileId = fileData[0]!.id

  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 78.5,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 1000,
      critical_count: 1,
      major_count: 3,
      minor_count: 1,
      npt: 0.215,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok)
    throw new Error(`seed score failed: ${scoreRes.status} ${await scoreRes.text()}`)

  const findings = [
    {
      severity: 'critical',
      category: 'accuracy',
      description: 'Critical mistranslation',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'fluency',
      description: 'Awkward phrasing',
      detected_by_layer: 'L2',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Wrong glossary term',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'style',
      description: 'Inconsistent register',
      detected_by_layer: 'L2',
    },
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Extra trailing space',
      detected_by_layer: 'L1',
    },
  ]
  for (const f of findings) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        status: 'pending',
        ...f,
      }),
    })
    if (!r.ok) throw new Error(`seed finding failed: ${r.status} ${await r.text()}`)
  }
  return fileId
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e-review-actions-${Date.now()}@test.local`
let projectId: string
let tenantId: string
let seededFileId: string

test.describe.serial('Review Actions — Story 4.2 ATDD', () => {
  test.setTimeout(120_000)
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  test('[setup] signup, create project, seed file with 5 findings', async ({ page }) => {
    test.setTimeout(60_000)
    await signupOrLogin(page, TEST_EMAIL)
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId
    projectId = await createTestProject(tenantId, 'E2E Review Actions Test')
    expect(projectId).toBeTruthy()
    seededFileId = await seedFileWithFindingsForActions({ tenantId, projectId })
    expect(seededFileId).toBeTruthy()
    const score = await queryScore(seededFileId)
    expect(score).not.toBeNull()
    expect(score!.layer_completed).toBe('L1L2')
  })

  test('[P0] E-R1: should accept finding via keyboard A with toast and auto-advance', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const rows = grid.getByRole('row')
    await rows.first().focus()
    await expect(rows.first()).toBeFocused()

    await page.keyboard.press('a')
    await expect(rows.first()).toHaveAttribute('data-status', 'accepted', { timeout: 5_000 })

    // Verify line-through styling on the row (compact card applies it on text spans)
    await expect(page.getByText(/finding.*accepted/i)).toBeVisible({ timeout: 5_000 })

    // Guardrail #32: auto-advance to next Pending
    await expect(rows.nth(1)).toBeFocused({ timeout: 5_000 })
    await expect(rows.nth(1)).toHaveAttribute('data-status', 'pending')
  })

  test('[P0] E-R2: should reject finding via keyboard R with toast and auto-advance', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    await pendingRow.focus()
    await expect(pendingRow).toBeFocused()

    await page.keyboard.press('r')
    await expect(pendingRow).toHaveAttribute('data-status', 'rejected', { timeout: 5_000 })
    await expect(page.getByText(/finding.*rejected/i)).toBeVisible({ timeout: 5_000 })

    const focusedRow = grid.locator('[role="row"]:focus')
    await expect(focusedRow).toHaveAttribute('data-status', 'pending')
  })

  test('[P0] E-R3: should flag finding via keyboard F with toast and auto-advance', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    await pendingRow.focus()
    await expect(pendingRow).toBeFocused()

    await page.keyboard.press('f')
    await expect(pendingRow).toHaveAttribute('data-status', 'flagged', { timeout: 5_000 })
    await expect(pendingRow.getByTestId('flag-icon')).toBeVisible()
    await expect(page.getByText(/finding.*flagged/i)).toBeVisible({ timeout: 5_000 })

    const focusedRow = grid.locator('[role="row"]:focus')
    await expect(focusedRow).toHaveAttribute('data-status', 'pending')
  })

  test('[P0] E-R4: should complete full keyboard review flow J then A then R then F', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const rows = grid.getByRole('row')
    await expect(rows).toHaveCount(5, { timeout: 10_000 })
    await rows.first().focus()

    // Accept first
    await page.keyboard.press('a')
    await expect(rows.first()).toHaveAttribute('data-status', 'accepted', { timeout: 5_000 })
    await page.keyboard.press('j')

    // Reject second
    await page.keyboard.press('r')
    await expect(grid.locator('[role="row"][data-status="rejected"]')).toHaveCount(1, {
      timeout: 5_000,
    })
    await page.keyboard.press('j')

    // Flag third
    await page.keyboard.press('f')
    await expect(grid.locator('[role="row"][data-status="flagged"]')).toHaveCount(1, {
      timeout: 5_000,
    })

    // 3 reviewed, 2 pending
    await expect(grid.locator('[role="row"][data-status="pending"]')).toHaveCount(2)
    const progress = page.getByTestId('review-progress')
    await expect(progress).toContainText('3', { timeout: 5_000 })
    await expect(progress).toContainText('5')
  })

  test('[P1] E-R5: should accept finding via mouse click on Accept button', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    await pendingRow.focus()

    const actionBar = page.getByTestId('review-action-bar')
    await actionBar.getByRole('button', { name: /accept/i }).click()

    await expect(pendingRow).toHaveAttribute('data-status', 'accepted', { timeout: 5_000 })
    await expect(page.getByText(/finding.*accepted/i)).toBeVisible({ timeout: 5_000 })
  })

  test('[P1] E-R6: should accept finding via quick-action icon click on row', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    await pendingRow.getByRole('button', { name: /accept/i }).click()

    await expect(pendingRow).toHaveAttribute('data-status', 'accepted', { timeout: 5_000 })
  })

  test('[P0] E-R7: should persist accepted state after page reload (crash recovery)', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    await grid.getByRole('row').first().focus()
    await page.keyboard.press('a')
    await expect(grid.getByRole('row').first()).toHaveAttribute('data-status', 'accepted', {
      timeout: 5_000,
    })

    await page.reload()
    await waitForReviewPageHydrated(page)

    const reloadedFirst = page.getByRole('grid').getByRole('row').first()
    await expect(reloadedFirst).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })
    await expect(page.getByTestId('review-progress')).toBeVisible({ timeout: 10_000 })
  })

  test('[P1] E-R8: should show info toast when accepting an already-accepted finding', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const targetRow = grid.locator('[role="row"][data-status="pending"]').first()
    await targetRow.focus()
    await page.keyboard.press('a')
    await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 5_000 })

    // Navigate back and try accepting again
    await page.keyboard.press('k')
    await expect(targetRow).toBeFocused()
    await page.keyboard.press('a')

    await expect(page.getByText(/already accepted/i)).toBeVisible({ timeout: 5_000 })
    await expect(targetRow).toHaveAttribute('data-status', 'accepted')
  })

  test('[P1] E-R9: should recalculate MQM score after rejecting a finding', async ({ page }) => {
    const initialScore = await queryScore(seededFileId)
    expect(initialScore).not.toBeNull()
    const initialMqm = initialScore!.mqm_score

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const pendingRow = page.getByRole('grid').locator('[role="row"][data-status="pending"]').first()
    await pendingRow.focus()
    await page.keyboard.press('r')
    await expect(pendingRow).toHaveAttribute('data-status', 'rejected', { timeout: 5_000 })

    // Poll DB for score increase (rejected = penalty removed = higher score)
    let updatedMqm = initialMqm
    const start = Date.now()
    while (Date.now() - start < 30_000) {
      const updated = await queryScore(seededFileId)
      if (updated && updated.mqm_score > initialMqm) {
        updatedMqm = updated.mqm_score
        break
      }
      await new Promise((r) => setTimeout(r, 2_000))
    }
    expect(updatedMqm).toBeGreaterThan(initialMqm)
  })

  test('[P1] E-R10: should disable action buttons when no finding is focused', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    await page.locator('body').click()

    const actionBar = page.getByTestId('review-action-bar')
    await expect(actionBar).toBeVisible({ timeout: 10_000 })
    await expect(actionBar.getByRole('button', { name: /accept/i })).toBeDisabled()
    await expect(actionBar.getByRole('button', { name: /reject/i })).toBeDisabled()
    await expect(actionBar.getByRole('button', { name: /flag/i })).toBeDisabled()

    await page.getByRole('grid').getByRole('row').first().focus()
    await expect(actionBar.getByRole('button', { name: /accept/i })).toBeEnabled({ timeout: 5_000 })
    await expect(actionBar.getByRole('button', { name: /reject/i })).toBeEnabled()
    await expect(actionBar.getByRole('button', { name: /flag/i })).toBeEnabled()
  })

  test('[P0] E-B1: should focus action bar when all findings are reviewed', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const rows = grid.getByRole('row')
    const total = await rows.count()

    await rows.first().focus()
    for (let i = 0; i < total; i++) {
      await page.keyboard.press('a')
      await expect(page.getByText(/accepted/i)).toBeVisible({ timeout: 3_000 })
    }

    // No pending left: focus should move to action bar (Guardrail #32)
    const actionBar = page.getByTestId('review-action-bar')
    await expect(actionBar).toBeFocused({ timeout: 5_000 })

    const progress = page.getByTestId('review-progress')
    await expect(progress).toContainText(`${total}`)
    await expect(progress).toContainText('Reviewed')
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
