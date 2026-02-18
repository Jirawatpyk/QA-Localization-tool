/**
 * RLS Tests: audit_logs table — INSERT-only enforcement + immutability trigger
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

let testTenant: { id: string; userId: string; jwt: string }
let auditLogId: string

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
  testTenant = await setupTenant('rls-audit-a@test.local')

  // Insert audit log via authenticated client
  const client = tenantClient(testTenant.jwt)
  const { data } = await client
    .from('audit_logs')
    .insert({
      tenant_id: testTenant.id,
      user_id: testTenant.userId,
      entity_type: 'user',
      entity_id: testTenant.userId,
      action: 'test.created',
    })
    .select('id')
    .single()

  auditLogId = data?.id
}, 30000)

afterAll(async () => {
  if (testTenant?.userId) await admin.auth.admin.deleteUser(testTenant.userId)
})

describe('audit_logs RLS — INSERT-only enforcement', () => {
  it('should allow INSERT via authenticated client', async () => {
    const client = tenantClient(testTenant.jwt)
    const { data, error } = await client
      .from('audit_logs')
      .insert({
        tenant_id: testTenant.id,
        user_id: testTenant.userId,
        entity_type: 'project',
        entity_id: testTenant.userId,
        action: 'project.created',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
  })

  it('should block UPDATE via authenticated client (no RLS UPDATE policy)', async () => {
    if (!auditLogId) return

    const client = tenantClient(testTenant.jwt)
    const { data } = await client
      .from('audit_logs')
      .update({ action: 'tampered' })
      .eq('id', auditLogId)
      .select()

    // RLS blocks: no UPDATE policy → returns empty
    expect(data).toHaveLength(0)
  })

  it('should block DELETE via authenticated client (no RLS DELETE policy)', async () => {
    if (!auditLogId) return

    const client = tenantClient(testTenant.jwt)
    const { data } = await client.from('audit_logs').delete().eq('id', auditLogId).select()

    // RLS blocks: no DELETE policy → returns empty
    expect(data).toHaveLength(0)
  })

  it('should block UPDATE via service_role (DB trigger Layer 3)', async () => {
    if (!auditLogId) return

    const { error } = await admin
      .from('audit_logs')
      .update({ action: 'tampered-by-admin' })
      .eq('id', auditLogId)

    // DB trigger raises exception
    expect(error).toBeTruthy()
    expect(error!.message).toContain('immutable')
  })

  it('should block DELETE via service_role (DB trigger Layer 3)', async () => {
    if (!auditLogId) return

    const { error } = await admin.from('audit_logs').delete().eq('id', auditLogId)

    // DB trigger raises exception
    expect(error).toBeTruthy()
    expect(error!.message).toContain('immutable')
  })
})
