'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getNotifications } from '@/features/dashboard/actions/getNotifications.action'
import { markNotificationRead as markNotificationReadAction } from '@/features/dashboard/actions/markNotificationRead.action'
import type { AppNotification } from '@/features/dashboard/types'
import { createBrowserClient } from '@/lib/supabase/client'

/** Raw Supabase Realtime payload uses snake_case DB column names */
interface RawNotificationPayload {
  id: string
  tenant_id: string
  user_id: string
  type: string
  title: string
  body: string
  is_read: boolean
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Map snake_case Realtime payload to camelCase AppNotification */
function mapRealtimePayload(raw: RawNotificationPayload): AppNotification {
  return {
    id: raw.id,
    tenantId: raw.tenant_id,
    userId: raw.user_id,
    type: raw.type,
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
    void fetchInitial()
  }, [userId])

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
          filter: `user_id=eq.${userId}&tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const raw = payload.new as RawNotificationPayload
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

  return { notifications, unreadCount, markAsRead, markAllAsRead, setNotifications }
}
