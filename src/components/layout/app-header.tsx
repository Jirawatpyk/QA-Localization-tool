import { Bell, User } from 'lucide-react'

import { AppBreadcrumb } from '@/components/layout/app-breadcrumb'
import { UserMenu } from '@/components/layout/user-menu'
import { NotificationDropdown } from '@/features/dashboard/components/NotificationDropdown'
import { HelpMenu } from '@/features/onboarding/components/HelpMenu'
import type { AppRole } from '@/lib/auth/getCurrentUser'

type AppHeaderProps = {
  userId?: string | undefined
  tenantId?: string | undefined
  displayName?: string | undefined
  email?: string | undefined
  role?: AppRole | undefined
}

export function AppHeader({ userId, tenantId, displayName, email, role }: AppHeaderProps) {
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
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary opacity-50 cursor-not-allowed"
            aria-label="Notifications"
            disabled
          >
            <Bell size={16} />
          </button>
        )}
        <HelpMenu />
        {displayName && email && role ? (
          <UserMenu displayName={displayName} email={email} role={role} />
        ) : (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary opacity-50 cursor-not-allowed"
            aria-label="User menu"
            disabled
          >
            <User size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
