/**
 * Integration tests for concurrent scoreFile behavior with real Postgres.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - MQM score calculation with real DB persistence
 * - Concurrent scoreFile calls produce identical (idempotent) results
 * - Score reflects current findings after DELETE+INSERT cycle
 * - Zero-findings edge case produces perfect score
 * - uq_scores_file_tenant constraint prevents duplicate rows
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'
import { tenants } from '@/db/schema/tenants'
import { DEFAULT_PENALTY_WEIGHTS } from '@/features/scoring/constants'
import { calculateMqmScore } from '@/features/scoring/mqmCalculator'
import type { FindingStatus } from '@/features/scoring/types'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Concurrent Scoring — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Test data IDs
  let tenantId: TenantId
  let projectId: string
  let fileId: string
  let segmentIds: string[]

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 10 })
    testDb = drizzle(queryClient)

    // Seed: tenant → project → file → 5 segments (100 words each = 500 total)
    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: 'Scoring Integration Test Tenant', status: 'active' })
      .returning({ id: tenants.id })
    tenantId = asTenantId(tenant!.id)

    const [project] = await testDb
      .insert(projects)
      .values({
        tenantId,
        name: 'Scoring Test Project',
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
        fileName: 'test-scoring.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 2048,
        storagePath: '/test/scoring-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileId = file!.id

    const segmentValues = Array.from({ length: 5 }, (_, i) => ({
      fileId,
      projectId,
      tenantId,
      segmentNumber: i + 1,
      sourceText: `Source segment ${i + 1}`,
      targetText: `Target segment ${i + 1}`,
      sourceLang: 'en-US',
      targetLang: 'th',
      wordCount: 100, // 5 segments × 100 words = 500 total
    }))

    const insertedSegments = await testDb
      .insert(segments)
      .values(segmentValues)
      .returning({ id: segments.id })
    segmentIds = insertedSegments.map((s) => s.id)
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(scores).where(eq(scores.tenantId, tenantId))
    await testDb.delete(findings).where(eq(findings.tenantId, tenantId))
    await testDb.delete(segments).where(eq(segments.tenantId, tenantId))
    await testDb.delete(files).where(eq(files.tenantId, tenantId))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantId))
    await testDb.delete(tenants).where(eq(tenants.id, tenantId))
    await queryClient.end()
  })

  // ── Helper: inline scoreFile logic against testDb ──
  // Cannot import real scoreFile — it uses singleton `db` from `@/db/client`
  // which requires all env vars. Replicate core logic: query segments + findings,
  // calculate MQM, persist via transaction with onConflictDoUpdate.
  // This tests the REAL SQL behavior (transaction, upsert, constraint).

  async function scoreFileViaTestDb(params: {
    fileId: string
    projectId: string
    tenantId: TenantId
  }) {
    const { fileId: fid, projectId: pid, tenantId: tid } = params

    // Load segments for word count
    const segmentRows = await testDb
      .select({ wordCount: segments.wordCount })
      .from(segments)
      .where(
        and(
          eq(segments.fileId, fid),
          eq(segments.projectId, pid),
          withTenant(segments.tenantId, tid),
        ),
      )

    if (segmentRows.length === 0) {
      return null
    }

    const totalWords = segmentRows.reduce((sum, s) => sum + s.wordCount, 0)

    // Load findings (all layers, contributing statuses filtered by calculator)
    const findingRows = await testDb
      .select({
        severity: findings.severity,
        status: findings.status,
        segmentCount: findings.segmentCount,
      })
      .from(findings)
      .where(
        and(
          eq(findings.fileId, fid),
          eq(findings.projectId, pid),
          withTenant(findings.tenantId, tid),
        ),
      )

    // Pure MQM calculation (imported directly — no DB deps)
    const scoreResult = calculateMqmScore(
      findingRows as Array<{
        severity: 'critical' | 'major' | 'minor'
        status: FindingStatus
        segmentCount: number
      }>,
      totalWords,
      DEFAULT_PENALTY_WEIGHTS,
    )

    // Persist: transaction DELETE → INSERT with onConflictDoUpdate safety net
    const { newScore } = await testDb.transaction(async (tx) => {
      const [prev] = await tx
        .select()
        .from(scores)
        .where(and(eq(scores.fileId, fid), withTenant(scores.tenantId, tid)))

      await tx.delete(scores).where(and(eq(scores.fileId, fid), withTenant(scores.tenantId, tid)))

      const scoreValues = {
        fileId: fid,
        projectId: pid,
        tenantId: tid,
        mqmScore: scoreResult.mqmScore,
        totalWords: scoreResult.totalWords,
        criticalCount: scoreResult.criticalCount,
        majorCount: scoreResult.majorCount,
        minorCount: scoreResult.minorCount,
        npt: scoreResult.npt,
        layerCompleted: 'L1' as const,
        status: scoreResult.status === 'na' ? 'na' : 'calculated',
        calculatedAt: new Date(),
      }

      const { ...updateSet } = scoreValues
      const [inserted] = await tx
        .insert(scores)
        .values(scoreValues)
        .onConflictDoUpdate({
          target: [scores.fileId, scores.tenantId],
          set: updateSet,
        })
        .returning()

      if (!inserted) {
        throw new Error(`Score insert returned no rows for file ${fid}`)
      }
      return { newScore: inserted, previousScore: prev }
    })

    return {
      scoreId: newScore.id,
      fileId: fid,
      mqmScore: newScore.mqmScore,
      npt: newScore.npt,
      totalWords: newScore.totalWords,
      criticalCount: newScore.criticalCount,
      majorCount: newScore.majorCount,
      minorCount: newScore.minorCount,
      status: newScore.status,
    }
  }

  /** Seed findings with known severities for a file */
  async function seedFindings(
    severities: Array<{ severity: 'critical' | 'major' | 'minor'; status?: string }>,
  ) {
    if (severities.length === 0) return []

    const values = severities.map((s, i) => ({
      fileId,
      projectId,
      tenantId,
      segmentId: segmentIds[i % segmentIds.length]!,
      severity: s.severity,
      status: s.status ?? 'pending',
      category: 'accuracy',
      description: `Test finding ${i + 1} (${s.severity})`,
      detectedByLayer: 'L1' as const,
      segmentCount: 1,
    }))

    const inserted = await testDb.insert(findings).values(values).returning({ id: findings.id })

    return inserted.map((r) => r.id)
  }

  /** Clean findings and scores between tests */
  async function cleanFindingsAndScores() {
    await testDb.delete(scores).where(eq(scores.tenantId, tenantId))
    await testDb.delete(findings).where(eq(findings.tenantId, tenantId))
  }

  // ── T1: Single scoreFile produces correct MQM score ──

  it('should produce correct MQM score for known severity distribution', async () => {
    await cleanFindingsAndScores()

    // Seed: 1 critical (25 penalty), 2 major (5×2=10), 3 minor (1×3=3) = 38 total penalty
    // totalWords = 500, NPT = (38/500)*1000 = 76, MQM = max(0, 100-76) = 24
    await seedFindings([
      { severity: 'critical' },
      { severity: 'major' },
      { severity: 'major' },
      { severity: 'minor' },
      { severity: 'minor' },
      { severity: 'minor' },
    ])

    const result = await scoreFileViaTestDb({ fileId, projectId, tenantId })

    expect(result).not.toBeNull()
    expect(result!.totalWords).toBe(500)
    expect(result!.criticalCount).toBe(1)
    expect(result!.majorCount).toBe(2)
    expect(result!.minorCount).toBe(3)
    expect(result!.npt).toBe(76)
    expect(result!.mqmScore).toBe(24)
    expect(result!.status).toBe('calculated')

    // Verify score persisted in DB
    const [dbScore] = await testDb
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    expect(dbScore).toBeDefined()
    expect(dbScore!.mqmScore).toBe(24)
    expect(dbScore!.npt).toBe(76)
  })

  // ── T2: Concurrent scoreFile calls produce identical result ──

  it('should produce identical final score from concurrent calls (idempotent)', async () => {
    await cleanFindingsAndScores()

    // Seed: 2 major findings → penalty = 10, NPT = (10/500)*1000 = 20, MQM = 80
    await seedFindings([{ severity: 'major' }, { severity: 'major' }])

    // Fire 2 concurrent scoreFile calls via Promise.all
    const [result1, result2] = await Promise.all([
      scoreFileViaTestDb({ fileId, projectId, tenantId }),
      scoreFileViaTestDb({ fileId, projectId, tenantId }),
    ])

    // Both should succeed (onConflictDoUpdate handles race)
    expect(result1).not.toBeNull()
    expect(result2).not.toBeNull()

    // Both should produce same MQM score
    expect(result1!.mqmScore).toBe(80)
    expect(result2!.mqmScore).toBe(80)
    expect(result1!.npt).toBe(20)
    expect(result2!.npt).toBe(20)

    // Only ONE score row should exist in DB (uq_scores_file_tenant constraint)
    const dbScores = await testDb
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    expect(dbScores).toHaveLength(1)
    expect(dbScores[0]!.mqmScore).toBe(80)
  })

  // ── T3: Score reflects new findings after DELETE+INSERT cycle ──

  it('should reflect new findings after DELETE+INSERT cycle', async () => {
    await cleanFindingsAndScores()

    // First round: 1 critical → penalty=25, NPT=50, MQM=50
    const firstFindingIds = await seedFindings([{ severity: 'critical' }])
    const result1 = await scoreFileViaTestDb({ fileId, projectId, tenantId })
    expect(result1!.mqmScore).toBe(50)
    expect(result1!.criticalCount).toBe(1)

    // Delete old findings
    for (const id of firstFindingIds) {
      await testDb.delete(findings).where(eq(findings.id, id))
    }

    // Insert different findings: 2 minor → penalty=2, NPT=(2/500)*1000=4, MQM=96
    await seedFindings([{ severity: 'minor' }, { severity: 'minor' }])
    const result2 = await scoreFileViaTestDb({ fileId, projectId, tenantId })

    expect(result2!.mqmScore).toBe(96)
    expect(result2!.criticalCount).toBe(0)
    expect(result2!.minorCount).toBe(2)
    expect(result2!.npt).toBe(4)

    // DB should have exactly 1 score row (updated, not duplicated)
    const dbScores = await testDb
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    expect(dbScores).toHaveLength(1)
    expect(dbScores[0]!.mqmScore).toBe(96)
  })

  // ── T4: scoreFile with zero findings ──

  it('should produce perfect score (100) with zero findings', async () => {
    await cleanFindingsAndScores()

    // No findings seeded — totalWords=500, penalty=0, NPT=0, MQM=100
    const result = await scoreFileViaTestDb({ fileId, projectId, tenantId })

    expect(result).not.toBeNull()
    expect(result!.mqmScore).toBe(100)
    expect(result!.npt).toBe(0)
    expect(result!.criticalCount).toBe(0)
    expect(result!.majorCount).toBe(0)
    expect(result!.minorCount).toBe(0)
    expect(result!.totalWords).toBe(500)
    expect(result!.status).toBe('calculated')
  })

  // ── T5: Non-contributing statuses excluded from score ──

  it('should exclude rejected/false_positive findings from score', async () => {
    await cleanFindingsAndScores()

    // Seed: 1 contributing critical + 2 non-contributing (rejected) majors
    // Only the critical should count → penalty=25, NPT=50, MQM=50
    await seedFindings([
      { severity: 'critical', status: 'pending' },
      { severity: 'major', status: 'rejected' },
      { severity: 'major', status: 'rejected' },
    ])

    const result = await scoreFileViaTestDb({ fileId, projectId, tenantId })

    expect(result!.mqmScore).toBe(50)
    expect(result!.criticalCount).toBe(1)
    expect(result!.majorCount).toBe(0) // rejected majors excluded
    expect(result!.minorCount).toBe(0)
  })

  // ── T6: Three concurrent calls still produce single row ──

  it('should maintain single score row even with 3 concurrent calls', async () => {
    await cleanFindingsAndScores()

    // Seed: 1 minor → penalty=1, NPT=2, MQM=98
    await seedFindings([{ severity: 'minor' }])

    const results = await Promise.all([
      scoreFileViaTestDb({ fileId, projectId, tenantId }),
      scoreFileViaTestDb({ fileId, projectId, tenantId }),
      scoreFileViaTestDb({ fileId, projectId, tenantId }),
    ])

    // All should succeed
    for (const result of results) {
      expect(result).not.toBeNull()
      expect(result!.mqmScore).toBe(98)
    }

    // Still only 1 row in DB
    const dbScores = await testDb
      .select()
      .from(scores)
      .where(and(eq(scores.fileId, fileId), withTenant(scores.tenantId, tenantId)))

    expect(dbScores).toHaveLength(1)
    expect(dbScores[0]!.mqmScore).toBe(98)
  })
})
