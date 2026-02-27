// ── AI Usage Dashboard types (Story 3.1a) ──────────────────────────────────

export type AiUsageSummary = {
  totalCostUsd: number
  filesProcessed: number
  avgCostPerFileUsd: number
  projectedMonthCostUsd: number | null // null when < 5 days elapsed
}

export type AiProjectSpend = {
  projectId: string
  projectName: string
  totalCostUsd: number
  filesProcessed: number
  monthlyBudgetUsd: number | null // null = unlimited
  budgetAlertThresholdPct: number
}

export type AiModelSpend = {
  provider: string // 'openai' | 'anthropic' | 'google' | 'unknown'
  model: string
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
}

export type AiSpendTrendPoint = {
  date: string // 'YYYY-MM-DD'
  totalCostUsd: number
  l2CostUsd: number
  l3CostUsd: number
}

// ── Legacy dashboard types ───────────────────────────────────────────────────

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
