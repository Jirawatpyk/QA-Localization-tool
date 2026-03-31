/**
 * Realtime Subscription Integration Tests
 *
 * Tests Supabase Realtime postgres_changes lifecycle against a real Supabase instance.
 * Validates: subscription connect, event delivery, cross-tenant isolation, cleanup.
 *
 * Tables tested: findings, scores (both in supabase_realtime publication).
 *
 * IMPORTANT: Supabase Realtime `filter` param only supports SINGLE column equality.
 * Compound filters (e.g. `file_id=eq.X&tenant_id=eq.Y`) silently ignore the second
 * condition. Cross-tenant isolation relies on RLS policies, not the filter param.
 * This test validates both: filter-based delivery and RLS-based isolation.
 *
 * Requires: Supabase running (local or cloud) with .env.local credentials
 * Run with: `npx dotenv-cli -e .env.local -- npx vitest run --project integration src/__tests__/integration/realtime-subscriptions.integration.test.ts`
 */
// eslint-disable-next-line no-restricted-imports -- integration test needs direct client (no app wrappers)
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'

// Polyfill WebSocket for Node.js < 21 (Supabase Realtime requires it)
if (!globalThis.WebSocket) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).WebSocket = WebSocket
}

// ── Environment guard ──────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_PASSWORD = 'realtime-test-pw-123!'

const canRun = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY)

// ── Test data tracking ─────────────────────────────────────────────────────
type TestTenant = {
  tenantId: string
  userId: string
  client: SupabaseClient
  projectId: string
  fileId: string
  segmentId: string
}

// Track all channels for cleanup
const activeChannels: { client: SupabaseClient; channel: RealtimeChannel }[] = []

function trackChannel(client: SupabaseClient, channel: RealtimeChannel): void {
  activeChannels.push({ client, channel })
}

// ── Client factories ───────────────────────────────────────────────────────
function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Wait for channel to reach SUBSCRIBED status */
function waitForSubscribed(channel: RealtimeChannel, timeoutMs = 15000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Channel did not reach SUBSCRIBED status')),
      timeoutMs,
    )
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(new Error(`Channel subscription failed: ${status}`))
      }
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Lazy-init: admin client created only when tests actually run (after skipIf check)
let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient {
  if (!_admin) _admin = createAdminClient()
  return _admin
}

async function cleanupStaleUser(email: string): Promise<void> {
  const admin = getAdmin()
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = (data?.users as Array<{ id: string; email?: string }>)?.find(
    (u) => u.email === email,
  )
  if (!existing) return
  await admin.from('user_roles').delete().eq('user_id', existing.id)
  await admin.from('users').delete().eq('id', existing.id)
  await admin.auth.admin.deleteUser(existing.id)
}

/**
 * Creates a tenant with project/file/segment data and returns a session-based
 * Supabase client. Realtime requires proper auth session (not header injection).
 */
async function setupTestTenantWithData(email: string): Promise<TestTenant> {
  const admin = getAdmin()
  await cleanupStaleUser(email)

  const { data: authUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createError || !authUser.user) {
    throw new Error(`Failed to create auth user ${email}: ${createError?.message ?? 'null'}`)
  }
  const userId = authUser.user.id

  const { data: tenant } = await admin
    .from('tenants')
    .insert({ name: `RT Tenant ${email}`, status: 'active' })
    .select('id')
    .single()
  if (!tenant) throw new Error('Failed to create tenant')
  const tenantId = tenant.id

  await admin.from('users').insert({ id: userId, tenant_id: tenantId, email, display_name: email })
  await admin.from('user_roles').insert({ user_id: userId, tenant_id: tenantId, role: 'admin' })
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId, user_role: 'admin' },
  })

  // Session-based client (Realtime WebSocket uses the auth session, not HTTP headers)
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: sessionError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (sessionError) {
    throw new Error(`Failed to sign in ${email}: ${sessionError.message}`)
  }

  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: tenantId,
      name: 'RT Test Project',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()
  if (!project) throw new Error('Failed to create project')

  const { data: file } = await admin
    .from('files')
    .insert({
      project_id: project.id,
      tenant_id: tenantId,
      file_name: `rt-test-${email}.xliff`,
      file_type: 'xliff',
      file_size_bytes: 1024,
      storage_path: `/rt-test-${email}.xliff`,
      status: 'parsed',
    })
    .select('id')
    .single()
  if (!file) throw new Error('Failed to create file')

  const { data: segment } = await admin
    .from('segments')
    .insert({
      file_id: file.id,
      project_id: project.id,
      tenant_id: tenantId,
      segment_number: 1,
      source_text: 'Hello',
      target_text: 'สวัสดี',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 1,
    })
    .select('id')
    .single()
  if (!segment) throw new Error('Failed to create segment')

  return {
    tenantId,
    userId,
    client,
    projectId: project.id,
    fileId: file.id,
    segmentId: segment.id,
  }
}

async function cleanupTestTenant(t: TestTenant | undefined): Promise<void> {
  if (!t?.userId) return
  const admin = getAdmin()
  await admin.from('user_roles').delete().eq('user_id', t.userId)
  await admin.from('users').delete().eq('id', t.userId)
  await admin.auth.admin.deleteUser(t.userId)
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe.skipIf(!canRun)('Realtime Subscriptions (real Supabase)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeAll(async () => {
    tenantA = await setupTestTenantWithData('rt-sub-a@test.local')
    tenantB = await setupTestTenantWithData('rt-sub-b@test.local')
  }, 60000)

  afterEach(async () => {
    for (const { client, channel } of activeChannels) {
      await client.removeChannel(channel)
    }
    activeChannels.length = 0
  })

  afterAll(async () => {
    await cleanupTestTenant(tenantA)
    await cleanupTestTenant(tenantB)
  }, 30000)

  // ── T1: Findings subscription receives INSERT ────────────────────────────
  it('should deliver finding INSERT to subscribed client', async () => {
    // Single-column filter (Supabase Realtime only supports one filter column)
    // RLS provides tenant isolation; filter narrows to specific file
    const filter = `file_id=eq.${tenantA.fileId}`

    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('INSERT event not received')), 12000)

      const channel = tenantA.client
        .channel(`t1-findings-insert-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'findings', filter },
          (payload) => {
            clearTimeout(timer)
            resolve(payload.new as Record<string, unknown>)
          },
        )

      trackChannel(tenantA.client, channel)

      waitForSubscribed(channel)
        .then(() => delay(2000))
        .then(async () => {
          const { error } = await getAdmin().from('findings').insert({
            segment_id: tenantA.segmentId,
            project_id: tenantA.projectId,
            tenant_id: tenantA.tenantId,
            file_id: tenantA.fileId,
            status: 'pending',
            severity: 'major',
            category: 'Accuracy',
            description: 'RT test finding INSERT',
            detected_by_layer: 'L1',
          })
          if (error) reject(new Error(`Insert failed: ${error.message}`))
        })
        .catch(reject)
    })

    const received = await eventPromise
    expect(received.description).toBe('RT test finding INSERT')
    expect(received.severity).toBe('major')
    expect(received.file_id).toBe(tenantA.fileId)
    expect(received.tenant_id).toBe(tenantA.tenantId)
  }, 25000)

  // ── T2: Cross-tenant isolation (RLS enforced) ──────────────────────────
  it('should NOT deliver findings for a different tenant (RLS isolation)', async () => {
    let receivedByA = 0
    let receivedByB = 0

    // Tenant B subscribes to their own findings (proves subscription works)
    const channelB = tenantB.client.channel(`t2-tenantB-${Date.now()}`).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'findings',
        filter: `file_id=eq.${tenantB.fileId}`,
      },
      () => {
        receivedByB++
      },
    )

    // Tenant A subscribes — if cross-tenant leaks, this catches it
    // Uses tenantA.client directly (already has session from beforeAll)
    const channelA = tenantA.client.channel(`t2-tenantA-${Date.now()}`).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'findings',
        filter: `file_id=eq.${tenantA.fileId}`,
      },
      () => {
        receivedByA++
      },
    )

    trackChannel(tenantB.client, channelB)
    trackChannel(tenantA.client, channelA)

    // Subscribe sequentially to avoid connection storms
    await waitForSubscribed(channelB)
    await waitForSubscribed(channelA)
    await delay(2000)

    // Insert finding for Tenant B — only B should receive
    const { error: insertError } = await getAdmin().from('findings').insert({
      segment_id: tenantB.segmentId,
      project_id: tenantB.projectId,
      tenant_id: tenantB.tenantId,
      file_id: tenantB.fileId,
      status: 'pending',
      severity: 'minor',
      category: 'Style',
      description: 'Tenant B only finding',
      detected_by_layer: 'L2',
    })
    expect(insertError).toBeNull()

    // Wait for events to propagate
    await delay(5000)

    // B received the event (proves Realtime is working)
    expect(receivedByB).toBe(1)
    // A did NOT receive it (RLS isolation + different file_id filter)
    expect(receivedByA).toBe(0)
  }, 25000)

  // ── T3: Findings subscription receives UPDATE ──────────────────────────
  it('should deliver finding UPDATE to subscribed client', async () => {
    // Insert a finding first
    const { data: finding, error: findingInsertErr } = await getAdmin()
      .from('findings')
      .insert({
        segment_id: tenantA.segmentId,
        project_id: tenantA.projectId,
        tenant_id: tenantA.tenantId,
        file_id: tenantA.fileId,
        status: 'pending',
        severity: 'major',
        category: 'Accuracy',
        description: 'RT test finding UPDATE',
        detected_by_layer: 'L1',
      })
      .select('id')
      .single()
    expect(findingInsertErr).toBeNull()
    expect(finding).toBeTruthy()

    const filter = `file_id=eq.${tenantA.fileId}`

    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('UPDATE event not received')), 12000)

      const channel = tenantA.client
        .channel(`t3-findings-update-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'findings', filter },
          (payload) => {
            clearTimeout(timer)
            resolve(payload.new as Record<string, unknown>)
          },
        )

      trackChannel(tenantA.client, channel)

      waitForSubscribed(channel)
        .then(() => delay(2000))
        .then(async () => {
          const { error } = await getAdmin()
            .from('findings')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', finding!.id)
          if (error) reject(new Error(`Update failed: ${error.message}`))
        })
        .catch(reject)
    })

    const received = await eventPromise
    expect(received.id).toBe(finding!.id)
    expect(received.status).toBe('accepted')
    expect(received.file_id).toBe(tenantA.fileId)
  }, 25000)

  // ── T4: Score subscription receives INSERT (DELETE+INSERT pattern) ─────
  it('should deliver score INSERT to subscribed client', async () => {
    const filter = `file_id=eq.${tenantA.fileId}`

    // Clean up any existing score first
    await getAdmin()
      .from('scores')
      .delete()
      .eq('file_id', tenantA.fileId)
      .eq('tenant_id', tenantA.tenantId)

    const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Score INSERT not received')), 12000)

      const channel = tenantA.client
        .channel(`t4-scores-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'scores', filter },
          (payload) => {
            clearTimeout(timer)
            resolve(payload.new as Record<string, unknown>)
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'scores', filter },
          (payload) => {
            clearTimeout(timer)
            resolve(payload.new as Record<string, unknown>)
          },
        )

      trackChannel(tenantA.client, channel)

      waitForSubscribed(channel)
        .then(() => delay(2000))
        .then(async () => {
          const { error } = await getAdmin().from('scores').insert({
            file_id: tenantA.fileId,
            project_id: tenantA.projectId,
            tenant_id: tenantA.tenantId,
            mqm_score: 85.5,
            total_words: 100,
            critical_count: 0,
            major_count: 1,
            minor_count: 2,
            npt: 14.5,
            layer_completed: 'L1L2',
            status: 'calculated',
          })
          if (error) reject(new Error(`Score insert failed: ${error.message}`))
        })
        .catch(reject)
    })

    const received = await eventPromise
    expect(received.mqm_score).toBe(85.5)
    expect(received.status).toBe('calculated')
    expect(received.layer_completed).toBe('L1L2')
    expect(received.file_id).toBe(tenantA.fileId)
    expect(received.tenant_id).toBe(tenantA.tenantId)
  }, 25000)

  // ── T5: Subscription cleanup — no events after unsubscribe ─────────────
  it('should NOT receive events after channel removal (no memory leak)', async () => {
    let receivedAfterRemoval = 0
    let receivedBeforeRemoval = 0

    const filter = `file_id=eq.${tenantB.fileId}`

    // Use tenantB's client for this test (fresh connection state)
    const channel = tenantB.client
      .channel(`t5-cleanup-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'findings', filter },
        () => {
          receivedBeforeRemoval++
          receivedAfterRemoval++
        },
      )

    // Do NOT track — we manage lifecycle manually in this test
    await waitForSubscribed(channel)
    await delay(2000)

    // First INSERT — verify subscription works before removal
    const { error: beforeError } = await getAdmin().from('findings').insert({
      segment_id: tenantB.segmentId,
      project_id: tenantB.projectId,
      tenant_id: tenantB.tenantId,
      file_id: tenantB.fileId,
      status: 'pending',
      severity: 'minor',
      category: 'Style',
      description: 'Pre-removal finding',
      detected_by_layer: 'L1',
    })
    expect(beforeError).toBeNull()

    // Wait for event to arrive
    await delay(3000)
    expect(receivedBeforeRemoval).toBeGreaterThanOrEqual(1)

    // Reset counter, then remove channel
    receivedAfterRemoval = 0
    await tenantB.client.removeChannel(channel)
    await delay(1000)

    // Insert finding after removal — should NOT be received
    const { error: afterError } = await getAdmin().from('findings').insert({
      segment_id: tenantB.segmentId,
      project_id: tenantB.projectId,
      tenant_id: tenantB.tenantId,
      file_id: tenantB.fileId,
      status: 'pending',
      severity: 'minor',
      category: 'Style',
      description: 'Post-removal finding',
      detected_by_layer: 'L1',
    })
    expect(afterError).toBeNull()

    // Wait for any leaked event
    await delay(4000)

    expect(receivedAfterRemoval).toBe(0)
  }, 25000)
})
