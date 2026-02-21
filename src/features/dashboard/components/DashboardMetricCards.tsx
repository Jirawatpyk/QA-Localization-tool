import { FileText, Clock, Shield, Users } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DashboardMetricCardsProps {
  recentFilesCount: number
  pendingReviewsCount: number
  teamActivityCount: number
}

export function DashboardMetricCards({
  recentFilesCount,
  pendingReviewsCount,
  teamActivityCount,
}: DashboardMetricCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="metric-cards">
      <Card data-testid="dashboard-metric-recent-files">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recent Files</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{recentFilesCount}</div>
          <p className="text-xs text-muted-foreground">Files uploaded</p>
        </CardContent>
      </Card>

      <Card data-testid="dashboard-metric-pending-reviews">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pendingReviewsCount}</div>
          <p className="text-xs text-muted-foreground">Awaiting review</p>
        </CardContent>
      </Card>

      <Card data-testid="dashboard-metric-auto-pass">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Auto-pass</CardTitle>
          <Shield className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-sm font-medium text-muted-foreground">Auto-pass setup pending</div>
          <p className="text-xs text-muted-foreground">Available in a future update</p>
        </CardContent>
      </Card>

      <Card data-testid="dashboard-metric-team-activity">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Team Activity</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{teamActivityCount}</div>
          <p className="text-xs text-muted-foreground">Actions last 7 days</p>
        </CardContent>
      </Card>
    </div>
  )
}
