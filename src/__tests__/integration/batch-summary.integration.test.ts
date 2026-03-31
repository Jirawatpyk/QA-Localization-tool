/**
 * Integration tests for getBatchSummary — real DB queries.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - File count and score aggregation from real DB
 * - File classification (pass vs needs-review) using project threshold
 * - Cross-file findings included, per-file excluded
 * - Tenant isolation (no data leakage)
 * - Graceful handling of files without scores
 * - Empty project returns empty summary
 */
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { tenants } from '@/db/schema/tenants'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { DEFAULT_AUTO_PASS_THRESHOLD } from '@/features/scoring/constants'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('getBatchSummary — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Tenant A
  let tenantIdA: TenantId
  let projectIdA: string
  let batchIdA: string
  let fileIdA1: string
  let fileIdA2: string
  let fileIdA3: string

  // Tenant B (for isolation test)
  let tenantIdB: TenantId
  let projectIdB: string
  let batchIdB: string
  let fileIdB1: string

  // Empty project (same tenant A)
  let emptyProjectId: string
  let emptyBatchId: string

  // Project with no-score files
  let noScoreProjectId: string
  let noScoreBatchId: string
  let noScoreFileId: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // ── Seed Tenant A ──
    const [tenantA] = await testDb
      .insert(tenants)
      .values({ name: 'Batch Summary Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdA = asTenantId(tenantA!.id)

    // Project A: threshold = 90
    const [projA] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'Batch Summary Project A',
        sourceLang: 'en-US',
        targetLangs: ['th'],
        autoPassThreshold: 90,
      })
      .returning({ id: projects.id })
    projectIdA = projA!.id

    // Batch A
    const [batchA] = await testDb
      .insert(uploadBatches)
      .values({ projectId: projectIdA, tenantId: tenantIdA, fileCount: 3 })
      .returning({ id: uploadBatches.id })
    batchIdA = batchA!.id

    // 3 files in batch A
    const fileValsA = [
      {
        projectId: projectIdA,
        tenantId: tenantIdA,
        fileName: 'file-pass-high.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/file-pass-high.sdlxliff',
        status: 'l1_completed',
        batchId: batchIdA,
      },
      {
        projectId: projectIdA,
        tenantId: tenantIdA,
        fileName: 'file-pass-boundary.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 2048,
        storagePath: '/test/file-pass-boundary.sdlxliff',
        status: 'l1_completed',
        batchId: batchIdA,
      },
      {
        projectId: projectIdA,
        tenantId: tenantIdA,
        fileName: 'file-needs-review.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        storagePath: '/test/file-needs-review.sdlxliff',
        status: 'l1_completed',
        batchId: batchIdA,
      },
    ] as const

    const insertedFiles = await testDb
      .insert(files)
      .values([...fileValsA])
      .returning({ id: files.id })
    fileIdA1 = insertedFiles[0]!.id // pass high
    fileIdA2 = insertedFiles[1]!.id // pass boundary
    fileIdA3 = insertedFiles[2]!.id // needs review

    // Scores for files A
    await testDb.insert(scores).values([
      {
        fileId: fileIdA1,
        projectId: projectIdA,
        tenantId: tenantIdA,
        mqmScore: 98,
        totalWords: 500,
        criticalCount: 0,
        majorCount: 1,
        minorCount: 2,
        npt: 0.02,
        layerCompleted: 'L1',
        status: 'calculated',
      },
      {
        fileId: fileIdA2,
        projectId: projectIdA,
        tenantId: tenantIdA,
        mqmScore: 90, // exactly at threshold
        totalWords: 300,
        criticalCount: 0,
        majorCount: 2,
        minorCount: 3,
        npt: 0.1,
        layerCompleted: 'L1',
        status: 'calculated',
      },
      {
        fileId: fileIdA3,
        projectId: projectIdA,
        tenantId: tenantIdA,
        mqmScore: 75, // below threshold
        totalWords: 400,
        criticalCount: 0,
        majorCount: 5,
        minorCount: 8,
        npt: 0.25,
        layerCompleted: 'L1',
        status: 'calculated',
      },
    ])

    // Cross-file finding for A
    await testDb.insert(findings).values({
      projectId: projectIdA,
      tenantId: tenantIdA,
      fileId: fileIdA1,
      severity: 'major',
      category: 'Consistency',
      description: 'Cross-file inconsistency in terminology',
      detectedByLayer: 'L2',
      scope: 'cross-file',
      relatedFileIds: [fileIdA1, fileIdA2],
      sourceTextExcerpt: 'Sample source text',
    })

    // Per-file finding for A (should NOT appear in crossFileFindings)
    await testDb.insert(findings).values({
      projectId: projectIdA,
      tenantId: tenantIdA,
      fileId: fileIdA1,
      severity: 'minor',
      category: 'Fluency',
      description: 'Minor grammar issue',
      detectedByLayer: 'L1',
      scope: 'per-file',
    })

    // ── Seed Tenant B (for isolation) ──
    const [tenantB] = await testDb
      .insert(tenants)
      .values({ name: 'Batch Summary Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdB = asTenantId(tenantB!.id)

    const [projB] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdB,
        name: 'Batch Summary Project B',
        sourceLang: 'en-US',
        targetLangs: ['ja'],
        autoPassThreshold: 95,
      })
      .returning({ id: projects.id })
    projectIdB = projB!.id

    const [batchB] = await testDb
      .insert(uploadBatches)
      .values({ projectId: projectIdB, tenantId: tenantIdB, fileCount: 1 })
      .returning({ id: uploadBatches.id })
    batchIdB = batchB!.id

    const [fileB] = await testDb
      .insert(files)
      .values({
        projectId: projectIdB,
        tenantId: tenantIdB,
        fileName: 'tenant-b-file.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/tenant-b-file.sdlxliff',
        status: 'l1_completed',
        batchId: batchIdB,
      })
      .returning({ id: files.id })
    fileIdB1 = fileB!.id

    await testDb.insert(scores).values({
      fileId: fileIdB1,
      projectId: projectIdB,
      tenantId: tenantIdB,
      mqmScore: 99,
      totalWords: 200,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 1,
      npt: 0.01,
      layerCompleted: 'L1',
      status: 'calculated',
    })

    // ── Seed empty project (tenant A) ──
    const [emptyProj] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'Empty Batch Project',
        sourceLang: 'en-US',
        targetLangs: ['th'],
      })
      .returning({ id: projects.id })
    emptyProjectId = emptyProj!.id

    const [emptyBatch] = await testDb
      .insert(uploadBatches)
      .values({ projectId: emptyProjectId, tenantId: tenantIdA, fileCount: 0 })
      .returning({ id: uploadBatches.id })
    emptyBatchId = emptyBatch!.id

    // ── Seed no-score project (tenant A) ──
    const [noScoreProj] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'No Score Project',
        sourceLang: 'en-US',
        targetLangs: ['th'],
      })
      .returning({ id: projects.id })
    noScoreProjectId = noScoreProj!.id

    const [noScoreBatch] = await testDb
      .insert(uploadBatches)
      .values({ projectId: noScoreProjectId, tenantId: tenantIdA, fileCount: 1 })
      .returning({ id: uploadBatches.id })
    noScoreBatchId = noScoreBatch!.id

    const [noScoreFile] = await testDb
      .insert(files)
      .values({
        projectId: noScoreProjectId,
        tenantId: tenantIdA,
        fileName: 'no-score-file.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/no-score-file.sdlxliff',
        status: 'uploaded',
        batchId: noScoreBatchId,
      })
      .returning({ id: files.id })
    noScoreFileId = noScoreFile!.id
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(findings).where(eq(findings.tenantId, tenantIdA))
    await testDb.delete(scores).where(eq(scores.tenantId, tenantIdA))
    await testDb.delete(scores).where(eq(scores.tenantId, tenantIdB))
    await testDb.delete(files).where(eq(files.tenantId, tenantIdA))
    await testDb.delete(files).where(eq(files.tenantId, tenantIdB))
    await testDb.delete(uploadBatches).where(eq(uploadBatches.tenantId, tenantIdA))
    await testDb.delete(uploadBatches).where(eq(uploadBatches.tenantId, tenantIdB))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantIdA))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantIdB))
    await testDb.delete(tenants).where(eq(tenants.id, tenantIdA))
    await testDb.delete(tenants).where(eq(tenants.id, tenantIdB))
    await queryClient.end()
  })

  // ── Helpers: replicate getBatchSummary core queries against testDb ──
  // We cannot import the real server action (uses `server-only`, singleton `db`,
  // `requireRole`). Instead we replicate the 3 DB queries — this tests the SQL
  // logic against real Postgres, which is the whole point.

  async function queryBatchSummary(params: {
    batchId: string
    projectId: string
    tenantId: TenantId
  }) {
    const { batchId, projectId, tenantId } = params

    // Query 1: project threshold
    const [project] = await testDb
      .select({ autoPassThreshold: projects.autoPassThreshold })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    const threshold = project?.autoPassThreshold ?? DEFAULT_AUTO_PASS_THRESHOLD

    // Query 2: files in batch with scores (LEFT JOIN)
    const filesWithScores = await testDb
      .select({
        fileId: files.id,
        fileName: files.fileName,
        status: files.status,
        createdAt: files.createdAt,
        updatedAt: files.updatedAt,
        mqmScore: scores.mqmScore,
        scoreStatus: scores.status,
        criticalCount: scores.criticalCount,
        majorCount: scores.majorCount,
        minorCount: scores.minorCount,
      })
      .from(files)
      .leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.batchId, batchId),
          eq(files.projectId, projectId),
        ),
      )

    // Classify
    const recommendedPass: typeof filesWithScores = []
    const needsReview: typeof filesWithScores = []

    for (const f of filesWithScores) {
      const isPass = f.mqmScore !== null && f.mqmScore >= threshold && (f.criticalCount ?? 0) === 0
      if (isPass) {
        recommendedPass.push(f)
      } else {
        needsReview.push(f)
      }
    }

    // Sort
    recommendedPass.sort(
      (a, b) => (b.mqmScore ?? 0) - (a.mqmScore ?? 0) || a.fileId.localeCompare(b.fileId),
    )
    needsReview.sort(
      (a, b) => (a.mqmScore ?? 100) - (b.mqmScore ?? 100) || a.fileId.localeCompare(b.fileId),
    )

    // Query 3: cross-file findings
    const fileIds = filesWithScores.map((f) => f.fileId)
    const crossFileRows =
      fileIds.length > 0
        ? await testDb
            .select({
              id: findings.id,
              description: findings.description,
              sourceTextExcerpt: findings.sourceTextExcerpt,
              relatedFileIds: findings.relatedFileIds,
            })
            .from(findings)
            .where(
              and(
                withTenant(findings.tenantId, tenantId),
                eq(findings.projectId, projectId),
                eq(findings.scope, 'cross-file'),
                inArray(findings.fileId, fileIds),
              ),
            )
        : []

    const crossFileFindings = crossFileRows.map((f) => ({
      id: f.id,
      description: f.description,
      sourceTextExcerpt: f.sourceTextExcerpt,
      relatedFileIds: Array.isArray(f.relatedFileIds)
        ? (f.relatedFileIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : [],
    }))

    return {
      totalFiles: filesWithScores.length,
      passedCount: recommendedPass.length,
      needsReviewCount: needsReview.length,
      recommendedPass,
      needsReview,
      crossFileFindings,
      threshold,
    }
  }

  // ── T1: Basic summary — 3 files, score aggregation ──

  it('T1: should return correct file count and score aggregation for 3 files', async () => {
    const result = await queryBatchSummary({
      batchId: batchIdA,
      projectId: projectIdA,
      tenantId: tenantIdA,
    })

    expect(result.totalFiles).toBe(3)
    expect(result.passedCount + result.needsReviewCount).toBe(3)
    // threshold=90: file1 (98) pass, file2 (90) pass, file3 (75) needs-review
    expect(result.passedCount).toBe(2)
    expect(result.needsReviewCount).toBe(1)

    // Verify score values are real numbers from DB
    for (const f of result.recommendedPass) {
      expect(typeof f.mqmScore).toBe('number')
      expect(f.mqmScore).toBeGreaterThanOrEqual(90)
    }
    for (const f of result.needsReview) {
      expect(f.mqmScore).toBeLessThan(90)
    }
  })

  // ── T2: File classification — pass vs needs-review by threshold ──

  it('T2: should classify file at exactly threshold as pass', async () => {
    const result = await queryBatchSummary({
      batchId: batchIdA,
      projectId: projectIdA,
      tenantId: tenantIdA,
    })

    // fileIdA2 has mqmScore=90, threshold=90 → >= threshold → pass
    const passIds = result.recommendedPass.map((f) => f.fileId)
    expect(passIds).toContain(fileIdA2)
  })

  it('T2: should classify file below threshold as needs-review', async () => {
    const result = await queryBatchSummary({
      batchId: batchIdA,
      projectId: projectIdA,
      tenantId: tenantIdA,
    })

    // fileIdA3 has mqmScore=75, threshold=90 → below → needs-review
    const reviewIds = result.needsReview.map((f) => f.fileId)
    expect(reviewIds).toContain(fileIdA3)
  })

  it('T2: should classify file with critical findings as needs-review even if score >= threshold', async () => {
    // Insert a file with high score but critical count > 0
    const [critFile] = await testDb
      .insert(files)
      .values({
        projectId: projectIdA,
        tenantId: tenantIdA,
        fileName: 'critical-file.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        storagePath: '/test/critical-file.sdlxliff',
        status: 'l1_completed',
        batchId: batchIdA,
      })
      .returning({ id: files.id })

    await testDb.insert(scores).values({
      fileId: critFile!.id,
      projectId: projectIdA,
      tenantId: tenantIdA,
      mqmScore: 95, // above threshold 90
      totalWords: 200,
      criticalCount: 1, // critical!
      majorCount: 0,
      minorCount: 0,
      npt: 0.05,
      layerCompleted: 'L1',
      status: 'calculated',
    })

    try {
      const result = await queryBatchSummary({
        batchId: batchIdA,
        projectId: projectIdA,
        tenantId: tenantIdA,
      })

      const reviewIds = result.needsReview.map((f) => f.fileId)
      expect(reviewIds).toContain(critFile!.id)

      const passIds = result.recommendedPass.map((f) => f.fileId)
      expect(passIds).not.toContain(critFile!.id)
    } finally {
      // Cleanup the extra file+score
      await testDb.delete(scores).where(eq(scores.fileId, critFile!.id))
      await testDb.delete(files).where(eq(files.id, critFile!.id))
    }
  })

  // ── T3: Cross-file findings ──

  it('T3: should include cross-file findings in summary', async () => {
    const result = await queryBatchSummary({
      batchId: batchIdA,
      projectId: projectIdA,
      tenantId: tenantIdA,
    })

    expect(result.crossFileFindings.length).toBeGreaterThanOrEqual(1)
    const crossFinding = result.crossFileFindings[0]!
    expect(crossFinding.description).toBe('Cross-file inconsistency in terminology')
    expect(crossFinding.relatedFileIds).toContain(fileIdA1)
    expect(crossFinding.relatedFileIds).toContain(fileIdA2)
  })

  it('T3: should exclude per-file findings from crossFileFindings', async () => {
    const result = await queryBatchSummary({
      batchId: batchIdA,
      projectId: projectIdA,
      tenantId: tenantIdA,
    })

    // The per-file finding with description "Minor grammar issue" should NOT appear
    const descriptions = result.crossFileFindings.map((f) => f.description)
    expect(descriptions).not.toContain('Minor grammar issue')
  })

  // ── T4: Tenant isolation ──

  it('T4: should return 0 files from tenant B when querying as tenant A', async () => {
    // Query tenant A's batch with tenant A's tenantId — should get only A's files
    const resultA = await queryBatchSummary({
      batchId: batchIdA,
      projectId: projectIdA,
      tenantId: tenantIdA,
    })

    // None of the file IDs should belong to tenant B
    const allFileIds = [
      ...resultA.recommendedPass.map((f) => f.fileId),
      ...resultA.needsReview.map((f) => f.fileId),
    ]
    expect(allFileIds).not.toContain(fileIdB1)

    // Query tenant B's batch with tenant A's tenantId → should get 0 files
    const crossTenant = await queryBatchSummary({
      batchId: batchIdB,
      projectId: projectIdB,
      tenantId: tenantIdA, // wrong tenant!
    })
    expect(crossTenant.totalFiles).toBe(0)
    expect(crossTenant.recommendedPass).toHaveLength(0)
    expect(crossTenant.needsReview).toHaveLength(0)
  })

  it('T4: should return correct data when tenant B queries their own batch', async () => {
    const resultB = await queryBatchSummary({
      batchId: batchIdB,
      projectId: projectIdB,
      tenantId: tenantIdB,
    })

    expect(resultB.totalFiles).toBe(1)
    const allFileIds = [
      ...resultB.recommendedPass.map((f) => f.fileId),
      ...resultB.needsReview.map((f) => f.fileId),
    ]
    expect(allFileIds).toContain(fileIdB1)
    // No tenant A files should leak
    expect(allFileIds).not.toContain(fileIdA1)
    expect(allFileIds).not.toContain(fileIdA2)
    expect(allFileIds).not.toContain(fileIdA3)
  })

  // ── T5: Files without scores ──

  it('T5: should handle files without scores gracefully (no crash)', async () => {
    const result = await queryBatchSummary({
      batchId: noScoreBatchId,
      projectId: noScoreProjectId,
      tenantId: tenantIdA,
    })

    expect(result.totalFiles).toBe(1)
    // File with no score → mqmScore is null → needs-review
    expect(result.needsReviewCount).toBe(1)
    expect(result.passedCount).toBe(0)

    const noScoreEntry = result.needsReview.find((f) => f.fileId === noScoreFileId)
    expect(noScoreEntry).toBeDefined()
    expect(noScoreEntry!.mqmScore).toBeNull()
    expect(noScoreEntry!.criticalCount).toBeNull()
  })

  // ── T6: Empty project ──

  it('T6: should return empty summary for project with 0 files', async () => {
    const result = await queryBatchSummary({
      batchId: emptyBatchId,
      projectId: emptyProjectId,
      tenantId: tenantIdA,
    })

    expect(result.totalFiles).toBe(0)
    expect(result.passedCount).toBe(0)
    expect(result.needsReviewCount).toBe(0)
    expect(result.recommendedPass).toHaveLength(0)
    expect(result.needsReview).toHaveLength(0)
    expect(result.crossFileFindings).toHaveLength(0)
  })
})
