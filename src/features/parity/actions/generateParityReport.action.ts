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
import { generateParityReportSchema } from '@/features/parity/validation/paritySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/types/actionResult'

type ParityReportResult = {
  reportId: string
  bothFound: Array<{ xbenchCategory: string; toolCategory: string; severity: string }>
  toolOnly: Array<{
    sourceTextExcerpt: string | null
    targetTextExcerpt: string | null
    category: string
    severity: string
  }>
  xbenchOnly: Array<{
    sourceText: string
    targetText: string
    category: string
    severity: string
  }>
  toolFindingCount: number
  xbenchFindingCount: number
}

export async function generateParityReport(
  input: unknown,
): Promise<ActionResult<ParityReportResult>> {
  const parsed = generateParityReportSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input', code: 'VALIDATION_ERROR' }
  }

  try {
    const user = await requireRole('qa_reviewer')
    const { projectId, xbenchReportBuffer, fileId } = parsed.data

    let xbenchResult
    try {
      xbenchResult = await parseXbenchReport(xbenchReportBuffer)
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
      .where(and(withTenant(projects.tenantId, user.tenantId), eq(projects.id, projectId)))

    if (!project) {
      return { success: false, error: 'Project not found', code: 'NOT_FOUND' }
    }

    // Fetch tool findings for this project
    const toolFindings = await db
      .select()
      .from(findings)
      .where(and(withTenant(findings.tenantId, user.tenantId), eq(findings.projectId, projectId)))

    // Compare xbench findings with tool findings
    // When fileId is provided, filter to that file; otherwise compare all project findings
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

    // Upload Xbench report to Supabase Storage for audit trail
    const storagePath = `${user.tenantId}/${projectId}/parity/report-${Date.now()}.xlsx`
    try {
      const supabase = createAdminClient()
      const { error: uploadError } = await supabase.storage
        .from('parity-reports')
        .upload(storagePath, xbenchReportBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: false,
        })
      if (uploadError) {
        logger.error(
          { err: uploadError, storagePath },
          'Non-fatal: failed to upload Xbench report to storage',
        )
      }
    } catch (storageErr) {
      logger.error({ err: storageErr, storagePath }, 'Non-fatal: storage upload exception')
    }

    // H2: Count filtered findings (matching the fileId scope used by compareFindings)
    const relevantToolFindingCount = fileId
      ? toolFindings.filter((f) => f.fileId === fileId).length
      : toolFindings.length

    // Persist report
    const [report] = await db
      .insert(parityReports)
      .values({
        projectId,
        tenantId: user.tenantId,
        fileId: fileId ?? null,
        comparisonData: comparisonResult,
        xbenchReportStoragePath: storagePath,
        toolFindingCount: relevantToolFindingCount,
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

    try {
      await writeAuditLog({
        action: 'parity_report_generated',
        tenantId: user.tenantId,
        userId: user.id,
        entityType: 'parity_report',
        entityId: report.id,
      })
    } catch (auditErr) {
      logger.error({ err: auditErr }, 'Non-fatal: failed to write audit log for parity report')
    }

    return {
      success: true,
      data: {
        reportId: report.id,
        bothFound: comparisonResult.matched,
        toolOnly: comparisonResult.toolOnly,
        xbenchOnly: comparisonResult.xbenchOnly,
        toolFindingCount: relevantToolFindingCount,
        xbenchFindingCount: xbenchResult.findings.length,
      },
    }
  } catch (err) {
    logger.error({ err }, 'generateParityReport failed')
    return { success: false, error: 'Failed to generate parity report', code: 'INTERNAL_ERROR' }
  }
}
