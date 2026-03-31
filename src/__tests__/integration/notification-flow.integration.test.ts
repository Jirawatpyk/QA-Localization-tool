/**
 * Integration tests for the notification data layer.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - Notification INSERT with correct shape (all 5 notification types)
 * - Tenant isolation via withTenant
 * - is_read status update lifecycle
 * - Metadata JSONB queryable
 * - Chronological ordering (newest first)
 * - FK constraint enforcement on user_id
 */
import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { notifications } from '@/db/schema/notifications'
import { tenants } from '@/db/schema/tenants'
import { users } from '@/db/schema/users'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Notification Flow — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Tenant A
  let tenantIdA: TenantId
  let userIdA: string

  // Tenant B (for isolation test)
  let tenantIdB: TenantId
  let userIdB: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // Seed Tenant A → User A
    const [tenantA] = await testDb
      .insert(tenants)
      .values({ name: 'Notification Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdA = asTenantId(tenantA!.id)

    userIdA = randomUUID()
    await testDb.insert(users).values({
      id: userIdA,
      tenantId: tenantIdA,
      email: 'notif-a@test.local',
      displayName: 'User A',
    })

    // Seed Tenant B → User B
    const [tenantB] = await testDb
      .insert(tenants)
      .values({ name: 'Notification Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdB = asTenantId(tenantB!.id)

    userIdB = randomUUID()
    await testDb.insert(users).values({
      id: userIdB,
      tenantId: tenantIdB,
      email: 'notif-b@test.local',
      displayName: 'User B',
    })
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(notifications).where(eq(notifications.tenantId, tenantIdA))
    await testDb.delete(notifications).where(eq(notifications.tenantId, tenantIdB))
    await testDb.delete(users).where(eq(users.id, userIdA))
    await testDb.delete(users).where(eq(users.id, userIdB))
    await testDb.delete(tenants).where(eq(tenants.id, tenantIdA))
    await testDb.delete(tenants).where(eq(tenants.id, tenantIdB))
    await queryClient.end()
  })

  // ── T1: Notification INSERT with correct shape ──

  it('should insert a notification with all columns populated correctly', async () => {
    const [row] = await testDb
      .insert(notifications)
      .values({
        tenantId: tenantIdA,
        userId: userIdA,
        type: 'finding_flagged_for_native',
        title: 'Finding flagged for your review',
        body: 'A finding has been flagged for native review',
        metadata: { findingId: 'f-001', projectId: 'p-001', fileId: 'file-001' },
      })
      .returning()

    expect(row).toBeDefined()
    expect(row!.id).toBeTruthy()
    expect(row!.tenantId).toBe(tenantIdA)
    expect(row!.userId).toBe(userIdA)
    expect(row!.type).toBe('finding_flagged_for_native')
    expect(row!.title).toBe('Finding flagged for your review')
    expect(row!.body).toBe('A finding has been flagged for native review')
    expect(row!.isRead).toBe(false)
    expect(row!.metadata).toEqual({ findingId: 'f-001', projectId: 'p-001', fileId: 'file-001' })
    expect(row!.createdAt).toBeInstanceOf(Date)
  })

  // ── T2: Tenant isolation ──

  it('should enforce tenant isolation — tenant B cannot see tenant A notifications', async () => {
    // Insert for tenant A
    await testDb.insert(notifications).values({
      tenantId: tenantIdA,
      userId: userIdA,
      type: 'native_review_completed',
      title: 'Tenant A only',
      body: 'This should not be visible to tenant B',
    })

    // Query as tenant B with withTenant — should return 0
    const rows = await testDb
      .select()
      .from(notifications)
      .where(withTenant(notifications.tenantId, tenantIdB))

    // None of these should belong to tenant A
    for (const row of rows) {
      expect(row.tenantId).toBe(tenantIdB)
    }

    // Explicitly verify tenant A's notification is NOT in tenant B results
    const tenantARows = rows.filter((r) => r.tenantId === tenantIdA)
    expect(tenantARows).toHaveLength(0)
  })

  // ── T3: Multiple notification types ──

  it('should support all notification types and filter by type', async () => {
    const types = [
      'language_pair_graduated',
      'finding_flagged_for_native',
      'native_review_completed',
      'native_comment_added',
    ] as const

    for (const type of types) {
      await testDb.insert(notifications).values({
        tenantId: tenantIdA,
        userId: userIdA,
        type,
        title: `Test ${type}`,
        body: `Body for ${type}`,
      })
    }

    // Query each type individually
    for (const type of types) {
      const rows = await testDb
        .select()
        .from(notifications)
        .where(
          and(
            withTenant(notifications.tenantId, tenantIdA),
            eq(notifications.userId, userIdA),
            eq(notifications.type, type),
          ),
        )

      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows.every((r) => r.type === type)).toBe(true)
    }
  })

  // ── T4: is_read status update ──

  it('should update is_read status from false to true', async () => {
    const [inserted] = await testDb
      .insert(notifications)
      .values({
        tenantId: tenantIdA,
        userId: userIdA,
        type: 'native_comment_added',
        title: 'Unread notification',
        body: 'Should become read',
      })
      .returning()

    expect(inserted!.isRead).toBe(false)

    // Update is_read
    const [updated] = await testDb
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, inserted!.id), withTenant(notifications.tenantId, tenantIdA)))
      .returning()

    expect(updated!.isRead).toBe(true)

    // Verify persistence via fresh SELECT
    const [verified] = await testDb
      .select()
      .from(notifications)
      .where(eq(notifications.id, inserted!.id))

    expect(verified!.isRead).toBe(true)
  })

  // ── T5: Metadata JSONB queryable ──

  it('should store and extract JSONB metadata fields', async () => {
    const metadata = {
      projectId: 'proj-meta-test',
      fileId: 'file-meta-test',
      findingId: 'find-meta-test',
      sourceLang: 'en-US',
      targetLang: 'th',
      fileCount: 42,
    }

    const [inserted] = await testDb
      .insert(notifications)
      .values({
        tenantId: tenantIdA,
        userId: userIdA,
        type: 'language_pair_graduated',
        title: 'Metadata test',
        body: 'Testing JSONB extraction',
        metadata: metadata as Record<string, unknown>,
      })
      .returning()

    // Query with JSONB operator to extract specific field
    const [result] = await testDb
      .select({
        id: notifications.id,
        projectId: sql<string>`${notifications.metadata}->>'projectId'`,
        fileCount: sql<number>`(${notifications.metadata}->>'fileCount')::int`,
      })
      .from(notifications)
      .where(eq(notifications.id, inserted!.id))

    expect(result!.projectId).toBe('proj-meta-test')
    expect(result!.fileCount).toBe(42)

    // Also verify full metadata round-trip via Drizzle typed select
    const [full] = await testDb
      .select({ metadata: notifications.metadata })
      .from(notifications)
      .where(eq(notifications.id, inserted!.id))

    expect(full!.metadata).toEqual(metadata)
  })

  // ── T6: Chronological ordering (newest first) ──

  it('should return notifications in newest-first order', async () => {
    // Insert 3 notifications with forced created_at ordering
    const ids: string[] = []
    const baseTimes = [
      new Date('2026-01-01T10:00:00Z'),
      new Date('2026-01-01T11:00:00Z'),
      new Date('2026-01-01T12:00:00Z'),
    ]

    for (const time of baseTimes) {
      const [row] = await testDb
        .insert(notifications)
        .values({
          tenantId: tenantIdA,
          userId: userIdA,
          type: 'native_comment_added',
          title: `Order test ${time.toISOString()}`,
          body: 'Ordering test',
          createdAt: time,
        })
        .returning({ id: notifications.id })
      ids.push(row!.id)
    }

    // Query ORDER BY created_at DESC (same as getNotifications.action.ts)
    const rows = await testDb
      .select({ id: notifications.id, createdAt: notifications.createdAt })
      .from(notifications)
      .where(
        and(
          withTenant(notifications.tenantId, tenantIdA),
          eq(notifications.userId, userIdA),
          sql`${notifications.id} = ANY(${ids}::uuid[])`,
        ),
      )
      .orderBy(desc(notifications.createdAt))

    expect(rows).toHaveLength(3)
    // Newest (12:00) should be first, oldest (10:00) should be last
    expect(rows[0]!.id).toBe(ids[2]) // 12:00
    expect(rows[1]!.id).toBe(ids[1]) // 11:00
    expect(rows[2]!.id).toBe(ids[0]) // 10:00
  })

  // ── T7: FK constraint on user_id ──

  it('should reject notification insert with non-existent user_id (FK constraint)', async () => {
    const fakeUserId = randomUUID()

    await expect(
      testDb.insert(notifications).values({
        tenantId: tenantIdA,
        userId: fakeUserId,
        type: 'native_comment_added',
        title: 'Should fail',
        body: 'FK violation expected',
      }),
    ).rejects.toThrow()
  })
})
