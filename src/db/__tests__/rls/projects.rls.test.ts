/**
 * RLS Tests: projects table — tenant isolation
 *
 * Requires: `npx supabase start` running locally
 * Run with: `npm run test:rls`
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Admin client (bypasses RLS) for setup/teardown
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Test state
let tenantA: { id: string; userId: string; jwt: string }
let tenantB: { id: string; userId: string; jwt: string }

async function createTestTenant(email: string) {
  // Create user via admin API
  const { data: authUser } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123!',
    email_confirm: true,
  })
  const userId = authUser.user!.id

  // Create tenant
  const { data: tenant } = await admin
    .from('tenants')
    .insert({ name: `Tenant ${email}`, status: 'active' })
    .select('id')
    .single()
  const tenantId = tenant!.id

  // Create user record + role
  await admin.from('users').insert({ id: userId, tenant_id: tenantId, email, display_name: email })
  await admin.from('user_roles').insert({ user_id: userId, tenant_id: tenantId, role: 'admin' })

  // Update app_metadata so JWT claims have tenant_id
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId, user_role: 'admin' },
  })

  // Sign in to get JWT
  const { data: session } = await admin.auth.signInWithPassword({
    email,
    password: 'test-password-123!',
  })

  return { id: tenantId, userId, jwt: session.session!.access_token }
}

function tenantClient(jwt: string) {
  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
}

beforeAll(async () => {
  tenantA = await createTestTenant('rls-projects-a@test.local')
  tenantB = await createTestTenant('rls-projects-b@test.local')

  // Seed a project for each tenant (via admin to bypass RLS)
  await admin.from('projects').insert({
    tenant_id: tenantA.id,
    name: 'Project A',
    source_lang: 'en',
    target_langs: ['th'],
    processing_mode: 'economy',
    status: 'draft',
  })
  await admin.from('projects').insert({
    tenant_id: tenantB.id,
    name: 'Project B',
    source_lang: 'en',
    target_langs: ['ja'],
    processing_mode: 'thorough',
    status: 'draft',
  })
}, 30000)

afterAll(async () => {
  // Cleanup
  if (tenantA?.userId) await admin.auth.admin.deleteUser(tenantA.userId)
  if (tenantB?.userId) await admin.auth.admin.deleteUser(tenantB.userId)
})

describe('projects RLS', () => {
  it('should allow Tenant A to see only their own projects', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('projects').select('name')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.name).toBe('Project A')
  })

  it('should allow Tenant B to see only their own projects', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('projects').select('name')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.name).toBe('Project B')
  })

  it('should prevent Tenant A from inserting into Tenant B', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('projects').insert({
      tenant_id: tenantB.id,
      name: 'Hijacked Project',
      source_lang: 'en',
      target_langs: ['ko'],
      processing_mode: 'economy',
      status: 'draft',
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant A from updating Tenant B projects', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('projects')
      .update({ name: 'Hijacked Name' })
      .eq('tenant_id', tenantB.id)
      .select()

    // RLS silently returns 0 rows (no match in USING clause)
    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from deleting Tenant B projects', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('projects').delete().eq('tenant_id', tenantB.id).select()

    expect(data).toHaveLength(0)
  })
})
