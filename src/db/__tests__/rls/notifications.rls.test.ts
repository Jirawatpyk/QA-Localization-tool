/**
 * RLS Tests: notifications — user-scoped access
 *
 * Guardrail #89: notifications_select_own policy
 * T1: User A sees own notifications
 * T2: User A does NOT see User B's notifications (same tenant)
 * T3: User A does NOT see User C's notifications (different tenant)
 * T4: Admin sees only own notifications (not all tenant — user-scoped, not role-scoped)
 *
 * Run with: `npm run test:rls`
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  admin,
  type TestTenant,
  cleanupStaleUser,
  cleanupTestTenant,
  setupTestTenant,
  tenantClient,
} from './helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'test-password-123!'

// --- Test state ---
let tenantA: TestTenant
let tenantB: TestTenant

let userB: { id: string; jwt: string } // Second user in Tenant A (non-admin)
let notifAdminId: string // Notification for Tenant A admin
let notifUserBId: string // Notification for User B in Tenant A
let notifTenantBId: string // Notification for Tenant B admin

beforeAll(async () => {
  // --- Tenant A (admin user) ---
  tenantA = await setupTestTenant('rls-notif-admin-a@test.local')

  // --- Tenant B (admin user, for cross-tenant tests) ---
  tenantB = await setupTestTenant('rls-notif-admin-b@test.local')

  // --- User B in Tenant A (qa_reviewer) ---
  await cleanupStaleUser('rls-notif-userb@test.local')
  const { data: userBAuth } = await admin.auth.admin.createUser({
    email: 'rls-notif-userb@test.local',
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  await admin.from('users').insert({
    id: userBAuth!.user!.id,
    tenant_id: tenantA.id,
    email: 'rls-notif-userb@test.local',
    display_name: 'User B',
  })
  await admin
    .from('user_roles')
    .insert({ user_id: userBAuth!.user!.id, tenant_id: tenantA.id, role: 'qa_reviewer' })
  await admin.auth.admin.updateUserById(userBAuth!.user!.id, {
    app_metadata: { tenant_id: tenantA.id, user_role: 'qa_reviewer' },
  })
  const userBAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: userBSession } = await userBAnon.auth.signInWithPassword({
    email: 'rls-notif-userb@test.local',
    password: TEST_PASSWORD,
  })
  userB = { id: userBAuth!.user!.id, jwt: userBSession!.session!.access_token }

  // --- Seed notifications via admin (service_role bypasses RLS) ---

  // Notification for Tenant A admin
  const { data: n1 } = await admin
    .from('notifications')
    .insert({
      tenant_id: tenantA.id,
      user_id: tenantA.userId,
      type: 'analysis_complete',
      title: 'Analysis done',
      body: 'File analysis complete for admin',
    })
    .select('id')
    .single()
  notifAdminId = n1!.id

  // Notification for User B in Tenant A
  const { data: n2 } = await admin
    .from('notifications')
    .insert({
      tenant_id: tenantA.id,
      user_id: userB.id,
      type: 'file_assigned',
      title: 'File assigned',
      body: 'You have been assigned a file',
    })
    .select('id')
    .single()
  notifUserBId = n2!.id

  // Notification for Tenant B admin
  const { data: n3 } = await admin
    .from('notifications')
    .insert({
      tenant_id: tenantB.id,
      user_id: tenantB.userId,
      type: 'analysis_complete',
      title: 'Analysis done for B',
      body: 'Tenant B notification',
    })
    .select('id')
    .single()
  notifTenantBId = n3!.id
}, 60_000)

afterAll(async () => {
  // Cleanup: notifications → extra users → tenants
  await admin.from('notifications').delete().eq('tenant_id', tenantA.id)
  await admin.from('notifications').delete().eq('tenant_id', tenantB.id)

  // Clean up User B
  if (userB?.id) {
    await admin.from('user_roles').delete().eq('user_id', userB.id)
    await admin.from('users').delete().eq('id', userB.id)
    await admin.auth.admin.deleteUser(userB.id)
  }

  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
}, 30_000)

describe('notifications RLS — user-scoped', () => {
  // T1: User A (admin) sees only own notifications
  it('should allow admin to see only own notifications', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data, error } = await clientA.from('notifications').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.id).toBe(notifAdminId)
  })

  // T2: User B sees only own notifications (same tenant as admin)
  it('should allow user B to see only own notifications (same tenant)', async () => {
    const clientB = tenantClient(userB.jwt)
    const { data, error } = await clientB.from('notifications').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.id).toBe(notifUserBId)
  })

  // T3: Tenant B admin does NOT see Tenant A notifications (cross-tenant)
  it('should prevent Tenant B from seeing Tenant A notifications', async () => {
    const clientTenantB = tenantClient(tenantB.jwt)
    const { data, error } = await clientTenantB.from('notifications').select('id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    // Only sees own Tenant B notification
    expect(data![0]!.id).toBe(notifTenantBId)
  })

  // T4: Admin sees only own notifications (user-scoped, NOT role-scoped)
  it('should NOT allow admin to see all tenant notifications (user-scoped)', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('notifications').select('id')

    // Admin should only see their 1 notification, NOT User B's
    expect(data).toHaveLength(1)
    const ids = data!.map((r) => r.id)
    expect(ids).not.toContain(notifUserBId)
  })

  // T5: User can mark own notification as read (UPDATE)
  it('should allow user to UPDATE own notification (mark as read)', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data, error } = await clientA
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifAdminId)
      .select('id, is_read')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]!.is_read).toBe(true)

    // Restore for other tests
    await admin.from('notifications').update({ is_read: false }).eq('id', notifAdminId)
  })

  // T6: User cannot UPDATE another user's notification
  it('should deny user UPDATE on another user notification', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifUserBId)
      .select('id')

    // RLS filters out: USING clause fails → 0 rows affected
    expect(data).toHaveLength(0)
  })

  // T7: No INSERT policy for authenticated — INSERT denied
  it('should deny authenticated user INSERT on notifications', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('notifications').insert({
      tenant_id: tenantA.id,
      user_id: tenantA.userId,
      type: 'test',
      title: 'test',
      body: 'test',
    })

    expect(error).toBeTruthy()
  })
})
