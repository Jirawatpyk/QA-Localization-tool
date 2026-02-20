import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { getDashboardData } from '@/features/dashboard/actions/getDashboardData.action'
import { DashboardSkeleton } from '@/features/dashboard/components/DashboardSkeleton'
import { DashboardView } from '@/features/dashboard/components/DashboardView'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const result = await getDashboardData(user.tenantId, user.id)
  const dashboardData = result.success
    ? result.data
    : { recentFiles: [], pendingReviewsCount: 0, teamActivityCount: 0 }

  return (
    <>
      <PageHeader title="Dashboard" />
      <CompactLayout>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardView
            data={dashboardData}
            userMetadata={user.metadata ?? null}
            userId={user.id}
          />
        </Suspense>
      </CompactLayout>
    </>
  )
}
