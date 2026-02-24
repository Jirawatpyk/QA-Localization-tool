import { db } from '@/db/client'
import { auditLogs } from '@/db/schema/auditLogs'

type AuditLogEntry = {
  tenantId: string
  userId?: string
  entityType: string
  entityId: string
  action: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
}

/**
 * Insert an immutable audit log entry.
 * CRITICAL: If audit write fails, throws (never silently fails).
 * This is Layer 1 of the 3-layer immutability defense.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await db.insert(auditLogs).values({
    tenantId: entry.tenantId,
    userId: entry.userId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
  })
}
