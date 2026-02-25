'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { findings } from '@/db/schema/findings'
import { parityReports } from '@/db/schema/parityReports'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { compareFindings } from '@/features/parity/helpers/parityComparator'
import { parseXbenchReport } from '@/features/parity/helpers/xbenchReportParser'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type GenerateParityReportInput = {
  projectId: string
  xbenchReportBuffer: Buffer
}

type ParityReportResult = {
  reportId: string
  bothFound: unknown[]
  toolOnly: unknown[]
  xbenchOnly: unknown[]
  toolFindingCount: number
  xbenchFindingCount: number
}

export async function generateParityReport(
  input: GenerateParityReportInput,
): Promise<ActionResult<ParityReportResult>> {
  const user = await requireRole('qa_reviewer')

  let xbenchResult
  try {
    xbenchResult = await parseXbenchReport(input.xbenchReportBuffer)
  } catch {
    logger.error('Failed to parse Xbench report')
    return {
      success: false,
      error: 'Failed to parse xlsx report. Please ensure it is a valid Xbench export.',
      code: 'INVALID_INPUT',
    }
  }

  // Verify project belongs to user's tenant
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(withTenant(projects.tenantId, user.tenantId), eq(projects.id, input.projectId)))

  if (!project) {
    return { success: false, error: 'Project not found', code: 'NOT_FOUND' }
  }

  // Fetch tool findings for this project
  const toolFindings = await db
    .select()
    .from(findings)
    .where(
      and(withTenant(findings.tenantId, user.tenantId), eq(findings.projectId, input.projectId)),
    )

  // Compare xbench findings with tool findings
  const comparisonResult = compareFindings(
    xbenchResult.findings,
    toolFindings.map((f) => ({
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
      category: f.category as string,
      severity: f.severity as string,
      fileId: f.fileId as string,
      segmentId: f.segmentId as string,
    })),
    (toolFindings[0]?.fileId as string) ?? '',
  )

  // Persist report
  const [report] = await db
    .insert(parityReports)
    .values({
      projectId: input.projectId,
      tenantId: user.tenantId,
      comparisonData: comparisonResult,
      xbenchReportStoragePath: 'uploaded',
      toolFindingCount: toolFindings.length,
      xbenchFindingCount: xbenchResult.findings.length,
      bothFoundCount: comparisonResult.matched.length,
      toolOnlyCount: comparisonResult.toolOnly.length,
      xbenchOnlyCount: comparisonResult.xbenchOnly.length,
      generatedBy: user.id,
    })
    .returning()

  if (!report) {
    return { success: false, error: 'Failed to create report', code: 'INTERNAL_ERROR' }
  }

  await writeAuditLog({
    action: 'parity_report_generated',
    tenantId: user.tenantId,
    userId: user.id,
    entityType: 'parity_report',
    entityId: report.id,
  })

  return {
    success: true,
    data: {
      reportId: report.id,
      bothFound: comparisonResult.matched,
      toolOnly: comparisonResult.toolOnly,
      xbenchOnly: comparisonResult.xbenchOnly,
      toolFindingCount: toolFindings.length,
      xbenchFindingCount: xbenchResult.findings.length,
    },
  }
}
