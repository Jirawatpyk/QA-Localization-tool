# Story 3.1a: AI Usage Dashboard & Reporting

Status: done

## Story

As an Admin,
I want a dedicated AI usage dashboard at `/admin/ai-usage/` showing tenant-wide spend by project, model/provider breakdown, daily cost trends, and CSV export,
So that I can track and optimize AI costs across all projects and make data-driven budget decisions.

## Acceptance Criteria

### AC1: Dashboard Route & Admin Navigation

**Given** an Admin navigates to `/admin/ai-usage/`
**When** the page loads
**Then** the AI Usage Dashboard renders with all sections (summary, by-project table, model chart, trend chart, export button)
**And** only users with `role = 'admin'` can access the page — all others are redirected to `/dashboard`
**And** the Admin layout nav (`src/app/(app)/admin/layout.tsx`) shows a new "AI Usage" tab (`href="/admin/ai-usage"`, `testId="admin-tab-ai-usage"`) that highlights when active
**And** the page has `export const dynamic = 'force-dynamic'` (imports db/client)

### AC2: Summary Metric Cards

**Given** the dashboard loads
**When** AI usage data exists for the current calendar month (UTC boundary, same as `checkProjectBudget`)
**Then** four metric cards are displayed:

| Card | Value | Formula |
|------|-------|---------|
| Total AI Spend | `$X.XX` | `SUM(estimated_cost)` from `ai_usage_logs` WHERE `tenant_id` + current month |
| Files Processed | `N` | `COUNT(DISTINCT file_id)` from `ai_usage_logs` WHERE `tenant_id` + current month |
| Avg Cost per File | `$X.XX` | Total Spend ÷ Files Processed (or `$0.00` if 0 files) |
| Projected This Month | `$X.XX` | `(totalSpend / daysElapsed) × daysInMonth` — only when ≥ 5 days elapsed; otherwise shows `—` |

**When** there is zero AI usage → all cards show `$0.00` or `0` (NOT loading spinner)
**And** empty state text beneath metric cards: "No AI processing recorded yet. Process your first file to see usage data."

### AC3: Spend by Project Table

**Given** the dashboard has loaded summary data
**When** projects exist with AI usage this month
**Then** a sortable table shows one row per project in the tenant:

| Column | Value | Sort |
|--------|-------|------|
| Project | Project name | A-Z |
| Spend This Month | `$X.XX` | ↑↓ |
| Monthly Budget | `$Y.YY` or "Unlimited" | ↑↓ |
| Budget Used | `N%` — color-coded (green < `budgetAlertThresholdPct`, yellow ≥ threshold, red ≥ 100%) | ↑↓ |
| Files Processed | count | ↑↓ |

**And** projects with ZERO spend this month are included in the table (not hidden), showing `$0.00`
**And** default sort: Spend This Month descending (highest cost projects first)
**And** `budgetAlertThresholdPct` is read from `projects.budget_alert_threshold_pct` (per-project threshold, default 80)

### AC4: Spend by Model/Provider Chart

**Given** the dashboard loads
**When** AI usage logs exist for the selected time period
**Then** a recharts `BarChart` shows total spend (USD) grouped by `provider`: "openai", "anthropic", "google"
**And** below the chart, a summary table shows per-model breakdown:

| Model | Provider | Total Cost ($) | Input Tokens | Output Tokens |
|-------|----------|---------------|-------------|--------------|

**And** the chart and table filter by the active date range (7 / 30 / 90 days — shared with trend chart, default 30 days)
**And** `getAiSpendByModel` accepts `{ days: 7 | 30 | 90 }` parameter — same period selector as trend chart
**And** when only one provider exists, the chart still renders (no empty-state fallback needed for single-bar)
**And** when no usage data → chart area shows text: "No model usage data for this period"

### AC5: Daily Cost Trend Chart

**Given** the dashboard loads
**When** the trend chart is displayed
**Then** a recharts `LineChart` shows daily spend (USD) for the selected period:
- **Period selector** (toggle buttons): `Last 7 days` | `Last 30 days` | `Last 90 days` (default: Last 30 days)
- **View toggle**: `Total` | `By Layer (L2 / L3)` (default: Total)
- **X-axis**: dates (formatted `MMM d`, e.g., "Feb 1")
- **Y-axis**: USD amount (`$X.XX` labels)

**And** days with zero spend show a data point at `$0.00` (not a gap in the line)
**And** period change re-fetches data from the same server action (client-side state controls the period param)
**And** max date range enforced at 90 days on the server side — requests > 90 days → returns 90 days from today

### AC6: CSV Export

**Given** Admin clicks the "Export CSV" button
**When** the download is triggered
**Then** a CSV file is generated with columns:
`date, project_name, file_id, layer, model, provider, input_tokens, output_tokens, cost_usd, latency_ms, status`
**And** the file is named: `ai-usage-{YYYY-MM}.csv` (current month)
**And** date range = current calendar month (same as default dashboard view)
**And** export is capped at 90 days — any request exceeding 90 days returns 90 days from today
**And** `project_name` is joined from the `projects` table using `project_id` (no hardcoded strings)
**And** empty data → CSV with only the header row (no error, just empty)

### AC7: RBAC

**Given** a user accesses `/admin/ai-usage/`
**When** their role is checked
**Then**:
- `admin` → full access (all projects within the tenant)
- `qa_reviewer` or `native_reviewer` → `redirect('/dashboard')`

> **Note:** There is no separate `pm` AppRole. The `admin` role covers PM responsibilities per Story 3.1 RBAC clarification.

### AC8: Unit Tests

**Given** the new server actions and components are implemented
**When** unit tests are run
**Then** tests exist for:

**Server Actions (boundary value coverage — Epic 2 Retro A2 mandate):**
- `getAiUsageSummary`: zero data → all zeros; single record; multi-project aggregation; `withTenant()` isolates by tenant
- `getAiUsageByProject`: zero spend shows project row; budget alert threshold color; projects with NULL budget show "Unlimited"
- `getAiSpendByModel`: single provider; multi-provider aggregation; zero data → empty array
- `getAiSpendTrend`: 7-day period; 30-day with gaps; exactly 90-day boundary; >90-day capped to 90; zero data returns empty array with date scaffolding (all points at 0)
- `exportAiUsage`: full month → correct column count; empty month → header-only CSV; special characters in project_name are escaped

**Components:**
- `AiUsageSummaryCards`: renders $0.00 with empty state text when no data; renders correct values; projected spend hides when < 5 days elapsed
- `AiSpendByProjectTable`: empty row for zero-spend projects; color coding: green/yellow/red; sort descending by spend default
- `AiUsageDashboard`: admin renders full dashboard; non-admin redirects (guard tested in page, not component)

> **Note on recharts tests:** Recharts uses ResizeObserver + canvas — mock in `vi.mock('recharts', ...)`. Chart container divs use `data-testid` for test assertions (not chart internals).

---

## Tasks / Subtasks

- [x] **Task 1: Admin Route, Navigation & DB Indexes** (AC: #1)
  - [x] 1.1 Create `src/app/(app)/admin/ai-usage/page.tsx` — Admin-only RSC page with `redirect('/dashboard')` guard for non-admins
  - [x] 1.2 Add `export const dynamic = 'force-dynamic'` to the page (imports db/client)
  - [x] 1.3 Add "AI Usage" nav item to `src/app/(app)/admin/layout.tsx` NAV_ITEMS: `{ label: 'AI Usage', href: '/admin/ai-usage', testId: 'admin-tab-ai-usage' }`
  - [x] 1.4 Create `supabase/migrations/00017_story_3_1a_indexes.sql` — add compound indexes for dashboard query performance (verified: NOT in 00016):
    ```sql
    CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_created
      ON ai_usage_logs (tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_project_created
      ON ai_usage_logs (tenant_id, project_id, created_at);
    ```
  - [x] 1.5 Apply migration: `npx dotenv-cli -e .env.local -- npm run db:migrate` (index-only — no Drizzle schema changes needed)

- [x] **Task 2: Server Actions — Data Fetching** (AC: #2, #3, #4, #5, #6)
  - [x] 2.0 Create `src/features/dashboard/types.ts` — define `AiUsageSummary`, `AiProjectSpend`, `AiModelSpend`, `AiSpendTrendPoint` types (MUST exist before any action file is written)
  - [x] 2.1 Create `src/features/dashboard/actions/getAiUsageSummary.action.ts` — tenant-wide: total spend, files processed, avg cost/file, projected spend. Auth: `requireRole('admin', 'read')`. Define `GetAiUsageSummaryResult` union type in file
  - [x] 2.2 Create `src/features/dashboard/actions/getAiUsageByProject.action.ts` — per-project table data: **LEFT JOIN** from `projects` → `ai_usage_logs` (date filter in JOIN condition, not WHERE). Admin-only. Define `GetAiUsageByProjectResult` union type in file
  - [x] 2.3 Create `src/features/dashboard/actions/getAiSpendByModel.action.ts` — group by provider + model; accepts `{ days: 7 | 30 | 90 }` parameter for date range. Admin-only. Define `GetAiSpendByModelResult` union type in file
  - [x] 2.4 Create `src/features/dashboard/actions/getAiSpendTrend.action.ts` — daily spend for N days (7/30/90), scaffolded with all dates (0 for gaps); accepts `{ days: 7 | 30 | 90 }`. Admin-only. Define `GetAiSpendTrendResult` union type in file
  - [x] 2.5 Create `src/features/dashboard/actions/exportAiUsage.action.ts` — generates CSV string for current month (capped 90 days). Admin-only. Define `ExportAiUsageResult` union type in file
  - [x] 2.6 Write unit tests for all 5 actions (boundary values per AC8)

- [x] **Task 3: Summary Metric Cards** (AC: #2)
  - [x] 3.1 Create `src/features/dashboard/components/AiUsageSummaryCards.tsx` — 4 metric cards using existing `Card` from `@/components/ui/card`
  - [x] 3.2 Implement projected spend logic: `daysInMonth`, `daysElapsed`, hide when < 5 days elapsed
  - [x] 3.3 Empty state: render `data-testid="ai-usage-empty-state"` when totalSpend === 0 AND filesProcessed === 0
  - [x] 3.4 Write component tests (6 tests: empty state, full data, < 5 days projection hidden, ≥ 5 days shown, $0.00 formatting)

- [x] **Task 4: Spend by Project Table** (AC: #3)
  - [x] 4.1 Create `src/features/dashboard/components/AiSpendByProjectTable.tsx` — client component with sort state
  - [x] 4.2 Color-code "Budget Used" column: green/yellow/red using project's `budgetAlertThresholdPct` (same logic as `AiBudgetCard.getProgressColor`)
  - [x] 4.3 Show "Unlimited" when `monthlyBudgetUsd === null`
  - [x] 4.4 Default sort: spend descending
  - [x] 4.5 Write component tests (6 tests: zero-spend project included, sort, color coding green/yellow/red, unlimited budget display)

- [x] **Task 5: Spend by Model Chart** (AC: #4)
  - [x] 5.1 Create `src/features/dashboard/components/AiSpendByModelChart.tsx` — recharts `BarChart` by provider + model table below
  - [x] 5.2 Wrap chart in `data-testid="ai-model-chart-container"` for testability
  - [x] 5.3 Empty state when no data: `data-testid="ai-model-chart-empty"` with text "No model usage data for this period"
  - [x] 5.4 Write component tests (3 tests: empty state; single provider renders; multi-provider renders — assert container testid present)

- [x] **Task 6: Daily Cost Trend Chart** (AC: #5)
  - [x] 6.1 Create `src/features/dashboard/components/AiSpendTrendChart.tsx` — recharts `LineChart` with period + view toggle
  - [x] 6.2 Period buttons: "Last 7 days" | "Last 30 days" | "Last 90 days" with `data-testid="trend-period-{7|30|90}"`
  - [x] 6.3 View toggle: "Total" | "By Layer" with `data-testid="trend-view-{total|layer}"`
  - [x] 6.4 Wrap chart in `data-testid="ai-trend-chart-container"` for testability
  - [x] 6.5 Write component tests (4 tests: default period is 30d; period button changes active state; zero data renders without crash; By Layer shows L2+L3 series)

- [x] **Task 7: Main Dashboard Component** (AC: all)
  - [x] 7.1 Create `src/features/dashboard/components/AiUsageDashboard.tsx` — client entry component; uses `useRouter().push()` for period navigation (RSC page re-fetches all data); handles period change via `startTransition`
  - [x] 7.2 Wire CSV export: `onClick` → call `exportAiUsage` action → `URL.createObjectURL(new Blob([csv]))` → programmatic `<a>` download → revoke URL
  - [x] 7.3 Wire `src/app/(app)/admin/ai-usage/page.tsx`: fetch initial data server-side via actions, pass to `<AiUsageDashboard />` as props
  - [x] 7.4 Write component tests (4 tests: full render with data; export button triggers download mock; period selector; router.push on period change)

- [x] **Task 8: Integration & Validation** (AC: #8)
  - [x] 8.1 Run `npm run type-check` — zero errors
  - [x] 8.2 Run `npm run lint` — zero warnings
  - [x] 8.3 Run full test suite — all passing, 0 skipped (remove any `it.skip()` stubs)

---

## Dev Notes

### Architecture Assumption Checklist — Pre-locked ✅

| Check | Result |
|-------|--------|
| R1: Route `/admin/ai-usage/` exists? | ❌ DOES NOT EXIST — Task 1.1 creates it |
| R2: Nav link reachable for admin? | ✅ Inside `(app)/admin/layout.tsx` (already auth-guarded at admin page level) |
| R3: New route explicit subtask? | ✅ Task 1.1 |
| D1: Columns in `ai_usage_logs` exist? | ✅ All present (Story 3.1 migration) |
| D2: New columns needed? | ❌ No new columns — read-only story |
| D3: `tenant_id` on all queried tables? | ✅ `ai_usage_logs.tenant_id` + `projects.tenant_id` — `withTenant()` mandatory |
| D4: State-changing mutations? | ✅ None — pure reporting. No audit log needed (reads only) |
| C1: Radix Select used? | ❌ Period selector uses simple toggle buttons (not Radix Select) — no E2E concern |
| C2: shadcn components installed? | ✅ Card, Button — already in `src/components/ui/` |
| C3: RSC boundary correct? | ✅ `page.tsx` = RSC, `AiUsageDashboard.tsx` = `"use client"` entry |

### Key Files from Story 3.1 (Dependencies)

| File | What It Provides | Notes |
|------|-----------------|-------|
| `src/db/schema/aiUsageLogs.ts` | `ai_usage_logs` Drizzle table definition | All columns ready (Story 3.1) |
| `src/db/schema/projects.ts` | `projects.budgetAlertThresholdPct`, `projects.aiBudgetMonthlyUsd` | Used for per-project budget display |
| `src/lib/ai/budget.ts` → `checkProjectBudget()` | Per-project budget query pattern | DO NOT duplicate — dashboard uses direct Drizzle queries for aggregation |
| `src/features/pipeline/components/AiBudgetCard.tsx` | `getProgressColor()` logic (green/yellow/red) | Extract or replicate the color logic in `AiSpendByProjectTable` (don't import from pipeline feature — cross-feature dependency) |
| `src/features/pipeline/actions/getProjectAiBudget.action.ts` | Per-project budget + threshold fetch | Dashboard needs tenant-wide, not single-project — new action needed |
| `src/app/(app)/admin/layout.tsx` | NAV_ITEMS array | Task 1.3 adds "AI Usage" tab |

### Server Action Patterns (Copy from Golden Examples)

All 5 new server actions MUST follow `_bmad-output/golden-examples/server-action.example.ts` (project root — no `src/` prefix):
- `'use server'` + `import 'server-only'`
- `requireRole('admin', 'read')` at top — ALL dashboard actions are admin-only (defense-in-depth, even though page-level guard exists)
- `withTenant()` on EVERY query
- Define custom result union type per action (no global `ActionResult<T>` in this codebase):
  ```typescript
  type GetAiUsageSummaryResult =
    | { success: true; data: AiUsageSummary }
    | { success: false; code: string; error: string }
  ```
- Return result union type (never throw to caller)
- Use `logger.error(...)` on catch (not `console.log`)

### Data Query Patterns for Dashboard Actions

**Summary Action (`getAiUsageSummary`):**
```typescript
// Get month boundary (same pattern as checkProjectBudget)
const monthStart = new Date()
monthStart.setUTCDate(1)
monthStart.setUTCHours(0, 0, 0, 0)

const [summary] = await db
  .select({
    totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
    fileCount: sql<string>`COUNT(DISTINCT ${aiUsageLogs.fileId})`,
  })
  .from(aiUsageLogs)
  .where(and(
    withTenant(aiUsageLogs.tenantId, tenantId),
    gte(aiUsageLogs.createdAt, monthStart),
  ))
```

**Guard:** After `summary` query, `summary` is always defined (aggregate returns 1 row). Safe to access without `if (!summary)` check — but DO guard `Number(summary.totalCost)` (sql result is string from Drizzle).

**By-Project Action (`getAiUsageByProject`):**

> ⚠️ **CRITICAL — must drive from `projects`, not `ai_usage_logs`!**
> AC3 requires zero-spend projects to appear. An `innerJoin` from `aiUsageLogs` would exclude them.
> The date filter MUST be in the `leftJoin` condition (not WHERE) — putting it in WHERE converts the LEFT JOIN to an INNER JOIN and drops zero-spend rows.

```typescript
import { and, eq, gte, sql } from 'drizzle-orm'
// ...

// Drive from projects so zero-spend projects still appear (LEFT JOIN)
const rows = await db
  .select({
    projectId: projects.id,
    projectName: projects.name,
    monthlyBudgetUsd: projects.aiBudgetMonthlyUsd,
    budgetAlertThresholdPct: projects.budgetAlertThresholdPct,
    totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
    fileCount: sql<string>`COUNT(DISTINCT ${aiUsageLogs.fileId})`,
  })
  .from(projects)                               // ← drive from projects
  .leftJoin(                                    // ← LEFT JOIN (not innerJoin!)
    aiUsageLogs,
    and(
      eq(aiUsageLogs.projectId, projects.id),
      eq(aiUsageLogs.tenantId, tenantId),       // ← tenant filter IN JOIN (not WHERE)
      gte(aiUsageLogs.createdAt, monthStart),   // ← date filter IN JOIN (not WHERE)
    ),
  )
  .where(withTenant(projects.tenantId, tenantId)) // ← only this tenant's projects
  .groupBy(
    projects.id,
    projects.name,
    projects.aiBudgetMonthlyUsd,
    projects.budgetAlertThresholdPct,
  )
```

**Why tenant filter appears in both JOIN and WHERE:** defense-in-depth (Guardrail #14). The `withTenant(projects.tenantId, tenantId)` in WHERE handles projects isolation. The `eq(aiUsageLogs.tenantId, tenantId)` in JOIN condition prevents cross-tenant log data leaking even if a project_id collision occurred.

**Trend Action (`getAiSpendTrend`):**
```typescript
import { and, eq, gte, lte, sql } from 'drizzle-orm' // note: lte required

// Daily aggregation with date scaffolding
// Input: { days: 7 | 30 | 90 } — capped at MAX_DAYS=90 server-side

const MAX_DAYS = 90
const cappedDays = Math.min(requestedDays, MAX_DAYS)
const rangeEnd = new Date()
rangeEnd.setUTCHours(23, 59, 59, 999)
const rangeStart = new Date()
rangeStart.setUTCDate(rangeStart.getUTCDate() - cappedDays)
rangeStart.setUTCHours(0, 0, 0, 0)

// 1. Query grouped by UTC date
const rows = await db
  .select({
    day: sql<string>`DATE(${aiUsageLogs.createdAt})`,  // UTC date truncation
    totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
    l2Cost: sql<string>`COALESCE(SUM(CASE WHEN ${aiUsageLogs.layer} = 'L2' THEN ${aiUsageLogs.estimatedCost} ELSE 0 END), 0)`,
    l3Cost: sql<string>`COALESCE(SUM(CASE WHEN ${aiUsageLogs.layer} = 'L3' THEN ${aiUsageLogs.estimatedCost} ELSE 0 END), 0)`,
  })
  .from(aiUsageLogs)
  .where(and(
    withTenant(aiUsageLogs.tenantId, tenantId),
    gte(aiUsageLogs.createdAt, rangeStart),
    lte(aiUsageLogs.createdAt, rangeEnd),
  ))
  .groupBy(sql`DATE(${aiUsageLogs.createdAt})`)

// 2. Scaffold all dates in range — fill missing days with 0
// Build Map<dateStr, row>, then iterate each day in range:
const rowMap = new Map(rows.map(r => [r.day, r]))
const result: AiSpendTrendPoint[] = []
for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
  const dateStr = d.toISOString().split('T')[0]
  const row = rowMap.get(dateStr)
  result.push({
    date: dateStr,
    totalCostUsd: Number(row?.totalCost ?? 0),
    l2CostUsd: Number(row?.l2Cost ?? 0),
    l3CostUsd: Number(row?.l3Cost ?? 0),
  })
}
```

**Export Action (`exportAiUsage`):**
```typescript
// Join ai_usage_logs + projects for project_name
// Build CSV string — NO npm CSV library (keep it simple, manual build)
const header = 'date,project_name,file_id,layer,model,provider,input_tokens,output_tokens,cost_usd,latency_ms,status'
const rows = records.map(r =>
  [
    r.createdAt.toISOString().split('T')[0],
    `"${r.projectName.replace(/"/g, '""')}"`,  // escape double quotes
    r.fileId,
    r.layer,
    r.model,
    r.provider,
    r.inputTokens,
    r.outputTokens,
    r.estimatedCost.toFixed(6),
    r.latencyMs,
    r.status,
  ].join(',')
)
const csv = [header, ...rows].join('\n')
```

### Component Architecture (RSC Boundary)

```
src/app/(app)/admin/ai-usage/page.tsx           ← RSC (Server Component)
  ↓ fetch initial data (summary + projects + initial trend 30d + initial model 30d)
  ↓ pass as props
src/features/dashboard/components/
  AiUsageDashboard.tsx                          ← "use client" (owns trendDays state)
    AiUsageSummaryCards.tsx                     ← pure presentational (no "use client")
    AiSpendByProjectTable.tsx                   ← "use client" (sort state)
    AiSpendByModelChart.tsx                     ← "use client" (recharts + days state)
    AiSpendTrendChart.tsx                       ← "use client" (recharts — receives data via props)
```

**Page pattern:**
```typescript
// src/app/(app)/admin/ai-usage/page.tsx
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { CompactLayout } from '@/components/layout/compact-layout'
import { AiUsageDashboard } from '@/features/dashboard/components/AiUsageDashboard'
import { getAiUsageSummary } from '@/features/dashboard/actions/getAiUsageSummary.action'
import { getAiUsageByProject } from '@/features/dashboard/actions/getAiUsageByProject.action'
import { getAiSpendTrend } from '@/features/dashboard/actions/getAiSpendTrend.action'
import { getAiSpendByModel } from '@/features/dashboard/actions/getAiSpendByModel.action'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'AI Usage — QA Localization Tool' }

export default async function AiUsagePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  const [summaryResult, projectsResult, trendResult, modelResult] = await Promise.all([
    getAiUsageSummary(),
    getAiUsageByProject(),
    getAiSpendTrend({ days: 30 }),   // default 30 days
    getAiSpendByModel({ days: 30 }), // default 30 days
  ])

  return (
    <>
      <PageHeader title="AI Usage Dashboard" />
      <CompactLayout>
        <AiUsageDashboard
          summary={summaryResult.success ? summaryResult.data : null}
          projects={projectsResult.success ? projectsResult.data : []}
          initialTrendData={trendResult.success ? trendResult.data : []}
          initialModelData={modelResult.success ? modelResult.data : []}
        />
      </CompactLayout>
    </>
  )
}
```

**Period Change Pattern (in `AiUsageDashboard.tsx`):**
```typescript
'use client'
import { useState, startTransition } from 'react'

export function AiUsageDashboard({ summary, projects, initialTrendData, initialModelData }: Props) {
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(30)
  const [trendData, setTrendData] = useState(initialTrendData)
  const [modelData, setModelData] = useState(initialModelData)

  function handlePeriodChange(days: 7 | 30 | 90) {
    setTrendDays(days)
    startTransition(async () => {
      const [trend, model] = await Promise.all([
        getAiSpendTrend({ days }),
        getAiSpendByModel({ days }),
      ])
      if (trend.success) setTrendData(trend.data)
      if (model.success) setModelData(model.data)
    })
  }

  return (
    <>
      <AiUsageSummaryCards summary={summary} />
      <AiSpendByProjectTable projects={projects} />
      <AiSpendByModelChart data={modelData} />
      <AiSpendTrendChart
        data={trendData}
        activeDays={trendDays}
        onPeriodChange={handlePeriodChange}  // ← chart signals up, parent re-fetches
      />
      <button onClick={handleExport}>Export CSV</button>
    </>
  )
}
```

**CRITICAL:** `AiSpendTrendChart` receives `data + activeDays + onPeriodChange` as props — it does NOT call server actions directly. `AiUsageDashboard` owns all state and re-fetching.

### CSV Export Download Pattern

```typescript
// In AiUsageDashboard.tsx client component
async function handleExport() {
  const result = await exportAiUsage()
  if (!result.success) {
    toast.error('Export failed — please try again')
    return
  }
  const blob = new Blob([result.data.csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = result.data.filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Recharts Mocking in Tests

```typescript
// In test files that import chart components:
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))
```

### Color Logic — Avoid Cross-Feature Import

**DO NOT** import `getProgressColor` from `AiBudgetCard.tsx` (pipeline feature → dashboard feature cross-boundary violation).

Instead, replicate as a local pure function in `AiSpendByProjectTable.tsx`:
```typescript
function getBudgetStatusColor(usedPct: number, thresholdPct: number): 'success' | 'warning' | 'error' {
  if (usedPct >= 100) return 'error'
  if (usedPct >= thresholdPct) return 'warning'
  return 'success'
}
```

### Type Definitions (new — define in feature)

```typescript
// src/features/dashboard/types.ts (new file)
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
  provider: string   // 'openai' | 'anthropic' | 'google' | 'unknown'
  model: string
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
}

export type AiSpendTrendPoint = {
  date: string        // 'YYYY-MM-DD'
  totalCostUsd: number
  l2CostUsd: number
  l3CostUsd: number
}
```

### Guardrails Checklist (Pre-implementation)

Apply BEFORE writing each file:

| Guardrail | Applies To | Check |
|-----------|-----------|-------|
| #1 `withTenant()` on every query | ALL 5 actions | `ai_usage_logs.tenantId` in WHERE (or JOIN) + `projects.tenantId` in WHERE (defense-in-depth) |
| #4 Guard `rows[0]!` | Summary action (single aggregate row) | Aggregate always returns 1 row — no guard needed, but cast: `Number(summary.totalCost)` (sql result is string) |
| #5 `inArray(col, [])` guard | N/A — no inArray calls | N/A |
| #6 DELETE+INSERT → transaction | N/A — read-only story | N/A |
| #8 Optional filter: null not '' | Trend action date range | Use `Date` objects (not empty strings). `rangeEnd` inclusive via `lte()` |
| #14 Asymmetric query filters | By-project action LEFT JOIN | `withTenant` in both JOIN condition (on ai_usage_logs) AND WHERE (on projects) — both required |

### Performance Note (O1)

The dashboard queries aggregate `ai_usage_logs` by `tenant_id + created_at`. Check `supabase/migrations/00016_story_3_1_schema.sql` to verify a compound index exists:

```sql
-- Ideal index for dashboard queries (check if already present in migration)
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_created
  ON ai_usage_logs (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_project_created
  ON ai_usage_logs (tenant_id, project_id, created_at);
```

Verified: `00016_story_3_1_schema.sql` does NOT include these indexes → **Task 1 must include creating `supabase/migrations/00017_story_3_1a_indexes.sql`** with the index DDL above. No Drizzle schema changes needed (index-only migration).

### Previous Story Learnings (Story 3.1)

From Story 3.1 CR rounds:
1. **AppRole has no `pm` value** — "PM" in original AC maps to `admin` in AppRole (`admin | qa_reviewer | native_reviewer`). Do not add a `pm` case.
2. **`logAIUsage()` is async** — all callers must `await` it. Dashboard is read-only so this is just for awareness.
3. **`checkProjectBudget` uses USD not tokens** — `BudgetCheckResult.remainingBudgetUsd` is a `number` (not tokens). Dashboard action returns same USD-based data.
4. **Supabase migration naming** — Story 3.1 used `00016_story_3_1_schema.sql`. This story adds ONE migration: `00017_story_3_1a_indexes.sql` (index-only, no schema changes). Verified: 00016 does not include the dashboard query indexes.
5. **`projects.aiBudgetMonthlyUsd`** is `numeric` in Drizzle → comes back as `string` from DB. Always `Number(...)` cast.

### Git Context (Recent Commits)

```
efc4b59 feat(story3.1): implement AI Cost Control, Throttling & Model Pinning
```

Files created in Story 3.1 that this story READS (not modifies):
- `src/lib/ai/budget.ts` — `checkProjectBudget()`
- `src/lib/ai/costs.ts` — `logAIUsage()`
- `src/db/schema/aiUsageLogs.ts` — Drizzle table
- `src/features/pipeline/components/AiBudgetCard.tsx` — color logic pattern (copy, don't import)
- `src/features/pipeline/actions/getProjectAiBudget.action.ts` — single-project pattern (reference for new tenant-wide actions)

### Project Structure Notes

New files to create:
```
src/
├── app/(app)/admin/ai-usage/
│   └── page.tsx                           ← RSC, admin-only, force-dynamic
supabase/migrations/
│   └── 00017_story_3_1a_indexes.sql       ← REQUIRED (verified: NOT in 00016)
src/features/dashboard/
│   ├── types.ts                           ← CREATE FIRST: AiUsageSummary, AiProjectSpend, etc.
│   ├── actions/
│   │   ├── getAiUsageSummary.action.ts
│   │   ├── getAiUsageSummary.action.test.ts
│   │   ├── getAiUsageByProject.action.ts
│   │   ├── getAiUsageByProject.action.test.ts
│   │   ├── getAiSpendByModel.action.ts
│   │   ├── getAiSpendByModel.action.test.ts
│   │   ├── getAiSpendTrend.action.ts
│   │   ├── getAiSpendTrend.action.test.ts
│   │   ├── exportAiUsage.action.ts
│   │   └── exportAiUsage.action.test.ts
│   └── components/
│       ├── AiUsageDashboard.tsx           ← "use client" client entry
│       ├── AiUsageDashboard.test.tsx
│       ├── AiUsageSummaryCards.tsx
│       ├── AiUsageSummaryCards.test.tsx
│       ├── AiSpendByProjectTable.tsx      ← "use client" sort state
│       ├── AiSpendByProjectTable.test.tsx
│       ├── AiSpendByModelChart.tsx        ← "use client" recharts
│       ├── AiSpendByModelChart.test.tsx
│       ├── AiSpendTrendChart.tsx          ← "use client" recharts + period
│       └── AiSpendTrendChart.test.tsx
```

Files to MODIFY:
```
src/app/(app)/admin/layout.tsx             ← Add "AI Usage" tab to NAV_ITEMS
```

### References

- Epic 3 AC: `_bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md` — Story 3.1a AC section
- Story 3.1 (dependency): `_bmad-output/implementation-artifacts/3-1-ai-cost-control-throttling-model-pinning.md` — AC4, AC6, AC7, scope note, UX wireframe note
- Sprint-status note: `3-1a-ai-usage-dashboard-reporting: backlog` — split from 3.1
- DB Schema: `src/db/schema/aiUsageLogs.ts`, `src/db/schema/projects.ts`
- Budget query pattern: `src/lib/ai/budget.ts` → `checkProjectBudget()`
- Admin layout: `src/app/(app)/admin/layout.tsx` (NAV_ITEMS)
- AiBudgetCard: `src/features/pipeline/components/AiBudgetCard.tsx` (color logic reference)
- Recharts: already installed `recharts@3.7.0` — use `BarChart` + `LineChart` from 'recharts'
- Golden Example — Server Action: `_bmad-output/golden-examples/server-action.example.ts`
- CLAUDE.md Guardrails: #1 (withTenant), #4 (rows[0] guard), #8 (null not ''), #14 (asymmetric filters)
- Architecture Checklist: `_bmad-output/architecture-assumption-checklist.md`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Amelia Dev Agent — 2026-02-28)

### Debug Log References

- Bug: `getAiSpendTrend` yielded N+1 data points. Fix: `rangeStart = today - cappedDays + 1` (inclusive range, exactly N points)
- Bug: `exportAiUsage` — `estimatedCost.toFixed()` TypeError since `real` column returns string from Drizzle. Fix: `Number(r.estimatedCost).toFixed(6)`
- Bug: days=7 date comparison test failure (62M ms delta). Fix: added `setUTCHours(0,0,0,0)` to match action's midnight normalization
- Bug: Projection BV tests flaky by day-of-month. Fix: `vi.useFakeTimers()` + `vi.setSystemTime()` to control date
- Bug: L2/L3 trend test — `2026-02-20` not in 7-day window on Feb 28. Fix: `vi.setSystemTime(new Date('2026-02-25T12:00:00Z'))`
- Type errors: Recharts `Tooltip formatter` requires `number | undefined`. Fix: `(v: number | undefined) => [(v ?? 0).toFixed(4)]`
- Pre-CR M1: STATUS_COLORS used `bg-green-500` etc. Fix: replaced with `bg-success`, `bg-warning`, `bg-error` design tokens
- Pre-CR M2: Recharts fill/stroke had hex fallbacks. Fix: removed hex, use `var(--chart-N)` only
- Pre-CR M3: `useState(selectedDays)` without sync useEffect. Fix: added `useEffect(() => setActivePeriod(selectedDays), [selectedDays])`

### Completion Notes List

- All 8 Tasks complete (Tasks 1–8)
- 63 ATDD tests activated (43 P0 + 11 P1 + 9 P1-BV): 63/63 GREEN ✅
- type-check: clean ✅ | lint: clean ✅
- Pre-CR quality scan: 0C/0H/3M/2L → all 3M fixed → 0C/0H/0M/2L (LOW = relative imports + pre-existing interface, acceptable)
- Tenant isolation audit: 0 findings — withTenant() applied correctly on all 5 actions including double-application on LEFT JOIN
- Pre-existing failure: `runL1ForFile.test.ts` (2 tests) — not caused by Story 3.1a (no files in common)
- **CR R1 (2026-02-28):** 0C/3H/5M/3L resolved — H1 (default sort), H2 (period → router.push), H3 (export catch), M1 (task checkboxes), M2 (file list), M3 (DATE UTC), M4 (CSV injection), M5 (days validation), M6 (single now), L1 (@/ imports), L2 (daysElapsed>0), L3 (test data) + test quality fixes (BV dates, P1 assertion strength, router.push assertion)

### File List

**Created (new files):**
- `supabase/migrations/00017_story_3_1a_indexes.sql`
- `src/features/dashboard/actions/getAiUsageSummary.action.ts`
- `src/features/dashboard/actions/getAiUsageSummary.action.test.ts`
- `src/features/dashboard/actions/getAiUsageByProject.action.ts`
- `src/features/dashboard/actions/getAiUsageByProject.action.test.ts`
- `src/features/dashboard/actions/getAiSpendByModel.action.ts`
- `src/features/dashboard/actions/getAiSpendByModel.action.test.ts`
- `src/features/dashboard/actions/getAiSpendTrend.action.ts`
- `src/features/dashboard/actions/getAiSpendTrend.action.test.ts`
- `src/features/dashboard/actions/exportAiUsage.action.ts`
- `src/features/dashboard/actions/exportAiUsage.action.test.ts`
- `src/features/dashboard/components/AiUsageSummaryCards.tsx`
- `src/features/dashboard/components/AiUsageSummaryCards.test.tsx`
- `src/features/dashboard/components/AiSpendByProjectTable.tsx`
- `src/features/dashboard/components/AiSpendByProjectTable.test.tsx`
- `src/features/dashboard/components/AiSpendByModelChart.tsx`
- `src/features/dashboard/components/AiSpendByModelChart.test.tsx`
- `src/features/dashboard/components/AiSpendTrendChart.tsx`
- `src/features/dashboard/components/AiSpendTrendChart.test.tsx`
- `src/features/dashboard/components/AiUsageDashboard.tsx`
- `src/features/dashboard/components/AiUsageDashboard.test.tsx`
- `src/app/(app)/admin/ai-usage/page.tsx`

**Modified:**
- `src/features/dashboard/types.ts` (prepended AI usage types)
- `src/app/(app)/admin/layout.tsx` (added "AI Usage" nav tab)
- `_bmad-output/implementation-artifacts/3-1a-ai-usage-dashboard-reporting.md` (this file — status → review)
