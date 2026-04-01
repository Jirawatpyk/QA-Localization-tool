'use server'
import 'server-only'

import { desc, eq, and, isNull } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { notifications } from '@/db/schema/notifications'
import type { AppNotification } from '@/features/dashboard/types'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/logger'
import { NOTIFICATION_TYPE_SET, type NotificationType } from '@/lib/notifications/types'
import type { ActionResult } from '@/types/actionResult'

export async function getNotifications(): Promise<ActionResult<AppNotification[]>> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, currentUser.id),
          withTenant(notifications.tenantId, currentUser.tenantId),
          isNull(notifications.archivedAt),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    const data: AppNotification[] = rows
      .filter((row) => {
        if (!NOTIFICATION_TYPE_SET.has(row.type)) {
          logger.warn({ type: row.type, id: row.id }, 'Unknown notification type in DB — skipped')
          return false
        }
        return true
      })
      .map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        userId: row.userId,
        type: row.type as NotificationType,
        projectId: row.projectId ?? null,
        title: row.title,
        body: row.body,
        isRead: row.isRead,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt.toISOString(),
      }))

    return { success: true, data }
  } catch (err) {
    logger.error({ err }, 'Failed to get notifications')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load notifications' }
  }
}
