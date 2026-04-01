import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { getNotifications } from '@/features/dashboard/actions/getNotifications.action'
import { markNotificationRead as markNotificationReadAction } from '@/features/dashboard/actions/markNotificationRead.action'
import type { AppNotification } from '@/features/dashboard/types'
import { edgeLogger } from '@/lib/logger-edge'
import { NOTIFICATION_TYPE_VALUES, type NotificationType } from '@/lib/notifications/types'
import { createBrowserClient } from '@/lib/supabase/client'

/**
 * Zod schema for validating raw Supabase Realtime payload (snake_case DB columns).
 * Type field is validated against known NOTIFICATION_TYPES — unknown types are
 * intentionally rejected to enforce type-safety. If a new type is inserted without
 * adding to NOTIFICATION_TYPES first, the Realtime handler will skip it and log a warning.
 */
const rawNotificationSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  user_id: z.string(),
  type: z.enum(NOTIFICATION_TYPE_VALUES),
  project_id: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  is_read: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
})

type RawNotificationPayload = z.infer<typeof rawNotificationSchema>

/** Map snake_case Realtime payload to camelCase AppNotification */
function mapRealtimePayload(raw: RawNotificationPayload): AppNotification {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    userId: raw.user_id,
    type: raw.type as NotificationType,
    projectId: raw.project_id,
    title: raw.title,
    body: raw.body,
    isRead: raw.is_read,
    metadata: raw.metadata,
    createdAt: raw.created_at,
  }
}

export function useNotifications(userId: string, tenantId: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [supabase] = useState(() => createBrowserClient())

  // Fetch initial notifications
  useEffect(() => {
    async function fetchInitial() {
      const result = await getNotifications()
      if (result.success) {
        setNotifications(result.data)
      } else {
        toast.error('Failed to load notifications')
      }
    }
    fetchInitial().catch(() => {
      // Non-critical: toast.error shown for result.success=false inside fetchInitial
    })
  }, [userId, tenantId])

  // Subscribe to Supabase Realtime for new notifications
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}:${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const parsed = rawNotificationSchema.safeParse(payload.new)
          if (!parsed.success) {
            edgeLogger.warn('Discarded Realtime notification payload', {
              issues: parsed.error.issues,
            })
            return
          }
          const raw = parsed.data
          // Client-side tenant guard (defense-in-depth)
          if (raw.tenant_id !== tenantId) return
          const newNotif = mapRealtimePayload(raw)
          setNotifications((prev) => [newNotif, ...prev])
          toast.info(newNotif.title, {
            description: newNotif.body,
            duration: 4000,
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, tenantId, supabase])

  // Re-fetch on tab visibility change (cross-tab staleness fix — AC7)
  // Uses functional update to merge with Realtime state, preventing race condition
  // where a Realtime INSERT during the fetch would be discarded by a full replace.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        getNotifications()
          .then((result) => {
            if (result.success) {
              setNotifications((prev) => {
                const fetchedIds = new Set(result.data.map((n) => n.id))
                const realtimeOnly = prev.filter((n) => !fetchedIds.has(n.id))
                return [...realtimeOnly, ...result.data].sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                )
              })
            }
          })
          .catch(() => {}) // Non-critical
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications])

  const markAsRead = useCallback(async (notificationId: string) => {
    const result = await markNotificationReadAction(notificationId)
    if (result.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      )
    } else {
      toast.error('Failed to mark notification as read')
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    const result = await markNotificationReadAction('all')
    if (result.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } else {
      toast.error('Failed to mark notifications as read')
    }
  }, [])

  return { notifications, unreadCount, markAsRead, markAllAsRead }
}
