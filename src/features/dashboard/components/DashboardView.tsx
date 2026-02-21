'use client'

import type { DashboardData } from '@/features/dashboard/types'
import { OnboardingTour } from '@/features/onboarding/components/OnboardingTour'
import type { UserMetadata } from '@/features/onboarding/types'

import { DashboardMetricCards } from './DashboardMetricCards'
import { RecentFilesTable } from './RecentFilesTable'

interface DashboardViewProps {
  data: DashboardData
  userMetadata: UserMetadata | null
  userId: string
}

export function DashboardView({ data, userMetadata, userId }: DashboardViewProps) {
  return (
    <div className="space-y-6" data-testid="dashboard-view">
      {/* Mobile banner */}
      <div
        className="block md:hidden rounded-lg border border-warning-border bg-warning-light p-3 text-sm text-warning-foreground"
        data-testid="mobile-desktop-banner"
      >
        For the best review experience, use a desktop browser
      </div>

      <DashboardMetricCards
        recentFilesCount={data.recentFiles.length}
        pendingReviewsCount={data.pendingReviewsCount}
        teamActivityCount={data.teamActivityCount}
      />

      <RecentFilesTable files={data.recentFiles} />

      <OnboardingTour userId={userId} userMetadata={userMetadata} />
    </div>
  )
}
