/**
 * Integration tests for getBackTranslation action DB queries against a REAL local Postgres database.
 *
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Tests the DB query layer extracted from getBackTranslation.action.ts:
 * - Segment loading (by segmentId + projectId + tenantId)
 * - Adjacent context segments (±2 window)
 * - Edge cases: first/last segment context window
 * - Project btConfidenceThreshold loading
 * - Cache miss → write → verify row exists
 * - Cache hit retrieval
 * - Tenant isolation (segment query + cache query)
 *
 * NOTE: AI generateText is NOT called — these tests validate the DB queries that
 * surround the AI call in the action.
 */
import { createHash } from 'node:crypto'

import { and, asc, between, eq, ne, gte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { backTranslationCache } from '@/db/schema/backTranslationCache'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import { tenants } from '@/db/schema/tenants'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

/** Compute SHA-256 hash matching production btCache.computeTargetTextHash (uses Web Crypto in prod, node:crypto here). */
function computeHash(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

describe.skipIf(!DATABASE_URL)('getBackTranslation Action — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Seed IDs
  let tenantIdA: TenantId
  let tenantIdB: TenantId
  let projectId: string
  let projectIdWithThreshold: string
  let fileId: string
  let segmentIds: string[] // segments 1-5

  const LANG_PAIR = 'en-US→th-TH'
  const MODEL_VERSION = 'gpt-4o-mini-bt-v1'

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // Seed tenant A
    const [tA] = await testDb
      .insert(tenants)
      .values({ name: 'BT Action Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdA = asTenantId(tA!.id)

    // Seed tenant B (for isolation tests)
    const [tB] = await testDb
      .insert(tenants)
      .values({ name: 'BT Action Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdB = asTenantId(tB!.id)

    // Project under tenant A (default btConfidenceThreshold = 0.6)
    const [proj] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'BT Action Test Project',
        sourceLang: 'en-US',
        targetLangs: ['th-TH'],
      })
      .returning({ id: projects.id })
    projectId = proj!.id

    // Project with custom btConfidenceThreshold = 0.7
    const [projThreshold] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'BT Action Threshold Project',
        sourceLang: 'en-US',
        targetLangs: ['th-TH'],
        btConfidenceThreshold: 0.7,
      })
      .returning({ id: projects.id })
    projectIdWithThreshold = projThreshold!.id

    // File under project
    const [f] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId: tenantIdA,
        fileName: 'bt-action-test.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        storagePath: '/test/bt-action-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileId = f!.id

    // 5 segments under file (numbers 1-5)
    const segs = await testDb
      .insert(segments)
      .values([
        {
          fileId,
          projectId,
          tenantId: tenantIdA,
          segmentNumber: 1,
          sourceText: 'Hello',
          targetText: 'สวัสดี',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          wordCount: 1,
        },
        {
          fileId,
          projectId,
          tenantId: tenantIdA,
          segmentNumber: 2,
          sourceText: 'Goodbye',
          targetText: 'ลาก่อน',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          wordCount: 1,
        },
        {
          fileId,
          projectId,
          tenantId: tenantIdA,
          segmentNumber: 3,
          sourceText: 'Thank you',
          targetText: 'ขอบคุณ',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          wordCount: 2,
        },
        {
          fileId,
          projectId,
          tenantId: tenantIdA,
          segmentNumber: 4,
          sourceText: 'Please',
          targetText: 'กรุณา',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          wordCount: 1,
        },
        {
          fileId,
          projectId,
          tenantId: tenantIdA,
          segmentNumber: 5,
          sourceText: 'Sorry',
          targetText: 'ขอโทษ',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          wordCount: 1,
        },
      ])
      .returning({ id: segments.id })

    segmentIds = segs.map((s) => s.id)
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(backTranslationCache).where(eq(backTranslationCache.tenantId, tenantIdA))
    await testDb.delete(segments).where(eq(segments.tenantId, tenantIdA))
    await testDb.delete(files).where(eq(files.tenantId, tenantIdA))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantIdA))
    await testDb.delete(tenants).where(eq(tenants.id, tenantIdA))
    await testDb.delete(tenants).where(eq(tenants.id, tenantIdB))
    await queryClient.end()
  })

  // ── T1: Segment loading — matches action line 94-111 ──

  it('should load segment by segmentId + projectId + tenantId with correct fields', async () => {
    const segmentId = segmentIds[2]! // segment number 3

    const [segment] = await testDb
      .select({
        id: segments.id,
        fileId: segments.fileId,
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
      })
      .from(segments)
      .where(
        and(
          eq(segments.id, segmentId),
          eq(segments.projectId, projectId),
          withTenant(segments.tenantId, tenantIdA),
        ),
      )

    expect(segment).toBeDefined()
    expect(segment!.id).toBe(segmentId)
    expect(segment!.fileId).toBe(fileId)
    expect(segment!.segmentNumber).toBe(3)
    expect(segment!.sourceText).toBe('Thank you')
    expect(segment!.targetText).toBe('ขอบคุณ')
    expect(segment!.sourceLang).toBe('en-US')
    expect(segment!.targetLang).toBe('th-TH')
  })

  // ── T2: Adjacent context segments — matches action lines 189-204 ──

  it('should load ±2 adjacent context segments for middle segment', async () => {
    const _segmentId = segmentIds[2]! // segment number 3 (unused — query uses segmentNumber)
    const segmentNumber = 3

    const adjacentRows = await testDb
      .select({
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        segmentNumber: segments.segmentNumber,
      })
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantIdA),
          eq(segments.fileId, fileId),
          between(segments.segmentNumber, segmentNumber - 2, segmentNumber + 2),
          ne(segments.segmentNumber, segmentNumber),
        ),
      )
      .orderBy(asc(segments.segmentNumber))

    // Segment 3 has neighbors: 1, 2, 4, 5
    expect(adjacentRows).toHaveLength(4)
    expect(adjacentRows.map((r) => r.segmentNumber)).toEqual([1, 2, 4, 5])
    expect(adjacentRows[0]!.sourceText).toBe('Hello')
    expect(adjacentRows[0]!.targetText).toBe('สวัสดี')
    expect(adjacentRows[3]!.sourceText).toBe('Sorry')
    expect(adjacentRows[3]!.targetText).toBe('ขอโทษ')
  })

  // ── T3: Edge case — first segment context ──

  it('should load only segments 2,3 as context for first segment (no negative numbers)', async () => {
    const segmentNumber = 1

    const adjacentRows = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
      })
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantIdA),
          eq(segments.fileId, fileId),
          between(segments.segmentNumber, segmentNumber - 2, segmentNumber + 2),
          ne(segments.segmentNumber, segmentNumber),
        ),
      )
      .orderBy(asc(segments.segmentNumber))

    // Segment 1: between(-1, 3), ne(1) → segments 2, 3
    expect(adjacentRows).toHaveLength(2)
    expect(adjacentRows.map((r) => r.segmentNumber)).toEqual([2, 3])
  })

  // ── T4: Edge case — last segment context ──

  it('should load only segments 3,4 as context for last segment', async () => {
    const segmentNumber = 5

    const adjacentRows = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
      })
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantIdA),
          eq(segments.fileId, fileId),
          between(segments.segmentNumber, segmentNumber - 2, segmentNumber + 2),
          ne(segments.segmentNumber, segmentNumber),
        ),
      )
      .orderBy(asc(segments.segmentNumber))

    // Segment 5: between(3, 7), ne(5) → segments 3, 4
    expect(adjacentRows).toHaveLength(2)
    expect(adjacentRows.map((r) => r.segmentNumber)).toEqual([3, 4])
  })

  // ── T5: Project btConfidenceThreshold — matches action lines 180-185 ──

  it('should load project btConfidenceThreshold correctly', async () => {
    // Default project (threshold = 0.6)
    const [defaultProj] = await testDb
      .select({ btConfidenceThreshold: projects.btConfidenceThreshold })
      .from(projects)
      .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, tenantIdA)))

    expect(defaultProj).toBeDefined()
    expect(defaultProj!.btConfidenceThreshold).toBeCloseTo(0.6)

    // Custom threshold project (0.7)
    const [customProj] = await testDb
      .select({ btConfidenceThreshold: projects.btConfidenceThreshold })
      .from(projects)
      .where(and(eq(projects.id, projectIdWithThreshold), withTenant(projects.tenantId, tenantIdA)))

    expect(customProj).toBeDefined()
    expect(customProj!.btConfidenceThreshold).toBeCloseTo(0.7)
  })

  // ── T6: Cache miss → write → verify row exists ──

  it('should write cache entry on miss and verify row exists in DB', async () => {
    const segmentId = segmentIds[0]! // segment 1
    const targetTextHash = computeHash('สวัสดี')

    // Verify no cache exists (miss)
    const ttlCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const missingRows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
          gte(backTranslationCache.createdAt, ttlCutoff),
        ),
      )
      .limit(1)

    expect(missingRows).toHaveLength(0)

    // Replicate cacheBackTranslation logic (action line 435-446)
    await testDb
      .insert(backTranslationCache)
      .values({
        segmentId,
        tenantId: tenantIdA,
        languagePair: LANG_PAIR,
        modelVersion: MODEL_VERSION,
        targetTextHash,
        backTranslation: 'Hello',
        contextualExplanation: 'Standard greeting',
        confidence: 0.92,
        languageNotes: [
          {
            noteType: 'tone_marker' as const,
            originalText: 'สวัสดี',
            explanation: 'Formal greeting',
          },
        ],
        translationApproach: 'literal',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.001,
      })
      .onConflictDoUpdate({
        target: [
          backTranslationCache.segmentId,
          backTranslationCache.languagePair,
          backTranslationCache.modelVersion,
          backTranslationCache.targetTextHash,
        ],
        set: {
          backTranslation: 'Hello',
          contextualExplanation: 'Standard greeting',
          confidence: 0.92,
          languageNotes: [
            {
              noteType: 'tone_marker' as const,
              originalText: 'สวัสดี',
              explanation: 'Formal greeting',
            },
          ],
          translationApproach: 'literal',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.001,
          createdAt: sql`now()`,
        },
      })

    // Verify row now exists
    const rows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.backTranslation).toBe('Hello')
    expect(row.contextualExplanation).toBe('Standard greeting')
    expect(row.confidence).toBeCloseTo(0.92)
    expect(row.languageNotes).toEqual([
      { noteType: 'tone_marker', originalText: 'สวัสดี', explanation: 'Formal greeting' },
    ])
    expect(row.inputTokens).toBe(100)
    expect(row.outputTokens).toBe(50)
  })

  // ── T7: Cache hit — pre-seeded entry returns data without AI call ──

  it('should return cached data on cache hit (TTL-filtered query)', async () => {
    const segmentId = segmentIds[1]! // segment 2
    const targetTextHash = computeHash('ลาก่อน')

    // Pre-seed cache entry
    await testDb.insert(backTranslationCache).values({
      segmentId,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash,
      backTranslation: 'Goodbye',
      contextualExplanation: 'Farewell expression',
      confidence: 0.88,
      languageNotes: [],
      translationApproach: 'contextual',
      inputTokens: 80,
      outputTokens: 40,
      estimatedCostUsd: 0.0008,
    })

    // Query with TTL filter (same logic as getCachedBackTranslation)
    const ttlCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const rows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
          gte(backTranslationCache.createdAt, ttlCutoff),
        ),
      )
      .limit(1)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.backTranslation).toBe('Goodbye')
    expect(row.contextualExplanation).toBe('Farewell expression')
    expect(row.confidence).toBeCloseTo(0.88)
    expect(row.translationApproach).toBe('contextual')
  })

  // ── T8: Tenant isolation — segment query ──

  it('should return no segment when querying with wrong tenant', async () => {
    const segmentId = segmentIds[0]! // segment 1 belongs to tenant A

    // Query segment with tenant B — should not find it
    const [segment] = await testDb
      .select({
        id: segments.id,
        fileId: segments.fileId,
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
      })
      .from(segments)
      .where(
        and(
          eq(segments.id, segmentId),
          eq(segments.projectId, projectId),
          withTenant(segments.tenantId, tenantIdB),
        ),
      )

    expect(segment).toBeUndefined()

    // Confirm tenant A CAN find it
    const [segmentA] = await testDb
      .select({ id: segments.id })
      .from(segments)
      .where(
        and(
          eq(segments.id, segmentId),
          eq(segments.projectId, projectId),
          withTenant(segments.tenantId, tenantIdA),
        ),
      )

    expect(segmentA).toBeDefined()
    expect(segmentA!.id).toBe(segmentId)
  })

  // ── T8b: Tenant isolation — cache query ──

  it('should return no cache entry when querying with wrong tenant', async () => {
    const segmentId = segmentIds[0]! // segment 1 — has cache from T6
    const targetTextHash = computeHash('สวัสดี')
    const ttlCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // Query cache with tenant B — should not find it
    const rows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdB),
          gte(backTranslationCache.createdAt, ttlCutoff),
        ),
      )
      .limit(1)

    expect(rows).toHaveLength(0)

    // Confirm tenant A CAN find it
    const rowsA = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
          gte(backTranslationCache.createdAt, ttlCutoff),
        ),
      )
      .limit(1)

    expect(rowsA).toHaveLength(1)
  })
})
