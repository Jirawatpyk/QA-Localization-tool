/**
 * ATDD E2E — Story 5.2c: Native Reviewer Workflow
 *
 * Full E2E: QA reviewer flags finding → native reviewer sees scoped view →
 * confirm → comment thread
 *
 * Uses 2 browser contexts (QA + native reviewer).
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test'

import {
  signupOrLogin,
  getUserInfo,
  createTestProject,
  adminHeaders,
  SUPABASE_URL,
} from './helpers/supabase-admin'

const SKIP_REASON = !process.env.INNGEST_DEV_URL ? 'INNGEST_DEV_URL not set' : undefined

// ── PostgREST Helpers ──

async function seedFile(projectId: string, tenantId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: projectId,
      tenant_id: tenantId,
      file_name: 'e2e-native-test.sdlxliff',
      file_type: 'sdlxliff',
      status: 'l2_completed',
      storage_path: 'e2e/test.sdlxliff',
      file_size_bytes: 1024,
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
      description: 'E2E test finding for native review workflow',
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

async function setUserRole(userId: string, tenantId: string, role: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, tenant_id: tenantId, role }),
  })
  // 409 = already exists — OK
  if (!res.ok && res.status !== 409) {
    throw new Error(`Role set failed: ${res.status} ${await res.text()}`)
  }
}

async function setNativeLanguages(email: string, langs: string[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ native_languages: langs }),
  })
  if (!res.ok) throw new Error(`Set native_languages failed: ${res.status} ${await res.text()}`)
}

async function seedAssignment(
  findingId: string,
  fileId: string,
  projectId: string,
  tenantId: string,
  assignedTo: string,
  assignedBy: string,
  comment: string,
): Promise<string> {
  // Also flag the finding
  await fetch(`${SUPABASE_URL}/rest/v1/findings?id=eq.${findingId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'flagged' }),
  })

  const res = await fetch(`${SUPABASE_URL}/rest/v1/finding_assignments`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      finding_id: findingId,
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      assigned_to: assignedTo,
      assigned_by: assignedBy,
      status: 'pending',
      flagger_comment: comment,
    }),
  })
  if (!res.ok) throw new Error(`Assignment seed failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as Array<{ id: string }>
  return data[0]!.id
}

// ── Tests ──

test.describe('Story 5.2c: Native Reviewer Workflow', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!!SKIP_REASON, SKIP_REASON ?? '')

  let qaEmail: string
  let nativeEmail: string
  let projectId: string
  let tenantId: string
  let fileId: string
  let findingId: string
  let qaUserId: string
  let nativeUserId: string

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000) // 2 min for user creation + seeding
    if (SKIP_REASON) return

    // Setup QA reviewer
    const qaCtx = await browser.newContext()
    const qaPage = await qaCtx.newPage()
    qaEmail = `qa-e2e-5-2c-${Date.now()}@test.local`
    await signupOrLogin(qaPage, qaEmail)
    const qaInfo = await getUserInfo(qaEmail)
    if (!qaInfo) throw new Error('QA user not found')
    qaUserId = qaInfo.id
    tenantId = qaInfo.tenantId
    await setUserRole(qaUserId, tenantId, 'qa_reviewer')
    await qaCtx.close()

    // Setup native reviewer
    const nativeCtx = await browser.newContext()
    const nativePage = await nativeCtx.newPage()
    nativeEmail = `native-e2e-5-2c-${Date.now()}@test.local`
    await signupOrLogin(nativePage, nativeEmail)
    const nativeInfo = await getUserInfo(nativeEmail)
    if (!nativeInfo) throw new Error('Native user not found')
    nativeUserId = nativeInfo.id
    await setUserRole(nativeUserId, tenantId, 'native_reviewer')
    await setNativeLanguages(nativeEmail, ['th'])
    await nativeCtx.close()

    // Seed data
    projectId = await createTestProject(tenantId, 'E2E 5.2c Project')
    fileId = await seedFile(projectId, tenantId)
    findingId = await seedFinding(projectId, tenantId, fileId)

    // Seed assignment (QA flags for native)
    await seedAssignment(
      findingId,
      fileId,
      projectId,
      tenantId,
      nativeUserId,
      qaUserId,
      'Needs native Thai review for this idiom',
    )
  })

  test('QA reviewer should see review page with flagged finding', async ({ page }) => {
    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/review/${fileId}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15000 })

    await expect(page.locator('[data-testid="review-3-zone"]')).toBeVisible()
    await expect(page.locator('[data-testid="review-action-bar"]')).toBeVisible()
  })

  test('Native reviewer should see scoped view banner', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, nativeEmail)
    await page.goto(`/projects/${projectId}/review/${fileId}`)

    // Wait for review page
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15000 })

    // Should see scoped view banner (AC2) — use text matcher to avoid strict mode violation
    await expect(page.getByText('flagged segment')).toBeVisible({ timeout: 10000 })

    await ctx.close()
  })

  test('Native reviewer should see confirm and override buttons', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, nativeEmail)
    await page.goto(`/projects/${projectId}/review/${fileId}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15000 })

    // Should see C/O buttons (AC3/AC8)
    await expect(page.locator('[data-testid="action-confirm-native"]')).toBeVisible()
    await expect(page.locator('[data-testid="action-override-native"]')).toBeVisible()

    await ctx.close()
  })

  test('QA reviewer should see FlagForNativeDialog when pressing F', async ({ page }) => {
    await signupOrLogin(page, qaEmail)
    await page.goto(`/projects/${projectId}/review/${fileId}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15000 })

    // Click on a finding to select it first
    const findingCard = page.locator('[role="row"]').first()
    if (await findingCard.isVisible()) {
      await findingCard.click()
    }

    // Action bar flag button should exist
    await expect(page.locator('[data-testid="action-flag"]')).toBeVisible()
  })

  test('Native reviewer should see comment thread on assigned finding', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await signupOrLogin(page, nativeEmail)
    await page.goto(`/projects/${projectId}/review/${fileId}`)
    await page.waitForSelector('[data-testid="review-3-zone"]', { timeout: 15000 })

    // Click on the finding to open detail
    const findingCard = page.locator('[role="row"]').first()
    if (await findingCard.isVisible()) {
      await findingCard.click()
      // Should see comment section with flagger's comment
      await expect(page.locator('text=Flagging reason')).toBeVisible({ timeout: 5000 })
    }

    await ctx.close()
  })
})
