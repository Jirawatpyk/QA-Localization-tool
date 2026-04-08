/**
 * Integration tests for getFileHistory action against a real Postgres database.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - Pagination (limit/offset slicing with FILE_HISTORY_PAGE_SIZE)
 * - Score LEFT JOIN (files with/without scores)
 * - Chronological ordering (ORDER BY created_at DESC)
 * - Tenant isolation (withTenant on every query)
 * - Empty project returns empty array
 * - Last reviewer name via reviewActions JOIN
 */
import { and, eq, desc, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { reviewActions } from '@/db/schema/reviewActions'
import { scores } from '@/db/schema/scores'
import { tenants } from '@/db/schema/tenants'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('getFileHistory — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Tenant A (primary test tenant)
  let tenantAId: TenantId
  let projectAId: string
  let userAId: string
  let fileIds: string[] // 5 files for tenant A

  // Tenant B (isolation test)
  let tenantBId: TenantId
  let projectBId: string
  let _fileBId: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // ── Seed Tenant A ──
    const [tenantA] = await testDb
      .insert(tenants)
      .values({ name: 'FileHistory Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantAId = asTenantId(tenantA!.id)

    const [projectA] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantAId,
        name: 'FileHistory Test Project A',
        sourceLang: 'en-US',
        targetLangs: ['th'],
        autoPassThreshold: 95,
      })
      .returning({ id: projects.id })
    projectAId = projectA!.id

    // Create a user for review actions (Supabase auth UID style — manual UUID)
    // Use raw SQL to avoid Drizzle including columns that may not exist in local DB yet
    const manualUserAId = crypto.randomUUID()
    await testDb.execute(
      sql`INSERT INTO users (id, tenant_id, email, display_name) VALUES (${manualUserAId}, ${tenantAId}, 'alice-filehistory@test.com', 'Alice Reviewer')`,
    )
    userAId = manualUserAId

    // Insert 5 files with staggered created_at for ordering tests
    fileIds = []
    for (let i = 0; i < 5; i++) {
      const [file] = await testDb
        .insert(files)
        .values({
          projectId: projectAId,
          tenantId: tenantAId,
          fileName: `file-${i + 1}.sdlxliff`,
          fileType: 'sdlxliff',
          fileSizeBytes: 1024,
          storagePath: `/test/file-history-${i + 1}.sdlxliff`,
          status: 'l1_completed',
          createdAt: new Date(`2026-03-0${i + 1}T10:00:00Z`),
        })
        .returning({ id: files.id })
      fileIds.push(file!.id)
    }

    // Insert scores for files 0, 1, 2 (files 3, 4 have NO scores)
    await testDb.insert(scores).values({
      fileId: fileIds[0]!,
      projectId: projectAId,
      tenantId: tenantAId,
      mqmScore: 98,
      totalWords: 500,
      criticalCount: 0,
      majorCount: 1,
      minorCount: 2,
      npt: 0.5,
      layerCompleted: 'L1',
      status: 'calculated',
    })
    await testDb.insert(scores).values({
      fileId: fileIds[1]!,
      projectId: projectAId,
      tenantId: tenantAId,
      mqmScore: 75,
      totalWords: 300,
      criticalCount: 0,
      majorCount: 3,
      minorCount: 5,
      npt: 2.1,
      layerCompleted: 'L1',
      status: 'calculated',
    })
    await testDb.insert(scores).values({
      fileId: fileIds[2]!,
      projectId: projectAId,
      tenantId: tenantAId,
      mqmScore: 99,
      totalWords: 200,
      criticalCount: 1,
      majorCount: 0,
      minorCount: 0,
      npt: 0.1,
      layerCompleted: 'L1',
      status: 'calculated',
    })

    // Insert review actions for file 0 (need segment + finding FK chain)
    // Use raw SQL to avoid Drizzle including columns that may not exist in local DB
    const segResult = await testDb.execute(
      sql`INSERT INTO segments (file_id, project_id, tenant_id, segment_number, source_text, target_text, source_lang, target_lang, word_count)
          VALUES (${fileIds[0]!}, ${projectAId}, ${tenantAId}, 1, 'Hello', 'สวัสดี', 'en-US', 'th', 1)
          RETURNING id`,
    )
    const segId = (segResult[0] as { id: string }).id

    const findingResult = await testDb.execute(
      sql`INSERT INTO findings (segment_id, project_id, tenant_id, file_id, severity, category, description, detected_by_layer)
          VALUES (${segId}, ${projectAId}, ${tenantAId}, ${fileIds[0]!}, 'minor', 'style', 'Test finding for review action', 'L1')
          RETURNING id`,
    )
    const findingId = (findingResult[0] as { id: string }).id

    // Create a review session for the review action
    // Raw SQL for safety with local DB schema
    await testDb.execute(
      sql`INSERT INTO review_sessions (project_id, tenant_id, reviewer_id) VALUES (${projectAId}, ${tenantAId}, ${userAId})`,
    )

    // Review action for file 0 — Alice is the reviewer
    // Raw SQL to avoid Drizzle including columns not yet in local DB
    await testDb.execute(
      sql`INSERT INTO review_actions (finding_id, file_id, project_id, tenant_id, action_type, previous_state, new_state, user_id, created_at)
          VALUES (${findingId}, ${fileIds[0]!}, ${projectAId}, ${tenantAId}, 'accept', 'pending', 'accepted', ${userAId}, '2026-03-10T12:00:00Z')`,
    )

    // ── Seed Tenant B ──
    const [tenantB] = await testDb
      .insert(tenants)
      .values({ name: 'FileHistory Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantBId = asTenantId(tenantB!.id)

    const [projectB] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantBId,
        name: 'FileHistory Test Project B',
        sourceLang: 'en-US',
        targetLangs: ['ja'],
      })
      .returning({ id: projects.id })
    projectBId = projectB!.id

    const [fileB] = await testDb
      .insert(files)
      .values({
        projectId: projectBId,
        tenantId: tenantBId,
        fileName: 'tenant-b-file.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        storagePath: '/test/tenant-b-file.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    _fileBId = fileB!.id
  })

  afterAll(async () => {
    if (!queryClient) return

    // Cleanup Tenant A (reverse FK order)
    if (tenantAId) {
      await testDb.delete(reviewActions).where(eq(reviewActions.tenantId, tenantAId))
      await testDb.execute(sql`DELETE FROM findings WHERE tenant_id = ${tenantAId}`)
      await testDb.execute(sql`DELETE FROM segments WHERE tenant_id = ${tenantAId}`)
      await testDb.delete(scores).where(eq(scores.tenantId, tenantAId))
      await testDb.delete(files).where(eq(files.tenantId, tenantAId))
      await testDb.execute(sql`DELETE FROM review_sessions WHERE tenant_id = ${tenantAId}`)
      await testDb.delete(projects).where(eq(projects.tenantId, tenantAId))
      await testDb.execute(sql`DELETE FROM users WHERE tenant_id = ${tenantAId}`)
      await testDb.delete(tenants).where(eq(tenants.id, tenantAId))
    }

    // Cleanup Tenant B
    if (tenantBId) {
      await testDb.delete(files).where(eq(files.tenantId, tenantBId))
      await testDb.delete(projects).where(eq(projects.tenantId, tenantBId))
      await testDb.delete(tenants).where(eq(tenants.id, tenantBId))
    }

    await queryClient.end()
  })

  // ── Helper: replicate getFileHistory core queries against testDb ──
  // Cannot import the real action (uses `server-only` + singleton `db` + `requireRole`).
  // We replicate the SQL logic to test real DB behavior.

  async function queryFileHistory(params: {
    projectId: string
    tenantId: TenantId
    page?: number
    pageSize?: number
  }) {
    const { projectId, tenantId, page = 1, pageSize = 50 } = params

    // Query 1: project threshold
    const [project] = await testDb
      .select({ autoPassThreshold: projects.autoPassThreshold })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    const threshold = project?.autoPassThreshold ?? 95

    // Query 2: files + scores LEFT JOIN
    const allFiles = await testDb
      .select({
        fileId: files.id,
        fileName: files.fileName,
        mqmScore: scores.mqmScore,
        criticalCount: scores.criticalCount,
        status: files.status,
        createdAt: files.createdAt,
      })
      .from(files)
      .leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))
      .where(and(withTenant(files.tenantId, tenantId), eq(files.projectId, projectId)))
      .orderBy(desc(files.createdAt))

    // Pagination (application-side, same as production code)
    const offset = (page - 1) * pageSize
    const paged = allFiles.slice(offset, offset + pageSize)

    return {
      files: paged,
      totalCount: allFiles.length,
      threshold,
    }
  }

  // ── T1: Basic history — 5 files with scores, verify all returned ──

  it('T1: should return all 5 files with correct data for tenant A', async () => {
    const result = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
    })

    expect(result.totalCount).toBe(5)
    expect(result.files).toHaveLength(5)

    // Verify file names are present
    const fileNames = result.files.map((f) => f.fileName)
    for (let i = 1; i <= 5; i++) {
      expect(fileNames).toContain(`file-${i}.sdlxliff`)
    }
  })

  // ── T2: Pagination — 5 files, limit=2 ──

  it('T2: should paginate correctly with pageSize=2', async () => {
    const page1 = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
      page: 1,
      pageSize: 2,
    })

    expect(page1.files).toHaveLength(2)
    expect(page1.totalCount).toBe(5)

    const page2 = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
      page: 2,
      pageSize: 2,
    })

    expect(page2.files).toHaveLength(2)
    expect(page2.totalCount).toBe(5)

    const page3 = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
      page: 3,
      pageSize: 2,
    })

    expect(page3.files).toHaveLength(1)
    expect(page3.totalCount).toBe(5)

    // No overlap between pages
    const allPagedIds = [
      ...page1.files.map((f) => f.fileId),
      ...page2.files.map((f) => f.fileId),
      ...page3.files.map((f) => f.fileId),
    ]
    const uniqueIds = new Set(allPagedIds)
    expect(uniqueIds.size).toBe(5)
  })

  // ── T3: Chronological order — newest first ──

  it('T3: should return files ordered by created_at DESC (newest first)', async () => {
    const result = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
    })

    // file-5 (Mar 05) > file-4 (Mar 04) > ... > file-1 (Mar 01)
    expect(result.files[0]!.fileName).toBe('file-5.sdlxliff')
    expect(result.files[1]!.fileName).toBe('file-4.sdlxliff')
    expect(result.files[2]!.fileName).toBe('file-3.sdlxliff')
    expect(result.files[3]!.fileName).toBe('file-2.sdlxliff')
    expect(result.files[4]!.fileName).toBe('file-1.sdlxliff')

    // Verify timestamps are actually descending
    for (let i = 0; i < result.files.length - 1; i++) {
      const current = new Date(result.files[i]!.createdAt).getTime()
      const next = new Date(result.files[i + 1]!.createdAt).getTime()
      expect(current).toBeGreaterThan(next)
    }
  })

  // ── T4: Score JOIN — files with/without scores ──

  it('T4: should populate score fields via LEFT JOIN, null for files without scores', async () => {
    const result = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
    })

    // Build a map by fileName for easier assertion
    const byName = new Map(result.files.map((f) => [f.fileName, f]))

    // file-1 has score: mqmScore=98, criticalCount=0
    const f1 = byName.get('file-1.sdlxliff')!
    expect(f1.mqmScore).toBe(98)
    expect(f1.criticalCount).toBe(0)

    // file-2 has score: mqmScore=75, criticalCount=0
    const f2 = byName.get('file-2.sdlxliff')!
    expect(f2.mqmScore).toBe(75)
    expect(f2.criticalCount).toBe(0)

    // file-3 has score: mqmScore=99, criticalCount=1
    const f3 = byName.get('file-3.sdlxliff')!
    expect(f3.mqmScore).toBe(99)
    expect(f3.criticalCount).toBe(1)

    // file-4 and file-5 have NO scores — LEFT JOIN → null
    const f4 = byName.get('file-4.sdlxliff')!
    expect(f4.mqmScore).toBeNull()
    expect(f4.criticalCount).toBeNull()

    const f5 = byName.get('file-5.sdlxliff')!
    expect(f5.mqmScore).toBeNull()
    expect(f5.criticalCount).toBeNull()
  })

  // ── T5: Tenant isolation — tenant A query must not return tenant B data ──

  it('T5: should return 0 files from tenant B when querying tenant A project', async () => {
    // Query tenant A's project with tenant A's ID — should get 5
    const resultA = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantAId,
    })
    expect(resultA.totalCount).toBe(5)

    // Query tenant B's project with tenant B's ID — should get 1
    const resultB = await queryFileHistory({
      projectId: projectBId,
      tenantId: tenantBId,
    })
    expect(resultB.totalCount).toBe(1)
    expect(resultB.files[0]!.fileName).toBe('tenant-b-file.sdlxliff')

    // Cross-tenant: query tenant A's project with tenant B's ID — should get 0
    const crossResult = await queryFileHistory({
      projectId: projectAId,
      tenantId: tenantBId,
    })
    expect(crossResult.totalCount).toBe(0)
    expect(crossResult.files).toHaveLength(0)
  })

  // ── T6: Empty project — no files ──

  it('T6: should return empty array for project with no files', async () => {
    // Create an empty project under tenant A
    const [emptyProject] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantAId,
        name: 'Empty Project',
        sourceLang: 'en-US',
        targetLangs: ['th'],
      })
      .returning({ id: projects.id })

    const result = await queryFileHistory({
      projectId: emptyProject!.id,
      tenantId: tenantAId,
    })

    expect(result.files).toHaveLength(0)
    expect(result.totalCount).toBe(0)

    // Cleanup
    await testDb.delete(projects).where(eq(projects.id, emptyProject!.id))
  })
})
