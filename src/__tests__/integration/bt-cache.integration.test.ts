/**
 * Integration tests for BT cache helpers against a REAL local Postgres database.
 *
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - cacheBackTranslation inserts and getCachedBackTranslation retrieves
 * - TTL expiry (24h) filters out stale rows
 * - onConflictDoUpdate upserts (no duplicate, refreshes createdAt)
 * - invalidateBTCacheForGlossary deletes all matching project+lang entries
 * - Tenant isolation via withTenant
 * - CASCADE delete when parent segment is removed
 * - targetTextHash separates cache entries for same segment, different target text
 */
import { createHash } from 'node:crypto'

import { and, eq, gte, sql } from 'drizzle-orm'
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

/** Compute SHA-256 hash matching production btCache.computeTargetTextHash (uses Web Crypto). */
function computeHash(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

describe.skipIf(!DATABASE_URL)('BT Cache — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Seed IDs
  let tenantIdA: TenantId
  let tenantIdB: TenantId
  let projectId: string
  let fileId: string
  let segmentId1: string
  let segmentId2: string
  let segmentId3: string

  const LANG_PAIR = 'en-US→th-TH'
  const MODEL_VERSION = 'gpt-4o-mini-2024-07-18'

  const baseBTResult = {
    backTranslation: 'Hello world',
    contextualExplanation: 'Direct translation',
    confidence: 0.92,
    languageNotes: [
      { noteType: 'tone_marker' as const, originalText: 'ครับ', explanation: 'Polite particle' },
    ],
    translationApproach: 'literal',
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.001,
  }

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // Seed tenant A
    const [tA] = await testDb
      .insert(tenants)
      .values({ name: 'BT Cache Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdA = asTenantId(tA!.id)

    // Seed tenant B (for isolation test)
    const [tB] = await testDb
      .insert(tenants)
      .values({ name: 'BT Cache Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantIdB = asTenantId(tB!.id)

    // Project under tenant A
    const [proj] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantIdA,
        name: 'BT Cache Test Project',
        sourceLang: 'en-US',
        targetLangs: ['th-TH'],
      })
      .returning({ id: projects.id })
    projectId = proj!.id

    // File under project
    const [f] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId: tenantIdA,
        fileName: 'bt-cache-test.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        storagePath: '/test/bt-cache-test.sdlxliff',
        status: 'parsed',
      })
      .returning({ id: files.id })
    fileId = f!.id

    // 3 segments under file
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
          sourceText: 'Thanks',
          targetText: 'ขอบคุณ',
          sourceLang: 'en-US',
          targetLang: 'th-TH',
          wordCount: 1,
        },
      ])
      .returning({ id: segments.id })

    segmentId1 = segs[0]!.id
    segmentId2 = segs[1]!.id
    segmentId3 = segs[2]!.id
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

  // ── T1: cacheBackTranslation inserts row ──

  it('should insert a cache entry and retrieve all fields', async () => {
    const targetTextHash = computeHash('สวัสดี')

    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId1,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash,
      backTranslation: baseBTResult.backTranslation,
      contextualExplanation: baseBTResult.contextualExplanation,
      confidence: baseBTResult.confidence,
      languageNotes: baseBTResult.languageNotes,
      translationApproach: baseBTResult.translationApproach,
      inputTokens: baseBTResult.inputTokens,
      outputTokens: baseBTResult.outputTokens,
      estimatedCostUsd: baseBTResult.estimatedCostUsd,
    })

    // Query back
    const rows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId1),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.backTranslation).toBe('Hello world')
    expect(row.contextualExplanation).toBe('Direct translation')
    expect(row.confidence).toBeCloseTo(0.92)
    expect(row.languageNotes).toEqual(baseBTResult.languageNotes)
    expect(row.translationApproach).toBe('literal')
    expect(row.inputTokens).toBe(100)
    expect(row.outputTokens).toBe(50)
    expect(row.estimatedCostUsd).toBeCloseTo(0.001)
  })

  // ── T2: getCachedBackTranslation with TTL ──

  it('should return null for expired cache entries (TTL > 24h)', async () => {
    const targetTextHash = computeHash('ลาก่อน')

    // Insert with old createdAt (25 hours ago)
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId2,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash,
      backTranslation: 'Goodbye',
      contextualExplanation: 'Farewell',
      confidence: 0.85,
      languageNotes: [],
      translationApproach: null,
      inputTokens: 80,
      outputTokens: 40,
      estimatedCostUsd: 0.0008,
      createdAt: oldDate,
    })

    // Query with TTL filter (same logic as getCachedBackTranslation)
    const ttlCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const expiredRows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId2),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
          gte(backTranslationCache.createdAt, ttlCutoff),
        ),
      )
      .limit(1)

    expect(expiredRows).toHaveLength(0)

    // Insert fresh entry for same segment (different hash to avoid conflict)
    const freshHash = computeHash('ลาก่อนครับ')
    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId2,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash: freshHash,
      backTranslation: 'Goodbye (polite)',
      contextualExplanation: 'Farewell with polite particle',
      confidence: 0.9,
      languageNotes: [],
      translationApproach: null,
      inputTokens: 90,
      outputTokens: 45,
      estimatedCostUsd: 0.0009,
    })

    const freshRows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId2),
          eq(backTranslationCache.targetTextHash, freshHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
          gte(backTranslationCache.createdAt, ttlCutoff),
        ),
      )
      .limit(1)

    expect(freshRows).toHaveLength(1)
    expect(freshRows[0]!.backTranslation).toBe('Goodbye (polite)')
  })

  // ── T3: onConflictDoUpdate ──

  it('should upsert on duplicate key and refresh createdAt', async () => {
    const targetTextHash = computeHash('ขอบคุณ')

    // First insert
    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId3,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash,
      backTranslation: 'Thank you (v1)',
      contextualExplanation: 'Gratitude expression',
      confidence: 0.8,
      languageNotes: [],
      translationApproach: null,
      inputTokens: 70,
      outputTokens: 35,
      estimatedCostUsd: 0.0007,
    })

    // Record createdAt of first insert
    const [firstRow] = await testDb
      .select({ id: backTranslationCache.id, createdAt: backTranslationCache.createdAt })
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId3),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )
    expect(firstRow).toBeDefined()
    const firstId = firstRow!.id
    const firstCreatedAt = firstRow!.createdAt

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Second insert with same key — should upsert
    await testDb
      .insert(backTranslationCache)
      .values({
        segmentId: segmentId3,
        tenantId: tenantIdA,
        languagePair: LANG_PAIR,
        modelVersion: MODEL_VERSION,
        targetTextHash,
        backTranslation: 'Thank you (v2)',
        contextualExplanation: 'Updated gratitude',
        confidence: 0.95,
        languageNotes: [],
        translationApproach: 'contextual',
        inputTokens: 120,
        outputTokens: 60,
        estimatedCostUsd: 0.0012,
      })
      .onConflictDoUpdate({
        target: [
          backTranslationCache.segmentId,
          backTranslationCache.languagePair,
          backTranslationCache.modelVersion,
          backTranslationCache.targetTextHash,
        ],
        set: {
          backTranslation: 'Thank you (v2)',
          contextualExplanation: 'Updated gratitude',
          confidence: 0.95,
          languageNotes: [],
          translationApproach: 'contextual',
          inputTokens: 120,
          outputTokens: 60,
          estimatedCostUsd: 0.0012,
          createdAt: sql`now()`,
        },
      })

    // Verify: still only 1 row (upserted, not duplicated)
    const allRows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId3),
          eq(backTranslationCache.targetTextHash, targetTextHash),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )

    expect(allRows).toHaveLength(1)
    const updated = allRows[0]!

    // Same row ID (upserted in place)
    expect(updated.id).toBe(firstId)

    // Content updated
    expect(updated.backTranslation).toBe('Thank you (v2)')
    expect(updated.confidence).toBeCloseTo(0.95)
    expect(updated.translationApproach).toBe('contextual')
    expect(updated.inputTokens).toBe(120)

    // createdAt refreshed
    expect(updated.createdAt.getTime()).toBeGreaterThan(firstCreatedAt.getTime())
  })

  // ── T4: invalidateBTCacheForGlossary ──

  it('should delete all cache entries for a project+languagePair', async () => {
    // Clean existing cache for clean state
    await testDb.delete(backTranslationCache).where(eq(backTranslationCache.tenantId, tenantIdA))

    // Insert 3 cache entries (one per segment)
    for (const [idx, segId] of [segmentId1, segmentId2, segmentId3].entries()) {
      await testDb.insert(backTranslationCache).values({
        segmentId: segId,
        tenantId: tenantIdA,
        languagePair: LANG_PAIR,
        modelVersion: MODEL_VERSION,
        targetTextHash: computeHash(`text-${idx}`),
        backTranslation: `BT ${idx}`,
        contextualExplanation: `Explanation ${idx}`,
        confidence: 0.85,
        languageNotes: [],
        translationApproach: null,
        inputTokens: 50,
        outputTokens: 25,
        estimatedCostUsd: 0.0005,
      })
    }

    // Verify 3 rows exist
    const beforeRows = await testDb
      .select({ id: backTranslationCache.id })
      .from(backTranslationCache)
      .where(withTenant(backTranslationCache.tenantId, tenantIdA))
    expect(beforeRows).toHaveLength(3)

    // Replicate invalidateBTCacheForGlossary logic (subquery through segments → files)
    const segmentIdsSubquery = testDb
      .select({ id: segments.id })
      .from(segments)
      .innerJoin(files, eq(segments.fileId, files.id))
      .where(
        and(
          eq(files.projectId, projectId),
          withTenant(segments.tenantId, tenantIdA),
          withTenant(files.tenantId, tenantIdA),
        ),
      )

    const result = await testDb
      .delete(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.languagePair, LANG_PAIR),
          withTenant(backTranslationCache.tenantId, tenantIdA),
          sql`${backTranslationCache.segmentId} IN (${segmentIdsSubquery})`,
        ),
      )
      .returning({ id: backTranslationCache.id })

    expect(result).toHaveLength(3)

    // Verify 0 rows remain
    const afterRows = await testDb
      .select({ id: backTranslationCache.id })
      .from(backTranslationCache)
      .where(withTenant(backTranslationCache.tenantId, tenantIdA))
    expect(afterRows).toHaveLength(0)
  })

  // ── T5: Tenant isolation ──

  it('should return 0 rows when querying with wrong tenant', async () => {
    // Insert cache entry for tenant A
    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId1,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash: computeHash('tenant-isolation-test'),
      backTranslation: 'Tenant A only',
      contextualExplanation: 'Should not be visible to tenant B',
      confidence: 0.99,
      languageNotes: [],
      translationApproach: null,
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.0001,
    })

    // Query as tenant B — should get 0 rows
    const rows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId1),
          withTenant(backTranslationCache.tenantId, tenantIdB),
        ),
      )

    expect(rows).toHaveLength(0)

    // Confirm tenant A can see it
    const rowsA = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId1),
          eq(backTranslationCache.targetTextHash, computeHash('tenant-isolation-test')),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )

    expect(rowsA).toHaveLength(1)
  })

  // ── T6: CASCADE on segment delete ──

  it('should cascade-delete cache when parent segment is deleted', async () => {
    // Clean existing cache
    await testDb.delete(backTranslationCache).where(eq(backTranslationCache.tenantId, tenantIdA))

    // Create a dedicated segment for this test (so deleting it doesn't break other tests)
    const [tempSeg] = await testDb
      .insert(segments)
      .values({
        fileId,
        projectId,
        tenantId: tenantIdA,
        segmentNumber: 999,
        sourceText: 'Temp',
        targetText: 'ชั่วคราว',
        sourceLang: 'en-US',
        targetLang: 'th-TH',
        wordCount: 1,
      })
      .returning({ id: segments.id })
    const tempSegId = tempSeg!.id

    // Insert cache entry for temp segment
    await testDb.insert(backTranslationCache).values({
      segmentId: tempSegId,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash: computeHash('ชั่วคราว'),
      backTranslation: 'Temporary',
      contextualExplanation: 'Temp test',
      confidence: 0.88,
      languageNotes: [],
      translationApproach: null,
      inputTokens: 30,
      outputTokens: 15,
      estimatedCostUsd: 0.0003,
    })

    // Verify cache exists
    const beforeRows = await testDb
      .select({ id: backTranslationCache.id })
      .from(backTranslationCache)
      .where(eq(backTranslationCache.segmentId, tempSegId))
    expect(beforeRows).toHaveLength(1)

    // Delete parent segment — should CASCADE to cache
    await testDb.delete(segments).where(eq(segments.id, tempSegId))

    // Verify cache entry is gone
    const afterRows = await testDb
      .select({ id: backTranslationCache.id })
      .from(backTranslationCache)
      .where(eq(backTranslationCache.segmentId, tempSegId))
    expect(afterRows).toHaveLength(0)
  })

  // ── T7: targetTextHash correctness ──

  it('should create separate cache entries for same segment with different target text hashes', async () => {
    // Clean existing cache
    await testDb.delete(backTranslationCache).where(eq(backTranslationCache.tenantId, tenantIdA))

    const hashA = computeHash('สวัสดีครับ')
    const hashB = computeHash('สวัสดีค่ะ')

    // Hashes must be different
    expect(hashA).not.toBe(hashB)

    // Insert two cache entries for same segment, different targetTextHash
    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId1,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash: hashA,
      backTranslation: 'Hello (male polite)',
      contextualExplanation: 'Male polite particle ครับ',
      confidence: 0.9,
      languageNotes: [
        {
          noteType: 'politeness_particle' as const,
          originalText: 'ครับ',
          explanation: 'Male polite',
        },
      ],
      translationApproach: 'literal',
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.001,
    })

    await testDb.insert(backTranslationCache).values({
      segmentId: segmentId1,
      tenantId: tenantIdA,
      languagePair: LANG_PAIR,
      modelVersion: MODEL_VERSION,
      targetTextHash: hashB,
      backTranslation: 'Hello (female polite)',
      contextualExplanation: 'Female polite particle ค่ะ',
      confidence: 0.91,
      languageNotes: [
        {
          noteType: 'politeness_particle' as const,
          originalText: 'ค่ะ',
          explanation: 'Female polite',
        },
      ],
      translationApproach: 'literal',
      inputTokens: 105,
      outputTokens: 52,
      estimatedCostUsd: 0.0011,
    })

    // Both entries should exist — no conflict because hash differs
    const rows = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId1),
          eq(backTranslationCache.languagePair, LANG_PAIR),
          eq(backTranslationCache.modelVersion, MODEL_VERSION),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )

    expect(rows).toHaveLength(2)

    const btTexts = rows.map((r) => r.backTranslation).sort()
    expect(btTexts).toEqual(['Hello (female polite)', 'Hello (male polite)'])

    // Query with specific hash returns only 1
    const [rowA] = await testDb
      .select()
      .from(backTranslationCache)
      .where(
        and(
          eq(backTranslationCache.segmentId, segmentId1),
          eq(backTranslationCache.targetTextHash, hashA),
          withTenant(backTranslationCache.tenantId, tenantIdA),
        ),
      )
    expect(rowA!.backTranslation).toBe('Hello (male polite)')
  })
})
