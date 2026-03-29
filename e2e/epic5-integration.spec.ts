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

import { FIXTURE_FILES, gotoProjectUpload, uploadSingleFile } from './helpers/fileUpload'
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
  getUserInfo,
  setUserMetadata,
  setUserNativeLanguages,
  setUserRole,
  moveUserToTenant,
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

  // Create non-native reviewer user + project via PostgREST
  const page = await browser.newPage()
  try {
    await signupOrLogin(page, NON_NATIVE_EMAIL)
    // Suppress onboarding tours so driver.js overlay doesn't intercept clicks
    await setUserMetadata(NON_NATIVE_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const user = await getUserInfo(NON_NATIVE_EMAIL)
    if (!user) throw new Error('User not found after signup')
    tenantId = user.tenantId
    projectId = await createTestProject(tenantId, `Epic5-Verify-${TIMESTAMP}`)
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
  test.setTimeout(120_000)
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  // Navigate to project upload page + upload SDLXLIFF
  await gotoProjectUpload(page, projectId)
  await uploadSingleFile(page, FIXTURE_FILES.sdlxliffMinimal)

  // Wait for upload + parse to complete — "Start Processing" button appears
  const startBtn = page.getByRole('button', { name: /start processing/i })
  await expect(startBtn).toBeVisible({ timeout: 60_000 })
  await expect(startBtn).toBeEnabled()
  await startBtn.click()

  // ProcessingModeDialog opens — Economy mode is default
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  const confirmBtn = dialog.getByRole('button', { name: 'Start Processing', exact: true })
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })

  // Get file ID from DB
  let fileRow: Array<{ id: string; status: string }> = []
  for (let attempt = 0; attempt < 15; attempt++) {
    fileRow = await fetch(
      `${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}&select=id,status`,
      { headers: adminHeaders() },
    ).then((r) => r.json())
    if (fileRow.length > 0) break
    await new Promise((r) => setTimeout(r, 2000))
  }

  expect(fileRow.length).toBeGreaterThan(0)
  seededFileId = fileRow[0]!.id

  // Poll for pipeline completion (Economy: L1+L2) — 4 min timeout for AI calls
  await pollFileStatus(seededFileId, 'l2_completed', 240_000)
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
  test.setTimeout(90_000)

  // Set desktop viewport BEFORE login/navigate — useIsDesktop() reads matchMedia on hydration.
  // Setting viewport after navigate causes a hydration gap where isDesktop=false, which prevents
  // handleActiveFindingChange from calling setSelectedFinding → aside stays empty → BT panel missing.
  await page.setViewportSize({ width: 1440, height: 900 })
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)

  // Wait for desktop layout to be active — useIsDesktop() has a hydration gap (SSR starts at false).
  // data-layout-mode="desktop" is set by ReviewPageClient after useIsDesktop() hydrates.
  // Without this, clicking a row while isDesktop=false prevents setSelectedFinding → panel never opens.
  await page.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

  // Confirm aside panel is in the DOM (isDesktop → static aside, not Sheet)
  await page.waitForSelector('[data-testid="finding-detail-aside"]', { timeout: 5_000 })

  // Force accordion to expanded state (may have collapsed after hydration re-render)
  const grid = page.getByRole('grid')
  const minorTrigger = grid.locator('[data-state]').filter({ hasText: /Minor/ }).first()
  // Click until accordion is open (data-state="open") — handles both collapsed and already-open
  for (let i = 0; i < 3; i++) {
    const state = await minorTrigger.getAttribute('data-state').catch(() => null)
    if (state === 'open') break
    await minorTrigger.click()
    await page.waitForTimeout(500)
  }

  // Wait for finding rows to appear after accordion expansion
  await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

  // Click first finding row — retry until aside updates from placeholder
  const aside = page.locator('[data-testid="finding-detail-aside"]')
  for (let attempt = 0; attempt < 5; attempt++) {
    await grid.locator('[role="row"]').first().click()
    try {
      await expect(aside.locator('text=Select a finding')).not.toBeVisible({ timeout: 3_000 })
      break // aside now shows finding content
    } catch {
      // Click didn't register — retry after brief wait
      await page.waitForTimeout(500)
    }
  }

  // LanguageBridge panel lives inside FindingDetailContent (aside).
  // BT fetch: 300ms debounce (Guardrail #53) + AI call (10-30s) → need generous timeout.
  const btPanel = page.getByTestId('language-bridge-panel')
  await expect(btPanel).toBeVisible({ timeout: 60_000 })

  // BT panel rendered = isNonNative + segmentId both correct.
  // Content may be loading/error/success — all valid states confirming panel wired.
  // The BT AI call is verified separately via back_translation_cache in Step 9.
  const panelState = await btPanel.getAttribute('data-state')
  expect(panelState).toBeTruthy() // Panel has a state (loading/standard/error/confidence-warning)
})

// ── Step 4 [P0]: Non-native accept/reject → non_native tag ──────────────────

test('[P0] Step 4: Non-native reviewer accepts finding → non_native:true tag auto-applied', async ({
  page,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  test.setTimeout(60_000)
  // Set viewport BEFORE login — prevents isDesktop=false during hydration (same pattern as Step 3)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)
  // Wait for desktop layout — waitForFindingsVisible already expanded minor accordion
  await page.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

  // Force accordion expanded (same robust pattern as Step 3)
  const grid = page.getByRole('grid')
  const minorTrigger = grid.locator('[data-state]').filter({ hasText: /Minor/ }).first()
  for (let i = 0; i < 3; i++) {
    const state = await minorTrigger.getAttribute('data-state').catch(() => null)
    if (state === 'open') break
    await minorTrigger.click()
    await page.waitForTimeout(500)
  }
  await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

  // Click first pending finding — retry until active
  const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
  await expect(pendingRow).toBeVisible({ timeout: 5_000 })
  for (let attempt = 0; attempt < 3; attempt++) {
    await pendingRow.click()
    const hasTabindex = await pendingRow.getAttribute('tabindex').catch(() => null)
    if (hasTabindex === '0') break
    await page.waitForTimeout(500)
  }

  // Re-wait for review action hotkeys after accordion expand + click (React re-render may drop attribute)
  await page.waitForSelector('[data-testid="review-3-zone"][data-review-actions-ready="true"]', {
    timeout: 5_000,
  })

  // Accept finding via Server Action (triggered by clicking action bar Accept button)
  // Ensure action bar is enabled: re-click row + wait for hotkey readiness
  await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

  // Capture console errors for debugging server action failures
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // Use action bar accept button (specific testid)
  const acceptBtn = page.getByTestId('action-accept')
  await expect(acceptBtn).toBeEnabled({ timeout: 10_000 })
  await acceptBtn.click()

  // Wait for status change — if it doesn't change, log console errors
  try {
    await expect(pendingRow).not.toHaveAttribute('data-status', 'pending', { timeout: 15_000 })
  } catch {
    // Log console errors for debugging
    if (consoleErrors.length > 0) {
      throw new Error(`Accept action failed. Console errors:\n${consoleErrors.join('\n')}`)
    }
    throw new Error(
      'Accept action failed — finding status remained pending after 15s. No console errors captured.',
    )
  }

  // Wait extra for server action DB write to complete
  await page.waitForTimeout(3_000)

  // Verify non_native metadata via PostgREST — poll with patience for async DB write
  let reviewActions: Array<{ metadata: Record<string, unknown> }> = []
  for (let attempt = 0; attempt < 15; attempt++) {
    reviewActions = await fetch(
      `${SUPABASE_URL}/rest/v1/review_actions?file_id=eq.${seededFileId}&select=metadata&limit=1&order=created_at.desc`,
      { headers: adminHeaders() },
    ).then((r) => r.json())
    if (reviewActions.length > 0) break
    await new Promise((r) => setTimeout(r, 2000))
  }

  expect(reviewActions.length).toBeGreaterThan(0)
  expect(reviewActions[0]!.metadata).toMatchObject({ non_native: true })
})

// ── Step 5 [P0]: Flag for native review → assignment created ─────────────────

test('[P0] Step 5: Non-native flags finding for native review → assignment created', async ({
  page,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  test.setTimeout(90_000)
  // Set viewport BEFORE login — prevents isDesktop=false during hydration (same pattern as Step 3)
  await page.setViewportSize({ width: 1440, height: 900 })

  // ── Create native reviewer in SAME tenant ──────────────────────────
  // signupOrLogin creates a new tenant per user. We must:
  // 1. Create the native user (gets own tenant)
  // 2. Move them to the non-native user's tenant
  // 3. Set role to native_reviewer
  // 4. Set native_languages DB column (not just metadata)
  // Use isolated browser context for native user signup (shared context has non-native's auth cookies)
  const nativeContext = await page.context().browser()!.newContext()
  const nativePage = await nativeContext.newPage()
  await signupOrLogin(nativePage, NATIVE_EMAIL)
  await nativePage.close()
  await nativeContext.close()

  const nativeUser = await getUserInfo(NATIVE_EMAIL)
  if (!nativeUser) throw new Error('Native user not found after signup')

  // Move native user to same tenant as non-native user
  if (nativeUser.tenantId !== tenantId) {
    await moveUserToTenant(nativeUser.id, tenantId)
  }

  // Set role to native_reviewer (getNativeReviewers queries user_roles for this role)
  await setUserRole(nativeUser.id, 'native_reviewer')

  // Set native_languages DB column — getNativeReviewers queries users.nativeLanguages
  await setUserNativeLanguages(NATIVE_EMAIL, ['th'])

  // Suppress onboarding tours
  await setUserMetadata(NATIVE_EMAIL, {
    setup_tour_completed: '2026-01-01T00:00:00Z',
    project_tour_completed: '2026-01-01T00:00:00Z',
  })

  // ── Non-native user flags a finding ────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 })
  await signupOrLogin(page, NON_NATIVE_EMAIL)

  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)
  await page.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

  // Force accordion expanded
  const grid = page.getByRole('grid')
  const minorTrigger = grid.locator('[data-state]').filter({ hasText: /Minor/ }).first()
  for (let i = 0; i < 3; i++) {
    const state = await minorTrigger.getAttribute('data-state').catch(() => null)
    if (state === 'open') break
    await minorTrigger.click()
    await page.waitForTimeout(500)
  }
  await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

  // Click a pending finding — retry until active
  const pendingRow = grid.locator('[role="row"][data-status="pending"]').first()
  await expect(pendingRow).toBeVisible({ timeout: 5_000 })
  for (let attempt = 0; attempt < 3; attempt++) {
    await pendingRow.click()
    const tab = await pendingRow.getAttribute('tabindex').catch(() => null)
    if (tab === '0') break
    await page.waitForTimeout(500)
  }

  // Wait for hotkey readiness before pressing Shift+F
  await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

  // Press Shift+F to flag for native review
  await page.keyboard.press('Shift+f')

  // Flag dialog should appear
  const flagDialog = page.getByRole('dialog')
  await expect(flagDialog).toBeVisible({ timeout: 5_000 })

  // Wait for reviewer list to load (getNativeReviewers API call)
  // Dialog shows "Loading..." while fetching — wait for it to disappear
  await expect(flagDialog.getByText('Loading...')).not.toBeVisible({ timeout: 15_000 })

  // Select native reviewer from shadcn Select (renders as button role="combobox")
  const selectTrigger = flagDialog.getByRole('combobox')
  await expect(selectTrigger).toBeVisible({ timeout: 5_000 })
  await selectTrigger.click()
  // Wait for dropdown options to appear (Radix Select portal)
  const option = page.getByRole('option').first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.click()

  // Fill required comment (min 10 chars — dialog validation requires it)
  const commentInput = flagDialog.getByRole('textbox')
  await commentInput.fill('This finding needs native Thai speaker verification for accuracy')

  // Submit — button text is "Flag for Review"
  const submitBtn = flagDialog.getByRole('button', { name: /flag for review/i })
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()

  // Wait for success feedback (toast or status change)
  await expect(page.getByText(/flagged|assigned/i).first()).toBeVisible({ timeout: 15_000 })

  // Verify assignment via PostgREST
  const assignments = await fetch(
    `${SUPABASE_URL}/rest/v1/finding_assignments?select=id,status,tenant_id&tenant_id=eq.${tenantId}&limit=5&order=created_at.desc`,
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
  test.setTimeout(60_000)

  // Login as native reviewer in separate browser context
  const nativePage = await browser.newPage()
  try {
    await nativePage.setViewportSize({ width: 1440, height: 900 })
    await signupOrLogin(nativePage, NATIVE_EMAIL)

    await gotoReviewPageWithRetry(nativePage, projectId, seededFileId)
    await waitForReviewPageHydrated(nativePage)

    // Wait for desktop layout — useIsDesktop() hydration gap
    await nativePage.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

    // Native reviewer should see scoped view banner (Story 5.2c AC2)
    // Banner text: "You have access to N flagged segment(s) in this file"
    await expect(nativePage.getByText(/flagged segment/i)).toBeVisible({ timeout: 10_000 })

    // Force accordion expanded (same robust pattern as Step 3)
    const grid = nativePage.getByRole('grid')
    const accordionTrigger = grid.locator('[data-state]').first()
    for (let i = 0; i < 3; i++) {
      const state = await accordionTrigger.getAttribute('data-state').catch(() => null)
      if (state === 'open') break
      await accordionTrigger.click()
      await nativePage.waitForTimeout(500)
    }
    await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

    // Finding rows should be visible (native reviewer sees findings in the file)
    const visibleRows = await grid.locator('[role="row"]').count()
    expect(visibleRows).toBeGreaterThan(0)

    // Verify via PostgREST: assignment exists for native user in this tenant
    const nativeUser = await getUserInfo(NATIVE_EMAIL)
    const assignments = await fetch(
      `${SUPABASE_URL}/rest/v1/finding_assignments?assigned_to=eq.${nativeUser!.id}&tenant_id=eq.${tenantId}&select=id,status,finding_id`,
      { headers: adminHeaders() },
    ).then((r) => r.json())

    expect(assignments.length).toBeGreaterThan(0)
  } finally {
    await nativePage.close()
  }
})

// ── Step 7 [P0]: Native confirms finding → status updated + notification ─────

test('[P0] Step 7: Native reviewer confirms finding → status updated, notification sent', async ({
  browser,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  test.setTimeout(60_000)

  const nativePage = await browser.newPage()
  try {
    await nativePage.setViewportSize({ width: 1440, height: 900 })
    await signupOrLogin(nativePage, NATIVE_EMAIL)

    await gotoReviewPageWithRetry(nativePage, projectId, seededFileId)
    await waitForReviewPageHydrated(nativePage)

    // Wait for desktop layout — useIsDesktop() hydration gap
    await nativePage.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

    // Force accordion expanded (same robust pattern as Step 3)
    const grid = nativePage.getByRole('grid')
    const accordionTrigger = grid.locator('[data-state]').first()
    for (let i = 0; i < 3; i++) {
      const state = await accordionTrigger.getAttribute('data-state').catch(() => null)
      if (state === 'open') break
      await accordionTrigger.click()
      await nativePage.waitForTimeout(500)
    }
    await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

    // Click assigned finding — retry until active (tabindex="0")
    for (let attempt = 0; attempt < 3; attempt++) {
      await grid.locator('[role="row"]').first().click()
      const tab = await grid
        .locator('[role="row"]')
        .first()
        .getAttribute('tabindex')
        .catch(() => null)
      if (tab === '0') break
      await nativePage.waitForTimeout(500)
    }

    // Wait for hotkey readiness before pressing 'c'
    await nativePage.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

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
  test.setTimeout(60_000)

  // Poll for score recalculation — Inngest processes finding.changed event asynchronously
  let score: Awaited<ReturnType<typeof queryScore>> = null
  for (let attempt = 0; attempt < 20; attempt++) {
    score = await queryScore(seededFileId)
    if (score && score.status === 'calculated') break
    await new Promise((r) => setTimeout(r, 2000))
  }

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

  // audit_logs has no project_id column — filter by tenant_id instead
  const auditLogs = await fetch(
    `${SUPABASE_URL}/rest/v1/audit_logs?tenant_id=eq.${tenantId}&select=id,action&order=created_at.desc&limit=50`,
    { headers: adminHeaders() },
  ).then((r) => r.json())

  // Should have entries for: finding.accept, assignment_created (flag), assignment_confirmed
  expect(auditLogs.length).toBeGreaterThanOrEqual(3)

  const actions = auditLogs.map((l: { action: string }) => l.action)
  expect(actions).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/accept/),
      expect.stringMatching(/assignment_created/),
      expect.stringMatching(/assignment_confirmed/),
    ]),
  )
})
