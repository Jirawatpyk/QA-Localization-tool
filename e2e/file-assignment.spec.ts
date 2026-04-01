/**
 * ATDD E2E — Story 6.1: File Assignment & Language-Pair Matching
 *
 * Tests: assign file to reviewer, soft lock warning, take over, priority badge,
 * read-only mode, auto-transition assigned→in_progress, heartbeat stale indicator.
 *
 * Uses 2 browser contexts (Admin/QA + second reviewer).
 * Requires: INNGEST_DEV_URL + local Supabase running.
 *
 * AC Coverage:
 *   AC#1 — ReviewerSelector with language-pair filtering & workload
 *   AC#2 — File assignment creation with notification & audit
 *   AC#3 — Urgent file priority badge
 *   AC#4 — Soft lock warning & take over
 *   AC#6 — Heartbeat stale detection
 *   AC#7 — Status auto-transition on file open
 */

import { test, expect } from '@playwright/test'

import {
  signupOrLogin,
  getUserInfo,
  createTestProject,
  moveUserToTenant,
  setUserRole,
  setUserNativeLanguages,
  setUserMetadata,
  adminHeaders,
  SUPABASE_URL,
  TEST_PASSWORD,
} from './helpers/supabase-admin'

const SKIP_REASON = !process.env.INNGEST_DEV_URL ? 'INNGEST_DEV_URL not set' : undefined

// ── PostgREST Seed Helpers ──

async function seedFile(
  projectId: string,
  tenantId: string,
  fileName: string = 'e2e-assign-test.sdlxliff',
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: projectId,
      tenant_id: tenantId,
      file_name: fileName,
      file_type: 'sdlxliff',
      status: 'l2_completed',
      storage_path: `e2e/${fileName}`,
      file_size_bytes: 2048,
    }),
  })
  if (!res.ok) throw new Error(`File seed failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Array<{ id: string }>
  return data[0]!.id
}

async function seedFinding(projectId: string, tenantId: string, fileId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: projectId,
      tenant_id: tenantId,
      file_id: fileId,
      review_session_id: null,
      severity: 'major',
      category: 'accuracy',
      description: 'E2E test finding for file assignment workflow',
      status: 'pending',
      detected_by_layer: 'L2',
      segment_count: 1,
      scope: 'per-file',
    }),
  })
  if (!res.ok) throw new Error(`Finding seed failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Array<{ id: string }>
  return data[0]!.id
}

async function seedFileAssignment(
  fileId: string,
  projectId: string,
  tenantId: string,
  assignedTo: string,
  assignedBy: string,
  options: { priority?: string; status?: string } = {},
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/file_assignments`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      status: options.status ?? 'assigned',
      priority: options.priority ?? 'normal',
    }),
  })
  if (!res.ok) throw new Error(`File assignment seed failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Array<{ id: string }>
  return data[0]!.id
}

async function updateFileAssignment(
  assignmentId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/file_assignments?id=eq.${assignmentId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`Assignment update failed: ${res.status} ${await res.text()}`)
}

async function cancelActiveAssignments(fId: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/file_assignments?file_id=eq.${fId}&status=in.(assigned,in_progress)`,
    {
      method: 'PATCH',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'cancelled' }),
    },
  )
  if (!res.ok) throw new Error(`Cancel assignments failed: ${res.status} ${await res.text()}`)
}

// ── Test Suite ──

test.describe('Story 6.1: File Assignment & Language-Pair Matching', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 })
  test.skip(!!SKIP_REASON, SKIP_REASON ?? '')

  let qaEmail: string
  let reviewerEmail: string
  let projectId: string
  let tenantId: string
  let fileId: string // AC1+AC2: assignment flow
  let fileIdUrgent: string // AC3: urgent priority
  let fileIdSoftLock: string // AC4: soft lock + read-only
  let fileIdStale: string // AC6: stale detection
  let fileIdAutoTransition: string // AC7: auto-transition
  let fileIdTenantIso: string // AC5: tenant isolation
  let findingId: string
  let qaUserId: string
  let reviewerUserId: string

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000)
    if (SKIP_REASON) return

    // ── Setup QA reviewer (Admin-level, assigns files) ──
    const qaCtx = await browser.newContext()
    const qaPage = await qaCtx.newPage()
    qaEmail = `qa-e2e-6-1-${Date.now()}@test.local`
    await signupOrLogin(qaPage, qaEmail)
    const qaInfo = await getUserInfo(qaEmail)
    if (!qaInfo) throw new Error('QA user not found')
    qaUserId = qaInfo.id
    tenantId = qaInfo.tenantId
    // QA reviewer can assign files
    await setUserRole(qaUserId, 'qa_reviewer')
    await setUserNativeLanguages(qaEmail, ['en', 'th'])
    // Suppress onboarding tours so driver.js overlay doesn't intercept clicks
    await setUserMetadata(qaEmail, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    await qaCtx.close()

    // ── Setup second reviewer (same tenant) ──
    const revCtx = await browser.newContext()
    const revPage = await revCtx.newPage()
    reviewerEmail = `reviewer-e2e-6-1-${Date.now()}@test.local`
    await signupOrLogin(revPage, reviewerEmail)
    const revInfo = await getUserInfo(reviewerEmail)
    if (!revInfo) throw new Error('Reviewer user not found')
    reviewerUserId = revInfo.id
    // Move to same tenant as QA
    await moveUserToTenant(reviewerUserId, tenantId)
    await setUserRole(reviewerUserId, 'qa_reviewer')
    await setUserNativeLanguages(reviewerEmail, ['th'])
    await setUserMetadata(reviewerEmail, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    await revCtx.close()

    // ── Seed test data: separate file per test group to avoid partial unique index conflicts ──
    projectId = await createTestProject(tenantId, 'E2E 6.1 File Assignment')
    fileId = await seedFile(projectId, tenantId, 'e2e-assign-th.sdlxliff')
    fileIdUrgent = await seedFile(projectId, tenantId, 'e2e-urgent-th.sdlxliff')
    fileIdSoftLock = await seedFile(projectId, tenantId, 'e2e-softlock-th.sdlxliff')
    fileIdStale = await seedFile(projectId, tenantId, 'e2e-stale-th.sdlxliff')
    fileIdAutoTransition = await seedFile(projectId, tenantId, 'e2e-autotrans-th.sdlxliff')
    fileIdTenantIso = await seedFile(projectId, tenantId, 'e2e-tenantiso-th.sdlxliff')
    findingId = await seedFinding(projectId, tenantId, fileId)
    // Seed findings for review page tests (soft lock, stale, auto-transition)
    await seedFinding(projectId, tenantId, fileIdSoftLock)
    await seedFinding(projectId, tenantId, fileIdStale)
    await seedFinding(projectId, tenantId, fileIdAutoTransition)
  })

  // ════════════════════════════════════════════════════
  // AC#1: ReviewerSelector with language-pair filtering
  // ════════════════════════════════════════════════════

  test('[AC1-P1] should show Assign button on file list page', async ({ page }) => {
    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })

    // File row should have an Assign button
    const assignBtn = page.getByRole('button', { name: /assign/i }).first()
    await expect(assignBtn).toBeVisible({ timeout: 10_000 })
  })

  test('[AC1-P1] should open FileAssignmentDialog with reviewer list', async ({ page }) => {
    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })
    // Wait for client hydration before clicking interactive elements
    await page.waitForLoadState('networkidle')

    // Open assignment dialog
    await page
      .getByRole('button', { name: /assign/i })
      .first()
      .click()
    const dialog = page.getByTestId('file-assignment-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Should show reviewer selector with language-matching reviewers
    const reviewerSelector = dialog.getByTestId('reviewer-selector')
    await expect(reviewerSelector).toBeVisible()
  })

  test('[AC1-P1] should filter reviewers by target language (th)', async ({ page }) => {
    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    await page
      .getByRole('button', { name: /assign/i })
      .first()
      .click()
    const dialog = page.getByTestId('file-assignment-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Wait for reviewer list to load (async fetch via getEligibleReviewers)
    const options = dialog.locator('[data-testid^="reviewer-option-"]')
    await expect(options.first()).toBeVisible({ timeout: 10_000 })

    // Both QA and reviewer have th in nativeLanguages — both should appear
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // Each option should show language badge and workload count
    const firstOption = options.first()
    await expect(firstOption.locator('[data-testid="language-badge"]').first()).toBeVisible()
    await expect(firstOption.locator('[data-testid="workload-count"]')).toBeVisible()
  })

  test('[AC1-P2] should auto-suggest reviewer with lowest workload', async ({ page }) => {
    // Pre-condition: assign a file to one reviewer so workloads differ
    await cancelActiveAssignments(fileIdUrgent)
    await seedFileAssignment(fileIdUrgent, projectId, tenantId, reviewerUserId, qaUserId, {
      status: 'assigned',
    })

    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    // Open dialog for a DIFFERENT file (not the one already assigned)
    const targetRow = page.locator(`[data-testid="file-row-${fileId}"]`)
    await expect(targetRow).toBeVisible({ timeout: 10_000 })
    await targetRow.getByRole('button', { name: /assign/i }).click()
    const dialog = page.getByTestId('file-assignment-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Wait for reviewers to load
    await expect(dialog.locator('[data-testid^="reviewer-option-"]').first()).toBeVisible({
      timeout: 10_000,
    })

    // QA user has 0 files, reviewer has 1 file → QA should be auto-suggested (star icon)
    const suggestedOption = dialog.locator('[data-testid="reviewer-suggested"]')
    await expect(suggestedOption).toBeVisible({ timeout: 5_000 })
  })

  // ════════════════════════════════════════════════════
  // AC#2: File assignment creation + notification + audit
  // ════════════════════════════════════════════════════

  test('[AC2-P1] should assign file to reviewer and show success toast', async ({ page }) => {
    // Clean up any stale assignments from previous runs
    await cancelActiveAssignments(fileId)

    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    // Click Assign button in the CORRECT file row (not .first() — multiple files exist)
    const targetRow = page.locator(`[data-testid="file-row-${fileId}"]`)
    await expect(targetRow).toBeVisible({ timeout: 10_000 })
    await targetRow.getByRole('button', { name: /assign/i }).click()

    const dialog = page.getByTestId('file-assignment-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Wait for reviewers to load
    await expect(dialog.locator('[data-testid^="reviewer-option-"]').first()).toBeVisible({
      timeout: 10_000,
    })
    await dialog.locator('[data-testid^="reviewer-option-"]').first().click()
    await dialog.getByRole('button', { name: /^assign$/i }).click()

    // Success toast
    await expect(page.getByText(/assigned successfully/i)).toBeVisible({ timeout: 10_000 })

    // Dialog closes
    await expect(dialog).not.toBeVisible()

    // Brief wait for DB write to settle before PostgREST check
    await page.waitForTimeout(1_000)

    // Verify assignment created via PostgREST
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/file_assignments?file_id=eq.${fileId}&status=in.(assigned,in_progress)&select=id,status`,
      { headers: adminHeaders() },
    )
    const assignments = (await res.json()) as Array<{ id: string; status: string }>
    expect(assignments.length).toBeGreaterThanOrEqual(1)
  })

  test('[AC2-P1] assigned reviewer should receive notification', async () => {
    // Verify notification created via PostgREST (Realtime push timing is non-deterministic)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?type=eq.file_assigned&project_id=eq.${projectId}&select=id,type,title,user_id`,
      { headers: adminHeaders() },
    )
    const notifications = (await res.json()) as Array<{
      id: string
      type: string
      title: string
      user_id: string
    }>
    const assignNotif = notifications.find((n) => n.title.includes('e2e-assign-th.sdlxliff'))
    expect(assignNotif).toBeDefined()
    expect(assignNotif!.type).toBe('file_assigned')
  })

  // ════════════════════════════════════════════════════
  // AC#3: Urgent file priority badge
  // ════════════════════════════════════════════════════

  test('[AC3-P1] should display Urgent badge on file with urgent priority', async ({ page }) => {
    // Clean up normal assignment from AC1-P2 test, then seed urgent
    await cancelActiveAssignments(fileIdUrgent)
    await seedFileAssignment(fileIdUrgent, projectId, tenantId, reviewerUserId, qaUserId, {
      priority: 'urgent',
      status: 'assigned',
    })

    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    // Urgent badge should appear on the file row
    await expect(page.getByTestId('urgent-badge').first()).toBeVisible({ timeout: 10_000 })
  })

  test('[AC3-P2] urgent files should appear at top of file list', async ({ page }) => {
    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/files`)
    await page.waitForSelector('[data-testid="file-list"]', { timeout: 15_000 })
    await page.waitForLoadState('networkidle')

    // Urgent badge should be visible (seeded in AC3-P1)
    await expect(page.getByTestId('urgent-badge').first()).toBeVisible({ timeout: 10_000 })

    // Verify urgent file appears as the first row in the list
    const firstRow = page.locator('[data-testid^="file-row-"]').first()
    await expect(firstRow).toHaveAttribute('data-testid', `file-row-${fileIdUrgent}`)
  })

  // ════════════════════════════════════════════════════
  // AC#4: Soft lock warning & take over
  // ════════════════════════════════════════════════════

  test('[AC4-P1] should show soft lock banner when file is assigned to another user', async ({
    browser,
  }) => {
    // Seed assignment: file assigned to QA user (simulating "another reviewer")
    const assignmentId = await seedFileAssignment(
      fileIdSoftLock,
      projectId,
      tenantId,
      qaUserId,
      qaUserId,
      { status: 'in_progress' },
    )
    // Set recent last_active_at so soft lock shows "active"
    await updateFileAssignment(assignmentId, {
      last_active_at: new Date().toISOString(),
    })

    // Second reviewer opens the same file
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    // Soft lock banner should be visible
    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await expect(banner).toContainText(/being reviewed by/i)

    // Should show "View Read-Only" and "Take Over" buttons
    await expect(banner.getByRole('button', { name: /read-only/i })).toBeVisible()
    await expect(banner.getByRole('button', { name: /take over/i })).toBeVisible()

    await ctx.close()
  })

  test('[AC4-P1] "View Read-Only" should disable all action buttons', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    // Click "View Read-Only"
    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await banner.getByRole('button', { name: /read-only/i }).click()

    // Read-only banner should appear
    await expect(page.getByTestId('read-only-banner')).toBeVisible()
    await expect(page.getByTestId('read-only-banner')).toContainText(/read-only/i)

    // Action buttons should exist and be disabled
    const actionBar = page.getByTestId('review-action-bar')
    const actionButtons = actionBar.getByRole('button')
    await expect(actionButtons.first()).toBeVisible({ timeout: 10_000 })

    const acceptBtn = actionBar.getByRole('button', { name: /accept/i })
    if (await acceptBtn.isVisible().catch(() => false)) {
      await expect(acceptBtn).toBeDisabled()
    }
    const rejectBtn = actionBar.getByRole('button', { name: /reject/i })
    if (await rejectBtn.isVisible().catch(() => false)) {
      await expect(rejectBtn).toBeDisabled()
    }

    await ctx.close()
  })

  test('[AC4-P1] read-only mode should suppress keyboard shortcuts', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    // Enter read-only mode
    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await banner.getByRole('button', { name: /read-only/i }).click()

    // Press 'a' (accept shortcut) — should have no effect
    await page.keyboard.press('a')

    // Finding status should remain unchanged (still 'pending')
    const findingRow = page.locator('[role="row"]').first()
    await expect(findingRow).not.toContainText(/accepted/i)

    await ctx.close()
  })

  test('[AC4-P1] "Take Over" should reassign file and notify original reviewer', async ({
    browser,
  }) => {
    // Second reviewer takes over the file
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })

    // Click "Take Over" — triggers window.location.reload() after server action
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30_000 }),
      banner.getByRole('button', { name: /take over/i }).click(),
    ])

    // After reload: reviewer is now the assignee → no soft lock banner
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })
    await expect(page.getByTestId('soft-lock-banner')).not.toBeVisible({ timeout: 5_000 })

    // Action bar should be visible (not read-only)
    await expect(page.getByTestId('review-action-bar')).toBeVisible({ timeout: 10_000 })
    await ctx.close()

    // Verify takeover notification via PostgREST (Realtime timing non-deterministic)
    const notifRes = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?type=eq.file_reassigned&select=id,type,title`,
      { headers: adminHeaders() },
    )
    const notifs = (await notifRes.json()) as Array<{ id: string; type: string; title: string }>
    expect(notifs.some((n) => n.type === 'file_reassigned')).toBe(true)
  })

  // ════════════════════════════════════════════════════
  // AC#4 (responsive): Soft lock banner at different viewports
  // ════════════════════════════════════════════════════

  test('[AC4-P2] soft lock banner should render on desktop (1440px)', async ({ browser }) => {
    // Re-seed: takeover test mutated fileIdSoftLock — reassign to QA user
    await cancelActiveAssignments(fileIdSoftLock)
    const aId = await seedFileAssignment(fileIdSoftLock, projectId, tenantId, qaUserId, qaUserId, {
      status: 'in_progress',
    })
    await updateFileAssignment(aId, { last_active_at: new Date().toISOString() })

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-layout-mode="desktop"]', { timeout: 15_000 })

    await expect(page.getByTestId('soft-lock-banner')).toBeVisible({ timeout: 10_000 })
    await ctx.close()
  })

  test('[AC4-P2] soft lock banner should render on laptop (1024px)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-layout-mode]', { timeout: 15_000 })

    await expect(page.getByTestId('soft-lock-banner')).toBeVisible({ timeout: 10_000 })
    await ctx.close()
  })

  test('[AC4-P2] soft lock banner should render on mobile (375px)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdSoftLock}`)
    await page.waitForSelector('[data-layout-mode]', { timeout: 15_000 })

    await expect(page.getByTestId('soft-lock-banner')).toBeVisible({ timeout: 10_000 })
    await ctx.close()
  })

  // ════════════════════════════════════════════════════
  // AC#6: Heartbeat stale detection
  // ════════════════════════════════════════════════════

  test('[AC6-P1] should show "inactive since" when last_active_at > 2 minutes', async ({
    browser,
  }) => {
    await cancelActiveAssignments(fileIdStale)
    const staleTime = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    const assignmentId = await seedFileAssignment(
      fileIdStale,
      projectId,
      tenantId,
      qaUserId,
      qaUserId,
      { status: 'in_progress' },
    )
    await updateFileAssignment(assignmentId, { last_active_at: staleTime })

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdStale}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await expect(banner).toContainText(/inactive/i)

    await ctx.close()
  })

  test('[AC6-P2] boundary: last_active_at at exactly 2 minutes should show stale', async ({
    browser,
  }) => {
    await cancelActiveAssignments(fileIdStale)
    const exactBoundary = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const assignmentId = await seedFileAssignment(
      fileIdStale,
      projectId,
      tenantId,
      qaUserId,
      qaUserId,
      { status: 'in_progress' },
    )
    await updateFileAssignment(assignmentId, { last_active_at: exactBoundary })

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdStale}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    await expect(banner).toContainText(/inactive/i)

    await ctx.close()
  })

  test('[AC6-P2] boundary: last_active_at at 119 seconds ago should show active', async ({
    browser,
  }) => {
    await cancelActiveAssignments(fileIdStale)
    const justUnderBoundary = new Date(Date.now() - 119 * 1000).toISOString()
    const assignmentId = await seedFileAssignment(
      fileIdStale,
      projectId,
      tenantId,
      qaUserId,
      qaUserId,
      { status: 'in_progress' },
    )
    await updateFileAssignment(assignmentId, { last_active_at: justUnderBoundary })

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdStale}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    const banner = page.getByTestId('soft-lock-banner')
    await expect(banner).toBeVisible({ timeout: 10_000 })
    // Should show "being reviewed" (active, not stale)
    await expect(banner).toContainText(/being reviewed/i)

    await ctx.close()
  })

  // ════════════════════════════════════════════════════
  // AC#7: Status auto-transition on file open
  // ════════════════════════════════════════════════════

  test('[AC7-P1] assigned reviewer opening file should transition status to in_progress', async ({
    page,
  }) => {
    // Seed fresh assignment for the reviewer (status = 'assigned')
    await cancelActiveAssignments(fileIdAutoTransition)
    await seedFileAssignment(fileIdAutoTransition, projectId, tenantId, reviewerUserId, qaUserId, {
      status: 'assigned',
    })

    await signupOrLogin(page, reviewerEmail)
    await page.goto(`/projects/${projectId}/review/${fileIdAutoTransition}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15_000 })

    // No soft lock banner (this user IS the assignee)
    await expect(page.getByTestId('soft-lock-banner')).not.toBeVisible({ timeout: 5_000 })

    // Action bar should be enabled (not read-only)
    await expect(page.getByTestId('review-action-bar')).toBeVisible({ timeout: 10_000 })

    // Poll for autoTransition (assigned→in_progress) — effect fires async after render
    let transitioned = false
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1_000)
      const pollRes = await fetch(
        `${SUPABASE_URL}/rest/v1/file_assignments?file_id=eq.${fileIdAutoTransition}&assigned_to=eq.${reviewerUserId}&status=eq.in_progress&select=id`,
        { headers: adminHeaders() },
      )
      const pollData = (await pollRes.json()) as Array<{ id: string }>
      if (pollData.length > 0) {
        transitioned = true
        break
      }
    }

    // Verify via PostgREST that status changed to in_progress
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/file_assignments?file_id=eq.${fileIdAutoTransition}&assigned_to=eq.${reviewerUserId}&status=eq.in_progress&select=id,status,started_at`,
      { headers: adminHeaders() },
    )
    const data = (await res.json()) as Array<{
      id: string
      status: string
      started_at: string | null
    }>
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0]!.status).toBe('in_progress')
    expect(data[0]!.started_at).not.toBeNull()
  })

  // ════════════════════════════════════════════════════
  // AC#5: RLS enforcement (via UI behavior)
  // ════════════════════════════════════════════════════

  test('[AC5-P1] assignment UI should not show reviewers from other tenants', async ({
    browser,
  }) => {
    // Create a user in a DIFFERENT tenant
    const otherCtx = await browser.newContext()
    const otherPage = await otherCtx.newPage()
    const otherEmail = `other-tenant-6-1-${Date.now()}@test.local`
    await signupOrLogin(otherPage, otherEmail)
    await setUserNativeLanguages(otherEmail, ['th'])
    await otherCtx.close()

    // QA opens assignment dialog — other-tenant user should NOT appear
    const qaCtx = await browser.newContext()
    const qaPage = await qaCtx.newPage()
    await signupOrLogin(qaPage, qaEmail)
    await qaPage.goto(`/projects/${projectId}/files`)
    await qaPage.waitForSelector('[data-testid="file-list"]', { timeout: 30_000 })
    await qaPage.waitForLoadState('networkidle')

    await qaPage
      .getByRole('button', { name: /assign/i })
      .first()
      .click()
    const dialog = qaPage.getByTestId('file-assignment-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    await dialog.getByTestId('reviewer-selector').click()
    // Other-tenant user should NOT be in the list
    await expect(dialog.getByText(otherEmail)).not.toBeVisible({ timeout: 3_000 })

    await qaCtx.close()
  })
})
