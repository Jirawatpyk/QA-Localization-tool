/**
 * Integration tests for Parser → DB round-trip.
 *
 * Parses real SDLXLIFF/XLIFF fixture files → inserts segments into real Postgres
 * → queries back and verifies data integrity. Catches schema mismatches between
 * parser output and DB columns that unit tests with mocks cannot detect.
 *
 * Requires: `npx supabase start` + DATABASE_URL env var.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import { tenants } from '@/db/schema/tenants'
import { parseXliff } from '@/features/parser/sdlxliffParser'
import type { ParsedSegment } from '@/features/parser/types'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

// ── Fixture paths ──

const FIXTURES_DIR = resolve(__dirname, '../../../e2e/fixtures')
const SDLXLIFF_MINIMAL = resolve(FIXTURES_DIR, 'sdlxliff/minimal.sdlxliff')
const XLIFF_STANDARD = resolve(FIXTURES_DIR, 'xliff/standard.xliff')

describe.skipIf(!DATABASE_URL)('Parser → DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Seed IDs
  let tenantId: TenantId
  let projectId: string
  let fileId: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 5 })
    testDb = drizzle(queryClient)

    // Seed: tenant → project
    const [tenant] = await testDb
      .insert(tenants)
      .values({ name: 'Parser-DB Integration Test Tenant', status: 'active' })
      .returning({ id: tenants.id })
    if (!tenant) throw new Error('Failed to seed tenant')
    tenantId = asTenantId(tenant.id)

    const [project] = await testDb
      .insert(projects)
      .values({
        tenantId,
        name: 'Parser-DB Test Project',
        sourceLang: 'en-US',
        targetLangs: ['th-TH'],
      })
      .returning({ id: projects.id })
    if (!project) throw new Error('Failed to seed project')
    projectId = project.id
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    if (tenantId) {
      await testDb.delete(segments).where(eq(segments.tenantId, tenantId))
      await testDb.delete(files).where(eq(files.tenantId, tenantId))
      await testDb.delete(projects).where(eq(projects.tenantId, tenantId))
      await testDb.delete(tenants).where(eq(tenants.id, tenantId))
    }
    await queryClient.end()
  })

  // ── Helper: create a file record for testing ──

  async function createFileRecord(
    fileName: string,
    fileType: 'sdlxliff' | 'xliff',
  ): Promise<string> {
    const [file] = await testDb
      .insert(files)
      .values({
        projectId,
        tenantId,
        fileName,
        fileType,
        fileSizeBytes: 1024,
        storagePath: `/test/${fileName}`,
        status: 'parsed',
      })
      .returning({ id: files.id })
    if (!file) throw new Error('Failed to create file record')
    return file.id
  }

  // ── Helper: insert parsed segments into DB (mirrors parseFile.action.ts logic) ──

  async function insertParsedSegments(parsedSegments: ParsedSegment[], fId: string): Promise<void> {
    await testDb.transaction(async (tx) => {
      // Delete old segments first (idempotent re-run, Guardrail #5)
      await tx.delete(segments).where(eq(segments.fileId, fId))

      const values = parsedSegments.map((seg) => ({
        fileId: fId,
        projectId,
        tenantId,
        segmentNumber: seg.segmentNumber,
        sourceText: seg.sourceText,
        targetText: seg.targetText,
        sourceLang: seg.sourceLang,
        targetLang: seg.targetLang,
        wordCount: seg.wordCount,
        confirmationState: seg.confirmationState,
        matchPercentage: seg.matchPercentage,
        translatorComment: seg.translatorComment,
        inlineTags: seg.inlineTags,
      }))

      await tx.insert(segments).values(values)
    })
  }

  // ── T1: Parse SDLXLIFF → insert segments → verify count ──

  it('should parse SDLXLIFF and persist correct segment count', async () => {
    const xmlContent = readFileSync(SDLXLIFF_MINIMAL, 'utf-8')
    const result = parseXliff(xmlContent, 'sdlxliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    fileId = await createFileRecord('minimal.sdlxliff', 'sdlxliff')
    await insertParsedSegments(result.data.segments, fileId)

    // Query back and verify count
    const [countResult] = await testDb
      .select({ count: sql<number>`count(*)::int` })
      .from(segments)
      .where(and(eq(segments.fileId, fileId), withTenant(segments.tenantId, tenantId)))

    expect(countResult!.count).toBe(result.data.segmentCount)
    expect(countResult!.count).toBe(3) // minimal.sdlxliff has 3 segments
  })

  // ── T2: Segment content round-trip ──

  it('should preserve sourceText, targetText, and segmentNumber exactly', async () => {
    const xmlContent = readFileSync(SDLXLIFF_MINIMAL, 'utf-8')
    const result = parseXliff(xmlContent, 'sdlxliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    const fId = await createFileRecord('roundtrip.sdlxliff', 'sdlxliff')
    await insertParsedSegments(result.data.segments, fId)

    // Query back ordered by segment_number
    const dbSegments = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))
      .orderBy(segments.segmentNumber)

    expect(dbSegments).toHaveLength(result.data.segments.length)

    for (let i = 0; i < result.data.segments.length; i++) {
      const parsed = result.data.segments[i]!
      const db = dbSegments[i]!

      expect(db.segmentNumber).toBe(parsed.segmentNumber)
      expect(db.sourceText).toBe(parsed.sourceText)
      expect(db.targetText).toBe(parsed.targetText)
    }

    // Spot-check known values from the fixture
    expect(dbSegments[0]!.sourceText).toBe('Hello world')
    expect(dbSegments[0]!.targetText).toBe('สวัสดีโลก')
    expect(dbSegments[1]!.sourceText).toBe('Click here to continue.')
    expect(dbSegments[2]!.sourceText).toBe('Cancel')
  })

  // ── T3: Word count persistence ──

  it('should persist word counts from Intl.Segmenter', async () => {
    const xmlContent = readFileSync(SDLXLIFF_MINIMAL, 'utf-8')
    const result = parseXliff(xmlContent, 'sdlxliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    const fId = await createFileRecord('wordcount.sdlxliff', 'sdlxliff')
    await insertParsedSegments(result.data.segments, fId)

    const dbSegments = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
        wordCount: segments.wordCount,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))
      .orderBy(segments.segmentNumber)

    for (let i = 0; i < result.data.segments.length; i++) {
      const parsed = result.data.segments[i]!
      const db = dbSegments[i]!

      expect(db.wordCount).toBe(parsed.wordCount)
      // Word counts should be positive for non-empty segments
      expect(db.wordCount).toBeGreaterThan(0)
    }

    // "Hello world" = 2 words
    expect(dbSegments[0]!.wordCount).toBe(2)
    // "Click here to continue." = 4 words
    expect(dbSegments[1]!.wordCount).toBe(4)
    // "Cancel" = 1 word
    expect(dbSegments[2]!.wordCount).toBe(1)
  })

  // ── T4: sourceLang/targetLang persistence ──

  it('should persist language pair from parser metadata', async () => {
    const xmlContent = readFileSync(SDLXLIFF_MINIMAL, 'utf-8')
    const result = parseXliff(xmlContent, 'sdlxliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.sourceLang).toBe('en-US')
    expect(result.data.targetLang).toBe('th-TH')

    const fId = await createFileRecord('langs.sdlxliff', 'sdlxliff')
    await insertParsedSegments(result.data.segments, fId)

    const dbSegments = await testDb
      .select({
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))

    // All segments should have the same language pair
    for (const seg of dbSegments) {
      expect(seg.sourceLang).toBe('en-US')
      expect(seg.targetLang).toBe('th-TH')
    }
  })

  // ── T5: SDLXLIFF metadata (confirmationState, matchPercentage) ──

  it('should persist confirmation state and match percentage', async () => {
    const xmlContent = readFileSync(SDLXLIFF_MINIMAL, 'utf-8')
    const result = parseXliff(xmlContent, 'sdlxliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    const fId = await createFileRecord('metadata.sdlxliff', 'sdlxliff')
    await insertParsedSegments(result.data.segments, fId)

    const dbSegments = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
        confirmationState: segments.confirmationState,
        matchPercentage: segments.matchPercentage,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))
      .orderBy(segments.segmentNumber)

    // Segment 1: Draft, 0%
    expect(dbSegments[0]!.confirmationState).toBe('Draft')
    expect(dbSegments[0]!.matchPercentage).toBe(0)

    // Segment 2: Translated, 85%
    expect(dbSegments[1]!.confirmationState).toBe('Translated')
    expect(dbSegments[1]!.matchPercentage).toBe(85)

    // Segment 3: ApprovedSignOff, 100%
    expect(dbSegments[2]!.confirmationState).toBe('ApprovedSignOff')
    expect(dbSegments[2]!.matchPercentage).toBe(100)
  })

  // ── T6: Re-parse idempotency (Guardrail #5) ──

  it('should produce identical results after DELETE + re-insert', async () => {
    const xmlContent = readFileSync(SDLXLIFF_MINIMAL, 'utf-8')
    const result = parseXliff(xmlContent, 'sdlxliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    const fId = await createFileRecord('idempotent.sdlxliff', 'sdlxliff')

    // First insert
    await insertParsedSegments(result.data.segments, fId)

    const firstRun = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        wordCount: segments.wordCount,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))
      .orderBy(segments.segmentNumber)

    // Re-parse and re-insert (the transaction in insertParsedSegments DELETEs first)
    await insertParsedSegments(result.data.segments, fId)

    const secondRun = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        wordCount: segments.wordCount,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))
      .orderBy(segments.segmentNumber)

    // Count must match
    expect(secondRun).toHaveLength(firstRun.length)

    // Content must be identical
    for (let i = 0; i < firstRun.length; i++) {
      expect(secondRun[i]!.segmentNumber).toBe(firstRun[i]!.segmentNumber)
      expect(secondRun[i]!.sourceText).toBe(firstRun[i]!.sourceText)
      expect(secondRun[i]!.targetText).toBe(firstRun[i]!.targetText)
      expect(secondRun[i]!.wordCount).toBe(firstRun[i]!.wordCount)
    }

    // Verify no duplicate segments (unique constraint: file_id + segment_number)
    const [countResult] = await testDb
      .select({ count: sql<number>`count(*)::int` })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))

    expect(countResult!.count).toBe(result.data.segmentCount)
  })

  // ── T7: XLIFF format ──

  it('should parse XLIFF 1.2 and persist segments correctly', async () => {
    const xmlContent = readFileSync(XLIFF_STANDARD, 'utf-8')
    const result = parseXliff(xmlContent, 'xliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.fileType).toBe('xliff')
    expect(result.data.segmentCount).toBe(3)

    const fId = await createFileRecord('standard.xliff', 'xliff')
    await insertParsedSegments(result.data.segments, fId)

    const dbSegments = await testDb
      .select({
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
        confirmationState: segments.confirmationState,
        translatorComment: segments.translatorComment,
        inlineTags: segments.inlineTags,
      })
      .from(segments)
      .where(and(eq(segments.fileId, fId), withTenant(segments.tenantId, tenantId)))
      .orderBy(segments.segmentNumber)

    expect(dbSegments).toHaveLength(3)

    // Segment 1: "Good morning" with translated state and note
    expect(dbSegments[0]!.sourceText).toBe('Good morning')
    expect(dbSegments[0]!.targetText).toBe('สวัสดีตอนเช้า')
    expect(dbSegments[0]!.confirmationState).toBe('Translated')
    expect(dbSegments[0]!.translatorComment).toBe('Standard greeting')
    expect(dbSegments[0]!.sourceLang).toBe('en-US')
    expect(dbSegments[0]!.targetLang).toBe('th-TH')

    // Segment 2: has inline <g> tags — verify they're stored as JSONB
    // Note: inline tag extraction joins text without extra whitespace,
    // so "your <g>email" → "youremail" (space is inside the tag boundary)
    const parsedSeg2Source = result.data.segments[1]!.sourceText
    expect(dbSegments[1]!.sourceText).toBe(parsedSeg2Source)
    expect(dbSegments[1]!.inlineTags).not.toBeNull()
    expect(dbSegments[1]!.inlineTags!.source).toHaveLength(1)
    expect(dbSegments[1]!.inlineTags!.source[0]!.type).toBe('g')
    expect(dbSegments[1]!.inlineTags!.target).toHaveLength(1)

    // Segment 3: has inline <ph> tags — compare against actual parser output
    const parsedSeg3 = result.data.segments[2]!
    expect(dbSegments[2]!.sourceText).toBe(parsedSeg3.sourceText)
    expect(dbSegments[2]!.inlineTags).not.toBeNull()
    expect(dbSegments[2]!.inlineTags!.source[0]!.type).toBe('ph')
  })

  // ── T8: Inline tags JSONB round-trip ──

  it('should preserve inline tags JSONB structure through DB round-trip', async () => {
    const xmlContent = readFileSync(XLIFF_STANDARD, 'utf-8')
    const result = parseXliff(xmlContent, 'xliff')

    expect(result.success).toBe(true)
    if (!result.success) return

    const fId = await createFileRecord('tags-roundtrip.xliff', 'xliff')
    await insertParsedSegments(result.data.segments, fId)

    // Get segment with <g> tags (segment 2)
    const [seg2] = await testDb
      .select({ inlineTags: segments.inlineTags })
      .from(segments)
      .where(
        and(
          eq(segments.fileId, fId),
          eq(segments.segmentNumber, 2),
          withTenant(segments.tenantId, tenantId),
        ),
      )

    const parsedSeg2 = result.data.segments[1]!
    expect(seg2!.inlineTags).toEqual(parsedSeg2.inlineTags)
  })
})
