export interface RecentFileRow {
  id: string
  fileName: string
  projectId: string
  projectName: string
  status: string // 'uploaded' | 'parsing' | 'parsed' | 'error'
  createdAt: string // ISO 8601
  mqmScore: number | null // from scores table (null if not scored yet)
  findingsCount: number // from findings count (default 0)
}

export interface DashboardData {
  recentFiles: RecentFileRow[] // last 10 files for tenant
  pendingReviewsCount: number // count of files with status 'parsed' and no score yet
  teamActivityCount: number // count of review_actions in last 7 days for tenant
}

// IMPORTANT: Do NOT use the browser's built-in `Notification` type
export interface AppNotification {
  id: string
  tenantId: string
  userId: string
  type: string
  title: string
  body: string
  isRead: boolean
  metadata: Record<string, unknown> | null
  createdAt: string // ISO 8601
}
