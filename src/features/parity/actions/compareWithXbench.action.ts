'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { compareFindings } from '@/features/parity/helpers/parityComparator'
import { parseXbenchReport } from '@/features/parity/helpers/xbenchReportParser'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

const inputSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  xbenchReportBuffer: z.instanceof(Uint8Array),
})

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
  const parsed = inputSchema.safeParse(input)
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
        category: f.category as string,
        severity: f.severity as string,
        fileId: f.fileId as string,
        segmentId: f.segmentId as string,
      })),
      fileId ?? '',
    )

    const toFinding = (
      item: { xbenchCategory?: string; toolCategory?: string; severity?: string },
      idx: number,
    ): ComparisonFinding => ({
      id: `${idx}`,
      description: item.xbenchCategory ?? item.toolCategory ?? 'Unknown',
      segmentNumber: 0,
      severity: item.severity ?? 'minor',
      category: item.xbenchCategory ?? item.toolCategory ?? '',
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
