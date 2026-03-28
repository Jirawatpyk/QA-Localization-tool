/**
 * ATDD E2E — Story 5.2a: Non-Native Auto-Tag
 * AC4: NonNativeBadge visible after non-native reviewer action
 * AC5: Override History shows "(non-native)" label
 *
 * Strategy: Seed file + findings via PostgREST, set user native_languages
 * to NOT include target language (non-native), then perform review action
 * and verify badge + history label.
 */

import { test, expect } from '@playwright/test'

import { cleanupTestProject } from './helpers/pipeline-admin'
import { gotoReviewPageWithRetry, waitForReviewPageHydrated } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  createTestProject,
  setUserMetadata,
} from './helpers/supabase-admin'

// ── Seed Helpers ─────────────────────────────────────────────────────────────

/** Set user's native_languages in the users table via PostgREST. */
async function setUserNativeLanguages(email: string, nativeLanguages: string[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ native_languages: nativeLanguages }),
  })
  if (!res.ok) {
    throw new Error(`setUserNativeLanguages failed: ${res.status} ${await res.text()}`)
  }
}

/**
 * Seed 2 review_actions for a finding via PostgREST.
 * Creates: pending→accepted (non-native), accepted→rejected (non-native)
 * This makes Q7 (HAVING count > 1) return overrideCount=1 on page load,
 * and Q8 return hasNonNativeAction=true, so the override badge appears immediately.
 */
async function seedReviewActionsForFinding(opts: {
  findingId: string
  fileId: string
  projectId: string
  tenantId: string
  userId: string
}): Promise<void> {
  const now = new Date()
  const t1 = new Date(now.getTime() - 2000).toISOString()
  const t2 = new Date(now.getTime() - 1000).toISOString()

  const actions = [
    {
      finding_id: opts.findingId,
      file_id: opts.fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      action_type: 'accept',
      previous_state: 'pending',
      new_state: 'accepted',
      is_bulk: false,
      metadata: { non_native: true },
      created_at: t1,
    },
    {
      finding_id: opts.findingId,
      file_id: opts.fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      action_type: 'reject',
      previous_state: 'accepted',
      new_state: 'rejected',
      is_bulk: false,
      metadata: { non_native: true },
      created_at: t2,
    },
  ]

  const res = await fetch(`${SUPABASE_URL}/rest/v1/review_actions`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(actions),
  })
  if (!res.ok) {
    throw new Error(`seedReviewActionsForFinding failed: ${res.status} ${await res.text()}`)
  }

  // NOTE: We do NOT update the finding status to 'rejected'.
  // Reason: DEFAULT_FILTER_STATE has status='pending' — a finding with status='rejected'
  // would be hidden by default filter, causing waitForFindingsVisible to fail.
  // The override badge depends on overrideCount from Q7 (counts review_actions, not finding status).
  // 2 seeded review_actions → Q7 HAVING count > 1 → overrideCount = 1 → badge visible.
  // Finding stays 'pending' so it appears in the default filtered list immediately.
}

/** Seed file + 1 finding for Thai language. */
async function seedFileWithFinding(opts: {
  tenantId: string
  projectId: string
}): Promise<{ fileId: string; findingId: string }> {
  // Create file
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `nonnative-test-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: `e2e/nonnative-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) throw new Error(`seed file failed: ${fileRes.status} ${await fileRes.text()}`)
  const [file] = (await fileRes.json()) as Array<{ id: string }>
  const fileId = file!.id

  // Create score
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 85.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 500,
      critical_count: 0,
      major_count: 1,
      minor_count: 0,
      npt: 15.0,
    }),
  })
  if (!scoreRes.ok)
    throw new Error(`seed score failed: ${scoreRes.status} ${await scoreRes.text()}`)

  // Create segment (needed for non-native determination)
  const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      segment_number: 1,
      source_text: 'Hello world',
      target_text: 'สวัสดีชาวโลก',
      source_lang: 'en-US',
      target_lang: 'th-TH',
      word_count: 2,
    }),
  })
  if (!segRes.ok) throw new Error(`seed segment failed: ${segRes.status} ${await segRes.text()}`)
  const [segment] = (await segRes.json()) as Array<{ id: string }>

  // Create finding linked to segment
  const findingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      segment_id: segment!.id,
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslation of greeting term',
      status: 'pending',
      detected_by_layer: 'L2',
      ai_confidence: 82,
      source_text_excerpt: 'Hello world',
      target_text_excerpt: 'สวัสดีชาวโลก',
    }),
  })
  if (!findingRes.ok)
    throw new Error(`seed finding failed: ${findingRes.status} ${await findingRes.text()}`)
  const [finding] = (await findingRes.json()) as Array<{ id: string }>

  return { fileId, findingId: finding!.id }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const TEST_EMAIL = `e2e-nonnative-${Date.now()}@test.local`
let tenantId: string
let projectId: string

test.describe.configure({ mode: 'serial' })

test.describe('Non-Native Auto-Tag (Story 5.2a)', () => {
  test('[setup] signup and create project with non-native user', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    // Suppress onboarding tours
    await setUserMetadata(TEST_EMAIL, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    // Set native_languages to English only (NOT Thai → non-native for th-TH files)
    await setUserNativeLanguages(TEST_EMAIL, ['en'])

    // Create project
    projectId = await createTestProject(tenantId, `NonNative Test ${Date.now()}`)
    expect(projectId).toBeTruthy()
  })

  // ── AC4: NonNativeBadge appears after non-native reviewer accepts ──

  test('[P1][AC4] Non-native reviewer accepts finding → NonNativeBadge visible', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    // Seed
    const { fileId } = await seedFileWithFinding({ tenantId, projectId })

    // Login & navigate
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)
    await waitForReviewPageHydrated(page)

    // Click first finding to select it (compact card → expanded)
    const findingRow = page.getByTestId('finding-compact-row').first()
    await findingRow.click()

    // Wait for finding card to be visible
    await expect(page.getByTestId('finding-card')).toBeVisible({ timeout: 10_000 })

    // Accept the finding via action bar button
    const acceptButton = page.getByRole('button', { name: /accept finding/i }).first()
    await acceptButton.click()

    // After accept, finding may be filtered out — click "All" status filter to show all findings
    await page.getByRole('button', { name: /all status filter/i }).click()

    // Wait for the accepted finding to appear in the list
    const acceptedRow = page.getByTestId('finding-compact-row').first()
    await expect(acceptedRow).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 })

    // NonNativeBadge should now be visible (C1 fix: store updates hasNonNativeAction immediately)
    // Note: may need a brief wait for store → useMemo → re-render chain
    await expect(page.getByTestId('non-native-badge').first()).toBeVisible({ timeout: 15_000 })
  })

  // ── AC5: Override History shows "(non-native)" label ──

  test('[P1][AC5] Override history shows "(non-native)" label for non-native action', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    // Zone 3 static aside requires desktop viewport (>= 1440px per useIsDesktop hook)
    await page.setViewportSize({ width: 1440, height: 900 })

    // Seed fresh file + finding
    const { fileId, findingId } = await seedFileWithFinding({ tenantId, projectId })

    // Get userId for seeding review_actions with the correct user
    const userInfo = await getUserInfo(TEST_EMAIL)
    if (!userInfo) throw new Error('getUserInfo returned null for test user')

    // Seed 2 review_actions (pending→accepted, accepted→rejected) with non_native=true metadata.
    // Strategy: seed via PostgREST before page load so that:
    //   - Q7 (HAVING count > 1) returns overrideCount=1 → badge visible on mount
    //   - Q8 returns hasNonNativeAction=true
    //   - getOverrideHistory returns entries with metadata.non_native=true
    // This avoids relying on client-side increment timing after live actions.
    await seedReviewActionsForFinding({
      findingId,
      fileId,
      projectId,
      tenantId,
      userId: userInfo.id,
    })

    // Login & navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await gotoReviewPageWithRetry(page, projectId, fileId)
    await waitForReviewPageHydrated(page)

    // Finding keeps status='pending' so it appears in the default filter (status='pending').
    // waitForReviewPageHydrated already confirms finding rows are visible.
    const pendingRow = page.getByTestId('finding-compact-row').first()
    await expect(pendingRow).toHaveAttribute('data-status', 'pending', { timeout: 10_000 })

    // Override badge should be visible in compact row (Q7 seeded overrideCount=1)
    const overrideBadge = page.getByTestId('decision-override-badge').first()
    await expect(overrideBadge).toBeVisible({ timeout: 5_000 })

    // Click finding row to select it → activeFindingState set → Zone 3 detail panel populates
    await pendingRow.click()

    // Verify finding-detail-aside is visible (desktop Zone 3 static panel)
    const detailAside = page.getByTestId('finding-detail-aside')
    await expect(detailAside).toBeVisible({ timeout: 10_000 })

    // The override badge is in the compact row, not the detail aside.
    // Q7 seeded overrideCount=1 at page load → overrideCount > 0 → OverrideBadge rendered.
    const overrideBadgeBtn = page.getByTestId('decision-override-badge').first()
    await expect(overrideBadgeBtn).toBeVisible({ timeout: 10_000 })

    // Click to open OverrideHistoryPanel
    await overrideBadgeBtn.click()

    // Wait for Decision History panel to appear and entries to load
    const historyHeading = detailAside.getByRole('heading', { name: /Decision History/i })
    await expect(historyHeading).toBeVisible({ timeout: 10_000 })

    // Server action getOverrideHistory may hang in dev mode. Reload page to get fresh connection.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForReviewPageHydrated(page)

    // Re-select finding after reload
    const reloadedRow = page.getByTestId('finding-compact-row').first()
    await reloadedRow.click()
    await expect(detailAside).toBeVisible({ timeout: 10_000 })

    // Re-click history button after reload
    const reloadedHistoryButton = detailAside.getByRole('button', {
      name: /show decision history/i,
    })
    await expect(reloadedHistoryButton).toBeVisible({ timeout: 10_000 })
    await reloadedHistoryButton.click()

    // Wait for entries to load (fresh server action connection after reload)
    const firstEntry = detailAside.locator('[role="listitem"]').first()
    await expect(firstEntry).toBeVisible({ timeout: 30_000 })

    // AC5: Verify "(non-native)" label appears in at least one history entry
    await expect(page.getByText(/\(non-native\)/).first()).toBeVisible({ timeout: 5_000 })
  })

  test.afterAll(async () => {
    if (projectId && tenantId) {
      await cleanupTestProject(projectId, tenantId).catch(() => {})
    }
  })
})
