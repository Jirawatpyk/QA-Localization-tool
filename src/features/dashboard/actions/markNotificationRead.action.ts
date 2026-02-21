'use server'
import 'server-only'

import { eq, and } from 'drizzle-orm'

import { db } from '@/db/client'
import { notifications } from '@/db/schema/notifications'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import type { ActionResult } from '@/types/actionResult'

export async function markNotificationRead(
  notificationId: string | 'all',
): Promise<ActionResult<void>> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  if (notificationId === 'all') {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, currentUser.id),
          eq(notifications.tenantId, currentUser.tenantId),
          eq(notifications.isRead, false),
        ),
      )
  } else {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, currentUser.id),
          eq(notifications.tenantId, currentUser.tenantId),
        ),
      )
  }

  // Use nil UUID for batch operations (entity_id is UUID column, "all" is invalid)
  const NIL_UUID = '00000000-0000-0000-0000-000000000000'
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'notification',
    entityId: notificationId === 'all' ? NIL_UUID : notificationId,
    action: notificationId === 'all' ? 'notification.read_all' : 'notification.read',
    newValue: { isRead: true },
  })

  return { success: true, data: undefined }
}
