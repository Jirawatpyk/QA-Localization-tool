import { and, eq, lt } from 'drizzle-orm'

import { db } from '@/db/client'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { validateTenantId } from '@/types/tenant'

/**
 * S-FIX-7 AC4: Auto-release stale file assignments after 30 minutes of inactivity.
 *
 * Runs every 5 minutes. Queries ALL tenants (no single tenant context).
 * Uses Drizzle directly (bypasses RLS, no withTenant()). See Dev Notes AC4.
 *
 * Guardrail #9: retries + onFailure + Object.assign for tests.
 * Guardrail #2: Audit log non-fatal — wrap in try/catch.
 */

const AUTO_RELEASE_THRESHOLD_MIN = 30

const handlerFn = async ({
  step,
}: {
  step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
}) => {
  const result = await step.run('release-stale-assignments', async () => {
    const threshold = new Date(Date.now() - AUTO_RELEASE_THRESHOLD_MIN * 60 * 1000)

    // Find and update stale assignments in one query
    // AC4 boundary: exactly 30 min = still active, 30m+1s = released (lt, not lte)
    const staleRows = await db
      .update(fileAssignments)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(fileAssignments.status, 'in_progress'), lt(fileAssignments.lastActiveAt, threshold)),
      )
      .returning({
        id: fileAssignments.id,
        fileId: fileAssignments.fileId,
        projectId: fileAssignments.projectId,
        assignedTo: fileAssignments.assignedTo,
        tenantId: fileAssignments.tenantId,
        lastActiveAt: fileAssignments.lastActiveAt,
      })

    // Also release assigned status with no activity for 30+ min
    const staleAssigned = await db
      .update(fileAssignments)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(fileAssignments.status, 'assigned'), lt(fileAssignments.lastActiveAt, threshold)),
      )
      .returning({
        id: fileAssignments.id,
        fileId: fileAssignments.fileId,
        projectId: fileAssignments.projectId,
        assignedTo: fileAssignments.assignedTo,
        tenantId: fileAssignments.tenantId,
        lastActiveAt: fileAssignments.lastActiveAt,
      })

    const allStale = [...staleRows, ...staleAssigned]

    // Write audit logs per row (Guardrail #2: non-fatal in error path)
    for (const row of allStale) {
      try {
        const tenantId = validateTenantId(row.tenantId)
        await writeAuditLog({
          tenantId,
          userId: row.assignedTo,
          entityType: 'file_assignment',
          entityId: row.id,
          action: 'auto_release',
          newValue: {
            assignmentId: row.id,
            fileId: row.fileId,
            reason: 'inactivity_timeout_30m',
            lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
          },
        })
      } catch (auditErr) {
        logger.error(
          { err: auditErr, assignmentId: row.id },
          'release-stale-assignments: audit log write failed',
        )
      }
    }

    logger.info({ releasedCount: allStale.length }, 'Stale file assignments auto-released')

    return { releasedCount: allStale.length }
  })

  return result
}

const onFailureFn = async ({ event, error }: { event: Record<string, unknown>; error: Error }) => {
  logger.error({ err: error, event }, 'release-stale-assignments: cron failed after all retries')
}

const fnConfig = {
  id: 'release-stale-assignments',
  retries: 3 as const,
  cron: '*/5 * * * *' as const,
}

export const releaseStaleAssignments = Object.assign(
  inngest.createFunction(
    {
      id: fnConfig.id,
      name: 'Release Stale File Assignments',
      retries: fnConfig.retries,
      onFailure: onFailureFn,
    },
    { cron: fnConfig.cron },
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureFn,
    fnConfig,
  },
)
