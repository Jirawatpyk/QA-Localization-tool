'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { missingCheckReports } from '@/db/schema/missingCheckReports'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

const inputSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid(),
  segmentNumber: z.number().int().positive(),
  expectedCategory: z.string().min(1),
  expectedDescription: z.string().min(1),
})

function generateTrackingReference(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `MCR-${dateStr}-${suffix}`
}

export async function reportMissingCheck(
  input: unknown,
): Promise<ActionResult<{ trackingReference: string }>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join(', '),
      code: 'INVALID_INPUT',
    }
  }

  const user = await requireRole('qa_reviewer')
  const { projectId, fileId, segmentNumber, expectedCategory, expectedDescription } = parsed.data

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
      fileReference: fileId,
      segmentNumber,
      expectedDescription,
      xbenchCheckType: expectedCategory,
      status: 'open',
      trackingReference,
      reportedBy: user.id,
    })
    .returning()

  if (!report) {
    return { success: false, error: 'Failed to create report', code: 'INTERNAL_ERROR' }
  }

  await writeAuditLog({
    action: 'missing_check_reported',
    tenantId: user.tenantId,
    userId: user.id,
    entityType: 'missing_check_report',
    entityId: report.id,
  })

  logger.info(`Missing check reported: ${trackingReference}`)

  return {
    success: true,
    data: { trackingReference: report.trackingReference },
  }
}
