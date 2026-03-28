/**
 * RLS Tests: Native Reviewer scoped access on EXISTING tables
 *
 * Story 5.2b AC5/AC7: Role-scoped RLS policies on findings, segments, review_actions
 * Tests that native_reviewer can ONLY access data linked via finding_assignments
 *
 * Guardrail #62: EXISTS subquery pattern for native-scoped policies
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
  findingAssignedId: string
  findingUnassignedId: string
  segmentAssignedId: string
  segmentUnassignedId: string
}
let tenantB: TestTenant & {
  nativeUserId: string
  nativeJwt: string
}

// Role-specific users within Tenant A
let qaUser: { id: string; jwt: string }
let nativeUser: { id: string; jwt: string }
let assignmentId: string
let seededReviewActionId: string // M2: seeded in beforeAll for SELECT test independence

beforeAll(async () => {
  // --- Tenant A (admin) ---
  const a = await setupTestTenant('rls-scoped-admin-a@test.local')

  // --- Tenant B (admin + native — for cross-tenant test) ---
  const b = await setupTestTenant('rls-scoped-admin-b@test.local')

  // H2: Seed finding in Tenant B (without assignment) so "0 findings" test exercises EXISTS policy
  const { data: projectB } = await admin
    .from('projects')
    .insert({
      tenant_id: b.id,
      name: 'Tenant B Project',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()
  const { data: fileB } = await admin
    .from('files')
    .insert({
      project_id: projectB!.id,
      tenant_id: b.id,
      file_name: 'tenant-b-test.xliff',
      file_type: 'xliff',
      file_size_bytes: 512,
      storage_path: '/tenant-b-test.xliff',
      status: 'parsed',
    })
    .select('id')
    .single()
  const { data: segmentB } = await admin
    .from('segments')
    .insert({
      file_id: fileB!.id,
      project_id: projectB!.id,
      tenant_id: b.id,
      segment_number: 1,
      source_text: 'Tenant B test',
      target_text: 'ทดสอบ Tenant B',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 3,
    })
    .select('id')
    .single()
  await admin.from('findings').insert({
    segment_id: segmentB!.id,
    project_id: projectB!.id,
    tenant_id: b.id,
    status: 'pending',
    severity: 'major',
    category: 'Accuracy',
    description: 'Tenant B finding — no assignment to native reviewer',
    detected_by_layer: 'L1',
  })

  // --- Tenant A: project → file → 2 segments → 2 findings ---
  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'Scoped Access Test',
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
      file_name: 'scoped-test.xliff',
      file_type: 'xliff',
      file_size_bytes: 2048,
      storage_path: '/scoped-test.xliff',
      status: 'parsed',
    })
    .select('id')
    .single()

  // Segment 1 — will have an assigned finding
  const { data: segAssigned } = await admin
    .from('segments')
    .insert({
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      segment_number: 1,
      source_text: 'Good morning',
      target_text: 'สวัสดีตอนเช้า',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 2,
    })
    .select('id')
    .single()

  // Segment 2 — will have an UNassigned finding
  const { data: segUnassigned } = await admin
    .from('segments')
    .insert({
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      segment_number: 2,
      source_text: 'Good evening',
      target_text: 'สวัสดีตอนเย็น',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 2,
    })
    .select('id')
    .single()

  // Finding 1 — assigned to native reviewer
  const { data: findingAssigned } = await admin
    .from('findings')
    .insert({
      segment_id: segAssigned!.id,
      project_id: project!.id,
      tenant_id: a.id,
      status: 'pending',
      severity: 'major',
      category: 'Accuracy',
      description: 'Assigned finding for scoped test',
      detected_by_layer: 'L1',
    })
    .select('id')
    .single()

  // Finding 2 — NOT assigned to native reviewer
  const { data: findingUnassigned } = await admin
    .from('findings')
    .insert({
      segment_id: segUnassigned!.id,
      project_id: project!.id,
      tenant_id: a.id,
      status: 'pending',
      severity: 'minor',
      category: 'Style',
      description: 'Unassigned finding for scoped test',
      detected_by_layer: 'L2',
    })
    .select('id')
    .single()

  // --- QA Reviewer user in Tenant A ---
  const { data: qaAuth } = await admin.auth.admin.createUser({
    email: 'rls-scoped-qa@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: qaAuth!.user!.id,
    tenant_id: a.id,
    email: 'rls-scoped-qa@test.local',
    display_name: 'QA Scoped',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: qaAuth!.user!.id, tenant_id: a.id, role: 'qa_reviewer' })
  await admin.auth.admin.updateUserById(qaAuth!.user!.id, {
    app_metadata: { tenant_id: a.id, user_role: 'qa_reviewer' },
  })
  const qaAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: qaSession } = await qaAnon.auth.signInWithPassword({
    email: 'rls-scoped-qa@test.local',
    password: TEST_PASSWORD,
  })

  // --- Native Reviewer user in Tenant A ---
  const { data: nativeAuth } = await admin.auth.admin.createUser({
    email: 'rls-scoped-native@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: nativeAuth!.user!.id,
    tenant_id: a.id,
    email: 'rls-scoped-native@test.local',
    display_name: 'Native Scoped',
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
    email: 'rls-scoped-native@test.local',
    password: TEST_PASSWORD,
  })

  // --- Native Reviewer in Tenant B (cross-tenant test) ---
  const { data: nativeBAuth } = await admin.auth.admin.createUser({
    email: 'rls-scoped-native-b@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: nativeBAuth!.user!.id,
    tenant_id: b.id,
    email: 'rls-scoped-native-b@test.local',
    display_name: 'Native B',
    native_languages: ['th'],
  })
  await admin
    .from('user_roles')
    .insert({ user_id: nativeBAuth!.user!.id, tenant_id: b.id, role: 'native_reviewer' })
  await admin.auth.admin.updateUserById(nativeBAuth!.user!.id, {
    app_metadata: { tenant_id: b.id, user_role: 'native_reviewer' },
  })
  const nativeBAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: nativeBSession } = await nativeBAnon.auth.signInWithPassword({
    email: 'rls-scoped-native-b@test.local',
    password: TEST_PASSWORD,
  })

  // --- Create finding_assignment: assign Finding 1 to native reviewer ---
  const { data: assignment } = await admin
    .from('finding_assignments')
    .insert({
      finding_id: findingAssigned!.id,
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      assigned_to: nativeAuth!.user!.id,
      assigned_by: a.userId,
      status: 'pending',
    })
    .select('id')
    .single()

  // M2: Seed review_action in beforeAll for SELECT test independence (no cross-test dependency)
  const { data: seededRA } = await admin
    .from('review_actions')
    .insert({
      finding_id: findingAssigned!.id,
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      user_id: nativeAuth!.user!.id,
      action_type: 'status_change',
      previous_state: 'pending',
      new_state: 'noted',
    })
    .select('id')
    .single()

  // Store references
  tenantA = {
    ...a,
    projectId: project!.id,
    fileId: file!.id,
    segmentId: segAssigned!.id,
    findingAssignedId: findingAssigned!.id,
    findingUnassignedId: findingUnassigned!.id,
    segmentAssignedId: segAssigned!.id,
    segmentUnassignedId: segUnassigned!.id,
  }
  tenantB = {
    ...b,
    nativeUserId: nativeBAuth!.user!.id,
    nativeJwt: nativeBSession!.session!.access_token,
  }
  qaUser = { id: qaAuth!.user!.id, jwt: qaSession!.session!.access_token }
  nativeUser = { id: nativeAuth!.user!.id, jwt: nativeSession!.session!.access_token }
  assignmentId = assignment!.id
  seededReviewActionId = seededRA!.id
}, 90_000)

afterAll(async () => {
  // Cleanup order: comments → review_actions → assignments → findings → segments → files → projects → extra users → tenants
  // Must explicitly delete test data to avoid orphan rows (cleanupTestTenant only handles auth users)
  await admin.from('finding_comments').delete().eq('tenant_id', tenantA.id)
  await admin.from('review_actions').delete().eq('tenant_id', tenantA.id)
  await admin.from('finding_assignments').delete().eq('tenant_id', tenantA.id)
  await admin.from('findings').delete().eq('tenant_id', tenantA.id)
  await admin.from('segments').delete().eq('tenant_id', tenantA.id)
  await admin.from('files').delete().eq('tenant_id', tenantA.id)
  await admin.from('projects').delete().eq('tenant_id', tenantA.id)

  // Cleanup extra users in Tenant A (qa + native)
  for (const uid of [qaUser?.id, nativeUser?.id]) {
    if (!uid) continue
    await admin.from('user_roles').delete().eq('user_id', uid)
    await admin.from('users').delete().eq('id', uid)
    await admin.auth.admin.deleteUser(uid)
  }

  // Cleanup Tenant B data (H2: seeded finding/segment/file/project)
  await admin.from('findings').delete().eq('tenant_id', tenantB.id)
  await admin.from('segments').delete().eq('tenant_id', tenantB.id)
  await admin.from('files').delete().eq('tenant_id', tenantB.id)
  await admin.from('projects').delete().eq('tenant_id', tenantB.id)

  // Cleanup Tenant B native user
  if (tenantB?.nativeUserId) {
    await admin.from('user_roles').delete().eq('user_id', tenantB.nativeUserId)
    await admin.from('users').delete().eq('id', tenantB.nativeUserId)
    await admin.auth.admin.deleteUser(tenantB.nativeUserId)
  }

  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
}, 30_000)

// =============================================================================
// findings — Native Reviewer scoped SELECT/UPDATE (AC5)
// =============================================================================
describe('findings — native reviewer scoped access', () => {
  it('should return 0 findings for native_reviewer with NO assignments', async () => {
    // AC7: Native reviewer SELECT findings — not assigned → 0 rows
    // Use Tenant B's native reviewer who has no assignments in Tenant B
    const clientNativeB = tenantClient(tenantB.nativeJwt)
    const { data } = await clientNativeB.from('findings').select('id')

    expect(data).toHaveLength(0)
  })

  it('should return only assigned findings for native_reviewer', async () => {
    // AC7: Native reviewer SELECT findings — assigned → only assigned rows
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative.from('findings').select('id, description')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.id).toBe(tenantA.findingAssignedId)
    // Must NOT include the unassigned finding
  })

  it('should allow native_reviewer to UPDATE assigned finding', async () => {
    // AC7: Native reviewer UPDATE assigned finding → success
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('findings')
      .update({ status: 'noted' })
      .eq('id', tenantA.findingAssignedId)
      .select('id')

    expect(data).toHaveLength(1)
  })

  it('should deny native_reviewer UPDATE on non-assigned finding (0 rows affected)', async () => {
    // AC7: Native reviewer UPDATE non-assigned finding → 0 rows affected
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('findings')
      .update({ status: 'noted' })
      .eq('id', tenantA.findingUnassignedId)
      .select('id')

    expect(data).toHaveLength(0)
  })
})

// =============================================================================
// segments — Native Reviewer scoped SELECT (AC5)
// =============================================================================
describe('segments — native reviewer scoped access', () => {
  it('should return only segments linked to assigned findings for native_reviewer', async () => {
    // AC7: Native reviewer SELECT segments — only via assigned findings
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative.from('segments').select('id, segment_number')

    // Should only see segment linked to the assigned finding
    expect(data).toHaveLength(1)
    expect(data?.[0]?.id).toBe(tenantA.segmentAssignedId)
  })

  // L6: native reviewer write denial on segments (role-scoped policies)
  it('should deny native_reviewer INSERT on segments', async () => {
    const clientNative = tenantClient(nativeUser.jwt)
    const { error } = await clientNative.from('segments').insert({
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      segment_number: 99,
      source_text: 'Native insert',
      target_text: 'ทดสอบ',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 1,
    })
    expect(error).toBeTruthy()
  })

  it('should deny native_reviewer DELETE on segments', async () => {
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('segments')
      .delete()
      .eq('id', tenantA.segmentAssignedId)
      .select('id')
    expect(data).toHaveLength(0)
  })
})

// =============================================================================
// review_actions — Native Reviewer scoped SELECT + INSERT (AC5, G1 fix)
// =============================================================================
describe('review_actions — native reviewer scoped access', () => {
  it('should allow native_reviewer to INSERT review_action on assigned finding', async () => {
    // AC7: Native reviewer INSERT review_action on assigned finding → success (G1 fix)
    const clientNative = tenantClient(nativeUser.jwt)
    const { error } = await clientNative.from('review_actions').insert({
      finding_id: tenantA.findingAssignedId,
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      user_id: nativeUser.id,
      action_type: 'status_change',
      previous_state: 'pending',
      new_state: 'noted',
    })

    expect(error).toBeNull()
  })

  it('should deny native_reviewer INSERT review_action on non-assigned finding', async () => {
    // AC7: Native reviewer INSERT review_action on non-assigned → denied
    const clientNative = tenantClient(nativeUser.jwt)
    const { error } = await clientNative.from('review_actions').insert({
      finding_id: tenantA.findingUnassignedId,
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      user_id: nativeUser.id,
      action_type: 'status_change',
      previous_state: 'pending',
      new_state: 'noted',
    })

    expect(error).toBeTruthy()
  })

  // H3: review_actions SELECT native — policy coverage (M2: uses seeded data from beforeAll)
  it('should allow native_reviewer to SELECT review_actions on assigned finding', async () => {
    // review_actions_select_native policy: EXISTS on finding_assignments
    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('review_actions')
      .select('id, finding_id')
      .eq('finding_id', tenantA.findingAssignedId)

    expect(data!.length).toBeGreaterThanOrEqual(1)
    expect(data!.some((r) => r.id === seededReviewActionId)).toBe(true)
  })

  it('should deny native_reviewer SELECT review_actions on non-assigned finding', async () => {
    // Seed a review_action on the unassigned finding via admin, then verify native can't see it
    await admin.from('review_actions').insert({
      finding_id: tenantA.findingUnassignedId,
      file_id: tenantA.fileId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      user_id: tenantA.userId,
      action_type: 'status_change',
      previous_state: 'pending',
      new_state: 'noted',
    })

    const clientNative = tenantClient(nativeUser.jwt)
    const { data } = await clientNative
      .from('review_actions')
      .select('id')
      .eq('finding_id', tenantA.findingUnassignedId)

    expect(data).toHaveLength(0)
  })
})

// =============================================================================
// finding_comments — Native Reviewer scoped INSERT (AC5/AC6)
// =============================================================================
describe('finding_comments — native reviewer scoped access', () => {
  it('should allow native_reviewer to INSERT comment on own assignment', async () => {
    // AC7: Native reviewer INSERT finding_comment on assigned → success
    const clientNative = tenantClient(nativeUser.jwt)
    const { error } = await clientNative.from('finding_comments').insert({
      finding_id: tenantA.findingAssignedId,
      finding_assignment_id: assignmentId,
      tenant_id: tenantA.id,
      author_id: nativeUser.id,
      body: 'The Thai translation misses the formal tone',
    })

    expect(error).toBeNull()
  })

  it('should deny native_reviewer INSERT comment on unassigned finding', async () => {
    // AC7: Native reviewer INSERT finding_comment on unassigned → denied
    const clientNative = tenantClient(nativeUser.jwt)
    // This should fail because the native reviewer has no assignment for this finding
    const { error } = await clientNative.from('finding_comments').insert({
      finding_id: tenantA.findingUnassignedId,
      finding_assignment_id: assignmentId, // valid assignment but mismatched finding_id — EXISTS checks fa.finding_id = comment.finding_id
      tenant_id: tenantA.id,
      author_id: nativeUser.id,
      body: 'Should be denied',
    })

    expect(error).toBeTruthy()
  })
})

// =============================================================================
// Regression: admin + qa_reviewer still have full tenant access (AC5)
// =============================================================================
describe('regression — admin + qa_reviewer full tenant access', () => {
  it('should allow qa_reviewer to SELECT all tenant findings (no regression)', async () => {
    // AC7: QA reviewer SELECT findings → all tenant findings
    const clientQA = tenantClient(qaUser.jwt)
    const { data } = await clientQA.from('findings').select('id')

    expect(data).toHaveLength(2) // both assigned + unassigned
  })

  it('should allow admin to SELECT all tenant findings (no regression)', async () => {
    // AC7: Admin SELECT findings → all tenant findings
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('findings').select('id')

    expect(data).toHaveLength(2) // both assigned + unassigned
  })
})

// =============================================================================
// Cross-tenant isolation (AC7)
// =============================================================================
describe('cross-tenant — native reviewer isolation', () => {
  it('should prevent cross-tenant native_reviewer from seeing Tenant A findings', async () => {
    // AC7: Cross-tenant native reviewer → 0 rows (tenant isolation maintained)
    const clientNativeB = tenantClient(tenantB.nativeJwt)
    const { data } = await clientNativeB.from('findings').select('id')

    expect(data).toHaveLength(0)
  })
})
