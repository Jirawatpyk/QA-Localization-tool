/**
 * RLS Tests: findings table — cross-tenant isolation
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

let tenantA: {
  id: string
  userId: string
  jwt: string
  projectId: string
  fileId: string
  segmentId: string
}
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
  const a = await setupTenant('rls-findings-a@test.local')
  const b = await setupTenant('rls-findings-b@test.local')

  // Create project → file → segment → finding for Tenant A
  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'Findings Test',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()

  const { data: file } = await admin
    .from('files')
    .insert({
      project_id: project!.id,
      tenant_id: a.id,
      file_name: 'test.xliff',
      file_type: 'xliff',
      file_size_bytes: 1024,
      storage_path: '/test.xliff',
      status: 'parsed',
    })
    .select('id')
    .single()

  const { data: segment } = await admin
    .from('segments')
    .insert({
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      segment_number: 1,
      source_text: 'Hello',
      target_text: 'สวัสดี',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 1,
    })
    .select('id')
    .single()

  await admin.from('findings').insert({
    segment_id: segment!.id,
    project_id: project!.id,
    tenant_id: a.id,
    status: 'pending',
    severity: 'major',
    category: 'Accuracy',
    description: 'Mistranslation detected',
    detected_by_layer: 'L1',
  })

  tenantA = { ...a, projectId: project!.id, fileId: file!.id, segmentId: segment!.id }
  tenantB = b
}, 30000)

afterAll(async () => {
  if (tenantA?.userId) await admin.auth.admin.deleteUser(tenantA.userId)
  if (tenantB?.userId) await admin.auth.admin.deleteUser(tenantB.userId)
})

describe('findings RLS', () => {
  it('should allow Tenant A to see their own findings', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('findings').select('description')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.description).toBe('Mistranslation detected')
  })

  it('should prevent Tenant B from seeing Tenant A findings', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('findings').select('*')

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant B from inserting findings into Tenant A project', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { error } = await clientB.from('findings').insert({
      segment_id: tenantA.segmentId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      status: 'pending',
      severity: 'critical',
      category: 'Accuracy',
      description: 'Injected finding',
      detected_by_layer: 'L2',
    })

    expect(error).toBeTruthy()
  })
})
