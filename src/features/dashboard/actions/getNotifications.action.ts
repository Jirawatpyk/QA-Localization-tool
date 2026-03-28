'use server'
import 'server-only'

import { desc, eq, and } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { notifications } from '@/db/schema/notifications'
import type { AppNotification } from '@/features/dashboard/types'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/logger'
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
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    const data: AppNotification[] = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      type: row.type,
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
