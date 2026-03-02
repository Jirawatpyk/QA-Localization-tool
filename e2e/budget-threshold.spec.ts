import { test, expect } from '@playwright/test'

import { cleanupTestProject } from './helpers/pipeline-admin'
import { createTestProject, getUserInfo, signupOrLogin } from './helpers/supabase-admin'

/**
 * Story 3.2b6 — Budget Alert Threshold Editing (E2E)
 *
 * AC Coverage:
 *   AC1: Admin can edit budgetAlertThresholdPct via AiBudgetCard on project settings page
 *
 * T1.13 [P0]: Admin → settings → sees AiBudgetCard → edits threshold → saves → verify persists
 *
 * Prerequisites:
 *   - Project with a monthly AI budget set (null = unlimited hides threshold input)
 *   - Admin role user (non-admin is redirected by settings page guard)
 *
 * Route under test:
 *   /projects/[projectId]/settings — ProjectSettings → AI Configuration → AiBudgetCard
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Ephemeral admin user — auto-cleaned by global-teardown
const TEST_EMAIL = `e2e-budget-${Date.now()}@test.local`

let projectId: string
let tenantId: string

function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  }
}

/** Query budgetAlertThresholdPct from DB via PostgREST (admin bypass). */
async function queryBudgetThresholdPct(pId: string): Promise<number | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?id=eq.${pId}&select=budget_alert_threshold_pct`,
    { headers: adminHeaders() },
  )
  const data = (await res.json()) as Array<{ budget_alert_threshold_pct: number }>
  if (!data || data.length === 0) return null
  return data[0].budget_alert_threshold_pct
}

/** Set monthly AI budget on project so threshold input is visible. */
async function setProjectMonthlyBudget(pId: string, budgetUsd: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${pId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ ai_budget_monthly_usd: budgetUsd }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to set monthly budget for project ${pId}: ${res.status} ${text}`)
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Budget Threshold Editing (Story 3.2b6)', () => {
  // ── Setup ────────────────────────────────────────────────────────────────
  test('[setup] signup/login and create project with budget', async ({ page }) => {
    test.setTimeout(60_000)

    await signupOrLogin(page, TEST_EMAIL)

    const userInfo = await getUserInfo(TEST_EMAIL)
    expect(userInfo).not.toBeNull()
    tenantId = userInfo!.tenantId

    projectId = await createTestProject(tenantId, 'Budget Threshold E2E')

    // Set monthly budget so threshold input is visible (null → unlimited → no input)
    await setProjectMonthlyBudget(projectId, '50.00')

    // Verify default threshold is 80 per DB schema
    const initial = await queryBudgetThresholdPct(projectId)
    expect(initial).toBe(80)
  })

  // ── T1.13a [P0]: Admin sees editable threshold input ────────────────────
  test('[P0] should show editable threshold input on AiBudgetCard for Admin', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/settings`)

    // AiBudgetCard should be visible
    const budgetCard = page.getByTestId('ai-budget-card')
    await expect(budgetCard).toBeVisible({ timeout: 10_000 })

    // Threshold input should be present for Admin
    const thresholdInput = page.getByTestId('threshold-input')
    await expect(thresholdInput).toBeVisible()

    // Current value should be 80 (DB default)
    await expect(thresholdInput).toHaveValue('80')
  })

  // ── T1.13b [P0]: Save threshold + persist after reload ──────────────────
  test('[P0] should save updated threshold and persist after page reload', async ({ page }) => {
    test.setTimeout(30_000)

    await signupOrLogin(page, TEST_EMAIL)
    await page.goto(`/projects/${projectId}/settings`)

    const budgetCard = page.getByTestId('ai-budget-card')
    await expect(budgetCard).toBeVisible({ timeout: 10_000 })

    // Edit threshold: clear, type new value, blur to save
    const thresholdInput = page.getByTestId('threshold-input')
    await expect(thresholdInput).toBeVisible()

    await thresholdInput.clear()
    await thresholdInput.fill('65')
    await thresholdInput.blur()

    // Success toast
    await expect(page.getByText(/Threshold updated/i)).toBeVisible({ timeout: 10_000 })

    // Verify persistence: reload and check value is still 65
    await page.reload()

    const thresholdAfterReload = page.getByTestId('threshold-input')
    await expect(thresholdAfterReload).toBeVisible({ timeout: 10_000 })
    await expect(thresholdAfterReload).toHaveValue('65')

    // Verify DB value directly
    const dbValue = await queryBudgetThresholdPct(projectId)
    expect(dbValue).toBe(65)
  })

  // ── Cleanup ──────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    if (projectId) {
      try {
        await cleanupTestProject(projectId)
      } catch {
        // Non-critical — global teardown handles user cleanup
      }
    }
  })
})
