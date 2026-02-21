'use client'

import { Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications } from '@/features/dashboard/hooks/useNotifications'

interface NotificationDropdownProps {
  userId: string
  tenantId: string
}

export function NotificationDropdown({ userId, tenantId }: NotificationDropdownProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(
    userId,
    tenantId,
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="Notifications"
          data-testid="notification-bell"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-primary-foreground"
              data-testid="notification-badge"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80" data-testid="notification-dropdown">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={() => void markAllAsRead()}
              data-testid="notification-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto">
            {notifications.slice(0, 20).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className="flex cursor-pointer flex-col items-start gap-1 px-3 py-2"
                onClick={() => {
                  if (!notif.isRead) void markAsRead(notif.id)
                }}
                data-testid={`notification-item-${notif.id}`}
              >
                <div className="flex w-full items-start gap-2">
                  {!notif.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className="flex-1">
                    <p
                      className="text-sm font-medium leading-tight"
                      data-testid="notification-title"
                    >
                      {notif.title}
                    </p>
                    <p
                      className="mt-0.5 text-xs text-muted-foreground line-clamp-2"
                      data-testid="notification-body"
                    >
                      {notif.body}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
