/**
 * Integration tests for budget reservation with pg_advisory_xact_lock.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - Advisory lock serializes concurrent reservations (TOCTOU safety)
 * - Reserve → settle → release lifecycle works with real DB
 * - Lock key uniqueness across project UUIDs
 */
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { tenants } from '@/db/schema/tenants'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Budget Reservation — Real DB Integration', () => {
  // Create a dedicated postgres client + drizzle instance for tests
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Test data IDs — populated in beforeAll
  let tenantId: TenantId
  let projectId: string
  let projectIdUnlimited: string
  let fileId: string
  let fileIdUnlimited: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 10 })
    testDb = drizzle(queryClient)

    // Seed: tenant → 2 projects (one with budget, one unlimited) → 1 file each
    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: 'Budget Integration Test Tenant', status: 'active' })
      .returning({ id: tenants.id })
    tenantId = asTenantId(tenant!.id)

    const [projectWithBudget] = await testDb
      .insert(projects)
      .values({
        tenantId,
        name: 'Budget Test Project',
        sourceLang: 'en-US',
        targetLangs: ['th'],
        aiBudgetMonthlyUsd: '1.00', // $1.00 budget
      })
      .returning({ id: projects.id })
    projectId = projectWithBudget!.id

    const [projectNoBudget] = await testDb
      .insert(projects)
      .values({
        tenantId,
        name: 'Unlimited Budget Project',
        sourceLang: 'en-US',
        targetLangs: ['th'],
        aiBudgetMonthlyUsd: null, // unlimited
      })
      .returning({ id: projects.id })
    projectIdUnlimited = projectNoBudget!.id

    const [file1] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId,
        fileName: 'test-budget.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/budget-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileId = file1!.id

    const [file2] = await testDb
      .insert(files)
      .values({
        projectId: projectIdUnlimited,
        tenantId,
        fileName: 'test-unlimited.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/unlimited-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileIdUnlimited = file2!.id
  })

  beforeEach(async () => {
    // Clean up ai_usage_logs between tests (keep tenant/project/file)
    await testDb.delete(aiUsageLogs).where(eq(aiUsageLogs.tenantId, tenantId))
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(aiUsageLogs).where(eq(aiUsageLogs.tenantId, tenantId))
    await testDb.delete(files).where(eq(files.tenantId, tenantId))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantId))
    await testDb.delete(tenants).where(eq(tenants.id, tenantId))
    await queryClient.end()
  })

  // ── Helper: inline reserveBudget against testDb ──
  // We cannot import the real `reserveBudget` because it imports `server-only`
  // and uses the singleton `db` from `@/db/client`. Instead, we replicate the
  // core logic against our test connection — this tests the SQL + lock behavior,
  // which is the whole point of this integration test.

  async function reserveBudgetViaTestDb(params: {
    projectId: string
    tenantId: TenantId
    fileId: string
    estimatedCost: number
  }) {
    const { projectId: pid, tenantId: tid, fileId: fid, estimatedCost } = params
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const monthStartIso = monthStart.toISOString()

    // D2: project read inside advisory-locked transaction (matches production budget.ts)
    const result = await testDb.transaction(async (tx) => {
      const lockKey = projectIdToLockKey(pid)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7001, ${lockKey})`)

      const [project] = await tx
        .select({ aiBudgetMonthlyUsd: projects.aiBudgetMonthlyUsd })
        .from(projects)
        .where(and(withTenant(projects.tenantId, tid), eq(projects.id, pid)))

      if (!project) throw new Error('Project not found')

      // Unlimited budget — no reservation needed
      if (project.aiBudgetMonthlyUsd === null) {
        return {
          hasQuota: true,
          reservationId: null,
          remainingBudgetUsd: Infinity,
          monthlyBudgetUsd: null,
          usedBudgetUsd: 0,
        }
      }

      const budget = Number(project.aiBudgetMonthlyUsd)

      const [usage] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
        })
        .from(aiUsageLogs)
        .where(
          and(
            withTenant(aiUsageLogs.tenantId, tid),
            eq(aiUsageLogs.projectId, pid),
            sql`${aiUsageLogs.createdAt} >= ${monthStartIso}::timestamptz`,
            // D1: exclude stale pending reservations (> 30 min = leaked/crashed)
            sql`(${aiUsageLogs.status} != 'pending' OR ${aiUsageLogs.createdAt} >= NOW() - INTERVAL '30 minutes')`,
          ),
        )

      const usedBudgetUsd = Number(usage?.total ?? 0)

      if (usedBudgetUsd + estimatedCost > budget) {
        return {
          hasQuota: false,
          reservationId: null,
          remainingBudgetUsd: Math.max(0, budget - usedBudgetUsd),
          monthlyBudgetUsd: budget,
          usedBudgetUsd,
        }
      }

      const [reservation] = await tx
        .insert(aiUsageLogs)
        .values({
          fileId: fid,
          projectId: pid,
          tenantId: tid,
          layer: 'L2',
          model: 'gpt-4o-mini',
          provider: 'reservation',
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost,
          latencyMs: 0,
          chunkIndex: null,
          languagePair: 'en→th',
          status: 'pending',
        })
        .returning({ id: aiUsageLogs.id })

      if (!reservation) throw new Error('Failed to insert budget reservation')

      return {
        hasQuota: true,
        reservationId: reservation.id,
        remainingBudgetUsd: Math.max(0, budget - usedBudgetUsd - estimatedCost),
        monthlyBudgetUsd: budget,
        usedBudgetUsd: usedBudgetUsd + estimatedCost,
      }
    })

    return result
  }

  async function settleBudgetViaTestDb(params: {
    reservationId: string
    tenantId: TenantId
    actualCost: number
    status: 'success' | 'error'
  }) {
    const [updated] = await testDb
      .update(aiUsageLogs)
      .set({
        estimatedCost: params.actualCost,
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
        status: params.status,
        provider: 'openai',
      })
      .where(
        and(
          eq(aiUsageLogs.id, params.reservationId),
          withTenant(aiUsageLogs.tenantId, params.tenantId),
          eq(aiUsageLogs.status, 'pending'), // P4: prevent double-settlement
        ),
      )
      .returning({ id: aiUsageLogs.id })

    return updated
  }

  async function releaseBudgetViaTestDb(reservationId: string, tid: TenantId) {
    await testDb
      .delete(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.id, reservationId),
          withTenant(aiUsageLogs.tenantId, tid),
          eq(aiUsageLogs.status, 'pending'),
        ),
      )
  }

  /** Replicate projectIdToLockKey from budget.ts (P2: | 0 for signed int32) */
  function projectIdToLockKey(pid: string): number {
    const hex = pid.replace(/-/g, '').slice(0, 8)
    return parseInt(hex, 16) | 0
  }

  // ── T1: Single reservation succeeds ──

  it('should reserve budget and settle with actual cost', async () => {
    // Reserve $0.50 against $1.00 budget
    const reservation = await reserveBudgetViaTestDb({
      projectId,
      tenantId,
      fileId,
      estimatedCost: 0.5,
    })

    expect(reservation.hasQuota).toBe(true)
    expect(reservation.reservationId).toBeTruthy()
    expect(reservation.monthlyBudgetUsd).toBe(1.0)
    expect(reservation.usedBudgetUsd).toBeCloseTo(0.5)

    // Verify pending row exists in DB
    const [pendingRow] = await testDb
      .select({
        id: aiUsageLogs.id,
        status: aiUsageLogs.status,
        estimatedCost: aiUsageLogs.estimatedCost,
      })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.id, reservation.reservationId!))

    expect(pendingRow).toBeDefined()
    expect(pendingRow!.status).toBe('pending')
    expect(pendingRow!.estimatedCost).toBeCloseTo(0.5)

    // Settle with actual cost $0.30
    const settled = await settleBudgetViaTestDb({
      reservationId: reservation.reservationId!,
      tenantId,
      actualCost: 0.3,
      status: 'success',
    })
    expect(settled).toBeDefined()

    // Verify row updated
    const [settledRow] = await testDb
      .select({ status: aiUsageLogs.status, estimatedCost: aiUsageLogs.estimatedCost })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.id, reservation.reservationId!))

    expect(settledRow!.status).toBe('success')
    expect(settledRow!.estimatedCost).toBeCloseTo(0.3)
  })

  // ── T2: Concurrent reservations serialize via advisory lock ──

  it('should serialize concurrent reservations so only one exceeds budget', async () => {
    // Budget: $0.15. Two concurrent reservations of $0.10 each.
    // Without lock: both see $0 used → both pass → $0.20 spent (overrun).
    // With lock: first reserves $0.10 → second sees $0.10 used → $0.10 + $0.10 > $0.15 → blocked.

    // First: set budget to $0.15
    await testDb
      .update(projects)
      .set({ aiBudgetMonthlyUsd: '0.15' })
      .where(eq(projects.id, projectId))

    const results = await Promise.all([
      reserveBudgetViaTestDb({
        projectId,
        tenantId,
        fileId,
        estimatedCost: 0.1,
      }),
      reserveBudgetViaTestDb({
        projectId,
        tenantId,
        fileId,
        estimatedCost: 0.1,
      }),
    ])

    const granted = results.filter((r) => r.hasQuota)
    const denied = results.filter((r) => !r.hasQuota)

    // Exactly one should pass, one should fail
    expect(granted).toHaveLength(1)
    expect(denied).toHaveLength(1)
    expect(granted[0]!.reservationId).toBeTruthy()
    expect(denied[0]!.reservationId).toBeNull()

    // Restore budget for other tests
    await testDb
      .update(projects)
      .set({ aiBudgetMonthlyUsd: '1.00' })
      .where(eq(projects.id, projectId))
  })

  // ── T3: Release frees budget for new reservation ──

  it('should free budget after release so new reservation succeeds', async () => {
    // Set tight budget
    await testDb
      .update(projects)
      .set({ aiBudgetMonthlyUsd: '0.50' })
      .where(eq(projects.id, projectId))

    // Reserve the full budget
    const reservation = await reserveBudgetViaTestDb({
      projectId,
      tenantId,
      fileId,
      estimatedCost: 0.5,
    })
    expect(reservation.hasQuota).toBe(true)

    // Another reservation should fail (budget exhausted)
    const blocked = await reserveBudgetViaTestDb({
      projectId,
      tenantId,
      fileId,
      estimatedCost: 0.1,
    })
    expect(blocked.hasQuota).toBe(false)

    // Release the first reservation
    await releaseBudgetViaTestDb(reservation.reservationId!, tenantId)

    // Verify pending row is deleted
    const [deletedRow] = await testDb
      .select({ id: aiUsageLogs.id })
      .from(aiUsageLogs)
      .where(eq(aiUsageLogs.id, reservation.reservationId!))
    expect(deletedRow).toBeUndefined()

    // Now a new reservation should succeed
    const newReservation = await reserveBudgetViaTestDb({
      projectId,
      tenantId,
      fileId,
      estimatedCost: 0.1,
    })
    expect(newReservation.hasQuota).toBe(true)

    // Restore budget
    await testDb
      .update(projects)
      .set({ aiBudgetMonthlyUsd: '1.00' })
      .where(eq(projects.id, projectId))
  })

  // ── T4: Lock key uniqueness ──

  it('should produce different lock keys for different project UUIDs', () => {
    const uuids = [
      'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
      'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
      '00000000-0000-4000-8000-000000000001',
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    ]

    const keys = uuids.map((id) => projectIdToLockKey(id))
    const uniqueKeys = new Set(keys)

    // All keys must be unique
    expect(uniqueKeys.size).toBe(uuids.length)

    // All keys must be valid signed int32 (P2: | 0 coerces to signed range)
    for (const key of keys) {
      expect(Number.isInteger(key)).toBe(true)
      expect(key).toBeGreaterThanOrEqual(-2147483648)
      expect(key).toBeLessThanOrEqual(2147483647)
    }
  })

  // ── T5: Unlimited budget skips lock ──

  it('should return hasQuota=true without reservation for unlimited budget', async () => {
    const result = await reserveBudgetViaTestDb({
      projectId: projectIdUnlimited,
      tenantId,
      fileId: fileIdUnlimited,
      estimatedCost: 999.99,
    })

    expect(result.hasQuota).toBe(true)
    expect(result.reservationId).toBeNull()
    expect(result.monthlyBudgetUsd).toBeNull()
    expect(result.remainingBudgetUsd).toBe(Infinity)

    // Verify no pending row was inserted
    const rows = await testDb
      .select({ id: aiUsageLogs.id })
      .from(aiUsageLogs)
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, tenantId),
          eq(aiUsageLogs.projectId, projectIdUnlimited),
        ),
      )
    expect(rows).toHaveLength(0)
  })
})
