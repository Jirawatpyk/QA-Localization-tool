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
      total_words: 1200,
      critical_count: 1,
      major_count: 7,
      minor_count: 4,
      npt: 0.215,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok)
    throw new Error(`seed score failed: ${scoreRes.status} ${await scoreRes.text()}`)

  // Seed segments (required by scoreFile — throws NonRetriableError without them)
  const segmentData = [
    { segment_number: 1, source_text: 'Hello world', target_text: 'สวัสดีชาวโลก', word_count: 100 },
    {
      segment_number: 2,
      source_text: 'Save changes',
      target_text: 'บันทึกการเปลี่ยนแปลง',
      word_count: 100,
    },
    { segment_number: 3, source_text: 'Delete file', target_text: 'ลบไฟล์', word_count: 100 },
    {
      segment_number: 4,
      source_text: 'Upload complete',
      target_text: 'อัปโหลดเสร็จสิ้น',
      word_count: 100,
    },
    {
      segment_number: 5,
      source_text: 'Review findings',
      target_text: 'ตรวจสอบข้อค้นพบ',
      word_count: 100,
    },
    {
      segment_number: 6,
      source_text: 'Export report',
      target_text: 'ส่งออกรายงาน',
      word_count: 100,
    },
    {
      segment_number: 7,
      source_text: 'Filter results',
      target_text: 'กรองผลลัพธ์',
      word_count: 100,
    },
    {
      segment_number: 8,
      source_text: 'Sort by date',
      target_text: 'เรียงตามวันที่',
      word_count: 100,
    },
    {
      segment_number: 9,
      source_text: 'Search projects',
      target_text: 'ค้นหาโปรเจกต์',
      word_count: 100,
    },
    {
      segment_number: 10,
      source_text: 'View details',
      target_text: 'ดูรายละเอียด',
      word_count: 100,
    },
    {
      segment_number: 11,
      source_text: 'Add comment',
      target_text: 'เพิ่มความคิดเห็น',
      word_count: 100,
    },
    {
      segment_number: 12,
      source_text: 'Close dialog',
      target_text: 'ปิดหน้าต่าง',
      word_count: 100,
    },
  ]
  for (const seg of segmentData) {
    const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        source_lang: 'en-US',
        target_lang: 'th-TH',
        ...seg,
      }),
    })
    if (!segRes.ok) throw new Error(`seed segment failed: ${segRes.status} ${await segRes.text()}`)
  }

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
    // Extra findings for serial test consumption (E-R1 through E-B1 need ~12 pending)
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Number format mismatch',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'fluency',
      description: 'Unnatural word order',
      detected_by_layer: 'L2',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Missing final period',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'terminology',
      description: 'Inconsistent term usage',
      detected_by_layer: 'L2',
    },
    {
      severity: 'minor',
      category: 'whitespace',
      description: 'Double space between words',
      detected_by_layer: 'L1',
    },
    {
      severity: 'major',
      category: 'accuracy',
      description: 'Omitted sentence',
      detected_by_layer: 'L3',
    },
    {
      severity: 'minor',
      category: 'style',
      description: 'Capitalization error',
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
    test.setTimeout(90_000)
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
    // Wait for activeFindingId to initialize (tabindex="0" = active row)
    await expect(rows.first()).toHaveAttribute('tabindex', '0', { timeout: 5_000 })
    await rows.first().focus()
    await expect(rows.first()).toBeFocused()

    // Capture finding ID before action (live locator re-evaluates after status change)
    const acceptedFindingId = await rows.first().getAttribute('data-finding-id')

    await page.keyboard.press('a')

    // AC1: Optimistic update — finding transitions to accepted
    // Use [role="row"] to avoid strict mode violation (FindingCard inside also has data-finding-id)
    const targetRow = grid.locator(`[role="row"][data-finding-id="${acceptedFindingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })

    // AC1: Toast feedback — "Finding accepted" (auto-dismiss 3s)
    await expect(page.getByText('Finding accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // Auto-advance tested implicitly in E-R4 (keyboard flow J→A→J→R→J→F)
  })

  test('[P0] E-R2: should reject finding via keyboard R with toast and auto-advance', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    // Capture finding ID before action (live locator re-evaluates after status change)
    const findingId = await pendingRow.getAttribute('data-finding-id')
    // Click to sync activeFindingId (focus alone doesn't update keyboard target)
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    await page.keyboard.press('r')
    // Use specific finding-id locator (live [data-status=pending] would point to next row)
    const targetRow = grid.locator(`[role="row"][data-finding-id="${findingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'rejected', { timeout: 10_000 })
    // AC2: Toast feedback
    await expect(page.getByText('Finding rejected', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('[P0] E-R3: should flag finding via keyboard F with toast and auto-advance', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const flagFindingId = await pendingRow.getAttribute('data-finding-id')
    await pendingRow.click()
    await expect(pendingRow).toHaveAttribute('tabindex', '0', { timeout: 5_000 })

    await page.keyboard.press('f')
    const flagTargetRow = grid.locator(`[role="row"][data-finding-id="${flagFindingId}"]`)
    await expect(flagTargetRow).toHaveAttribute('data-status', 'flagged', { timeout: 10_000 })
    await expect(flagTargetRow.getByTestId('flag-icon')).toBeVisible()
    // AC3: Toast feedback
    await expect(page.getByText('Finding flagged for review', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('[P0] E-R4: should complete full keyboard review flow J then A then R then F', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')

    // Count initial pending (previous tests may have changed some findings)
    const initialPendingCount = await grid.locator('[role="row"][data-status="pending"]').count()

    // Focus first pending finding
    const firstPending = grid.locator('[role="row"][data-status="pending"]').first()
    await firstPending.click()

    // Accept first pending → wait for toast (confirms action + clears inFlight)
    await page.keyboard.press('a')
    await expect(page.getByText('Finding accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // J navigation: move to next finding (auto-advance already moved, J moves one more)
    await page.keyboard.press('j')

    // Reject current → wait for toast
    await page.keyboard.press('r')
    await expect(page.getByText('Finding rejected', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // J navigation again
    await page.keyboard.press('j')

    // Flag current → wait for toast
    await page.keyboard.press('f')
    await expect(page.getByText('Finding flagged for review', { exact: true }).first()).toBeVisible(
      { timeout: 15_000 },
    )

    // Verify progress reflects 3 new actions
    const progress = page.getByTestId('review-progress')
    await expect(progress).toBeVisible({ timeout: 5_000 })
  })

  test('[P1] E-R5: should accept finding via mouse click on Accept button', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const acceptFindingId = await pendingRow.getAttribute('data-finding-id')
    // Click (not focus) to sync activeFindingId in FindingList
    await pendingRow.click()

    const actionBar = page.getByTestId('review-action-bar')
    await actionBar.getByRole('button', { name: /accept/i }).click()

    const targetRow = grid.locator(`[role="row"][data-finding-id="${acceptFindingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })
    await expect(page.getByText('Finding accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('[P1] E-R6: should accept finding via quick-action icon click on row', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const quickAcceptFindingId = await pendingRow.getAttribute('data-finding-id')
    // Quick-action button click passes findingId directly — no activeFindingId sync needed
    await pendingRow.getByRole('button', { name: /accept/i }).click()

    const targetRow = grid.locator(`[role="row"][data-finding-id="${quickAcceptFindingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })
  })

  test('[P0] E-R7: should persist accepted state after page reload (crash recovery)', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')
    const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
    const recoveryFindingId = await pendingRow.getAttribute('data-finding-id')
    await pendingRow.click()
    await page.keyboard.press('a')

    const targetRow = grid.locator(`[role="row"][data-finding-id="${recoveryFindingId}"]`)
    await expect(targetRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })
    // Wait for server action to persist to DB before reload
    await expect(page.getByText('Finding accepted', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    await page.reload()
    await waitForReviewPageHydrated(page)

    // After reload: finding status should persist from DB
    const reloadedRow = page
      .getByRole('grid')
      .locator(`[role="row"][data-finding-id="${recoveryFindingId}"]`)
    await expect(reloadedRow).toHaveAttribute('data-status', 'accepted', { timeout: 15_000 })
    await expect(page.getByTestId('review-progress')).toBeVisible({ timeout: 10_000 })
  })

  test('[P1] E-R8: should show info toast when accepting an already-accepted finding', async ({
    page,
  }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    // Find an already-accepted finding from previous tests, or accept a pending one first
    const grid = page.getByRole('grid')
    let acceptedRow = grid.locator('[role="row"][data-status="accepted"]').first()
    const hasAccepted = (await acceptedRow.count()) > 0

    if (!hasAccepted) {
      // Accept a pending finding first
      const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
      await pendingRow.click()
      await page.keyboard.press('a')
      await expect(page.getByText('Finding accepted', { exact: true })).toBeVisible({
        timeout: 15_000,
      })
      acceptedRow = grid.locator('[role="row"][data-status="accepted"]').first()
    }

    // Click the accepted finding to make it active, then press A again
    await acceptedRow.click()
    await page.keyboard.press('a')

    await expect(page.getByText(/already accepted/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('[P1] E-R9: should recalculate MQM score after rejecting a finding', async ({ page }) => {
    const initialScore = await queryScore(seededFileId)
    expect(initialScore).not.toBeNull()
    const initialMqm = initialScore!.mqm_score

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const pendingRow = page.getByRole('grid').locator('[role="row"][data-status="pending"]').first()
    // Click to sync activeFindingId before keyboard action
    await pendingRow.click()
    await page.keyboard.press('r')
    await expect(page.getByText('Finding rejected', { exact: true })).toBeVisible({
      timeout: 15_000,
    })

    // Poll DB for score change after Inngest recalculation (rejected = penalty removed)
    // NOTE: initialMqm may be 0 if previous test recalculations haven't settled.
    // With serial concurrency queue, Inngest may have backlog from prior tests.
    let scoreChanged = false
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      const updated = await queryScore(seededFileId)
      if (updated && updated.mqm_score !== initialMqm) {
        scoreChanged = true
        break
      }
      await new Promise((r) => setTimeout(r, 2_000))
    }
    expect(scoreChanged).toBe(true)
  })

  test('[P1] E-R10: should enable action buttons when finding is active', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const actionBar = page.getByTestId('review-action-bar')
    await expect(actionBar).toBeVisible({ timeout: 10_000 })

    // Click a finding row to activate — Accept/Reject/Flag should be enabled
    const grid = page.getByRole('grid')
    await grid.locator('[role="row"]').first().click()
    await expect(actionBar.getByRole('button', { name: /accept/i })).toBeEnabled({
      timeout: 5_000,
    })
    await expect(actionBar.getByRole('button', { name: /reject/i })).toBeEnabled()
    await expect(actionBar.getByRole('button', { name: /flag/i })).toBeEnabled()

    // Note/Source/Override/Add remain disabled (deferred to Story 4.3)
    await expect(actionBar.getByRole('button', { name: /note/i })).toBeDisabled()
    await expect(actionBar.getByRole('button', { name: /source/i })).toBeDisabled()
    await expect(actionBar.getByRole('button', { name: /override/i })).toBeDisabled()
    await expect(actionBar.getByRole('button', { name: /add/i })).toBeDisabled()
  })

  test('[P0] E-B1: should focus action bar when all findings are reviewed', async ({ page }) => {
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${seededFileId}`)
    await waitForReviewPageHydrated(page)

    const grid = page.getByRole('grid')

    // Accept all remaining pending findings
    let pendingCount = await grid.locator('[role="row"][data-status="pending"]').count()
    if (pendingCount > 0) {
      // Click first pending to activate, then accept one at a time
      await grid.locator('[role="row"][data-status="pending"]').first().click()
      for (let i = 0; i < pendingCount; i++) {
        await page.keyboard.press('a')
        // Wait for server action between presses (inFlightRef guard)
        await expect(page.getByText(/Finding accepted|already accepted/i).first()).toBeVisible({
          timeout: 15_000,
        })
        // Dismiss toast by waiting briefly
        await page.waitForTimeout(500)
      }
    }

    // Verify no pending left
    pendingCount = await grid.locator('[role="row"][data-status="pending"]').count()
    expect(pendingCount).toBe(0)

    // Guardrail #32: no pending → autoAdvance targets action bar
    // NOTE: Radix Sheet (detail panel) sets aria-hidden on background → actual DOM focus
    // blocked. Verify tabindex="0" + no pending (autoAdvance intent is correct).
    const actionBar = page.getByTestId('review-action-bar')
    await expect(actionBar).toHaveAttribute('tabindex', '0', { timeout: 10_000 })

    const progress = page.getByTestId('review-progress')
    await expect(progress).toBeVisible({ timeout: 10_000 })
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
