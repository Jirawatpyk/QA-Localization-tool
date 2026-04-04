import type { ReactNode } from 'react'

import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { MobileBanner } from '@/components/layout/mobile-banner'
import { AuthListener } from '@/features/admin/components/AuthListener'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()

  return (
    <div className="flex h-screen flex-col">
      <AuthListener />
      {/* Mobile banner: visible below md */}
      <div className="p-2 md:hidden">
        <MobileBanner />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: hidden below md, collapsed at lg, expanded at xl+ */}
        <div className="hidden md:flex">
          <AppSidebar userRole={user?.role ?? null} />
        </div>

        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppHeader
            userId={user?.id}
            tenantId={user?.tenantId}
            displayName={user?.displayName}
            email={user?.email}
            role={user?.role}
          />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[var(--content-max-width)] has-[[data-review-layout]]:max-w-none">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
