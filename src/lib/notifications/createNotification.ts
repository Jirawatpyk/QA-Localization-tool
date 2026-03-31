import { db } from '@/db/client'
import { notifications } from '@/db/schema/notifications'
import { logger } from '@/lib/logger'
import type { TenantId } from '@/types/tenant'

// ── Notification Type Constants ──
// Existing types (migrated from inline INSERTs)
export const NOTIFICATION_TYPES = {
  // Epic 5: Native review workflow
  FINDING_FLAGGED_FOR_NATIVE: 'finding_flagged_for_native',
  NATIVE_REVIEW_COMPLETED: 'native_review_completed',
  NATIVE_COMMENT_ADDED: 'native_comment_added',
  // Epic 2: Score graduation
  LANGUAGE_PAIR_GRADUATED: 'language_pair_graduated',
  // Epic 6: File assignment (Story 6.1)
  FILE_ASSIGNED: 'file_assigned',
  FILE_REASSIGNED: 'file_reassigned',
  FILE_URGENT: 'file_urgent',
  ASSIGNMENT_COMPLETED: 'assignment_completed',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

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
