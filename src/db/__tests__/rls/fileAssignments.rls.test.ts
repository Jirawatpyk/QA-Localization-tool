/**
 * RLS Tests: file_assignments — role-scoped access (Story 6.1, AC5)
 *
 * T1: Admin sees all tenant file_assignments (SELECT)
 * T2: QA reviewer sees all tenant file_assignments (SELECT)
 * T3: Native reviewer sees ONLY own assignments (SELECT)
 * T4: Cross-tenant isolation (Tenant B cannot see Tenant A)
 * T5: Admin can INSERT file_assignments
 * T6: QA reviewer can INSERT file_assignments
 * T7: Admin can UPDATE any assignment in tenant
 * T8: Assigned reviewer can UPDATE own assignment
 * T9: Admin can DELETE assignments
 * T10: Native reviewer cannot DELETE assignments
 *
 * Run with: `npm run test:rls`
 */
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'test-password-123!'

let tenantA: TestTenant
let tenantB: TestTenant
let nativeUser: { id: string; jwt: string }
let qaUser: { id: string; jwt: string }
let projectId: string
let fileId: string
let assignmentForAdmin: string
let assignmentForNative: string

beforeAll(async () => {
  // Tenant A (admin)
  tenantA = await setupTestTenant('rls-fa-admin-a@test.local')

  // Tenant B (admin, for cross-tenant)
  tenantB = await setupTestTenant('rls-fa-admin-b@test.local')

  // QA reviewer in Tenant A
  const { data: qaAuth } = await admin.auth.admin.createUser({
    email: 'rls-fa-qa@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: qaAuth!.user!.id,
    tenant_id: tenantA.id,
    email: 'rls-fa-qa@test.local',
    display_name: 'QA User',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: qaAuth!.user!.id, tenant_id: tenantA.id, role: 'qa_reviewer' })
  await admin.auth.admin.updateUserById(qaAuth!.user!.id, {
    app_metadata: { tenant_id: tenantA.id, user_role: 'qa_reviewer' },
  })
  const qaAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: qaSession } = await qaAnon.auth.signInWithPassword({
    email: 'rls-fa-qa@test.local',
    password: TEST_PASSWORD,
  })
  qaUser = { id: qaAuth!.user!.id, jwt: qaSession!.session!.access_token }

  // Native reviewer in Tenant A
  const { data: nativeAuth } = await admin.auth.admin.createUser({
    email: 'rls-fa-native@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: nativeAuth!.user!.id,
    tenant_id: tenantA.id,
    email: 'rls-fa-native@test.local',
    display_name: 'Native User',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: nativeAuth!.user!.id, tenant_id: tenantA.id, role: 'native_reviewer' })
  await admin.auth.admin.updateUserById(nativeAuth!.user!.id, {
    app_metadata: { tenant_id: tenantA.id, user_role: 'native_reviewer' },
  })
  const nativeAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: nativeSession } = await nativeAnon.auth.signInWithPassword({
    email: 'rls-fa-native@test.local',
    password: TEST_PASSWORD,
  })
  nativeUser = { id: nativeAuth!.user!.id, jwt: nativeSession!.session!.access_token }

  // Create project + file for assignments
  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: tenantA.id,
      name: 'RLS FA Test Project',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
    })
    .select('id')
    .single()
  projectId = project!.id

  const { data: file } = await admin
    .from('files')
    .insert({
      project_id: projectId,
      tenant_id: tenantA.id,
      file_name: 'test.sdlxliff',
      file_type: 'sdlxliff',
      file_size_bytes: 1024,
      storage_path: `${tenantA.id}/${projectId}/abc/test.sdlxliff`,
    })
    .select('id')
    .single()
  fileId = file!.id

  // Create two assignments: one for admin, one for native
  const { data: a1 } = await admin
    .from('file_assignments')
    .insert({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantA.id,
      assigned_to: tenantA.userId,
      assigned_by: tenantA.userId,
      status: 'completed', // completed so partial unique index allows second active
    })
    .select('id')
    .single()
  assignmentForAdmin = a1!.id

  // Create a separate file for native's assignment (unique index: one active per file)
  const { data: file2 } = await admin
    .from('files')
    .insert({
      project_id: projectId,
      tenant_id: tenantA.id,
      file_name: 'test2.sdlxliff',
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: `${tenantA.id}/${projectId}/def/test2.sdlxliff`,
    })
    .select('id')
    .single()

  const { data: a2 } = await admin
    .from('file_assignments')
    .insert({
      file_id: file2!.id,
      project_id: projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: tenantA.userId,
      status: 'assigned',
    })
    .select('id')
    .single()
  assignmentForNative = a2!.id
}, 30000)

afterAll(async () => {
  // Cleanup: delete assignments, files, project, users
  await admin.from('file_assignments').delete().eq('project_id', projectId)
  await admin.from('files').delete().eq('project_id', projectId)
  await admin.from('projects').delete().eq('id', projectId)

  // Cleanup users
  for (const email of ['rls-fa-qa@test.local', 'rls-fa-native@test.local']) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const user = data?.users?.find((u) => u.email === email)
    if (user) {
      await admin.from('user_roles').delete().eq('user_id', user.id)
      await admin.from('users').delete().eq('id', user.id)
      await admin.auth.admin.deleteUser(user.id)
    }
  }

  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
}, 15000)

describe('file_assignments RLS', () => {
  // T1: Admin SELECT
  it('T1: admin sees all tenant file_assignments', async () => {
    const client = tenantClient(tenantA.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id')
      .eq('project_id', projectId)

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })

  // T2: QA reviewer SELECT
  it('T2: QA reviewer sees all tenant file_assignments', async () => {
    const client = tenantClient(qaUser.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id')
      .eq('project_id', projectId)

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })

  // T3: Native reviewer sees ONLY own assignments
  it('T3: native reviewer sees ONLY own assignments', async () => {
    const client = tenantClient(nativeUser.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id, assigned_to')
      .eq('project_id', projectId)

    expect(error).toBeNull()
    // Should see only the assignment where assigned_to = nativeUser.id
    expect(data!.length).toBe(1)
    expect(data![0]!.assigned_to).toBe(nativeUser.id)
  })

  // T4: Cross-tenant isolation
  it('T4: Tenant B cannot see Tenant A assignments', async () => {
    const client = tenantClient(tenantB.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id')
      .eq('project_id', projectId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  // T5: Admin can INSERT file_assignments
  it('T5: admin can INSERT file_assignments', async () => {
    // Create a separate file to avoid partial unique index conflict
    const { data: tempFile } = await admin
      .from('files')
      .insert({
        project_id: projectId,
        tenant_id: tenantA.id,
        file_name: 'test-t5.sdlxliff',
        file_type: 'sdlxliff',
        file_size_bytes: 256,
        storage_path: `${tenantA.id}/${projectId}/t5/test-t5.sdlxliff`,
      })
      .select('id')
      .single()

    const client = tenantClient(tenantA.jwt)
    const { error } = await client.from('file_assignments').insert({
      file_id: tempFile!.id,
      project_id: projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: tenantA.userId,
      status: 'assigned',
    })
    expect(error).toBeNull()

    // Cleanup
    await admin.from('file_assignments').delete().eq('file_id', tempFile!.id)
    await admin.from('files').delete().eq('id', tempFile!.id)
  })

  // T6: QA reviewer can INSERT file_assignments
  it('T6: QA reviewer can INSERT file_assignments', async () => {
    // Create a separate file to avoid partial unique index conflict
    const { data: tempFile } = await admin
      .from('files')
      .insert({
        project_id: projectId,
        tenant_id: tenantA.id,
        file_name: 'test-t6.sdlxliff',
        file_type: 'sdlxliff',
        file_size_bytes: 256,
        storage_path: `${tenantA.id}/${projectId}/t6/test-t6.sdlxliff`,
      })
      .select('id')
      .single()

    const client = tenantClient(qaUser.jwt)
    const { error } = await client.from('file_assignments').insert({
      file_id: tempFile!.id,
      project_id: projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: qaUser.id,
      status: 'assigned',
    })
    expect(error).toBeNull()

    // Cleanup
    await admin.from('file_assignments').delete().eq('file_id', tempFile!.id)
    await admin.from('files').delete().eq('id', tempFile!.id)
  })

  // T7: Admin can UPDATE any assignment
  it('T7: admin can UPDATE any assignment in tenant', async () => {
    const client = tenantClient(tenantA.jwt)
    const { error } = await client
      .from('file_assignments')
      .update({ notes: 'admin-updated' })
      .eq('id', assignmentForAdmin)

    expect(error).toBeNull()
  })

  // T8: Assigned reviewer can UPDATE own assignment
  it('T8: assigned native reviewer can UPDATE own assignment', async () => {
    const client = tenantClient(nativeUser.jwt)
    const { error } = await client
      .from('file_assignments')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', assignmentForNative)

    expect(error).toBeNull()
  })

  // T9: Admin can DELETE assignments
  it('T9: admin can DELETE assignments', async () => {
    // Create a temp file + assignment, then delete via admin client
    const { data: tempFile } = await admin
      .from('files')
      .insert({
        project_id: projectId,
        tenant_id: tenantA.id,
        file_name: 'test-t9.sdlxliff',
        file_type: 'sdlxliff',
        file_size_bytes: 256,
        storage_path: `${tenantA.id}/${projectId}/t9/test-t9.sdlxliff`,
      })
      .select('id')
      .single()

    const { data: tempAssignment } = await admin
      .from('file_assignments')
      .insert({
        file_id: tempFile!.id,
        project_id: projectId,
        tenant_id: tenantA.id,
        assigned_to: nativeUser.id,
        assigned_by: tenantA.userId,
        status: 'assigned',
      })
      .select('id')
      .single()

    const client = tenantClient(tenantA.jwt)
    const { data } = await client
      .from('file_assignments')
      .delete()
      .eq('id', tempAssignment!.id)
      .select('id')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.id).toBe(tempAssignment!.id)

    // Cleanup temp file
    await admin.from('files').delete().eq('id', tempFile!.id)
  })

  // T10: Native reviewer cannot DELETE
  it('T10: native reviewer cannot DELETE assignments', async () => {
    const client = tenantClient(nativeUser.jwt)
    const { error } = await client.from('file_assignments').delete().eq('id', assignmentForNative)

    // RLS should prevent this — either error or no rows affected
    // Supabase returns no error but 0 rows for RLS denial on DELETE
    const { data: check } = await admin
      .from('file_assignments')
      .select('id')
      .eq('id', assignmentForNative)
      .single()

    expect(check).not.toBeNull() // Row still exists
  })
})
