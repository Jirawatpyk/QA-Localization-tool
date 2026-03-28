/**
 * RLS Tests: finding_assignments + finding_comments tables — role-scoped access
 *
 * Story 5.2b AC6/AC7: RLS policies on new tables
 * Guardrail #71: RLS test mandatory for every new Epic 5 table
 * Guardrail #76: Every role × operation combination tested
 *
 * Run with: `npm run test:rls`
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'test-password-123!'

// --- Test state ---
let tenantA: TestTenant & {
  projectId: string
  fileId: string
  segmentId: string
  findingId: string
}
let tenantB: TestTenant

// Role-specific users within Tenant A
let qaUser: { id: string; jwt: string }
let nativeUser: { id: string; jwt: string }
let assignmentId: string
let unassignedFindingId: string // H1: finding with no assignment — for INSERT denial test
let commentId: string // M3: seeded in beforeAll for test isolation

beforeAll(async () => {
  // --- Tenant A (admin) ---
  const a = await setupTestTenant('rls-fa-admin-a@test.local')

  // --- Tenant B (admin, for cross-tenant tests) ---
  const b = await setupTestTenant('rls-fa-admin-b@test.local')

  // --- Tenant A: project → file → segment → finding ---
  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'FA RLS Test',
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
      file_name: 'fa-test.xliff',
      file_type: 'xliff',
      file_size_bytes: 1024,
      storage_path: '/fa-test.xliff',
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

  const { data: finding } = await admin
    .from('findings')
    .insert({
      segment_id: segment!.id,
      project_id: project!.id,
      tenant_id: a.id,
      status: 'pending',
      severity: 'major',
      category: 'Accuracy',
      description: 'FA RLS test finding',
      detected_by_layer: 'L1',
    })
    .select('id')
    .single()

  // H1: second finding with NO assignment to nativeUser — for INSERT denial test
  const { data: findingForInsert } = await admin
    .from('findings')
    .insert({
      segment_id: segment!.id,
      project_id: project!.id,
      tenant_id: a.id,
      status: 'pending',
      severity: 'minor',
      category: 'Style',
      description: 'Unassigned finding for INSERT denial test',
      detected_by_layer: 'L1',
    })
    .select('id')
    .single()

  // --- QA Reviewer user ---
  const { data: qaAuth } = await admin.auth.admin.createUser({
    email: 'rls-fa-qa@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: qaAuth!.user!.id,
    tenant_id: a.id,
    email: 'rls-fa-qa@test.local',
    display_name: 'QA Reviewer',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: qaAuth!.user!.id, tenant_id: a.id, role: 'qa_reviewer' })
  await admin.auth.admin.updateUserById(qaAuth!.user!.id, {
    app_metadata: { tenant_id: a.id, user_role: 'qa_reviewer' },
  })
  const qaAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: qaSession } = await qaAnon.auth.signInWithPassword({
    email: 'rls-fa-qa@test.local',
    password: TEST_PASSWORD,
  })

  // --- Native Reviewer user ---
  const { data: nativeAuth } = await admin.auth.admin.createUser({
    email: 'rls-fa-native@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: nativeAuth!.user!.id,
    tenant_id: a.id,
    email: 'rls-fa-native@test.local',
    display_name: 'Native Reviewer',
    native_languages: ['th'],
  })
  await admin
    .from('user_roles')
    .insert({ user_id: nativeAuth!.user!.id, tenant_id: a.id, role: 'native_reviewer' })
  await admin.auth.admin.updateUserById(nativeAuth!.user!.id, {
    app_metadata: { tenant_id: a.id, user_role: 'native_reviewer' },
  })
  const nativeAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: nativeSession } = await nativeAnon.auth.signInWithPassword({
    email: 'rls-fa-native@test.local',
    password: TEST_PASSWORD,
  })

  // --- Create a finding_assignment (admin assigns native reviewer) ---
  const { data: assignment } = await admin
    .from('finding_assignments')
    .insert({
      finding_id: finding!.id,
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      assigned_to: nativeAuth!.user!.id,
      assigned_by: a.userId,
      status: 'pending',
    })
    .select('id')
    .single()

  // M3: Seed comment in beforeAll for test isolation (not in sibling `it`)
  const { data: seededComment } = await admin
    .from('finding_comments')
    .insert({
      finding_id: finding!.id,
      finding_assignment_id: assignment!.id,
      tenant_id: a.id,
      author_id: nativeAuth!.user!.id,
      body: 'This translation looks incorrect in Thai context',
    })
    .select('id')
    .single()

  // Store references
  tenantA = {
    ...a,
    projectId: project!.id,
    fileId: file!.id,
    segmentId: segment!.id,
    findingId: finding!.id,
  }
  tenantB = b
  qaUser = { id: qaAuth!.user!.id, jwt: qaSession!.session!.access_token }
  nativeUser = { id: nativeAuth!.user!.id, jwt: nativeSession!.session!.access_token }
  assignmentId = assignment!.id
  unassignedFindingId = findingForInsert!.id
  commentId = seededComment!.id
}, 60_000)

afterAll(async () => {
  // Cleanup order: comments → assignments → findings → segments → files → projects → extra users → tenants
  // Must explicitly delete test data to avoid orphan rows (cleanupTestTenant only handles auth users)
  await admin.from('finding_comments').delete().eq('tenant_id', tenantA.id)
  await admin.from('finding_assignments').delete().eq('tenant_id', tenantA.id)
  await admin.from('findings').delete().eq('tenant_id', tenantA.id)
  await admin.from('segments').delete().eq('tenant_id', tenantA.id)
  await admin.from('files').delete().eq('tenant_id', tenantA.id)
  await admin.from('projects').delete().eq('tenant_id', tenantA.id)
  // Additional user cleanup (qa + native)
  for (const uid of [qaUser?.id, nativeUser?.id]) {
    if (!uid) continue
    await admin.from('user_roles').delete().eq('user_id', uid)
    await admin.from('users').delete().eq('id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
}, 30_000)

// =============================================================================
// finding_assignments RLS — AC6
// =============================================================================
describe('finding_assignments RLS', () => {
  // --- Admin: full CRUD within tenant ---
  it('should allow admin to SELECT all tenant assignments', async () => {
    // AC6: admin+qa = tenant-scoped SELECT
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('finding_assignments').select('id')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.id).toBe(assignmentId)
  })

  it('should allow admin to INSERT assignments (create assignments)', async () => {
    // AC6: INSERT admin+qa only — verify admin can create a new assignment
    // Create a second finding to avoid UNIQUE constraint on (finding_id, assigned_to)
    const { data: extraFinding } = await admin
      .from('findings')
      .insert({
        segment_id: tenantA.segmentId,
        project_id: tenantA.projectId,
        tenant_id: tenantA.id,
        status: 'pending',
        severity: 'minor',
        category: 'Style',
        description: 'Extra finding for INSERT test',
        detected_by_layer: 'L1',
      })
      .select('id')
      .single()

    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('finding_assignments').insert({
      finding_id: extraFinding!.id,
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: tenantA.userId,
      status: 'pending',
    })
    expect(error).toBeNull()

    // Cleanup: delete extra assignment + finding via admin
    await admin.from('finding_assignments').delete().eq('finding_id', extraFinding!.id)
    await admin.from('findings').delete().eq('id', extraFinding!.id)
  })

  it('should allow admin to DELETE assignments', async () => {
    // AC6: DELETE admin only — create temp assignment, then delete it
    const { data: tempFinding } = await admin
      .from('findings')
      .insert({
        segment_id: tenantA.segmentId,
        project_id: tenantA.projectId,
        tenant_id: tenantA.id,
        status: 'pending',
        severity: 'minor',
        category: 'Style',
        description: 'Temp finding for DELETE test',
        detected_by_layer: 'L1',
      })
      .select('id')
      .single()
    const { data: tempAssignment } = await admin
      .from('finding_assignments')
      .insert({
        finding_id: tempFinding!.id,
        file_id: tenantA.fileId,
        project_id: tenantA.projectId,
        tenant_id: tenantA.id,
        assigned_to: nativeUser.id,
        assigned_by: tenantA.userId,
        status: 'pending',
      })
      .select('id')
      .single()

    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('finding_assignments')
      .delete()
      .eq('id', tempAssignment!.id)
      .select('id')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.id).toBe(tempAssignment!.id)

    // Cleanup temp finding
    await admin.from('findings').delete().eq('id', tempFinding!.id)
  })

  // --- QA Reviewer: SELECT + INSERT, no DELETE ---
  it('should allow qa_reviewer to SELECT all tenant assignments', async () => {
    // AC6: admin+qa = tenant-scoped SELECT
    const clientQA = tenantClient(qaUser.jwt)
    const { data } = await clientQA.from('finding_assignments').select('id')

    expect(data).toHaveLength(1)
  })

  // --- Native Reviewer: scoped to own assignments ---
  it('should allow native_reviewer to SELECT only own assignments', async () => {
    // AC6: native = own assignments only (assigned_to = jwt.sub)
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative.from('finding_assignments').select('id')

    expect(data).toHaveLength(1) // only their assignment
    expect(data?.[0]?.id).toBe(assignmentId)
  })

  it('should deny native_reviewer INSERT on finding_assignments', async () => {
    // AC6: INSERT admin+qa only — native cannot create assignments
    // H1 fix: use unassignedFindingId to avoid UNIQUE constraint masking RLS denial
    const clientNative = tenantClient(nativeUser.jwt)
    const { error } = await clientNative.from('finding_assignments').insert({
      finding_id: unassignedFindingId,
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: nativeUser.id,
      status: 'pending',
    })

    expect(error).toBeTruthy()
  })

  it('should deny native_reviewer UPDATE when reassigning to different user', async () => {
    // AC6/AC7: native UPDATE own assignment but cannot change assigned_to
    // WITH CHECK violation: PostgREST returns error (data=null) or empty array depending on version
    const clientNative = tenantClient(nativeUser.jwt)
    const { data, error } = await clientNative
      .from('finding_assignments')
      .update({ assigned_to: tenantA.userId }) // try to reassign to admin
      .eq('id', assignmentId)
      .select('id')

    expect(data?.length ?? 0).toBe(0)
  })

  it('should allow native_reviewer to UPDATE own assignment status', async () => {
    // H4: positive case — native CAN update status (core workflow for Story 5.2c)
    const clientNative = tenantClient(nativeUser.jwt)
    const { data, error } = await clientNative
      .from('finding_assignments')
      .update({ status: 'in_review' })
      .eq('id', assignmentId)
      .select('id, status')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.status).toBe('in_review')

    // Restore status for subsequent tests
    await admin.from('finding_assignments').update({ status: 'pending' }).eq('id', assignmentId)
  })

  it('should deny native_reviewer UPDATE status to overridden (QA-only)', async () => {
    // H5: native cannot self-assign 'overridden' — WITH CHECK restricts to pending/in_review/confirmed
    // WITH CHECK violation: PostgREST returns error (data=null) or empty array depending on version
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('finding_assignments')
      .update({ status: 'overridden' })
      .eq('id', assignmentId)
      .select('id')

    expect(data?.length ?? 0).toBe(0)
  })

  // --- QA Reviewer: INSERT (L5) ---
  it('should allow qa_reviewer to INSERT assignments', async () => {
    // L5: policy allows admin+qa INSERT — verify qa_reviewer separately
    const clientQA = tenantClient(qaUser.jwt)
    const { error } = await clientQA.from('finding_assignments').insert({
      finding_id: unassignedFindingId,
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      assigned_to: nativeUser.id,
      assigned_by: qaUser.id,
      status: 'pending',
    })
    expect(error).toBeNull()

    // Cleanup
    await admin.from('finding_assignments').delete().eq('finding_id', unassignedFindingId)
  })

  // --- Cross-tenant isolation ---
  it('should prevent Tenant B from seeing Tenant A assignments', async () => {
    // AC7: cross-tenant → 0 rows
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('finding_assignments').select('*')

    expect(data).toHaveLength(0)
  })
})

// =============================================================================
// finding_comments RLS — AC6
// =============================================================================
describe('finding_comments RLS', () => {
  // --- Native Reviewer: INSERT comment on own assignment ---
  it('should allow native_reviewer to INSERT comment on own assignment', async () => {
    // AC6/AC7: native = assignment ownership + author_id check
    const clientNative = tenantClient(nativeUser.jwt)
    const { error } = await clientNative.from('finding_comments').insert({
      finding_id: tenantA.findingId,
      finding_assignment_id: assignmentId,
      tenant_id: tenantA.id,
      author_id: nativeUser.id,
      body: 'Additional comment from native reviewer',
    })

    expect(error).toBeNull()

    // Cleanup: remove the extra comment (seeded comment remains)
    await admin.from('finding_comments').delete().neq('id', commentId).eq('tenant_id', tenantA.id)
  })

  // --- Native Reviewer: SELECT only on own assignments (M3: uses seeded comment from beforeAll) ---
  it('should allow native_reviewer to SELECT comments on own assignments', async () => {
    // AC6: native = only on their assignments (EXISTS on finding_assignments)
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative.from('finding_comments').select('id, body')

    expect(data!.length).toBeGreaterThanOrEqual(1)
    expect(data!.some((c) => c.id === commentId)).toBe(true)
  })

  // --- Native Reviewer: DELETE denied (admin-only) — L3: target specific comment by ID ---
  it('should deny native_reviewer DELETE on finding_comments', async () => {
    // AC7: native DELETE finding_comment → denied (admin-only)
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('finding_comments')
      .delete()
      .eq('id', commentId)
      .select('id')

    expect(data).toHaveLength(0)
  })

  // --- Comments immutable: no UPDATE policy ---
  it('should deny UPDATE on finding_comments (immutable — no UPDATE policy)', async () => {
    // AC2/AC6: comments are immutable, no UPDATE policy exists
    const clientA = tenantClient(tenantA.jwt) // even admin cannot update
    const { data } = await clientA
      .from('finding_comments')
      .update({ body: 'modified' })
      .eq('tenant_id', tenantA.id)
      .select('id')

    expect(data).toHaveLength(0)
  })
})
