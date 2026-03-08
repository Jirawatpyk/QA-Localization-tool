/**
 * Story 3.5 ATDD — E2E: Score Lifecycle & Confidence Display
 *
 * Tests score state transitions visible on the review page:
 *   - calculating state → spinner + Approve gate disabled
 *   - calculated+L1L2 state → "AI Screened" badge + Approve enabled
 *   - calculating state → SCORE_STALE toast on approve attempt
 *   - auto_passed state → AutoPassRationale card visible, Approve hidden
 *   - findings with confidence values → colored confidence badges
 *
 * Strategy: Seed pre-baked score states via PostgREST (no real pipeline run needed).
 * Each test seeds its own isolated file+score to avoid state bleed.
 *
 * Prerequisites:
 * - Next.js dev server (npm run dev) on port 3000
 * - Supabase running (local or cloud)
 */

// NOTE: process.env used directly — E2E specs run in Playwright Node.js process
// (not Next.js runtime), so @/lib/env is not available.
import { test, expect } from '@playwright/test'

import { SUPABASE_URL, adminHeaders } from './helpers/supabase-admin'
import { cleanupTestProject, queryScore } from './helpers/pipeline-admin'
import {
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

// ── Seed Helpers ──────────────────────────────────────────────────────────────

type ScoreStatus = 'calculating' | 'calculated' | 'partial' | 'overridden' | 'auto_passed' | 'na'
type ScoreLayerCompleted = 'L1' | 'L1L2' | 'L1L2L3'

/**
 * Seed a file + score row via PostgREST (service_role bypasses RLS).
 * Returns the seeded fileId.
 */
async function seedFileWithScore(opts: {
  tenantId: string
  projectId: string
  scoreStatus: ScoreStatus
  layerCompleted: ScoreLayerCompleted
  mqmScore: number
  autoPassRationale?: string
}): Promise<string> {
  // 1. Insert file row
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      file_name: `score-lifecycle-${opts.scoreStatus}-${Date.now()}.sdlxliff`,
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: `e2e/score-lifecycle-${opts.scoreStatus}-${Date.now()}.sdlxliff`,
      status: 'l2_completed',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(`seedFileWithScore: failed to insert file: ${fileRes.status} ${text}`)
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seedFileWithScore: no file row returned')
  const fileId = fileData[0]!.id

  // 2. Insert score row
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: opts.projectId,
      tenant_id: opts.tenantId,
      mqm_score: opts.mqmScore,
      status: opts.scoreStatus,
      layer_completed: opts.layerCompleted,
      total_words: 1000,
      critical_count: 0,
      major_count: 2,
      minor_count: 5,
      npt: opts.mqmScore < 100 ? (100 - opts.mqmScore) / 100 : 0,
      auto_pass_rationale: opts.autoPassRationale ?? null,
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(`seedFileWithScore: failed to insert score: ${scoreRes.status} ${text}`)
  }

  return fileId
}

/**
 * Seed findings with specific ai_confidence values for a file.
 */
async function seedFindingsWithConfidence(opts: {
  tenantId: string
  projectId: string
  fileId: string
  findings: Array<{
    severity: 'critical' | 'major' | 'minor'
    aiConfidence: number
    detectedByLayer: 'L1' | 'L2' | 'L3'
    aiModel: string
  }>
}): Promise<void> {
  for (const f of opts.findings) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        file_id: opts.fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        severity: f.severity,
        category: 'accuracy',
        description: `Confidence test finding — ${f.severity} (${f.aiConfidence}%)`,
        detected_by_layer: f.detectedByLayer,
        ai_model: f.aiModel,
        ai_confidence: f.aiConfidence,
        status: 'pending',
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`seedFindingsWithConfidence: failed to insert finding: ${res.status} ${text}`)
    }
  }
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

// Ephemeral user — auto-cleaned by global-teardown (matches /^e2e-.*\d{13,}@test\.local$/)
const TEST_EMAIL = `e2e-score-lifecycle-${Date.now()}@test.local`

// Shared state across serial tests (set in [setup])
let projectId: string
let tenantId: string

test.describe.serial('Score Lifecycle & Confidence Display — Story 3.5', () => {
  test.setTimeout(120_000)

  // ── Setup: Auth + Project ─────────────────────────────────────────────────
  test('[setup] signup, login, and create project', async ({ page }) => {
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

    projectId = await createTestProject(tenantId, 'Score Lifecycle E2E')
    expect(projectId).toBeTruthy()
  })

  // ── 3.5-E-001 [P0]: calculating state → spinner + Approve disabled ────────
  test('[P0] should show spinner and disable Approve when score is calculating', async ({
    page,
  }) => {
    // Arrange: seed file with score_status='calculating', layer_completed='L1'
    const fileId = await seedFileWithScore({
      tenantId,
      projectId,
      scoreStatus: 'calculating',
      layerCompleted: 'L1',
      mqmScore: 0,
    })

    // Verify seed
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('calculating')

    // Act: navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Assert: ScoreBadge shows calculating / spinner state
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })
    // "Calculating..." or "Analyzing" indicator visible
    await expect(scoreBadge).toContainText(/calculat|analyz/i)

    // Assert: Approve button is disabled (score not yet settled)
    const approveBtn = page.getByRole('button', { name: /approve/i })
    // Button may be disabled or hidden entirely
    const btnCount = await approveBtn.count()
    if (btnCount > 0) {
      await expect(approveBtn).toBeDisabled()
    }
  })

  // ── 3.5-E-002 [P1]: calculated + L1L2 → AI Screened badge + Approve enabled ──
  test('[P1] should show AI Screened badge and enable Approve when calculated', async ({
    page,
  }) => {
    // Arrange: seed file with score_status='calculated', layer_completed='L1L2'
    const fileId = await seedFileWithScore({
      tenantId,
      projectId,
      scoreStatus: 'calculated',
      layerCompleted: 'L1L2',
      mqmScore: 92.5,
    })

    // Verify seed
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('calculated')
    expect(score!.layer_completed).toBe('L1L2')

    // Act: navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Assert: ScoreBadge shows "AI Screened" state (L1L2 = Economy pipeline complete)
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 15_000 })
    await expect(scoreBadge).toContainText(/ai screened/i)

    // Assert: MQM score value is visible (not "N/A" or empty)
    await expect(scoreBadge).toContainText(/\d+/)

    // Assert: Approve button is enabled (score is settled)
    const approveBtn = page.getByRole('button', { name: /approve/i })
    await expect(approveBtn).toBeVisible({ timeout: 10_000 })
    await expect(approveBtn).toBeEnabled()
  })

  // ── 3.5-E-003 [P0]: Approve on calculating score → SCORE_STALE toast ──────
  test('[P0] should show SCORE_STALE toast when approving a calculating score', async ({
    page,
  }) => {
    // Strategy: seed file as 'calculated' so the Approve button is enabled on load,
    // then mutate score to 'calculating' via PostgREST BEFORE clicking Approve.
    // This tests the real defense-in-depth scenario: UI shows stale state, server rejects.

    // Arrange: seed file with score_status='calculated' (button will be enabled)
    const fileId = await seedFileWithScore({
      tenantId,
      projectId,
      scoreStatus: 'calculated',
      layerCompleted: 'L1L2',
      mqmScore: 90.0,
    })

    // Verify seed before navigating
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('calculated')

    // Act: navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for the review page to fully render with the score badge
    const scoreBadge = page.getByTestId('score-badge')
    await expect(scoreBadge).toBeVisible({ timeout: 30_000 })

    // Wait for Approve button to be enabled (score is 'calculated')
    const approveBtn = page.getByRole('button', { name: /approve/i })
    await expect(approveBtn).toBeVisible({ timeout: 15_000 })
    await expect(approveBtn).toBeEnabled({ timeout: 5_000 })

    // Mutate score status to 'calculating' via PostgREST (behind the UI's back)
    // This simulates a recalculation starting between page render and user click.
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/scores?file_id=eq.${fileId}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'calculating' }),
    })
    if (!patchRes.ok) {
      const text = await patchRes.text()
      throw new Error(`Failed to patch score to calculating: ${patchRes.status} ${text}`)
    }

    // Click Approve — UI still shows it as enabled, but server-side gate should reject
    await approveBtn.click()

    // Assert: SCORE_STALE error toast visible
    const toast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: /calculat|please wait|score.*recalcul/i })
    await expect(toast).toBeVisible({ timeout: 10_000 })
  })

  // ── 3.5-E-004 [P1]: auto_passed + rationale → AutoPassRationale card ──────
  test('[P1] should show AutoPassRationale card when file is auto-passed', async ({ page }) => {
    // Arrange: seed file with score_status='auto_passed' + auto_pass_rationale JSON
    const rationale = JSON.stringify({
      score: 96.5,
      threshold: 95,
      margin: 1.5,
      severityCounts: { critical: 0, major: 2, minor: 8 },
      riskiestFinding: {
        category: 'fluency',
        severity: 'major',
        confidence: 72,
        description: 'Awkward phrasing',
      },
      criteria: {
        scoreAboveThreshold: true,
        noCriticalFindings: true,
        allLayersComplete: true,
      },
      isNewPair: false,
      fileCount: 51,
    })

    const fileId = await seedFileWithScore({
      tenantId,
      projectId,
      scoreStatus: 'auto_passed',
      layerCompleted: 'L1L2',
      mqmScore: 96.5,
      autoPassRationale: rationale,
    })

    // Verify seed
    const score = await queryScore(fileId)
    expect(score).not.toBeNull()
    expect(score!.status).toBe('auto_passed')

    // Act: navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Assert: Approve button is NOT visible (auto_passed files don't need manual approval)
    const approveBtn = page.getByRole('button', { name: /^approve$/i })
    await expect(approveBtn).not.toBeVisible({ timeout: 10_000 })

    // Assert: AutoPassRationale card is visible
    const rationaleCard = page.getByTestId('auto-pass-rationale')
    await expect(rationaleCard).toBeVisible({ timeout: 15_000 })

    // Assert: score margin "+1.5 above threshold" visible
    await expect(rationaleCard).toContainText(/1\.5/i)

    // Assert: severity counts visible — Critical: 0, Major: 2, Minor: 8
    await expect(rationaleCard).toContainText(/critical.*0|0.*critical/i)
    await expect(rationaleCard).toContainText(/major.*2|2.*major/i)
    await expect(rationaleCard).toContainText(/minor.*8|8.*minor/i)

    // Assert: criteria checkmarks visible
    const criteriaSection = rationaleCard.locator('[data-testid="auto-pass-criteria"]')
    await expect(criteriaSection).toBeVisible()
    await expect(
      criteriaSection.locator('[data-testid="criterion-score-above-threshold"]'),
    ).toBeVisible()
    await expect(criteriaSection.locator('[data-testid="criterion-no-critical"]')).toBeVisible()
    await expect(
      criteriaSection.locator('[data-testid="criterion-all-layers-complete"]'),
    ).toBeVisible()
  })

  // ── 3.5-E-005 [P1]: confidence badges with correct colors ─────────────────
  test('[P1] should display confidence badges with correct colors on findings', async ({
    page,
  }) => {
    // Arrange: seed file (calculated + L1L2) + findings with varied confidence values
    const fileId = await seedFileWithScore({
      tenantId,
      projectId,
      scoreStatus: 'calculated',
      layerCompleted: 'L1L2',
      mqmScore: 88.0,
    })

    await seedFindingsWithConfidence({
      tenantId,
      projectId,
      fileId,
      findings: [
        // High confidence (>= 85): should render with green/success color token
        {
          severity: 'minor',
          aiConfidence: 94,
          detectedByLayer: 'L2',
          aiModel: 'gpt-4o-mini',
        },
        // Medium confidence (>= 70 and < 85): should render with orange/warning color token
        {
          severity: 'major',
          aiConfidence: 75,
          detectedByLayer: 'L2',
          aiModel: 'gpt-4o-mini',
        },
        // Low confidence (< 70): should render with red/destructive color token
        {
          severity: 'major',
          aiConfidence: 60,
          detectedByLayer: 'L3',
          aiModel: 'claude-sonnet-4-5-20250929',
        },
      ],
    })

    // Act: navigate to review page
    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for findings list to render
    const confidenceBadges = page.getByTestId('confidence-badge')
    await expect(confidenceBadges.first()).toBeVisible({ timeout: 15_000 })

    // Assert: at least 3 confidence badges visible (one per seeded finding)
    await expect(confidenceBadges).toHaveCount(3, { timeout: 10_000 })

    // Assert: each badge shows the percentage text
    await expect(page.getByTestId('confidence-badge').filter({ hasText: '94%' })).toBeVisible()
    await expect(page.getByTestId('confidence-badge').filter({ hasText: '75%' })).toBeVisible()
    await expect(page.getByTestId('confidence-badge').filter({ hasText: '60%' })).toBeVisible()

    // Assert: color tiers via data-confidence-tier attribute
    // High (94%) → tier="high"
    const highBadge = page.getByTestId('confidence-badge').filter({ hasText: '94%' })
    await expect(highBadge).toHaveAttribute('data-confidence-tier', 'high')

    // Medium (75%) → tier="medium"
    const mediumBadge = page.getByTestId('confidence-badge').filter({ hasText: '75%' })
    await expect(mediumBadge).toHaveAttribute('data-confidence-tier', 'medium')

    // Low (60%) → tier="low"
    const lowBadge = page.getByTestId('confidence-badge').filter({ hasText: '60%' })
    await expect(lowBadge).toHaveAttribute('data-confidence-tier', 'low')
  })

  // ── Cleanup ───────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch (err) {
        // Non-critical — global teardown will clean up the ephemeral user
        // NOTE: console.warn used — E2E runs in Playwright Node.js process, pino not importable
        console.warn(`[cleanup] Failed to clean project ${projectId}:`, err)
      }
    }
  })
})
