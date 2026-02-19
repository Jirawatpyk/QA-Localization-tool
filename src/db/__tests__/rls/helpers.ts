/**
 * Shared helpers for RLS integration tests.
 *
 * Handles idempotent user creation (cleans up stale data from previous runs)
 * and provides tenant-scoped Supabase clients for cross-tenant assertions.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'test-password-123!'

export type TestTenant = {
  id: string
  userId: string
  jwt: string
}

/**
 * Admin client (service_role) — bypasses RLS for setup/teardown.
 */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/**
 * Creates a tenant-scoped Supabase client using a user JWT.
 * This client is subject to RLS policies.
 */
export function tenantClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
}

/**
 * Deletes stale auth user by email if it exists from a previous test run.
 * Also cleans up related rows (user_roles, users) to avoid FK conflicts.
 */
async function cleanupStaleUser(email: string): Promise<void> {
  // Supabase admin API doesn't have getUserByEmail — list + filter
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = data?.users?.find((u) => u.email === email)
  if (!existing) return

  // Clean up DB rows first (service_role bypasses RLS)
  await admin.from('user_roles').delete().eq('user_id', existing.id)
  await admin.from('users').delete().eq('id', existing.id)
  await admin.auth.admin.deleteUser(existing.id)
}

/**
 * Creates a fresh test tenant with auth user, tenant row, user record, and role.
 * Idempotent: cleans up stale data first if the email was used in a prior run.
 *
 * Returns tenant ID, user ID, and a signed JWT with tenant_id/user_role claims.
 */
export async function setupTestTenant(email: string): Promise<TestTenant> {
  // Clean up stale user from previous test run (if any)
  await cleanupStaleUser(email)

  // 1. Create auth user
  const { data: authUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createError || !authUser.user) {
    throw new Error(
      `Failed to create auth user ${email}: ${createError?.message ?? 'user is null'}`,
    )
  }
  const userId = authUser.user.id

  // 2. Create tenant
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({ name: `Tenant ${email}`, status: 'active' })
    .select('id')
    .single()
  if (tenantError || !tenant) {
    throw new Error(
      `Failed to create tenant for ${email}: ${tenantError?.message ?? 'tenant is null'}`,
    )
  }
  const tenantId = tenant.id

  // 3. Create user record + role
  await admin.from('users').insert({ id: userId, tenant_id: tenantId, email, display_name: email })
  await admin.from('user_roles').insert({ user_id: userId, tenant_id: tenantId, role: 'admin' })

  // 4. Set app_metadata so JWT claims include tenant_id + user_role
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId, user_role: 'admin' },
  })

  // 5. Sign in to get JWT with claims
  // IMPORTANT: Use a separate anon client for sign-in to avoid polluting the
  // admin client's session. If admin.auth.signInWithPassword() is used, the
  // admin client's internal session switches to the user JWT, causing subsequent
  // service_role operations (e.g., creating a second tenant) to be subject to RLS.
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  })
  const { data: session, error: sessionError } = await anonClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (sessionError || !session.session) {
    throw new Error(`Failed to sign in ${email}: ${sessionError?.message ?? 'session is null'}`)
  }

  return { id: tenantId, userId, jwt: session.session.access_token }
}

/**
 * Cleans up a test tenant's auth user (+ cascading DB data via FK/triggers).
 */
export async function cleanupTestTenant(tenant: TestTenant | undefined): Promise<void> {
  if (!tenant?.userId) return
  // Clean up user_roles and users first, then auth user
  await admin.from('user_roles').delete().eq('user_id', tenant.userId)
  await admin.from('users').delete().eq('id', tenant.userId)
  await admin.auth.admin.deleteUser(tenant.userId)
}
