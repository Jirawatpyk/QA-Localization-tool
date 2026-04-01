import { db } from '@/db/client'
import { notifications } from '@/db/schema/notifications'
import { logger } from '@/lib/logger'
import type { NotificationType } from '@/lib/notifications/types'
import type { TenantId } from '@/types/tenant'

// Re-export from shared types (safe for client components)
export { NOTIFICATION_TYPES, type NotificationType } from '@/lib/notifications/types'

// ── Input Types ──

interface CreateNotificationInput {
  tenantId: TenantId
  userId: string
  type: NotificationType
  title: string
  body: string
  projectId?: string
  metadata?: Record<string, unknown>
}

interface CreateBulkNotificationInput {
  tenantId: TenantId
  recipients: Array<{ userId: string }>
  type: NotificationType
  title: string
  body: string
  projectId?: string
  metadata?: Record<string, unknown>
}

/**
 * Centralized notification INSERT helper (Guardrail #85).
 * Non-blocking: wraps in try/catch, logs error but never throws.
 * All notification INSERTs must go through this helper.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      projectId: input.projectId,
      metadata: input.metadata,
    })
  } catch (err) {
    logger.error({ err, type: input.type, userId: input.userId }, 'Failed to create notification')
  }
}

/**
 * Bulk notification INSERT for multiple recipients.
 * Non-blocking: wraps in try/catch, logs error but never throws.
 */
export async function createBulkNotification(input: CreateBulkNotificationInput): Promise<void> {
  if (input.recipients.length === 0) return

  try {
    await db.insert(notifications).values(
      input.recipients.map((r) => ({
        tenantId: input.tenantId,
        userId: r.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        projectId: input.projectId,
        metadata: input.metadata,
      })),
    )
  } catch (err) {
    logger.error(
      { err, type: input.type, recipientCount: input.recipients.length },
      'Failed to create bulk notification',
    )
  }
}
