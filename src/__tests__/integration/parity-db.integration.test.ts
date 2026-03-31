/**
 * Integration tests for parity reports (generateParityReport + reportMissingCheck) — real DB.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - parityReports insert + JSONB round-trip + tenant isolation
 * - missingCheckReports insert + all fields preserved + tenant isolation
 */
import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { missingCheckReports } from '@/db/schema/missingCheckReports'
import { parityReports } from '@/db/schema/parityReports'
import { projects } from '@/db/schema/projects'
import { tenants } from '@/db/schema/tenants'
import { users } from '@/db/schema/users'
import { asTenantId, type TenantId } from '@/types/tenant'

/**
 * Insert user via raw SQL — the Drizzle schema includes `metadata` column
 * which may not exist in the real DB (migration not applied). Raw SQL avoids
 * referencing non-existent columns.
 */
async function insertTestUser(
  db: ReturnType<typeof drizzle>,
  params: { id: string; tenantId: string; email: string; displayName: string },
) {
  await db.execute(
    sql`INSERT INTO users (id, tenant_id, email, display_name) VALUES (${params.id}, ${params.tenantId}, ${params.email}, ${params.displayName})`,
  )
}

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Parity DB Integration — Real DB', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Tenant A
  let tenantIdA: TenantId
  let projectIdA: string
  let fileIdA: string
  let userIdA: string

  // Tenant B (for isolation tests)
  let tenantIdB: TenantId
  let projectIdB: string
  let userIdB: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // ── Seed Tenant A ──
    const [tenantA] = await testDb
      .insert(tenants)
      .values({ name: 'Parity Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdA = asTenantId(tenantA!.id)

    // User A — uses a fixed UUID as Supabase auth UID
    userIdA = randomUUID()
    await insertTestUser(testDb, {
      id: userIdA,
      tenantId: tenantIdA as string,
      email: 'parity-a@test.local',
      displayName: 'Parity Tester A',
    })

    const [projA] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'Parity Test Project A',
        sourceLang: 'en-US',
        targetLangs: ['th'],
      })
      .returning({ id: projects.id })
    projectIdA = projA!.id

    const [fA] = await testDb
      .insert(files)
      .values({
        projectId: projectIdA,
        tenantId: tenantIdA,
        fileName: 'parity-test.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 2048,
        storagePath: '/test/parity-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileIdA = fA!.id

    // ── Seed Tenant B ──
    const [tenantB] = await testDb
      .insert(tenants)
      .values({ name: 'Parity Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdB = asTenantId(tenantB!.id)

    userIdB = randomUUID()
    await insertTestUser(testDb, {
      id: userIdB,
      tenantId: tenantIdB as string,
      email: 'parity-b@test.local',
      displayName: 'Parity Tester B',
    })

    const [projB] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdB,
        name: 'Parity Test Project B',
        sourceLang: 'en-US',
        targetLangs: ['ja'],
      })
      .returning({ id: projects.id })
    projectIdB = projB!.id
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order — guard against undefined if beforeAll failed
    const tids = [tenantIdA, tenantIdB].filter(Boolean)
    for (const tid of tids) {
      await testDb.delete(missingCheckReports).where(eq(missingCheckReports.tenantId, tid))
      await testDb.delete(parityReports).where(eq(parityReports.tenantId, tid))
      await testDb.delete(files).where(eq(files.tenantId, tid))
      await testDb.delete(projects).where(eq(projects.tenantId, tid))
      await testDb.execute(sql`DELETE FROM users WHERE tenant_id = ${tid as string}`)
      await testDb.delete(tenants).where(eq(tenants.id, tid))
    }
    await queryClient.end()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // generateParityReport tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('generateParityReport — parityReports table', () => {
    // T1: Insert parity report
    it('should insert a parity report and query it back with all fields', async () => {
      const comparisonData = {
        matched: [
          { xbenchCategory: 'Terminology', toolCategory: 'terminology', severity: 'major' },
        ],
        toolOnly: [],
        xbenchOnly: [],
      }

      const [report] = await testDb
        .insert(parityReports)
        .values({
          projectId: projectIdA,
          tenantId: tenantIdA,
          fileId: fileIdA,
          comparisonData,
          xbenchReportStoragePath: '/test/parity/report-123.xlsx',
          toolFindingCount: 5,
          xbenchFindingCount: 3,
          bothFoundCount: 1,
          toolOnlyCount: 4,
          xbenchOnlyCount: 2,
          generatedBy: userIdA,
        })
        .returning()

      expect(report).toBeDefined()
      expect(report!.id).toBeTruthy()

      // Query back
      const [queried] = await testDb
        .select()
        .from(parityReports)
        .where(and(withTenant(parityReports.tenantId, tenantIdA), eq(parityReports.id, report!.id)))

      expect(queried).toBeDefined()
      expect(queried!.projectId).toBe(projectIdA)
      expect(queried!.tenantId).toBe(tenantIdA as string)
      expect(queried!.fileId).toBe(fileIdA)
      expect(queried!.toolFindingCount).toBe(5)
      expect(queried!.xbenchFindingCount).toBe(3)
      expect(queried!.bothFoundCount).toBe(1)
      expect(queried!.toolOnlyCount).toBe(4)
      expect(queried!.xbenchOnlyCount).toBe(2)
      expect(queried!.xbenchReportStoragePath).toBe('/test/parity/report-123.xlsx')
      expect(queried!.generatedBy).toBe(userIdA)
      expect(queried!.createdAt).toBeInstanceOf(Date)
    })

    // T2: comparisonData JSONB round-trip with complex nested data
    it('should preserve complex nested JSONB comparisonData through round-trip', async () => {
      const complexData = {
        matched: [
          {
            xbenchCategory: 'Inconsistency in Translation',
            toolCategory: 'consistency',
            severity: 'minor',
          },
          {
            xbenchCategory: 'Number Mismatch',
            toolCategory: 'accuracy',
            severity: 'critical',
          },
        ],
        toolOnly: [
          {
            sourceTextExcerpt: 'The quick brown fox',
            targetTextExcerpt: 'สุนัขจิ้งจอกสีน้ำตาล',
            category: 'fluency',
            severity: 'minor',
          },
        ],
        xbenchOnly: [
          {
            sourceText: 'Click Save',
            targetText: 'คลิกบันทึก',
            category: 'Untranslated',
            severity: 'major',
            fileName: 'ui-strings.sdlxliff',
            segmentNumber: 42,
          },
        ],
        metadata: {
          comparisonTimestamp: '2026-03-30T10:00:00Z',
          version: 2,
          nestedArray: [1, 2, [3, 4]],
          nullableField: null,
        },
      }

      const [report] = await testDb
        .insert(parityReports)
        .values({
          projectId: projectIdA,
          tenantId: tenantIdA,
          fileId: null, // project-level report (no specific file)
          comparisonData: complexData,
          xbenchReportStoragePath: '/test/parity/complex-report.xlsx',
          toolFindingCount: 10,
          xbenchFindingCount: 8,
          bothFoundCount: 2,
          toolOnlyCount: 1,
          xbenchOnlyCount: 1,
          generatedBy: userIdA,
        })
        .returning()

      const [queried] = await testDb
        .select({ comparisonData: parityReports.comparisonData })
        .from(parityReports)
        .where(eq(parityReports.id, report!.id))

      const data = queried!.comparisonData as typeof complexData
      expect(data.matched).toHaveLength(2)
      expect(data.matched[0]!.xbenchCategory).toBe('Inconsistency in Translation')
      expect(data.matched[1]!.severity).toBe('critical')
      expect(data.toolOnly[0]!.targetTextExcerpt).toBe('สุนัขจิ้งจอกสีน้ำตาล')
      expect(data.xbenchOnly[0]!.segmentNumber).toBe(42)
      expect(data.metadata.nestedArray).toEqual([1, 2, [3, 4]])
      expect(data.metadata.nullableField).toBeNull()
    })

    // T3: Tenant isolation
    it('should enforce tenant isolation — tenant B cannot see tenant A reports', async () => {
      // Insert report for tenant A
      const [reportA] = await testDb
        .insert(parityReports)
        .values({
          projectId: projectIdA,
          tenantId: tenantIdA,
          comparisonData: { matched: [], toolOnly: [], xbenchOnly: [] },
          xbenchReportStoragePath: '/test/parity/isolation-test.xlsx',
          toolFindingCount: 0,
          xbenchFindingCount: 0,
          bothFoundCount: 0,
          toolOnlyCount: 0,
          xbenchOnlyCount: 0,
          generatedBy: userIdA,
        })
        .returning({ id: parityReports.id })

      expect(reportA).toBeDefined()

      // Query as tenant B — should find 0 rows
      const tenantBResults = await testDb
        .select()
        .from(parityReports)
        .where(
          and(withTenant(parityReports.tenantId, tenantIdB), eq(parityReports.id, reportA!.id)),
        )

      expect(tenantBResults).toHaveLength(0)

      // Query as tenant A — should find the report
      const tenantAResults = await testDb
        .select()
        .from(parityReports)
        .where(
          and(withTenant(parityReports.tenantId, tenantIdA), eq(parityReports.id, reportA!.id)),
        )

      expect(tenantAResults).toHaveLength(1)
    })

    // T4: Multiple reports per project
    it('should support multiple reports for the same project', async () => {
      const baseValues = {
        projectId: projectIdA,
        tenantId: tenantIdA,
        comparisonData: { matched: [], toolOnly: [], xbenchOnly: [] },
        xbenchReportStoragePath: '/test/parity/multi-1.xlsx',
        toolFindingCount: 3,
        xbenchFindingCount: 2,
        bothFoundCount: 1,
        toolOnlyCount: 2,
        xbenchOnlyCount: 1,
        generatedBy: userIdA,
      }

      const [report1] = await testDb
        .insert(parityReports)
        .values({ ...baseValues, xbenchReportStoragePath: '/test/parity/multi-1.xlsx' })
        .returning({ id: parityReports.id })

      const [report2] = await testDb
        .insert(parityReports)
        .values({
          ...baseValues,
          xbenchReportStoragePath: '/test/parity/multi-2.xlsx',
          toolFindingCount: 7,
          xbenchFindingCount: 5,
        })
        .returning({ id: parityReports.id })

      expect(report1!.id).not.toBe(report2!.id)

      // Both should be queryable
      const allReports = await testDb
        .select()
        .from(parityReports)
        .where(
          and(
            withTenant(parityReports.tenantId, tenantIdA),
            eq(parityReports.projectId, projectIdA),
          ),
        )

      const reportIds = allReports.map((r) => r.id)
      expect(reportIds).toContain(report1!.id)
      expect(reportIds).toContain(report2!.id)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // reportMissingCheck tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('reportMissingCheck — missingCheckReports table', () => {
    // T5: Insert missing check report
    it('should insert a missing check report and verify persistence', async () => {
      const trackingRef = `MCR-TEST-${Date.now()}`

      const [report] = await testDb
        .insert(missingCheckReports)
        .values({
          projectId: projectIdA,
          tenantId: tenantIdA,
          fileReference: 'ui-strings.sdlxliff',
          segmentNumber: 15,
          expectedDescription: 'Should detect untranslated UI labels',
          xbenchCheckType: 'Untranslated Segments',
          status: 'open',
          trackingReference: trackingRef,
          reportedBy: userIdA,
        })
        .returning()

      expect(report).toBeDefined()
      expect(report!.id).toBeTruthy()
      expect(report!.trackingReference).toBe(trackingRef)
      expect(report!.status).toBe('open')

      // Query back to verify persistence
      const [queried] = await testDb
        .select()
        .from(missingCheckReports)
        .where(
          and(
            withTenant(missingCheckReports.tenantId, tenantIdA),
            eq(missingCheckReports.id, report!.id),
          ),
        )

      expect(queried).toBeDefined()
      expect(queried!.projectId).toBe(projectIdA)
      expect(queried!.fileReference).toBe('ui-strings.sdlxliff')
      expect(queried!.segmentNumber).toBe(15)
      expect(queried!.createdAt).toBeInstanceOf(Date)
    })

    // T6: All fields preserved
    it('should preserve all fields including category, description, expectedBehavior, fileReference, reporter', async () => {
      const trackingRef = `MCR-FULL-${Date.now()}`

      const [report] = await testDb
        .insert(missingCheckReports)
        .values({
          projectId: projectIdA,
          tenantId: tenantIdA,
          fileReference: 'glossary-terms.xlsx',
          segmentNumber: 99,
          expectedDescription: 'Glossary term mismatch should be flagged for Thai compound words',
          xbenchCheckType: 'Terminology',
          status: 'open',
          trackingReference: trackingRef,
          reportedBy: userIdA,
        })
        .returning()

      const [queried] = await testDb
        .select()
        .from(missingCheckReports)
        .where(eq(missingCheckReports.id, report!.id))

      expect(queried!.fileReference).toBe('glossary-terms.xlsx')
      expect(queried!.segmentNumber).toBe(99)
      expect(queried!.expectedDescription).toBe(
        'Glossary term mismatch should be flagged for Thai compound words',
      )
      expect(queried!.xbenchCheckType).toBe('Terminology')
      expect(queried!.status).toBe('open')
      expect(queried!.trackingReference).toBe(trackingRef)
      expect(queried!.reportedBy).toBe(userIdA)
      expect(queried!.resolvedBy).toBeNull()
      expect(queried!.resolvedAt).toBeNull()
    })

    // T7: Tenant isolation
    it('should enforce tenant isolation — tenant B cannot see tenant A missing check reports', async () => {
      const trackingRef = `MCR-ISO-${Date.now()}`

      const [reportA] = await testDb
        .insert(missingCheckReports)
        .values({
          projectId: projectIdA,
          tenantId: tenantIdA,
          fileReference: 'isolation-test.sdlxliff',
          segmentNumber: 1,
          expectedDescription: 'Isolation test report',
          xbenchCheckType: 'Consistency',
          status: 'open',
          trackingReference: trackingRef,
          reportedBy: userIdA,
        })
        .returning({ id: missingCheckReports.id })

      expect(reportA).toBeDefined()

      // Query as tenant B — should find 0 rows
      const tenantBResults = await testDb
        .select()
        .from(missingCheckReports)
        .where(
          and(
            withTenant(missingCheckReports.tenantId, tenantIdB),
            eq(missingCheckReports.id, reportA!.id),
          ),
        )

      expect(tenantBResults).toHaveLength(0)

      // Query as tenant A — should find the report
      const tenantAResults = await testDb
        .select()
        .from(missingCheckReports)
        .where(
          and(
            withTenant(missingCheckReports.tenantId, tenantIdA),
            eq(missingCheckReports.id, reportA!.id),
          ),
        )

      expect(tenantAResults).toHaveLength(1)
    })
  })
})
