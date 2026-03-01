import { Bell, User } from 'lucide-react'

import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import { NotificationDropdown } from '@/features/dashboard/components/NotificationDropdown'
import { HelpMenu } from '@/features/onboarding/components/HelpMenu'

type AppHeaderProps = {
  userId?: string | undefined
  tenantId?: string | undefined
}

export function AppHeader({ userId, tenantId }: AppHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <AppBreadcrumb />
      </div>
      <div className="flex items-center gap-2">
        {userId && tenantId ? (
          <NotificationDropdown userId={userId} tenantId={tenantId} />
        ) : (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            aria-label="Notifications"
          >
            <Bell size={16} />
          </button>
        )}
        <HelpMenu />
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="User menu"
        >
          <User size={16} />
        </button>
      </div>
    </header>
  )
}
