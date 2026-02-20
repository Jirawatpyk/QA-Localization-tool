'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getNotifications } from '@/features/dashboard/actions/getNotifications.action'
import { markNotificationRead as markNotificationReadAction } from '@/features/dashboard/actions/markNotificationRead.action'
import type { AppNotification } from '@/features/dashboard/types'
import { createBrowserClient } from '@/lib/supabase/client'

export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [supabase] = useState(() => createBrowserClient())

  // Fetch initial notifications
  useEffect(() => {
    async function fetchInitial() {
      const result = await getNotifications()
      if (result.success) {
        setNotifications(result.data)
      }
    }
    void fetchInitial()
  }, [userId])

  // Subscribe to Supabase Realtime for new notifications
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification
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
  }, [userId, supabase])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications])

  const markAsRead = useCallback(async (notificationId: string) => {
    await markNotificationReadAction(notificationId)
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
    )
  }, [])

  const markAllAsRead = useCallback(async () => {
    await markNotificationReadAction('all')
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }, [])

  return { notifications, unreadCount, markAsRead, markAllAsRead, setNotifications }
}
