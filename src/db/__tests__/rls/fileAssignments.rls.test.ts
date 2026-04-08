/**
 * RLS Tests: file_assignments — role-scoped access (Story 6.1 AC5 + S-FIX-7 AC2)
 *
 * T1: Admin sees all tenant file_assignments (SELECT)
 * T2: QA reviewer sees all tenant file_assignments (SELECT)
 * T3: Native reviewer sees ALL tenant assignments (SELECT — expanded in S-FIX-7)
 * T4: Cross-tenant isolation (Tenant B cannot see Tenant A)
 * T5: Admin can INSERT file_assignments
 * T6: QA reviewer can INSERT file_assignments
 * T7: Admin can UPDATE any assignment in tenant
 * T8: Assigned reviewer can UPDATE own assignment
 * T9: Admin can DELETE assignments
 * T10: Native reviewer cannot DELETE assignments
 * T11: Native reviewer can INSERT own self-assignment (S-FIX-7)
 * T12: Native reviewer CANNOT insert assignment for another user (S-FIX-7)
 * T13: Native reviewer can SELECT another reviewer's assignment (S-FIX-7 lock visibility)
 * T14: Cross-tenant native reviewer cannot see other tenant's assignments (S-FIX-7)
 *
 * Run with: `npm run test:rls`
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'test-password-123!'

let tenantA: TestTenant
let tenantB: TestTenant
let nativeUser: { id: string; jwt: string }
let nativeUser2: { id: string; jwt: string }
let nativeTenantB: { id: string; jwt: string }
let qaUser: { id: string; jwt: string }
let projectId: string
let fileId: string
let file2Id: string
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

  // Second native reviewer in Tenant A (for T13: lock visibility)
  const { data: native2Auth } = await admin.auth.admin.createUser({
    email: 'rls-fa-native2@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: native2Auth!.user!.id,
    tenant_id: tenantA.id,
    email: 'rls-fa-native2@test.local',
    display_name: 'Native User 2',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: native2Auth!.user!.id, tenant_id: tenantA.id, role: 'native_reviewer' })
  await admin.auth.admin.updateUserById(native2Auth!.user!.id, {
    app_metadata: { tenant_id: tenantA.id, user_role: 'native_reviewer' },
  })
  const native2Anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: native2Session } = await native2Anon.auth.signInWithPassword({
    email: 'rls-fa-native2@test.local',
    password: TEST_PASSWORD,
  })
  nativeUser2 = { id: native2Auth!.user!.id, jwt: native2Session!.session!.access_token }

  // Native reviewer in Tenant B (for T14: cross-tenant isolation)
  const { data: nativeBAuth } = await admin.auth.admin.createUser({
    email: 'rls-fa-native-b@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: nativeBAuth!.user!.id,
    tenant_id: tenantB.id,
    email: 'rls-fa-native-b@test.local',
    display_name: 'Native Tenant B',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: nativeBAuth!.user!.id, tenant_id: tenantB.id, role: 'native_reviewer' })
  await admin.auth.admin.updateUserById(nativeBAuth!.user!.id, {
    app_metadata: { tenant_id: tenantB.id, user_role: 'native_reviewer' },
  })
  const nativeBAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: nativeBSession } = await nativeBAnon.auth.signInWithPassword({
    email: 'rls-fa-native-b@test.local',
    password: TEST_PASSWORD,
  })
  nativeTenantB = { id: nativeBAuth!.user!.id, jwt: nativeBSession!.session!.access_token }

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
  file2Id = file2!.id

  const { data: a2 } = await admin
    .from('file_assignments')
    .insert({
      file_id: file2Id,
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
  for (const email of [
    'rls-fa-qa@test.local',
    'rls-fa-native@test.local',
    'rls-fa-native2@test.local',
    'rls-fa-native-b@test.local',
  ]) {
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

  // T3: Native reviewer sees ALL tenant assignments (S-FIX-7 expanded SELECT)
  it('T3: native reviewer sees ALL tenant file_assignments', async () => {
    const client = tenantClient(nativeUser.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id')
      .eq('project_id', projectId)

    expect(error).toBeNull()
    // S-FIX-7: native_reviewer now has tenant-wide SELECT (lock visibility)
    expect(data!.length).toBeGreaterThanOrEqual(2)
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
    await client.from('file_assignments').delete().eq('id', assignmentForNative)

    // RLS should prevent this — either error or no rows affected
    // Supabase returns no error but 0 rows for RLS denial on DELETE
    const { data: check } = await admin
      .from('file_assignments')
      .select('id')
      .eq('id', assignmentForNative)
      .single()

    expect(check).not.toBeNull() // Row still exists
  })

  // === S-FIX-7: Self-assign + Lock Visibility ===

  // T11: Native reviewer can INSERT own self-assignment
  it('T11: native reviewer can INSERT own self-assignment', async () => {
    // Create a temp file to avoid partial unique index conflict
    const { data: tempFile } = await admin
      .from('files')
      .insert({
        project_id: projectId,
        tenant_id: tenantA.id,
        file_name: 'test-t11.sdlxliff',
        file_type: 'sdlxliff',
        file_size_bytes: 256,
        storage_path: `${tenantA.id}/${projectId}/t11/test-t11.sdlxliff`,
      })
      .select('id')
      .single()

    const client = tenantClient(nativeUser.jwt)
    const { error } = await client.from('file_assignments').insert({
      file_id: tempFile!.id,
      project_id: projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: nativeUser.id, // Self-assign: assigned_to = assigned_by = self
      status: 'in_progress',
    })

    expect(error).toBeNull()

    // Cleanup
    await admin.from('file_assignments').delete().eq('file_id', tempFile!.id)
    await admin.from('files').delete().eq('id', tempFile!.id)
  })

  // T12: Native reviewer CANNOT insert assignment for another user
  it('T12: native reviewer CANNOT insert assignment for another user', async () => {
    const { data: tempFile } = await admin
      .from('files')
      .insert({
        project_id: projectId,
        tenant_id: tenantA.id,
        file_name: 'test-t12.sdlxliff',
        file_type: 'sdlxliff',
        file_size_bytes: 256,
        storage_path: `${tenantA.id}/${projectId}/t12/test-t12.sdlxliff`,
      })
      .select('id')
      .single()

    const client = tenantClient(nativeUser.jwt)

    // Try to assign to nativeUser2 (not self) — should be blocked by RLS
    const { error } = await client.from('file_assignments').insert({
      file_id: tempFile!.id,
      project_id: projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser2.id, // NOT self
      assigned_by: nativeUser.id,
      status: 'assigned',
    })

    // RLS should block: native_reviewer INSERT requires assigned_to = assigned_by = auth.uid()
    expect(error).not.toBeNull()

    // Cleanup temp file
    await admin.from('file_assignments').delete().eq('file_id', tempFile!.id)
    await admin.from('files').delete().eq('id', tempFile!.id)
  })

  // T13: Native reviewer can SELECT another reviewer's active assignment (lock visibility)
  it("T13: native reviewer can see another reviewer's assignment", async () => {
    // nativeUser2 should see nativeUser's assignment on file2 (assigned to nativeUser)
    const client = tenantClient(nativeUser2.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id, assigned_to')
      .eq('file_id', file2Id)

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(1)
    // Should include nativeUser's assignment
    const nativeAssignment = data!.find((a) => a.assigned_to === nativeUser.id)
    expect(nativeAssignment).toBeDefined()
  })

  // T14: Cross-tenant native reviewer cannot see other tenant's assignments
  it('T14: cross-tenant native reviewer cannot see other tenant assignments', async () => {
    const client = tenantClient(nativeTenantB.jwt)
    const { data, error } = await client
      .from('file_assignments')
      .select('id')
      .eq('project_id', projectId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
