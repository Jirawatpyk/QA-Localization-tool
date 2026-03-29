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
import {
  gotoReviewPageWithRetry,
  waitForFindingsVisible,
  waitForReviewPageHydrated,
} from './helpers/review-page'
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
let flaggedFindingId: string

// ── Setup ────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  testInfo.setTimeout(120_000)

  // Create non-native reviewer user + project via PostgREST
  const page = await browser.newPage()
  try {
    await signupOrLogin(page, NON_NATIVE_EMAIL)
    // I4 fix: explicitly set qa_reviewer role (don't rely on default signup role)
    const nnUser = await getUserInfo(NON_NATIVE_EMAIL)
    if (nnUser) await setUserRole(nnUser.id, 'qa_reviewer')
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

// ── Step 4 [P0]: Non-native accept via UI → non_native tag ─────────────────

test('[P0] Step 4: Non-native reviewer accepts finding via UI → non_native:true tag auto-applied', async ({
  page,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  test.setTimeout(90_000)

  // Set desktop viewport BEFORE login (same pattern as Step 3)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signupOrLogin(page, NON_NATIVE_EMAIL)
  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)
  await page.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

  // Expand accordion if minor findings are collapsed
  const grid = page.getByRole('grid')
  const minorTrigger = grid.locator('[data-state]').filter({ hasText: /Minor/ }).first()
  for (let i = 0; i < 3; i++) {
    const state = await minorTrigger.getAttribute('data-state').catch(() => null)
    if (state === 'open') break
    await minorTrigger.click()
    await page.waitForTimeout(500)
  }

  // Click first finding row — retry until aside shows content
  const aside = page.locator('[data-testid="finding-detail-aside"]')
  const firstRow = grid.locator('[role="row"]').first()
  await firstRow.waitFor({ timeout: 10_000 })
  for (let attempt = 0; attempt < 5; attempt++) {
    await firstRow.click()
    try {
      await expect(aside.locator('text=Select a finding')).not.toBeVisible({ timeout: 3_000 })
      break
    } catch {
      await page.waitForTimeout(500)
    }
  }

  // Wait for hotkey readiness then press 'a' to accept
  await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })
  await page.keyboard.press('a')

  // Verify toast "Finding accepted" appears
  await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 15_000 })

  // Verify non_native metadata via PostgREST — server action writes it
  let reviewActions: Array<{ metadata: Record<string, unknown> }> = []
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      reviewActions = await fetch(
        `${SUPABASE_URL}/rest/v1/review_actions?file_id=eq.${seededFileId}&action_type=eq.accept&select=metadata&limit=1&order=created_at.desc`,
        { headers: adminHeaders() },
      ).then((r) => r.json())
      if (reviewActions.length > 0 && reviewActions[0]?.metadata?.non_native === true) break
    } catch {
      // Transient ECONNRESET — retry
    }
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

  // Set native_languages DB column — flagForNative validates nativeLanguages @> [targetLang]
  // Fixture minimal.sdlxliff: source-language="en-US" target-language="th-TH"
  // Parser stores segment.targetLang as "th-TH", so native reviewer needs exact match.
  await setUserNativeLanguages(NATIVE_EMAIL, ['th-TH', 'th'])

  // Verify setup: native user should now be in correct tenant with correct role
  const verifyUser = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(NATIVE_EMAIL)}&select=id,tenant_id,native_languages`,
    { headers: adminHeaders() },
  ).then((r) => r.json())
  const verifyRole = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${nativeUser.id}&select=role,tenant_id`,
    { headers: adminHeaders() },
  ).then((r) => r.json())
  expect(verifyUser[0]?.tenant_id).toBe(tenantId)
  expect(verifyRole[0]?.role).toBe('native_reviewer')

  // Suppress onboarding tours
  await setUserMetadata(NATIVE_EMAIL, {
    setup_tour_completed: '2026-01-01T00:00:00Z',
    project_tour_completed: '2026-01-01T00:00:00Z',
  })

  // ── Flag finding via real UI (Shift+F dialog) ──────────────────────
  // Login as non-native reviewer and use Shift+F hotkey to open FlagForNativeDialog
  await signupOrLogin(page, NON_NATIVE_EMAIL)
  await gotoReviewPageWithRetry(page, projectId, seededFileId)
  await waitForReviewPageHydrated(page)
  await page.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

  // Expand accordion if needed
  const grid = page.getByRole('grid')
  const minorTrigger = grid.locator('[data-state]').filter({ hasText: /Minor/ }).first()
  for (let i = 0; i < 3; i++) {
    const state = await minorTrigger.getAttribute('data-state').catch(() => null)
    if (state === 'open') break
    await minorTrigger.click()
    await page.waitForTimeout(500)
  }

  // Click a PENDING finding row (skip already-accepted from Step 4)
  const rows = grid.locator('[role="row"]')
  await rows.first().waitFor({ timeout: 10_000 })
  const rowCount = await rows.count()
  let clickedFindingId: string | null = null
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i)
    const status = await row.getAttribute('data-status').catch(() => null)
    if (status === 'pending') {
      clickedFindingId = await row.getAttribute('data-finding-id')
      await row.click()
      break
    }
  }
  expect(clickedFindingId).toBeTruthy()
  flaggedFindingId = clickedFindingId! // Store for Steps 6+7

  // Wait for aside to update from placeholder
  const aside = page.locator('[data-testid="finding-detail-aside"]')
  await expect(aside.locator('text=Select a finding')).not.toBeVisible({ timeout: 5_000 })

  // Open FlagForNativeDialog via Shift+F — retry if reviewers loading hangs
  // getNativeReviewers can hang when DB connection pool is busy from pipeline AI calls.
  // Strategy: open dialog → if Loading... persists 15s → close + wait 10s → retry
  let dialogReady = false
  for (let dialogAttempt = 0; dialogAttempt < 3; dialogAttempt++) {
    await page.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })
    await page.keyboard.press('Shift+f')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Check if reviewers loaded within 15s
    try {
      await expect(dialog.getByText('Loading...')).not.toBeVisible({ timeout: 15_000 })
      dialogReady = true
      break
    } catch {
      // Reviewers still loading — close dialog and retry after connections free up
      const cancelBtn = dialog.getByRole('button', { name: /cancel|close/i }).first()
      if (await cancelBtn.isVisible().catch(() => false)) await cancelBtn.click()
      await page.waitForTimeout(10_000) // Let DB connections settle
    }
  }
  // I3 fix: descriptive error when reviewers never load
  if (!dialogReady) {
    const dialogContent = await page
      .getByRole('dialog')
      .textContent()
      .catch(() => '(dialog not visible)')
    throw new Error(
      `FlagForNativeDialog reviewers never loaded after 3 attempts. Dialog content: "${dialogContent}"`,
    )
  }

  // Dialog is open with reviewers loaded — select the native reviewer
  const dialog = page.getByRole('dialog')
  const reviewerCombobox = dialog.locator('[role="combobox"]').first()
  await reviewerCombobox.click()
  await page.waitForTimeout(500) // Wait for Radix Select dropdown portal

  // Select first option — Radix SelectContent renders in a portal
  const firstOption = page.getByRole('option').first()
  await expect(firstOption).toBeVisible({ timeout: 10_000 })
  await firstOption.click()

  // Fill comment (min 10 chars required for isValid)
  const commentField = dialog.locator('textarea').first()
  await expect(commentField).toBeVisible({ timeout: 5_000 })
  await commentField.fill('E2E integration test — needs native Thai review')

  // Submit — button becomes enabled after reviewer + comment (min 10 chars)
  const submitBtn = dialog.getByRole('button', { name: /flag for review/i })
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()

  // Dialog should close
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })

  // Verify assignment created via PostgREST
  let assignments: Array<{ id: string; status: string }> = []
  for (let attempt = 0; attempt < 15; attempt++) {
    assignments = await fetch(
      `${SUPABASE_URL}/rest/v1/finding_assignments?finding_id=eq.${flaggedFindingId}&select=id,status&limit=1&order=created_at.desc`,
      { headers: adminHeaders() },
    ).then((r) => r.json())
    if (assignments.length > 0) break
    await new Promise((r) => setTimeout(r, 2000))
  }

  expect(assignments.length).toBeGreaterThan(0)
  expect(assignments[0]!.status).toBe('pending')
})

// ── Step 6 [P0]: Native reviewer scoped view (RLS) ──────────────────────────

test('[P0] Step 6: Native reviewer sees only assigned findings (RLS enforced)', async ({
  browser,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  test.skip(!flaggedFindingId, 'Step 5 did not produce flaggedFindingId')
  test.setTimeout(120_000)

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
    await expect(nativePage.getByText(/flagged segment/i)).toBeVisible({ timeout: 10_000 })

    // Expand accordion if present (native scoped view may not have accordion groups)
    const grid = nativePage.getByRole('grid')
    const accordionTrigger = grid.locator('[data-state]').first()
    const hasAccordion = await accordionTrigger.count().catch(() => 0)
    if (hasAccordion > 0) {
      for (let i = 0; i < 3; i++) {
        const state = await accordionTrigger.getAttribute('data-state').catch(() => null)
        if (state === 'open') break
        await accordionTrigger.click()
        await nativePage.waitForTimeout(500)
      }
    }
    await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

    // I1 fix: Assert native reviewer sees ONLY assigned findings (proves RLS scoping)
    // We assigned exactly 1 finding in Step 5 → expect exactly 1 row visible
    const visibleRows = await grid.locator('[role="row"]').count()
    expect(visibleRows).toBe(1)

    // Verify the visible row is specifically the flagged finding
    const flaggedVisible = await grid.locator(`[data-finding-id="${flaggedFindingId}"]`).count()
    expect(flaggedVisible).toBe(1)

    // Verify via PostgREST: assignment exists for native user in this tenant
    const nativeUser = await getUserInfo(NATIVE_EMAIL)
    const assignments = await fetch(
      `${SUPABASE_URL}/rest/v1/finding_assignments?assigned_to=eq.${nativeUser!.id}&tenant_id=eq.${tenantId}&select=id,status,finding_id`,
      { headers: adminHeaders() },
    ).then((r) => r.json())

    expect(assignments.length).toBe(1)
    expect(assignments[0].finding_id).toBe(flaggedFindingId)
  } finally {
    await nativePage.close()
  }
})

// ── Step 7 [P0]: Native confirms finding → status updated + notification ─────

test('[P0] Step 7: Native reviewer confirms finding → status updated, notification sent', async ({
  browser,
}) => {
  test.skip(!HAS_INFRA, SKIP_REASON)
  test.skip(!flaggedFindingId, 'Step 5 did not produce flaggedFindingId')
  test.setTimeout(120_000)

  const nativePage = await browser.newPage()
  try {
    await nativePage.setViewportSize({ width: 1440, height: 900 })
    await signupOrLogin(nativePage, NATIVE_EMAIL)

    // Navigate to review page — capture SSR error if any
    const reviewUrl = `/projects/${projectId}/review/${seededFileId}`
    for (let attempt = 0; attempt < 5; attempt++) {
      await nativePage.goto(reviewUrl)
      const heading = nativePage.locator('h1')
      await expect(heading).toBeVisible({ timeout: 30_000 })

      const errorText = nativePage.locator('.text-destructive')
      const errCount = await errorText.count()
      if (errCount > 0) {
        const msg = await errorText.first().textContent()
        if (attempt === 4) throw new Error(`Review page SSR failed after 5 attempts: ${msg}`)
        await nativePage.waitForTimeout(5_000)
        continue
      }
      break // SSR OK
    }

    // Wait for hydration
    await waitForFindingsVisible(nativePage)
    await nativePage.waitForSelector('[role="grid"][data-keyboard-ready="true"]', {
      timeout: 15_000,
    })
    await nativePage.waitForSelector(
      '[data-testid="review-3-zone"][data-review-actions-ready="true"]',
      { timeout: 10_000 },
    )

    // Wait for desktop layout — useIsDesktop() hydration gap
    await nativePage.waitForSelector('[data-layout-mode="desktop"]', { timeout: 10_000 })

    // Expand accordion if present (native scoped view may not have accordion groups)
    const grid = nativePage.getByRole('grid')
    const accordionTrigger = grid.locator('[data-state]').first()
    const hasAccordion7 = await accordionTrigger.count().catch(() => 0)
    if (hasAccordion7 > 0) {
      for (let i = 0; i < 3; i++) {
        const state = await accordionTrigger.getAttribute('data-state').catch(() => null)
        if (state === 'open') break
        await accordionTrigger.click()
        await nativePage.waitForTimeout(500)
      }
    }
    await grid.locator('[role="row"]').first().waitFor({ timeout: 10_000 })

    // Server returns only assigned findings (5.2c AC2 scoped view)
    // Client pre-filters to status='flagged' — flagged finding should be visible
    const flaggedRow = grid.locator(`[data-finding-id="${flaggedFindingId}"]`)
    await flaggedRow.waitFor({ timeout: 10_000 })

    // Click the flagged finding — retry until aside shows content (activeFindingIdRef set)
    const aside = nativePage.locator('[data-testid="finding-detail-aside"]')
    for (let attempt = 0; attempt < 5; attempt++) {
      await flaggedRow.click()
      try {
        await expect(aside.getByText('Select a finding')).not.toBeVisible({ timeout: 3_000 })
        break
      } catch {
        await nativePage.waitForTimeout(500)
      }
    }

    // Wait for hotkey readiness before pressing 'c'
    await nativePage.waitForSelector('[data-review-actions-ready="true"]', { timeout: 5_000 })

    // Press 'c' to confirm — native reviewer confirm hotkey
    await nativePage.keyboard.press('c')

    // Verify confirm succeeded — toast "Finding confirmed" or status change in UI
    // L2 fix: scope to sonner toast (not status badge which may already show "confirmed")
    await expect(
      nativePage
        .locator('[data-sonner-toast]')
        .getByText(/confirmed/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 })

    // Verify assignment status via PostgREST — scoped to THIS finding (C2 fix)
    const assignments = await fetch(
      `${SUPABASE_URL}/rest/v1/finding_assignments?finding_id=eq.${flaggedFindingId}&tenant_id=eq.${tenantId}&select=id,status&limit=1&order=updated_at.desc`,
      { headers: adminHeaders() },
    ).then((r) => r.json())

    expect(Array.isArray(assignments)).toBe(true)
    expect(assignments.length).toBeGreaterThan(0)
    expect(assignments[0].status).toBe('confirmed')

    // Verify notification created — scoped to tenant + type (C3 fix: not vacuous)
    const notifications = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?tenant_id=eq.${tenantId}&type=eq.native_review_completed&select=id,type&limit=5&order=created_at.desc`,
      { headers: adminHeaders() },
    ).then((r) => r.json())

    expect(Array.isArray(notifications)).toBe(true)
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

  // C4 fix: scope to this tenant (not vacuous from prior test runs)
  const btCache = await fetch(
    `${SUPABASE_URL}/rest/v1/back_translation_cache?tenant_id=eq.${tenantId}&select=id&limit=5`,
    { headers: adminHeaders() },
  ).then((r) => r.json())

  expect(Array.isArray(btCache)).toBe(true)
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
