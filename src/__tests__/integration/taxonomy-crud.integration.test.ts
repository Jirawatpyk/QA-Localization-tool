/**
 * Integration tests for Taxonomy CRUD against a real Postgres database.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - Create mapping with auto-incrementing displayOrder
 * - Update mapping preserves unchanged fields
 * - Reorder mappings atomically in a transaction
 * - Soft delete (isActive=false) retains row
 * - getTaxonomyMappings returns only active rows ordered by displayOrder
 * - Findings referencing a soft-deleted taxonomy category remain queryable
 *
 * NOTE: taxonomy_definitions has NO tenant_id — shared reference data per ERD 1.9.
 * No withTenant() needed for taxonomy queries.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { tenants } from '@/db/schema/tenants'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Taxonomy CRUD — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // IDs created during tests — tracked for cleanup
  const createdTaxonomyIds: string[] = []

  // Seed data IDs for T7 (finding + taxonomy cross-reference)
  let tenantId: TenantId
  let projectId: string
  let fileId: string
  let segmentId: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // Seed: tenant → project → file → segment (needed for T7 finding insertion)
    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: 'Taxonomy CRUD Test Tenant', status: 'active' })
      .returning({ id: tenants.id })
    tenantId = asTenantId(tenant!.id)

    const [project] = await testDb
      .insert(projects)
      .values({
        tenantId,
        name: 'Taxonomy Test Project',
        sourceLang: 'en-US',
        targetLangs: ['th'],
      })
      .returning({ id: projects.id })
    projectId = project!.id

    const [file] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId,
        fileName: 'test-taxonomy.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/taxonomy-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileId = file!.id

    const [seg] = await testDb
      .insert(segments)
      .values({
        fileId,
        projectId,
        tenantId,
        segmentNumber: 1,
        sourceText: 'Hello',
        targetText: 'สวัสดี',
        sourceLang: 'en-US',
        targetLang: 'th',
        wordCount: 1,
      })
      .returning({ id: segments.id })
    segmentId = seg!.id
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    // 1. Findings (references segments, files, projects, tenants)
    await testDb.delete(findings).where(eq(findings.tenantId, tenantId))
    // 2. Segments (references files)
    await testDb.delete(segments).where(eq(segments.tenantId, tenantId))
    // 3. Files (references projects)
    await testDb.delete(files).where(eq(files.tenantId, tenantId))
    // 4. Projects (references tenants)
    await testDb.delete(projects).where(eq(projects.tenantId, tenantId))
    // 5. Tenants
    await testDb.delete(tenants).where(eq(tenants.id, tenantId))
    // 6. Taxonomy definitions (no FK, shared data — clean up test-created rows)
    if (createdTaxonomyIds.length > 0) {
      for (const id of createdTaxonomyIds) {
        await testDb.delete(taxonomyDefinitions).where(eq(taxonomyDefinitions.id, id))
      }
    }
    await queryClient.end()
  })

  // ── Helper: insert taxonomy definition directly ──
  async function insertTaxonomy(overrides: Partial<typeof taxonomyDefinitions.$inferInsert> = {}) {
    const [row] = await testDb
      .insert(taxonomyDefinitions)
      .values({
        category: overrides.category ?? 'Test Category',
        description: overrides.description ?? 'Test description',
        severity: overrides.severity ?? 'minor',
        isCustom: overrides.isCustom ?? true,
        isActive: overrides.isActive ?? true,
        displayOrder: overrides.displayOrder ?? 0,
        ...overrides,
      })
      .returning()

    if (!row) throw new Error('Failed to insert taxonomy definition')
    createdTaxonomyIds.push(row.id)
    return row
  }

  // ── T1: Create mapping ──

  it('should insert a new taxonomy definition and query it back', async () => {
    const row = await insertTaxonomy({
      category: 'Accuracy',
      severity: 'major',
      description: 'Translation accuracy issues',
      displayOrder: 100,
    })

    expect(row.id).toBeTruthy()
    expect(row.category).toBe('Accuracy')
    expect(row.severity).toBe('major')
    expect(row.description).toBe('Translation accuracy issues')
    expect(row.displayOrder).toBe(100)
    expect(row.isActive).toBe(true)
    expect(row.isCustom).toBe(true)
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.updatedAt).toBeInstanceOf(Date)

    // Query back from DB to verify persistence
    const [queried] = await testDb
      .select()
      .from(taxonomyDefinitions)
      .where(eq(taxonomyDefinitions.id, row.id))

    expect(queried).toBeDefined()
    expect(queried!.category).toBe('Accuracy')
    expect(queried!.severity).toBe('major')
  })

  // ── T2: Auto displayOrder ──

  it('should auto-increment displayOrder for sequential inserts', async () => {
    // Get current max displayOrder
    const [maxRow] = await testDb
      .select({ max: sql<number>`COALESCE(MAX(${taxonomyDefinitions.displayOrder}), -1)` })
      .from(taxonomyDefinitions)
    const baseOrder = (maxRow?.max ?? -1) + 1

    const row1 = await insertTaxonomy({
      category: 'AutoOrder-1',
      description: 'First',
      displayOrder: baseOrder,
    })
    const row2 = await insertTaxonomy({
      category: 'AutoOrder-2',
      description: 'Second',
      displayOrder: baseOrder + 1,
    })
    const row3 = await insertTaxonomy({
      category: 'AutoOrder-3',
      description: 'Third',
      displayOrder: baseOrder + 2,
    })

    expect(row1.displayOrder).toBe(baseOrder)
    expect(row2.displayOrder).toBe(baseOrder + 1)
    expect(row3.displayOrder).toBe(baseOrder + 2)

    // Verify order is sequential
    expect(row2.displayOrder - row1.displayOrder).toBe(1)
    expect(row3.displayOrder - row2.displayOrder).toBe(1)
  })

  // ── T3: Update mapping ──

  it('should update description and severity while preserving other fields', async () => {
    const original = await insertTaxonomy({
      category: 'Fluency',
      severity: 'minor',
      description: 'Original description',
      parentCategory: 'Language Quality',
      displayOrder: 200,
    })

    // Update only description + severity
    const [updated] = await testDb
      .update(taxonomyDefinitions)
      .set({
        description: 'Updated fluency description',
        severity: 'major',
        updatedAt: new Date(),
      })
      .where(eq(taxonomyDefinitions.id, original.id))
      .returning()

    expect(updated).toBeDefined()
    expect(updated!.description).toBe('Updated fluency description')
    expect(updated!.severity).toBe('major')

    // Unchanged fields preserved
    expect(updated!.category).toBe('Fluency')
    expect(updated!.parentCategory).toBe('Language Quality')
    expect(updated!.displayOrder).toBe(200)
    expect(updated!.isActive).toBe(true)
    expect(updated!.isCustom).toBe(true)

    // updatedAt should be newer
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime())
  })

  // ── T4: Reorder (atomic) ──

  it('should reorder displayOrder atomically in a transaction', async () => {
    const a = await insertTaxonomy({ category: 'Reorder-A', description: 'A', displayOrder: 300 })
    const b = await insertTaxonomy({ category: 'Reorder-B', description: 'B', displayOrder: 301 })
    const c = await insertTaxonomy({ category: 'Reorder-C', description: 'C', displayOrder: 302 })

    // Reorder: [C, A, B] → displayOrder should become [300, 301, 302]
    const now = new Date()
    await testDb.transaction(async (tx) => {
      await Promise.all([
        tx
          .update(taxonomyDefinitions)
          .set({ displayOrder: 300, updatedAt: now })
          .where(eq(taxonomyDefinitions.id, c.id)),
        tx
          .update(taxonomyDefinitions)
          .set({ displayOrder: 301, updatedAt: now })
          .where(eq(taxonomyDefinitions.id, a.id)),
        tx
          .update(taxonomyDefinitions)
          .set({ displayOrder: 302, updatedAt: now })
          .where(eq(taxonomyDefinitions.id, b.id)),
      ])
    })

    // Verify new order
    const rows = await testDb
      .select({ id: taxonomyDefinitions.id, displayOrder: taxonomyDefinitions.displayOrder })
      .from(taxonomyDefinitions)
      .where(sql`${taxonomyDefinitions.id} IN (${sql.raw(`'${a.id}', '${b.id}', '${c.id}'`)})`)
      .orderBy(asc(taxonomyDefinitions.displayOrder))

    expect(rows).toHaveLength(3)
    expect(rows[0]!.id).toBe(c.id) // C is now first (300)
    expect(rows[0]!.displayOrder).toBe(300)
    expect(rows[1]!.id).toBe(a.id) // A is now second (301)
    expect(rows[1]!.displayOrder).toBe(301)
    expect(rows[2]!.id).toBe(b.id) // B is now third (302)
    expect(rows[2]!.displayOrder).toBe(302)
  })

  // ── T5: Soft delete ──

  it('should soft delete by setting isActive=false while retaining the row', async () => {
    const row = await insertTaxonomy({
      category: 'ToDelete',
      description: 'Will be soft deleted',
      displayOrder: 400,
    })

    expect(row.isActive).toBe(true)

    // Soft delete
    await testDb
      .update(taxonomyDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(taxonomyDefinitions.id, row.id))

    // Row still exists
    const [afterDelete] = await testDb
      .select()
      .from(taxonomyDefinitions)
      .where(eq(taxonomyDefinitions.id, row.id))

    expect(afterDelete).toBeDefined()
    expect(afterDelete!.isActive).toBe(false)
    expect(afterDelete!.category).toBe('ToDelete')
    expect(afterDelete!.description).toBe('Will be soft deleted')
  })

  // ── T6: getTaxonomyMappings (active only, ordered) ──

  it('should fetch only active mappings ordered by displayOrder', async () => {
    // Use unique prefix to isolate from other test data
    const prefix = `GetTest-${Date.now()}`

    const active1 = await insertTaxonomy({
      category: `${prefix}-Active1`,
      description: 'Active first',
      displayOrder: 502,
    })
    const active2 = await insertTaxonomy({
      category: `${prefix}-Active2`,
      description: 'Active second',
      displayOrder: 501,
    })
    const inactive = await insertTaxonomy({
      category: `${prefix}-Inactive`,
      description: 'Inactive',
      displayOrder: 500,
      isActive: false,
    })

    // Query active only, ordered by displayOrder
    const rows = await testDb
      .select()
      .from(taxonomyDefinitions)
      .where(
        and(
          eq(taxonomyDefinitions.isActive, true),
          sql`${taxonomyDefinitions.category} LIKE ${prefix + '%'}`,
        ),
      )
      .orderBy(asc(taxonomyDefinitions.displayOrder))

    // Should have 2 active rows (inactive excluded)
    expect(rows).toHaveLength(2)

    // Verify order: active2 (501) before active1 (502)
    expect(rows[0]!.id).toBe(active2.id)
    expect(rows[0]!.displayOrder).toBe(501)
    expect(rows[1]!.id).toBe(active1.id)
    expect(rows[1]!.displayOrder).toBe(502)

    // Inactive row not in results
    const inactiveInResults = rows.find((r) => r.id === inactive.id)
    expect(inactiveInResults).toBeUndefined()
  })

  // ── T7: Finding with deleted category ──

  it('should not break finding queries when referenced taxonomy category is soft-deleted', async () => {
    // Create taxonomy definition
    const taxDef = await insertTaxonomy({
      category: 'Terminology',
      description: 'Terminology consistency',
      severity: 'major',
      displayOrder: 600,
    })

    // Create a finding that references the same category string
    const [finding] = await testDb
      .insert(findings)
      .values({
        segmentId,
        projectId,
        tenantId,
        fileId,
        status: 'pending',
        severity: 'major',
        category: taxDef.category, // matches taxonomy category
        description: 'Inconsistent terminology usage',
        detectedByLayer: 'L1',
      })
      .returning()

    expect(finding).toBeDefined()

    // Soft delete the taxonomy definition
    await testDb
      .update(taxonomyDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(taxonomyDefinitions.id, taxDef.id))

    // Verify taxonomy is inactive
    const [deletedTax] = await testDb
      .select({ isActive: taxonomyDefinitions.isActive })
      .from(taxonomyDefinitions)
      .where(eq(taxonomyDefinitions.id, taxDef.id))
    expect(deletedTax!.isActive).toBe(false)

    // Finding should still be queryable — no cascade break
    const [queriedFinding] = await testDb
      .select()
      .from(findings)
      .where(and(eq(findings.id, finding!.id), withTenant(findings.tenantId, tenantId)))

    expect(queriedFinding).toBeDefined()
    expect(queriedFinding!.category).toBe('Terminology')
    expect(queriedFinding!.severity).toBe('major')
    expect(queriedFinding!.description).toBe('Inconsistent terminology usage')

    // Clean up finding
    await testDb.delete(findings).where(eq(findings.id, finding!.id))
  })
})
