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

    // AC4: release only 'in_progress' assignments that have been inactive for 30+ minutes.
    // Boundary: lastActiveAt strictly less than (now - 30min) → released. Exactly 30 min ago = still active.
    // NOTE: 'assigned' rows (admin pre-assignments reviewer never opened) are intentionally
    // NOT released by this cron — see S-FIX-7b for the `assigned` row lifecycle gap.
    const allStale = await db
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

    // Write audit logs per row (Guardrail #2: non-fatal in error path)
    // L5 fix: parallelize via Promise.allSettled — N rows complete in 1*latency, not N*latency.
    // R2-C2 fix: let inner errors REJECT so allSettled can count them. Inner try/catch
    // would swallow failures and make `auditFailures` permanently 0. Logging still happens
    // in the rejection handler below.
    const auditResults = await Promise.allSettled(
      allStale.map(async (row) => {
        // L6 + R2-M1: validate tenantId — throw to be counted in failures
        const tenantId = validateTenantId(row.tenantId) // throws on invalid UUID
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
      }),
    )

    // Count and log real rejections (now that inner try/catch is gone, allSettled sees them)
    let auditFailures = 0
    auditResults.forEach((result, idx) => {
      if (result.status === 'rejected') {
        auditFailures++
        const row = allStale[idx]!
        logger.error(
          {
            err: result.reason,
            assignmentId: row.id,
            rawTenantId: row.tenantId,
          },
          'release-stale-assignments: audit log write failed',
        )
      }
    })

    logger.info(
      { releasedCount: allStale.length, auditFailures },
      'Stale file assignments auto-released',
    )

    return { releasedCount: allStale.length, auditFailures }
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
