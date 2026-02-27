'use server'

import 'server-only'

import { and, eq, gte, lte } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { projects } from '@/db/schema/projects'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

const MAX_DAYS = 90

export type ExportAiUsageResult =
  | { success: true; data: { csv: string; filename: string } }
  | { success: false; code: string; error: string }

export async function exportAiUsage(): Promise<ExportAiUsageResult> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  try {
    // M6: single reference point — all date math derived from one `now` (no midnight race)
    const now = new Date()

    // Current month boundaries (same as summary action)
    const monthStart = new Date(now)
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    const monthEnd = new Date(now)
    monthEnd.setUTCHours(23, 59, 59, 999)

    // Cap at 90 days — if month start is > 90 days ago, use 90 days from today
    const ninetyDaysAgo = new Date(now)
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - MAX_DAYS)
    ninetyDaysAgo.setUTCHours(0, 0, 0, 0)

    const effectiveStart = monthStart < ninetyDaysAgo ? ninetyDaysAgo : monthStart

    const records = await db
      .select({
        createdAt: aiUsageLogs.createdAt,
        projectName: projects.name,
        fileId: aiUsageLogs.fileId,
        layer: aiUsageLogs.layer,
        model: aiUsageLogs.model,
        provider: aiUsageLogs.provider,
        inputTokens: aiUsageLogs.inputTokens,
        outputTokens: aiUsageLogs.outputTokens,
        estimatedCost: aiUsageLogs.estimatedCost,
        latencyMs: aiUsageLogs.latencyMs,
        status: aiUsageLogs.status,
      })
      .from(aiUsageLogs)
      .leftJoin(
        projects,
        and(
          eq(aiUsageLogs.projectId, projects.id),
          withTenant(projects.tenantId, currentUser.tenantId),
        ),
      )
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, currentUser.tenantId),
          gte(aiUsageLogs.createdAt, effectiveStart),
          lte(aiUsageLogs.createdAt, monthEnd),
        ),
      )

    // Manual CSV build (no library) — double-quote escape for project_name
    const header =
      'date,project_name,file_id,layer,model,provider,input_tokens,output_tokens,cost_usd,latency_ms,status'

    // M4: CSV formula injection guard — prefix with ' if value starts with a formula trigger char
    function sanitizeCsvString(value: string): string {
      return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    }

    const csvRows = records.map((r) => {
      const projectName = r.projectName ?? ''
      // Escape double quotes: " → "" and wrap in quotes; then sanitize formula chars
      const escapedName = `"${sanitizeCsvString(projectName).replace(/"/g, '""')}"`
      return [
        r.createdAt.toISOString().split('T')[0],
        escapedName,
        r.fileId,
        r.layer,
        r.model,
        r.provider,
        r.inputTokens,
        r.outputTokens,
        Number(r.estimatedCost).toFixed(6),
        r.latencyMs,
        r.status,
      ].join(',')
    })

    const csv = [header, ...csvRows].join('\n')

    // Filename: ai-usage-YYYY-MM.csv (current month)
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const filename = `ai-usage-${year}-${month}.csv`

    return { success: true, data: { csv, filename } }
  } catch (err) {
    logger.error({ err }, 'Failed to export AI usage CSV')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to export AI usage data' }
  }
}
