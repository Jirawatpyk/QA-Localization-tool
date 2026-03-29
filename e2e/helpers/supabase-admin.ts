/**
 * Supabase Admin API helpers for E2E tests.
 * Uses service_role key to bypass RLS and manage test data via PostgREST.
 *
 * NOTE: process.env is used directly because E2E helpers run in the Playwright
 * Node.js context (not Next.js runtime), so @/lib/env is not available.
 */
import type { Page } from '@playwright/test'

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

export function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  }
}

/**
 * Signup or login a test user via the app's UI.
 * Tries login first; falls back to signup if the user doesn't exist.
 */
export async function signupOrLogin(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD,
  displayName: string = 'E2E Test User',
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  let loginSucceeded = true
  try {
    await page.waitForURL('**/dashboard', { timeout: 15000, waitUntil: 'domcontentloaded' })
  } catch {
    loginSucceeded = false
  }

  if (!loginSucceeded) {
    await page.goto('/signup')
    // Display Name field removed from signup page — skip if not present
    const displayNameField = page.getByLabel('Display Name')
    if (await displayNameField.isVisible().catch(() => false)) {
      await displayNameField.fill(displayName)
    }
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/dashboard', { timeout: 30000, waitUntil: 'domcontentloaded' })
  }
}

/**
 * Get user info (id, tenant_id) from the public.users table via PostgREST.
 */
export async function getUserInfo(email: string): Promise<{ id: string; tenantId: string } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,tenant_id`,
    { headers: adminHeaders() },
  )
  const data = (await res.json()) as Array<{ id: string; tenant_id: string }>
  if (!data || data.length === 0) return null
  return { id: data[0].id, tenantId: data[0].tenant_id }
}

/**
 * Set user metadata via PostgREST PATCH.
 * Pass null to reset metadata to NULL.
 */
export async function setUserMetadata(
  email: string,
  metadata: Record<string, unknown> | null,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ metadata }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to set metadata for ${email}: ${res.status} ${text}`)
  }
}

/**
 * Create a test project for a user via PostgREST.
 * Returns the project ID. Uses service_role to bypass RBAC.
 */
export async function createTestProject(
  tenantId: string,
  name: string = 'E2E Test Project',
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      tenant_id: tenantId,
      name,
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create project: ${res.status} ${text}`)
  }
  const data = (await res.json()) as Array<{ id: string }>
  return data[0].id
}

/**
 * Move a user to a different tenant via PostgREST.
 * Updates users.tenant_id and user_roles.tenant_id.
 * Used in E2E to ensure multiple test users share the same tenant.
 */
export async function moveUserToTenant(userId: string, targetTenantId: string): Promise<void> {
  // Update users table
  const userRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ tenant_id: targetTenantId }),
  })
  if (!userRes.ok) {
    const text = await userRes.text()
    throw new Error(`Failed to move user to tenant: ${userRes.status} ${text}`)
  }

  // Update user_roles table
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ tenant_id: targetTenantId }),
  })
  if (!roleRes.ok) {
    const text = await roleRes.text()
    throw new Error(`Failed to move user role to tenant: ${roleRes.status} ${text}`)
  }
}

/**
 * Set a user's role in user_roles via PostgREST PATCH.
 * Updates the existing role row (unique constraint: user_id + tenant_id).
 */
export async function setUserRole(userId: string, role: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to set user role: ${res.status} ${text}`)
  }
}

/**
 * Set a user's native_languages column (jsonb array) via PostgREST PATCH.
 * This sets the DB column directly — separate from metadata.native_languages.
 */
export async function setUserNativeLanguages(email: string, languages: string[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ native_languages: languages }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to set native languages: ${res.status} ${text}`)
  }
}

/**
 * Insert a notification record for a user via PostgREST.
 */
export async function createNotification(
  userId: string,
  tenantId: string,
  title: string,
  body: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      tenant_id: tenantId,
      type: 'e2e_test',
      title,
      body,
      is_read: false,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create notification: ${res.status} ${text}`)
  }
}
