/**
 * Supabase Storage Integration Tests
 *
 * Validates Storage RLS policies from migration 00029:
 * - Tenant-scoped read/write via JWT claims
 * - Cross-tenant isolation (download + upload blocked)
 * - Admin-only delete
 * - service_role bypass for admin operations
 *
 * Requires: `npx supabase start` (local Supabase with Storage + Auth)
 *
 * Run with: `npx vitest run --project integration src/__tests__/integration/supabase-storage.integration.test.ts`
 */
import { randomUUID } from 'node:crypto'

// eslint-disable-next-line no-restricted-imports -- integration test needs direct client (no app wrappers)
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'storage-test-123!'
const BUCKET = 'project-files'

type TestTenantContext = {
  tenantId: string
  userId: string
  jwt: string
}

/**
 * Admin client (service_role) — bypasses RLS for setup/teardown.
 */
function createAdminStorageClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/**
 * Authenticated client with user JWT — subject to RLS policies.
 */
function createAuthenticatedClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
}

/**
 * Creates a test tenant with auth user, tenant row, user record, and role.
 * Returns tenant context with JWT containing tenant_id and user_role claims.
 */
async function setupStorageTestTenant(
  adminClient: SupabaseClient,
  email: string,
  role: 'admin' | 'qa_reviewer',
): Promise<TestTenantContext> {
  // Clean up stale user from previous test run
  const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  const existing = listData?.users?.find((u) => u.email === email)
  if (existing) {
    await adminClient.from('user_roles').delete().eq('user_id', existing.id)
    await adminClient.from('users').delete().eq('id', existing.id)
    await adminClient.auth.admin.deleteUser(existing.id)
  }

  // Create auth user
  const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createError || !authUser.user) {
    throw new Error(`Failed to create auth user ${email}: ${createError?.message ?? 'null'}`)
  }
  const userId = authUser.user.id

  // Create tenant
  const { data: tenant, error: tenantError } = await adminClient
    .from('tenants')
    .insert({ name: `Storage Test ${email}`, status: 'active' })
    .select('id')
    .single()
  if (tenantError || !tenant) {
    throw new Error(`Failed to create tenant: ${tenantError?.message ?? 'null'}`)
  }
  const tenantId = tenant.id as string

  // Create user + role records
  await adminClient
    .from('users')
    .insert({ id: userId, tenant_id: tenantId, email, display_name: email })
  await adminClient.from('user_roles').insert({ user_id: userId, tenant_id: tenantId, role })

  // Set JWT claims
  await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenantId, user_role: role },
  })

  // Sign in with separate anon client to get JWT (avoid polluting admin session)
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  })
  const { data: session, error: sessionError } = await anonClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (sessionError || !session.session) {
    throw new Error(`Failed to sign in ${email}: ${sessionError?.message ?? 'null'}`)
  }

  return { tenantId, userId, jwt: session.session.access_token }
}

/**
 * Cleans up a test tenant's auth user and related data.
 */
async function cleanupStorageTestTenant(
  adminClient: SupabaseClient,
  ctx: TestTenantContext | undefined,
): Promise<void> {
  if (!ctx?.userId) return
  await adminClient.from('user_roles').delete().eq('user_id', ctx.userId)
  await adminClient.from('users').delete().eq('id', ctx.userId)
  await adminClient.auth.admin.deleteUser(ctx.userId)
}

// Skip entire suite if local Supabase is not running
const hasSupabase = Boolean(SERVICE_ROLE_KEY)

describe.skipIf(!hasSupabase)('Supabase Storage RLS Integration', () => {
  let adminClient: SupabaseClient
  let tenantA: TestTenantContext
  let tenantB: TestTenantContext
  let qaReviewer: TestTenantContext

  // Storage paths used in tests — tracked for cleanup
  const uploadedPaths: string[] = []

  const projectIdA = randomUUID()
  const projectIdB = randomUUID()
  const fileHash = randomUUID().replace(/-/g, '')
  const fileName = 'test-file.txt'
  const fileContent = 'Hello from storage integration test'

  // Path: {tenantId}/{projectId}/{fileHash}/{fileName}
  let pathA: string
  let pathB: string

  beforeAll(async () => {
    adminClient = createAdminStorageClient()

    // Ensure bucket exists (local Supabase may not have it)
    const { data: buckets } = await adminClient.storage.listBuckets()
    const bucketExists = buckets?.some((b) => b.name === BUCKET)
    if (!bucketExists) {
      const { error } = await adminClient.storage.createBucket(BUCKET, {
        public: false,
      })
      if (error) {
        throw new Error(`Failed to create bucket "${BUCKET}": ${error.message}`)
      }
    }

    // Setup two tenants (admin role) and one QA reviewer in tenant A
    tenantA = await setupStorageTestTenant(adminClient, 'storage-rls-a@test.local', 'admin')
    tenantB = await setupStorageTestTenant(adminClient, 'storage-rls-b@test.local', 'admin')
    qaReviewer = await setupStorageTestTenant(
      adminClient,
      'storage-rls-qa@test.local',
      'qa_reviewer',
    )

    // Move QA reviewer to tenant A (same tenant, different role)
    await adminClient
      .from('users')
      .update({ tenant_id: tenantA.tenantId })
      .eq('id', qaReviewer.userId)
    await adminClient
      .from('user_roles')
      .update({ tenant_id: tenantA.tenantId })
      .eq('user_id', qaReviewer.userId)
    await adminClient.auth.admin.updateUserById(qaReviewer.userId, {
      app_metadata: { tenant_id: tenantA.tenantId, user_role: 'qa_reviewer' },
    })
    // Re-sign-in to refresh JWT claims
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    })
    const { data: refreshed } = await anonClient.auth.signInWithPassword({
      email: 'storage-rls-qa@test.local',
      password: TEST_PASSWORD,
    })
    if (refreshed?.session) {
      qaReviewer = {
        ...qaReviewer,
        tenantId: tenantA.tenantId,
        jwt: refreshed.session.access_token,
      }
    }

    pathA = `${tenantA.tenantId}/${projectIdA}/${fileHash}/${fileName}`
    pathB = `${tenantB.tenantId}/${projectIdB}/${fileHash}/${fileName}`
  }, 30000)

  afterAll(async () => {
    // Clean up all uploaded files
    if (uploadedPaths.length > 0) {
      await adminClient.storage.from(BUCKET).remove(uploadedPaths)
    }

    // Clean up test tenants
    await cleanupStorageTestTenant(adminClient, tenantA)
    await cleanupStorageTestTenant(adminClient, tenantB)
    await cleanupStorageTestTenant(adminClient, qaReviewer)
  }, 30000)

  // ── T1: Upload via service_role succeeds ──
  it('T1: service_role admin client can upload files', async () => {
    const buffer = new TextEncoder().encode(fileContent)

    const { error } = await adminClient.storage.from(BUCKET).upload(pathA, buffer, {
      contentType: 'text/plain',
      upsert: false,
    })

    expect(error).toBeNull()
    uploadedPaths.push(pathA)
  })

  // ── T2: Download own tenant file ──
  it('T2: authenticated user can download file in their tenant', async () => {
    const clientA = createAuthenticatedClient(tenantA.jwt)

    const { data, error } = await clientA.storage.from(BUCKET).download(pathA)

    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const text = await data!.text()
    expect(text).toBe(fileContent)
  })

  // ── T3: Cross-tenant download blocked ──
  it('T3: authenticated user CANNOT download file from another tenant', async () => {
    const clientB = createAuthenticatedClient(tenantB.jwt)

    const { data, error } = await clientB.storage.from(BUCKET).download(pathA)

    // RLS should block — either error or empty data
    const isBlocked = error !== null || data === null
    expect(isBlocked).toBe(true)
  })

  // ── T4: Upload to wrong tenant path blocked ──
  it('T4: authenticated user CANNOT upload to another tenant path', async () => {
    const clientA = createAuthenticatedClient(tenantA.jwt)
    const crossTenantPath = `${tenantB.tenantId}/${projectIdB}/${fileHash}/cross-tenant.txt`
    const buffer = new TextEncoder().encode('cross-tenant attempt')

    const { error } = await clientA.storage.from(BUCKET).upload(crossTenantPath, buffer, {
      contentType: 'text/plain',
      upsert: false,
    })

    expect(error).toBeTruthy()
    // Do NOT add to uploadedPaths — upload should have been rejected
  })

  // ── T5: Delete by admin succeeds ──
  it('T5: admin-role user can delete file in their tenant', async () => {
    // Upload a file specifically for deletion test
    const deletePath = `${tenantA.tenantId}/${projectIdA}/${fileHash}/delete-test.txt`
    const buffer = new TextEncoder().encode('file to delete')

    await adminClient.storage.from(BUCKET).upload(deletePath, buffer, {
      contentType: 'text/plain',
      upsert: false,
    })

    // Admin user in tenant A deletes
    const clientA = createAuthenticatedClient(tenantA.jwt)
    const { error } = await clientA.storage.from(BUCKET).remove([deletePath])

    expect(error).toBeNull()
    // No need to add to uploadedPaths — already deleted
  })

  // ── T6: Delete by non-admin blocked ──
  it('T6: qa_reviewer CANNOT delete files (admin-only policy)', async () => {
    // Upload a file for QA reviewer to attempt deleting
    const noDeletePath = `${tenantA.tenantId}/${projectIdA}/${fileHash}/no-delete-test.txt`
    const buffer = new TextEncoder().encode('qa reviewer cannot delete')

    await adminClient.storage.from(BUCKET).upload(noDeletePath, buffer, {
      contentType: 'text/plain',
      upsert: false,
    })
    uploadedPaths.push(noDeletePath)

    // QA reviewer (same tenant A, but qa_reviewer role) attempts delete
    const qaClient = createAuthenticatedClient(qaReviewer.jwt)
    const { error, data } = await qaClient.storage.from(BUCKET).remove([noDeletePath])

    // Supabase Storage remove() with RLS may return error OR empty data array
    // The key assertion: the file should still exist after the attempt
    const { data: checkData } = await adminClient.storage.from(BUCKET).download(noDeletePath)
    expect(checkData).toBeTruthy()

    // Also verify error or empty result from the delete attempt
    const deleteBlocked = error !== null || (Array.isArray(data) && data.length === 0)
    expect(deleteBlocked).toBe(true)
  })

  // ── T7: Upload to own tenant path succeeds ──
  it('T7: authenticated user CAN upload to their own tenant path', async () => {
    const clientB = createAuthenticatedClient(tenantB.jwt)
    const ownPath = `${tenantB.tenantId}/${projectIdB}/${fileHash}/own-upload.txt`
    const buffer = new TextEncoder().encode('own tenant upload')

    const { error } = await clientB.storage.from(BUCKET).upload(ownPath, buffer, {
      contentType: 'text/plain',
      upsert: false,
    })

    expect(error).toBeNull()
    uploadedPaths.push(ownPath)
  })
})
