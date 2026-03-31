/**
 * Integration tests for checkAutoPass() with a real Postgres database.
 *
 * Validates that the actual Drizzle queries (language_pair_configs threshold,
 * file count via scores+segments JOIN, project fallback) produce correct
 * auto-pass eligibility decisions against real data.
 *
 * Requires: `npx supabase start` + DATABASE_URL env var.
 */
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'
import { tenants } from '@/db/schema/tenants'
import {
  CONSERVATIVE_AUTO_PASS_THRESHOLD,
  NEW_PAIR_FILE_THRESHOLD,
} from '@/features/scoring/constants'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Auto-Pass Checker — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Test data IDs — populated in beforeAll
  let tenantId: TenantId
  let projectId: string
  let fileId: string

  // We replicate checkAutoPass logic against testDb because the real function
  // imports `server-only` and uses the singleton `db` from `@/db/client`.
  // This tests the actual SQL queries + Drizzle ORM behavior against real Postgres.
  async function checkAutoPassViaTestDb(input: {
    mqmScore: number
    criticalCount: number
    projectId: string
    tenantId: TenantId
    sourceLang: string
    targetLang: string
  }) {
    const { mqmScore, criticalCount, projectId: pid, tenantId: tid, sourceLang, targetLang } = input

    const [langConfigRows, countRows] = await Promise.all([
      testDb
        .select({ autoPassThreshold: languagePairConfigs.autoPassThreshold })
        .from(languagePairConfigs)
        .where(
          and(
            withTenant(languagePairConfigs.tenantId, tid),
            eq(languagePairConfigs.sourceLang, sourceLang),
            eq(languagePairConfigs.targetLang, targetLang),
          ),
        )
        .limit(1),
      testDb
        .select({ count: sql<number>`count(distinct ${scores.fileId})` })
        .from(scores)
        .innerJoin(segments, eq(scores.fileId, segments.fileId))
        .where(
          and(
            eq(scores.projectId, pid),
            eq(segments.projectId, pid),
            eq(segments.sourceLang, sourceLang),
            eq(segments.targetLang, targetLang),
            withTenant(scores.tenantId, tid),
            withTenant(segments.tenantId, tid),
            sql`${scores.status} IN ('calculated', 'auto_passed', 'overridden')`,
          ),
        ),
    ])

    const [langConfig] = langConfigRows
    const [countResult] = countRows
    const fileCount = Number(countResult?.count ?? 0)
    const isNewPair = !langConfig || fileCount === 0

    if (isNewPair) {
      if (fileCount < NEW_PAIR_FILE_THRESHOLD) {
        return {
          eligible: false,
          rationale: `New language pair: mandatory manual review (file ${fileCount}/${NEW_PAIR_FILE_THRESHOLD})`,
          isNewPair: true,
          fileCount,
        }
      }

      // Fall back to project threshold
      const [project] = await testDb
        .select({ autoPassThreshold: projects.autoPassThreshold })
        .from(projects)
        .where(and(withTenant(projects.tenantId, tid), eq(projects.id, pid)))
        .limit(1)

      const threshold = project?.autoPassThreshold ?? CONSERVATIVE_AUTO_PASS_THRESHOLD
      const eligible = mqmScore >= threshold && criticalCount === 0

      return {
        eligible,
        rationale: eligible
          ? `Score ${mqmScore} >= project threshold ${threshold} with no critical findings`
          : criticalCount > 0
            ? `Critical findings (${criticalCount}) prevent auto-pass`
            : `Score ${mqmScore} below project threshold ${threshold}`,
        isNewPair: true,
        fileCount,
        threshold,
      }
    }

    const threshold = langConfig.autoPassThreshold ?? CONSERVATIVE_AUTO_PASS_THRESHOLD
    const eligible = mqmScore >= threshold && criticalCount === 0

    return {
      eligible,
      rationale: eligible
        ? `Score ${mqmScore} >= configured threshold ${threshold} with no critical findings`
        : criticalCount > 0
          ? `Critical findings (${criticalCount}) prevent auto-pass`
          : `Score ${mqmScore} below configured threshold ${threshold}`,
      isNewPair: false,
      fileCount,
      threshold,
    }
  }

  // ── Helper to seed N scored files for a language pair ──
  async function seedScoredFiles(
    count: number,
    opts: {
      projectId: string
      tenantId: TenantId
      sourceLang: string
      targetLang: string
      scoreStatus?: string
    },
  ) {
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      const [file] = await testDb
        .insert(files)
        .values({
          projectId: opts.projectId,
          tenantId: opts.tenantId,
          fileName: `seed-file-${Date.now()}-${i}.sdlxliff`,
          fileType: 'sdlxliff',
          fileSizeBytes: 1024,
          storagePath: `/test/seed-${Date.now()}-${i}.sdlxliff`,
          status: 'parsed',
        })
        .returning({ id: files.id })

      await testDb.insert(segments).values({
        fileId: file!.id,
        projectId: opts.projectId,
        tenantId: opts.tenantId,
        segmentNumber: 1,
        sourceText: 'Hello',
        targetText: 'สวัสดี',
        sourceLang: opts.sourceLang,
        targetLang: opts.targetLang,
        wordCount: 1,
      })

      await testDb.insert(scores).values({
        fileId: file!.id,
        projectId: opts.projectId,
        tenantId: opts.tenantId,
        mqmScore: 95,
        totalWords: 100,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 1,
        npt: 0.01,
        layerCompleted: 'L1L2',
        status: opts.scoreStatus ?? 'calculated',
      })

      ids.push(file!.id)
    }
    return ids
  }

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 10 })
    testDb = drizzle(queryClient)

    // Seed base data: tenant → project → 1 file + 1 segment (for basic tests)
    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: 'Auto-Pass Integration Test Tenant', status: 'active' })
      .returning({ id: tenants.id })
    tenantId = asTenantId(tenant!.id)

    const [project] = await testDb
      .insert(projects)
      .values({
        tenantId,
        name: 'Auto-Pass Test Project',
        sourceLang: 'en-US',
        targetLangs: ['th-TH'],
        autoPassThreshold: 95,
      })
      .returning({ id: projects.id })
    projectId = project!.id

    const [file] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId,
        fileName: 'test-autopass.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/autopass-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileId = file!.id
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(scores).where(eq(scores.tenantId, tenantId))
    await testDb.delete(segments).where(eq(segments.tenantId, tenantId))
    await testDb.delete(files).where(eq(files.tenantId, tenantId))
    await testDb.delete(languagePairConfigs).where(eq(languagePairConfigs.tenantId, tenantId))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantId))
    await testDb.delete(tenants).where(eq(tenants.id, tenantId))
    await queryClient.end()
  })

  // ── T1: Eligible — score above threshold, no criticals ──

  it('should return eligible when score >= configured threshold and no criticals', async () => {
    // Seed language_pair_config with threshold=90
    await testDb.insert(languagePairConfigs).values({
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      autoPassThreshold: 90,
      l2ConfidenceMin: 70,
      l3ConfidenceMin: 80,
    })

    // Seed a segment + calculated score for this file so fileCount >= 1
    await testDb.insert(segments).values({
      fileId,
      projectId,
      tenantId,
      segmentNumber: 1,
      sourceText: 'Hello world',
      targetText: 'สวัสดีชาวโลก',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      wordCount: 2,
    })

    await testDb.insert(scores).values({
      fileId,
      projectId,
      tenantId,
      mqmScore: 95,
      totalWords: 100,
      criticalCount: 0,
      majorCount: 1,
      minorCount: 2,
      npt: 0.07,
      layerCompleted: 'L1L2',
      status: 'calculated',
    })

    const result = await checkAutoPassViaTestDb({
      mqmScore: 95,
      criticalCount: 0,
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'th-TH',
    })

    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(false)
    expect(result.threshold).toBe(90)
    expect(result.fileCount).toBeGreaterThanOrEqual(1)

    // Cleanup for next tests
    await testDb.delete(scores).where(eq(scores.fileId, fileId))
    await testDb.delete(segments).where(eq(segments.fileId, fileId))
    await testDb
      .delete(languagePairConfigs)
      .where(
        and(
          eq(languagePairConfigs.tenantId, tenantId),
          eq(languagePairConfigs.sourceLang, 'en-US'),
          eq(languagePairConfigs.targetLang, 'th-TH'),
        ),
      )
  })

  // ── T2: Not eligible — score below threshold ──

  it('should return not eligible when score is below configured threshold', async () => {
    await testDb.insert(languagePairConfigs).values({
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'de-DE',
      autoPassThreshold: 90,
      l2ConfidenceMin: 70,
      l3ConfidenceMin: 80,
    })

    // Seed a scored file for this language pair
    const [deFile] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId,
        fileName: 'test-de.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        storagePath: '/test/de-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })

    await testDb.insert(segments).values({
      fileId: deFile!.id,
      projectId,
      tenantId,
      segmentNumber: 1,
      sourceText: 'Hello',
      targetText: 'Hallo',
      sourceLang: 'en-US',
      targetLang: 'de-DE',
      wordCount: 1,
    })

    await testDb.insert(scores).values({
      fileId: deFile!.id,
      projectId,
      tenantId,
      mqmScore: 85,
      totalWords: 50,
      criticalCount: 0,
      majorCount: 2,
      minorCount: 3,
      npt: 0.13,
      layerCompleted: 'L1L2',
      status: 'calculated',
    })

    const result = await checkAutoPassViaTestDb({
      mqmScore: 85,
      criticalCount: 0,
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'de-DE',
    })

    expect(result.eligible).toBe(false)
    expect(result.isNewPair).toBe(false)
    expect(result.rationale).toContain('below')

    // Cleanup
    await testDb.delete(scores).where(eq(scores.fileId, deFile!.id))
    await testDb.delete(segments).where(eq(segments.fileId, deFile!.id))
    await testDb.delete(files).where(eq(files.id, deFile!.id))
    await testDb
      .delete(languagePairConfigs)
      .where(
        and(
          eq(languagePairConfigs.tenantId, tenantId),
          eq(languagePairConfigs.sourceLang, 'en-US'),
          eq(languagePairConfigs.targetLang, 'de-DE'),
        ),
      )
  })

  // ── T3: Not eligible — has critical findings (criticalCount > 0) ──

  it('should return not eligible when criticalCount > 0 despite high score', async () => {
    await testDb.insert(languagePairConfigs).values({
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'ja-JP',
      autoPassThreshold: 85,
      l2ConfidenceMin: 70,
      l3ConfidenceMin: 80,
    })

    const [jaFile] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId,
        fileName: 'test-ja.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        storagePath: '/test/ja-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })

    await testDb.insert(segments).values({
      fileId: jaFile!.id,
      projectId,
      tenantId,
      segmentNumber: 1,
      sourceText: 'Hello',
      targetText: 'こんにちは',
      sourceLang: 'en-US',
      targetLang: 'ja-JP',
      wordCount: 1,
    })

    await testDb.insert(scores).values({
      fileId: jaFile!.id,
      projectId,
      tenantId,
      mqmScore: 95,
      totalWords: 50,
      criticalCount: 1,
      majorCount: 0,
      minorCount: 0,
      npt: 0.25,
      layerCompleted: 'L1L2',
      status: 'calculated',
    })

    const result = await checkAutoPassViaTestDb({
      mqmScore: 95,
      criticalCount: 1,
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'ja-JP',
    })

    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('Critical findings')

    // Cleanup
    await testDb.delete(scores).where(eq(scores.fileId, jaFile!.id))
    await testDb.delete(segments).where(eq(segments.fileId, jaFile!.id))
    await testDb.delete(files).where(eq(files.id, jaFile!.id))
    await testDb
      .delete(languagePairConfigs)
      .where(
        and(
          eq(languagePairConfigs.tenantId, tenantId),
          eq(languagePairConfigs.sourceLang, 'en-US'),
          eq(languagePairConfigs.targetLang, 'ja-JP'),
        ),
      )
  })

  // ── T4: New language pair (< 50 files) — mandatory manual review ──

  it('should return isNewPair=true with mandatory review when < 50 files', async () => {
    // No language_pair_config for zh-CN pair
    // Seed 10 scored files for this pair
    const seededIds = await seedScoredFiles(10, {
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'zh-CN',
    })

    const result = await checkAutoPassViaTestDb({
      mqmScore: 100,
      criticalCount: 0,
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'zh-CN',
    })

    expect(result.eligible).toBe(false)
    expect(result.isNewPair).toBe(true)
    expect(result.fileCount).toBe(10)
    expect(result.rationale).toContain('mandatory manual review')
    expect(result.rationale).toContain(`10/${NEW_PAIR_FILE_THRESHOLD}`)

    // Cleanup seeded files
    for (const id of seededIds) {
      await testDb.delete(scores).where(eq(scores.fileId, id))
      await testDb.delete(segments).where(eq(segments.fileId, id))
      await testDb.delete(files).where(eq(files.id, id))
    }
  })

  // ── T5: No language_pair_config — uses fallback (project threshold or conservative) ──

  it('should use project autoPassThreshold when no lang config and fileCount >= 50', async () => {
    // No language_pair_config for ko-KR pair
    // Seed 51 scored files to exceed NEW_PAIR_FILE_THRESHOLD
    const seededIds = await seedScoredFiles(51, {
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'ko-KR',
    })

    // Project autoPassThreshold = 95 (set in beforeAll)
    const result = await checkAutoPassViaTestDb({
      mqmScore: 96,
      criticalCount: 0,
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'ko-KR',
    })

    // isNewPair is true (no config), but fileCount >= 50 so falls through to project threshold
    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(true)
    expect(result.threshold).toBe(95)
    expect(result.fileCount).toBe(51)

    // Cleanup
    for (const id of seededIds) {
      await testDb.delete(scores).where(eq(scores.fileId, id))
      await testDb.delete(segments).where(eq(segments.fileId, id))
      await testDb.delete(files).where(eq(files.id, id))
    }
  })

  // ── T6: Scores with non-terminal status are excluded from file count ──

  it('should exclude calculating/partial status scores from file count', async () => {
    // Seed 5 files with 'calculating' status — should NOT count
    const calcIds = await seedScoredFiles(5, {
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'fr-FR',
      scoreStatus: 'calculating',
    })

    // Seed 3 files with 'calculated' status — SHOULD count
    const doneIds = await seedScoredFiles(3, {
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'fr-FR',
      scoreStatus: 'calculated',
    })

    const result = await checkAutoPassViaTestDb({
      mqmScore: 100,
      criticalCount: 0,
      projectId,
      tenantId,
      sourceLang: 'en-US',
      targetLang: 'fr-FR',
    })

    // Only 3 terminal-status files should count
    expect(result.fileCount).toBe(3)
    expect(result.isNewPair).toBe(true)
    expect(result.eligible).toBe(false) // < 50 files → mandatory review

    // Cleanup
    for (const id of [...calcIds, ...doneIds]) {
      await testDb.delete(scores).where(eq(scores.fileId, id))
      await testDb.delete(segments).where(eq(segments.fileId, id))
      await testDb.delete(files).where(eq(files.id, id))
    }
  })
})
