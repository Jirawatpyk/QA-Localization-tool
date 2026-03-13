'use server'

import 'server-only'

import { and, eq, gte, lte, inArray, asc, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { segments } from '@/db/schema/segments'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types'

// ── Types ──

export type SegmentForContext = {
  id: string
  segmentNumber: number
  sourceText: string
  targetText: string
  sourceLang: string
  targetLang: string
  wordCount: number
}

export type SegmentContextData = {
  currentSegment: SegmentForContext
  contextBefore: SegmentForContext[]
  contextAfter: SegmentForContext[]
  findingsBySegmentId: Record<string, string[]>
}

// ── Constants ──

const MIN_CONTEXT_RANGE = 1
const MAX_CONTEXT_RANGE = 3
const DEFAULT_CONTEXT_RANGE = 2

function clampRange(range: number | undefined): number {
  const raw = range ?? DEFAULT_CONTEXT_RANGE
  return Math.max(MIN_CONTEXT_RANGE, Math.min(MAX_CONTEXT_RANGE, raw))
}

const SEGMENT_COLUMNS = {
  id: segments.id,
  segmentNumber: segments.segmentNumber,
  sourceText: segments.sourceText,
  targetText: segments.targetText,
  sourceLang: segments.sourceLang,
  targetLang: segments.targetLang,
  wordCount: segments.wordCount,
} as const

// ── Validation ──

const getSegmentContextSchema = z.object({
  fileId: z.string().uuid(),
  segmentId: z.string().uuid(),
  contextRange: z.number().int().min(0).max(10).optional(),
})

// ── Action ──

export async function getSegmentContext(input: unknown): Promise<ActionResult<SegmentContextData>> {
  try {
    const parsed = getSegmentContextSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'Invalid input', code: 'VALIDATION_ERROR' }
    }

    const currentUser = await requireRole('qa_reviewer')
    const tenantId = currentUser.tenantId
    const { fileId, segmentId } = parsed.data
    const contextRange = clampRange(parsed.data.contextRange)

    // Query 1: Fetch target segment
    const targetRows = await db
      .select(SEGMENT_COLUMNS)
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantId),
          eq(segments.fileId, fileId),
          eq(segments.id, segmentId),
        ),
      )

    if (targetRows.length === 0) {
      return { success: false, error: 'Segment not found', code: 'NOT_FOUND' }
    }

    const targetSegment = targetRows[0]!
    const targetNumber = targetSegment.segmentNumber

    // Query 2: Fetch surrounding context segments (before + after in single query)
    const contextRows = await db
      .select(SEGMENT_COLUMNS)
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantId),
          eq(segments.fileId, fileId),
          // Segments within range but NOT the target itself
          gte(segments.segmentNumber, targetNumber - contextRange),
          lte(segments.segmentNumber, targetNumber + contextRange),
          // Exclude target segment (we already have it)
          // Use OR of before/after instead — split in JS
        ),
      )
      .orderBy(asc(segments.segmentNumber))

    const contextBefore: SegmentForContext[] = []
    const contextAfter: SegmentForContext[] = []
    for (const row of contextRows) {
      if (row.segmentNumber < targetNumber) {
        contextBefore.push(row)
      } else if (row.segmentNumber > targetNumber) {
        contextAfter.push(row)
      }
      // Skip rows with segmentNumber === targetNumber (the target itself)
    }

    // Query 3: Fetch finding IDs per context segment (for click-to-navigate)
    const allContextSegmentIds = [...contextBefore, ...contextAfter].map((s) => s.id)

    const findingsBySegmentId: Record<string, string[]> = {}

    // Guardrail #5: inArray with empty array = invalid SQL
    if (allContextSegmentIds.length > 0) {
      // ORDER BY severity priority (critical first) so findingIds[0] matches UI sort order (AC5)
      const findingRows = await db
        .select({
          segmentId: findings.segmentId,
          id: findings.id,
        })
        .from(findings)
        .where(
          and(
            withTenant(findings.tenantId, tenantId),
            eq(findings.fileId, fileId),
            inArray(findings.segmentId, allContextSegmentIds),
          ),
        )
        .orderBy(
          sql`CASE ${findings.severity}
            WHEN 'critical' THEN 0
            WHEN 'major' THEN 1
            WHEN 'minor' THEN 2
            ELSE 3
          END`,
        )

      // Group by segmentId — order preserved from query (critical first)
      for (const row of findingRows) {
        if (row.segmentId) {
          if (!findingsBySegmentId[row.segmentId]) {
            findingsBySegmentId[row.segmentId] = []
          }
          findingsBySegmentId[row.segmentId]!.push(row.id)
        }
      }
    }

    return {
      success: true,
      data: {
        currentSegment: targetSegment,
        contextBefore,
        contextAfter,
        findingsBySegmentId,
      },
    }
  } catch (err) {
    logger.error({ err, input }, 'getSegmentContext failed')
    return { success: false, error: 'Failed to load segment context', code: 'INTERNAL_ERROR' }
  }
}
