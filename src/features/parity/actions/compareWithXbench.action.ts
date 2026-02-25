'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { compareFindings } from '@/features/parity/helpers/parityComparator'
import { parseXbenchReport } from '@/features/parity/helpers/xbenchReportParser'
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

type CompareInput = {
  projectId: string
  fileId?: string | undefined
  xbenchReportBuffer: Buffer
}

export async function compareWithXbench(input: CompareInput): Promise<ActionResult<CompareResult>> {
  const user = await requireRole('qa_reviewer')

  let xbenchResult
  try {
    xbenchResult = await parseXbenchReport(input.xbenchReportBuffer)
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
    .where(
      and(withTenant(findings.tenantId, user.tenantId), eq(findings.projectId, input.projectId)),
    )

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
    input.fileId ?? '',
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
}
