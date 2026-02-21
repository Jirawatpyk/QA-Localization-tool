import { Suspense } from 'react'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { getDashboardData } from '@/features/dashboard/actions/getDashboardData.action'
import { DashboardSkeleton } from '@/features/dashboard/components/DashboardSkeleton'
import { DashboardView } from '@/features/dashboard/components/DashboardView'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  // Note: proxy.ts already handles unauthenticated redirect to /login.
  // If user reaches here but getCurrentUser returns null, their account
  // is still being set up (Supabase replica lag for user_role). Show skeleton.
  if (!user) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <CompactLayout>
          <DashboardSkeleton />
        </CompactLayout>
      </>
    )
  }

  const result = await getDashboardData()
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
