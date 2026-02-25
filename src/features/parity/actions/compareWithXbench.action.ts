'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { compareFindings } from '@/features/parity/helpers/parityComparator'
import { parseXbenchReport } from '@/features/parity/helpers/xbenchReportParser'
import { compareWithXbenchSchema } from '@/features/parity/validation/paritySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type ComparisonFinding = {
  id: string
  description: string
  segmentNumber: number
  severity: string
  category: string
}

type CompareResult = {
  bothFound: ComparisonFinding[]
  toolOnly: ComparisonFinding[]
  xbenchOnly: ComparisonFinding[]
}

export async function compareWithXbench(input: unknown): Promise<ActionResult<CompareResult>> {
  const parsed = compareWithXbenchSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input', code: 'VALIDATION_ERROR' }
  }

  try {
    const user = await requireRole('qa_reviewer')
    const { projectId, fileId, xbenchReportBuffer } = parsed.data

    // Verify project belongs to user's tenant
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(withTenant(projects.tenantId, user.tenantId), eq(projects.id, projectId)))

    if (!project) {
      return { success: false, error: 'Project not found', code: 'NOT_FOUND' }
    }

    let xbenchResult
    try {
      xbenchResult = await parseXbenchReport(xbenchReportBuffer)
    } catch {
      logger.error('Failed to parse Xbench report in compareWithXbench')
      return {
        success: false,
        error: 'Failed to parse xlsx report. Please ensure it is a valid Xbench export.',
        code: 'INVALID_INPUT',
      }
    }

    const toolFindings = await db
      .select()
      .from(findings)
      .where(and(withTenant(findings.tenantId, user.tenantId), eq(findings.projectId, projectId)))

    const comparisonResult = compareFindings(
      xbenchResult.findings,
      toolFindings.map((f) => ({
        sourceTextExcerpt: f.sourceTextExcerpt,
        targetTextExcerpt: f.targetTextExcerpt,
        category: f.category,
        severity: f.severity,
        fileId: f.fileId ?? null,
        segmentId: f.segmentId ?? null,
      })),
      fileId,
    )

    // H1: MatchedFinding has xbenchCategory+toolCategory; XbenchFinding/ToolFinding have category
    // H2: xbenchOnly items carry segmentNumber from Xbench report — pass through instead of hardcoding 0
    const toFinding = (
      item: {
        xbenchCategory?: string
        toolCategory?: string
        category?: string
        severity?: string
        segmentNumber?: number
      },
      idx: number,
    ): ComparisonFinding => ({
      id: `${idx}`,
      description: item.xbenchCategory ?? item.toolCategory ?? item.category ?? 'Unknown',
      segmentNumber: item.segmentNumber ?? 0,
      severity: item.severity ?? 'minor',
      category: item.xbenchCategory ?? item.toolCategory ?? item.category ?? '',
    })

    return {
      success: true,
      data: {
        bothFound: comparisonResult.matched.map((m, i) => toFinding(m, i)),
        toolOnly: comparisonResult.toolOnly.map((m, i) => toFinding(m, i + 1000)),
        xbenchOnly: comparisonResult.xbenchOnly.map((m, i) => toFinding(m, i + 2000)),
      },
    }
  } catch (err) {
    logger.error({ err }, 'compareWithXbench failed')
    return { success: false, error: 'Comparison failed', code: 'INTERNAL_ERROR' }
  }
}
