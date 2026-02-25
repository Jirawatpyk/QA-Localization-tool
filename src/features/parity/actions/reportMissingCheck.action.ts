'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { missingCheckReports } from '@/db/schema/missingCheckReports'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { reportMissingCheckSchema } from '@/features/parity/validation/paritySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

function generateTrackingReference(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i]! % chars.length]
  }
  return `MCR-${dateStr}-${suffix}`
}

export async function reportMissingCheck(
  input: unknown,
): Promise<ActionResult<{ trackingReference: string }>> {
  const parsed = reportMissingCheckSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
      code: 'INVALID_INPUT',
    }
  }

  try {
    const user = await requireRole('qa_reviewer')
    const { projectId, fileReference, segmentNumber, expectedDescription, xbenchCheckType } =
      parsed.data

    // Verify project belongs to user's tenant
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(withTenant(projects.tenantId, user.tenantId), eq(projects.id, projectId)))

    if (!project) {
      return { success: false, error: 'Project not found', code: 'NOT_FOUND' }
    }

    const trackingReference = generateTrackingReference()

    const [report] = await db
      .insert(missingCheckReports)
      .values({
        projectId,
        tenantId: user.tenantId,
        fileReference,
        segmentNumber,
        expectedDescription,
        xbenchCheckType,
        status: 'open',
        trackingReference,
        reportedBy: user.id,
      })
      .returning()

    if (!report) {
      return { success: false, error: 'Failed to create report', code: 'INTERNAL_ERROR' }
    }

    try {
      await writeAuditLog({
        action: 'missing_check_reported',
        tenantId: user.tenantId,
        userId: user.id,
        entityType: 'missing_check_report',
        entityId: report.id,
      })
    } catch (auditErr) {
      logger.error({ err: auditErr }, 'Non-fatal: failed to write audit log for missing check')
    }

    logger.info({ trackingReference }, 'Missing check reported')

    return {
      success: true,
      data: { trackingReference: report.trackingReference },
    }
  } catch (err) {
    logger.error({ err }, 'reportMissingCheck failed')
    return { success: false, error: 'Failed to submit report', code: 'INTERNAL_ERROR' }
  }
}
