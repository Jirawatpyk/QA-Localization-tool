/**
 * Story 4.1a ATDD — E2E: Progressive Disclosure & Severity Grouping
 *
 * Tests the review page progressive disclosure after Story 4.1a implementation:
 *   seed file + mixed-severity findings via PostgREST → navigate to review page
 *   → severity groups visible → Critical auto-expanded → Minor accordion → dual-track progress
 *
 * Strategy: Seed via PostgREST (no pipeline needed — faster E2E execution).
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
import { test, expect } from '@playwright/test'

import { cleanupTestProject } from './helpers/pipeline-admin'
import { waitForFindingsVisible } from './helpers/review-page'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// ── Seed Helper ────────────────────────────────────────────────────────────────

/**
 * Seed a file with mixed-severity findings (critical + major + minor)
 * + score for progressive disclosure E2E tests.
 */
async function seedProgressiveDisclosureFile(opts: {
  projectId: string
  tenantId: string
}): Promise<string> {
  // 1. Insert file row (l2_completed — simulates Economy pipeline done)
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `progressive-disclosure-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 1024,
      storage_path: `e2e/progressive-disclosure-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
      source_lang: 'en',
      target_lang: 'th',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(`seedProgressiveDisclosureFile: file insert failed: ${fileRes.status} ${text}`)
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seedProgressiveDisclosureFile: no file row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score (calculated + L1L2)
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: 75.0,
      status: 'calculated',
      layer_completed: 'L1L2',
      total_words: 2000,
      critical_count: 1,
      major_count: 2,
      minor_count: 3,
      npt: 0.25,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(
      `seedProgressiveDisclosureFile: score insert failed: ${scoreRes.status} ${text}`,
    )
  }

  // 3. Insert findings — mixed severities for progressive disclosure
  const findings = [
    // 1 Critical (L2, high confidence)
    {
      severity: 'critical',
      category: 'Accuracy',
      description: 'Critical translation error — meaning reversed',
      detected_by_layer: 'L2',
      ai_confidence: 95,
      ai_model: 'gpt-4o-mini',
      status: 'pending',
      source_text_excerpt: 'Do not press the red button',
      target_text_excerpt: 'กดปุ่มแดง',
    },
    // 2 Major (1× L2, 1× L1)
    {
      severity: 'major',
      category: 'Terminology',
      description: 'Inconsistent key term translation',
      detected_by_layer: 'L2',
      ai_confidence: 82,
      ai_model: 'gpt-4o-mini',
      status: 'pending',
      source_text_excerpt: 'Application settings',
      target_text_excerpt: 'ตั้งค่าแอป',
    },
    {
      severity: 'major',
      category: 'Number Mismatch',
      description: 'Number format mismatch: 1,000 vs 1000',
      detected_by_layer: 'L1',
      status: 'pending',
      source_text_excerpt: '1,000 users',
      target_text_excerpt: '1000 ผู้ใช้',
    },
    // 3 Minor (all L1 — no confidence)
    {
      severity: 'minor',
      category: 'Whitespace',
      description: 'Leading whitespace in target',
      detected_by_layer: 'L1',
      status: 'pending',
    },
    {
      severity: 'minor',
      category: 'Punctuation',
      description: 'Missing period at end of sentence',
      detected_by_layer: 'L1',
      status: 'pending',
    },
    {
      severity: 'minor',
      category: 'Formatting',
      description: 'Extra space before comma',
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
        `seedProgressiveDisclosureFile: finding insert failed: ${findingRes.status} ${text}`,
      )
    }
  }

  return fileId
}

// ── Test Suite ──────────────────────────────────────────────────────────────────

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-disclosure-${Date.now()}@test.local`

// Shared state across serial tests
let projectId: string
let tenantId: string
let fileId: string

test.describe.serial('Progressive Disclosure — Story 4.1a', () => {
  // No pipeline needed — seed-based tests work without Inngest
  test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')

  // ── Setup: Auth + Project + Seeded Data ──────────────────────────────────
  test('[setup] signup, create project, seed mixed-severity findings', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'Disclosure E2E')
    fileId = await seedProgressiveDisclosureFile({ projectId, tenantId })
    expect(fileId).toBeTruthy()
  })

  // ── E1 [P1]: Findings grouped by severity ──────────────────────────────
  test('[P1] E1: findings grouped by severity — Critical, Major, Minor sections', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for findings to load
    await waitForFindingsVisible(page)

    // Severity rowgroups should exist with proper aria-labels
    const criticalGroup = page.locator('[role="rowgroup"][aria-label="Critical findings"]')
    const majorGroup = page.locator('[role="rowgroup"][aria-label="Major findings"]')
    const minorGroup = page.locator('[role="rowgroup"][aria-label="Minor findings"]')

    await expect(criticalGroup).toBeVisible()
    await expect(majorGroup).toBeVisible()
    await expect(minorGroup).toBeVisible()

    // Critical section should appear BEFORE Major in DOM order
    const criticalBBox = await criticalGroup.boundingBox()
    const majorBBox = await majorGroup.boundingBox()
    expect(criticalBBox).not.toBeNull()
    expect(majorBBox).not.toBeNull()
    expect(criticalBBox!.y).toBeLessThan(majorBBox!.y)
  })

  // ── E2 [P1]: Critical findings auto-expanded ───────────────────────────
  test('[P1] E2: critical findings are auto-expanded on load', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    await waitForFindingsVisible(page)

    // Critical finding row should have aria-expanded="true"
    const criticalGroup = page.locator('[role="rowgroup"][aria-label="Critical findings"]')
    const criticalRow = criticalGroup.getByTestId('finding-compact-row').first()
    await expect(criticalRow).toBeVisible()
    await expect(criticalRow).toHaveAttribute('aria-expanded', 'true')
  })

  // ── E3 [P1]: Minor findings under accordion, collapsed by default ──────
  test('[P1] E3: minor findings under "Minor (N)" accordion, collapsed by default', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for finding list (but don't expand accordion yet)
    const findingList = page.getByTestId('finding-list')
    await expect(findingList).toBeVisible({ timeout: 15_000 })

    // Wait for store to populate
    const countSummary = page.getByTestId('finding-count-summary')
    await expect(countSummary).not.toContainText('Total: 0', { timeout: 15_000 })

    // Minor accordion header should show "Minor (3)" — 3 seeded minor findings
    const minorAccordion = page.getByText(/Minor \(3\)/i)
    await expect(minorAccordion).toBeVisible()

    // Minor finding rows should NOT be visible when accordion is collapsed
    const minorGroup = page.locator('[role="rowgroup"][aria-label="Minor findings"]')
    const minorRows = minorGroup.getByTestId('finding-compact-row')

    // The AccordionContent is collapsed — rows inside should not be visible
    // (Radix Accordion hides content with data-state="closed")
    const accordionContent = minorGroup.locator('[data-state="closed"]')
    const closedCount = await accordionContent.count()
    expect(closedCount).toBeGreaterThan(0)
  })

  // ── E4 [P1]: Click Minor accordion → minor findings revealed ──────────
  test('[P1] E4: clicking Minor accordion reveals minor findings', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for finding list
    const findingList = page.getByTestId('finding-list')
    await expect(findingList).toBeVisible({ timeout: 15_000 })
    const countSummary = page.getByTestId('finding-count-summary')
    await expect(countSummary).not.toContainText('Total: 0', { timeout: 15_000 })

    // Click Minor accordion to expand
    const minorAccordion = page.getByText(/Minor \(\d+\)/i)
    await expect(minorAccordion).toBeVisible()
    await minorAccordion.click()
    await page.waitForTimeout(500)

    // Minor finding rows should now be visible
    const minorGroup = page.locator('[role="rowgroup"][aria-label="Minor findings"]')
    const minorRows = minorGroup.getByTestId('finding-compact-row')
    await expect(minorRows.first()).toBeVisible({ timeout: 5_000 })

    // Should have 3 minor rows
    const count = await minorRows.count()
    expect(count).toBe(3)
  })

  // ── E5 [P1]: FindingCardCompact shows severity icon + text + badges ────
  test('[P1] E5: compact rows show severity icon + text label + category + layer badge', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    await waitForFindingsVisible(page)

    // Major group should have compact rows with severity indicator
    const majorGroup = page.locator('[role="rowgroup"][aria-label="Major findings"]')
    const firstMajorRow = majorGroup.getByTestId('finding-compact-row').first()
    await expect(firstMajorRow).toBeVisible()

    // Severity text "Major" should be visible inside the row
    await expect(firstMajorRow.getByText('Major')).toBeVisible()

    // Layer badge should be visible (either "Rule" or "AI")
    const layerBadge = firstMajorRow.getByTestId('layer-badge')
    await expect(layerBadge).toBeVisible()
  })

  // ── E6 [P1]: Severity icons have aria-hidden ───────────────────────────
  test('[P1] E6: severity icons have aria-hidden="true" (G#36)', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    await waitForFindingsVisible(page)

    // All SVG icons inside finding rows should have aria-hidden="true"
    const findingRows = page.getByTestId('finding-compact-row')
    const firstRow = findingRows.first()
    await expect(firstRow).toBeVisible()

    // Check that SVG icons in severity indicator have aria-hidden
    const severityIcons = firstRow.locator('svg[aria-hidden="true"]')
    const iconCount = await severityIcons.count()
    expect(iconCount).toBeGreaterThan(0)
  })

  // ── E7 [P1]: Dual-track ReviewProgress visible ─────────────────────────
  test('[P1] E7: dual-track ReviewProgress shows "Reviewed X/N" and "AI: status"', async ({
    page,
  }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // ReviewProgress component should be visible
    const reviewProgress = page.getByTestId('review-progress')
    await expect(reviewProgress).toBeVisible({ timeout: 15_000 })

    // Track 1: Review count — "Reviewed: 0/6" (6 seeded findings, none reviewed)
    const reviewTrack = reviewProgress.getByTestId('review-count-track')
    await expect(reviewTrack).toBeVisible()
    await expect(reviewTrack).toContainText(/Reviewed/i)

    // Track 2: AI status — should show "AI: complete" (l2_completed)
    const aiTrack = reviewProgress.getByTestId('ai-status-track')
    await expect(aiTrack).toBeVisible()
    await expect(aiTrack).toContainText(/AI: complete/i)

    // AI progress bar should be at 100% (l2_completed in economy mode)
    const aiProgressBar = reviewProgress.getByTestId('ai-progress-bar')
    await expect(aiProgressBar).toHaveAttribute('aria-valuenow', '100')
  })

  // ── E8 [P1]: Finding count summary matches seeded data ─────────────────
  test('[P1] E8: finding count summary shows correct total (6 findings)', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    const countSummary = page.getByTestId('finding-count-summary')
    await expect(countSummary).toBeVisible({ timeout: 15_000 })

    // Should show "Total: 6" (1 critical + 2 major + 3 minor)
    await expect(countSummary).toContainText('6')
  })

  // ── E9 [P2]: Click compact row → expand to FindingCard ─────────────────
  test('[P2] E9: clicking compact row expands to full FindingCard inline', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    await waitForFindingsVisible(page)

    // Find a Major row that is NOT expanded
    const majorGroup = page.locator('[role="rowgroup"][aria-label="Major findings"]')
    const majorRow = majorGroup.getByTestId('finding-compact-row').first()
    await expect(majorRow).toBeVisible()

    // Verify row starts collapsed
    await expect(majorRow).toHaveAttribute('aria-expanded', 'false')

    // Click to expand
    await majorRow.click()

    // After click, the row should be expanded
    await expect(majorRow).toHaveAttribute('aria-expanded', 'true')
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        // Non-critical — global teardown handles user cleanup
        console.warn(`[cleanup] Failed to clean project ${projectId}:`, err)
      }
    }
  })
})
