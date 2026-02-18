/**
 * RLS Tests: user_roles table — cross-tenant role isolation
 *
 * Requires: `npx supabase start` running locally
 * Run with: `npm run test:rls`
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let tenantA: { id: string; userId: string; jwt: string }
let tenantB: { id: string; userId: string; jwt: string }

async function setupTenant(email: string) {
  const { data: authUser } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123!',
    email_confirm: true,
  })
  const userId = authUser.user!.id

  const { data: tenant } = await admin
    .from('tenants')
    .insert({ name: `Tenant ${email}`, status: 'active' })
    .select('id')
    .single()
  const tenantId = tenant!.id

  await admin.from('users').insert({ id: userId, tenant_id: tenantId, email, display_name: email })
  await admin.from('user_roles').insert({ user_id: userId, tenant_id: tenantId, role: 'admin' })
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId, user_role: 'admin' },
  })

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
  tenantA = await setupTenant('rls-roles-a@test.local')
  tenantB = await setupTenant('rls-roles-b@test.local')
}, 30000)

afterAll(async () => {
  if (tenantA?.userId) await admin.auth.admin.deleteUser(tenantA.userId)
  if (tenantB?.userId) await admin.auth.admin.deleteUser(tenantB.userId)
})

describe('user_roles RLS', () => {
  it('should allow Tenant A to see only their own roles', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('user_roles').select('role, tenant_id')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.role).toBe('admin')
    expect(data?.[0]?.tenant_id).toBe(tenantA.id)
  })

  it('should prevent Tenant B from seeing Tenant A roles', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('user_roles').select('*').eq('tenant_id', tenantA.id)

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from inserting roles into Tenant B', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('user_roles').insert({
      user_id: tenantA.userId,
      tenant_id: tenantB.id,
      role: 'admin',
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant A from updating Tenant B roles', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('user_roles')
      .update({ role: 'qa_reviewer' })
      .eq('tenant_id', tenantB.id)
      .select()

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from deleting Tenant B roles', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('user_roles').delete().eq('tenant_id', tenantB.id).select()

    expect(data).toHaveLength(0)
  })
})
