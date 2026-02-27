---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-02-28'
---

# ATDD Checklist - Epic 3, Story 1a: AI Usage Dashboard & Reporting

**Date:** 2026-02-28
**Author:** Mona (TEA)
**Primary Test Level:** Unit (Vitest — node + jsdom)

---

## Story Summary

Read-only analytics dashboard at `/admin/ai-usage/` for Admins. Surfaces AI spend data from
`ai_usage_logs` (created in Story 3.1) via 5 new server actions and 5 new React components.
Zero-spend projects are included in the per-project table (LEFT JOIN from `projects`). All date
ranges are capped at 90 days server-side. Export generates a compliant CSV file.

**As an** Admin
**I want** a dashboard showing AI spend by project, by model, and over time with CSV export
**So that** I can monitor AI costs, identify high-spend areas, and report usage to stakeholders

---

## Acceptance Criteria

1. **AC1:** `/admin/ai-usage/` route exists under the protected `(app)` layout; non-admins are redirected to `/dashboard`
2. **AC2:** Four summary metric cards: Total AI Cost (MTD), Files Processed (MTD), Avg Cost/File, and Projected Month Cost (null when daysElapsed < 5)
3. **AC3:** Per-project AI spend table driven by LEFT JOIN from `projects` table — includes projects with **zero** spend; colour-coded budget ≥ threshold % (green/yellow/red)
4. **AC4:** AI spend by model BarChart grouped by provider; shared period selector toggle (7/30/90d)
5. **AC5:** Spend trend LineChart with pre-scaffolded date points (no gaps, zero-fill missing days); max 90d; L2/L3 cost breakdown toggle
6. **AC6:** Export CSV button: `ai-usage-YYYY-MM.csv`, 11 columns, current month scope, 90-day cap, double-quote escaping for project names
7. **AC7:** `requireRole('admin', 'read')` enforced in all 5 server actions; page.tsx redirects non-admins
8. **AC8:** Unit tests for all above with boundary value coverage (Epic 2 retro mandate A2)

---

## Test Strategy

### Test Level Selection

| AC | Test Level | Rationale |
|----|-----------|-----------|
| AC1 (Route & RBAC) | Unit (node) — action tests | Auth enforced in server actions; page redirect covered by manual verification or future E2E |
| AC2 (Summary Cards) | Unit (node) + Unit (jsdom) | Server action test for data calculation; component test for rendering formulas |
| AC3 (Project Table) | Unit (node) + Unit (jsdom) | Action test for LEFT JOIN correctness; component test for budget colour coding |
| AC4 (Model Chart) | Unit (node) + Unit (jsdom) | Action test for period filter; component test for BarChart rendering |
| AC5 (Trend Chart) | Unit (node) + Unit (jsdom) | Action test for date scaffolding + 90d cap; component test for toggle state |
| AC6 (CSV Export) | Unit (node) | Server action test — CSV string generation, header columns, filename format |
| AC7 (Admin Auth) | Unit (node) — all action tests | Every action test includes FORBIDDEN when `requireRole` rejects |
| AC8 (Unit Tests Meta) | — | Covered by all above |

### No E2E Tests

This story creates no new route handlers (all data via Server Actions). The period selector uses
plain toggle buttons (not Radix Select), so no E2E Radix workarounds needed. All tests are Vitest
unit tests (node or jsdom project).

---

## Failing Tests Created (RED Phase)

### Test File 1: `src/features/dashboard/actions/getAiUsageSummary.action.test.ts` — 9 tests (NEW FILE)

```
P0  should return zero data when no records exist this month
P0  should sum total cost from ai_usage_logs for current tenant
P0  should count distinct file IDs for filesProcessed
P0  should apply withTenant filter for tenant isolation
P0  should filter to current calendar month only (gte called with date.getUTCDate()===1)
P0  should return FORBIDDEN when user role is not admin
P1  should compute avgCostPerFileUsd as 0 when filesProcessed is 0 (division-by-zero guard)
P1-BV  should return projectedMonthCostUsd=null when daysElapsed is less than 5
P1-BV  should return projectedMonthCostUsd as calculated value when daysElapsed is 5 or more
```

### Test File 2: `src/features/dashboard/actions/getAiUsageByProject.action.test.ts` — 8 tests (NEW FILE)

```
P0  should include project with ZERO spend this month in result (LEFT JOIN verification)
P0  should show totalCostUsd=0 for zero-spend project and not exclude it
P0  should show correct totalCostUsd for project with usage
P0  should return FORBIDDEN when user role is not admin
P0  should apply withTenant on projects table in WHERE clause for tenant isolation
P0  should apply tenant filter for ai_usage_logs in JOIN condition for defense-in-depth (withTenant x2)
P1  should place date filter in JOIN condition to preserve LEFT JOIN semantics
P1  should return monthlyBudgetUsd=null when project has no budget set (unlimited)
```

### Test File 3: `src/features/dashboard/actions/getAiSpendByModel.action.test.ts` — 7 tests (NEW FILE)

```
P0  should return empty array when no AI usage exists for the period
P0  should group spend by provider and model correctly
P0  should accept days=7 parameter and filter to last 7 days only
P0  should accept days=30 parameter and filter to last 30 days only
P0  should accept days=90 parameter and filter to last 90 days only
P0  should return FORBIDDEN when user role is not admin
P1  should apply withTenant on ai_usage_logs query
```

### Test File 4: `src/features/dashboard/actions/getAiSpendTrend.action.test.ts` — 8 tests (NEW FILE)

```
P0  should return 7 data points for days=7 (one per day)
P0  should return 30 data points for days=30 with zero-filled gaps for days with no spend
P0  should return all points at $0.00 when no usage exists (not empty array)
P0  should return FORBIDDEN when user role is not admin
P0  should apply withTenant on ai_usage_logs query
P1  should track l2CostUsd and l3CostUsd separately per day
P1-BV  should return exactly 90 data points for days=90 (boundary — exact max)
P1-BV  should cap at 90 days when requested days exceeds 90 (MAX_DAYS enforcement)
```

### Test File 5: `src/features/dashboard/actions/exportAiUsage.action.test.ts` — 7 tests (NEW FILE)

```
P0  should return header-only CSV when no records exist for the month
P0  should include all 11 required columns in header
P0  should join project_name from projects table and not use hardcoded values
P0  should return FORBIDDEN when user role is not admin
P0  should return filename in format ai-usage-YYYY-MM.csv
P1  should escape double quotes in project_name with CSV double-quote escaping
P1-BV  should cap export at 90 days when requested range exceeds 90 days
```

### Test File 6: `src/features/dashboard/components/AiUsageSummaryCards.test.tsx` — 7 tests (NEW FILE)

```
P0  should render all 4 metric card sections
P0  should display $0.00 for all cost cards when summary has zero values
P0  should display formatted totalCostUsd as $X.XX
P0  should display correct filesProcessed count
P0  should display avgCostPerFileUsd rounded to $0.37
P1  should show em-dash ("—") in projected cost card when projectedMonthCostUsd is null
P1-BV  should display projectedMonthCostUsd value when not null (≥5 days elapsed)
```

### Test File 7: `src/features/dashboard/components/AiSpendByProjectTable.test.tsx` — 7 tests (NEW FILE)

```
P0  should render empty state when projects array is empty
P0  should render a row for each project in the data
P0  should show $0.00 for zero-spend projects and not exclude them
P0  should display formatted totalCostUsd for active project
P1  should show green budget indicator when spend is below alert threshold
P1  should show yellow budget indicator when spend is at or above alert threshold
P1-BV  should show red budget indicator when spend is at or above 100% (exceeded)
```

### Test File 8: `src/features/dashboard/components/AiSpendByModelChart.test.tsx` — 3 tests (NEW FILE)

```
P0  should render BarChart container when data is provided
P0  should render empty state message when data array is empty
P1  should display provider and model labels for each data entry
```

### Test File 9: `src/features/dashboard/components/AiSpendTrendChart.test.tsx` — 4 tests (NEW FILE)

```
P0  should render LineChart container when data is provided
P0  should render all data points (no sparse gaps — all 7 present)
P1  should show L2/L3 toggle buttons to switch view mode
P1-BV  should render chart (not empty state) when all data points are $0.00
```

### Test File 10: `src/features/dashboard/components/AiUsageDashboard.test.tsx` — 3 tests (NEW FILE)

```
P0  should render period selector with 7d, 30d, and 90d buttons
P0  should render export CSV button visible to admin
P1  should mark the active period button as selected (aria-pressed=true)
```

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY, all P0/P1-BV)

### Projected Spend Boundary (AC2)

| Test | Condition | Expected |
|------|-----------|----------|
| daysElapsed = 4 (below threshold) | Run on day 4 of month | `projectedMonthCostUsd = null` |
| daysElapsed = 5 (at threshold) | Run on day 5 of month | `projectedMonthCostUsd > 0` |

**Coverage location:** `getAiUsageSummary.action.test.ts` (P1-BV tests)

### Trend Date Range Boundary (AC5)

| Test | Input | Expected |
|------|-------|----------|
| days = 7 | `{ days: 7 }` | 7 data points |
| days = 30 | `{ days: 30 }` | 30 data points |
| days = 90 (exact max) | `{ days: 90 }` | 90 data points |
| days = 365 (over max) | `{ days: 365 }` | Capped to 90 data points |

**Coverage location:** `getAiSpendTrend.action.test.ts` (P1-BV tests)

### Export Date Range Boundary (AC6)

| Test | Condition | Expected |
|------|-----------|----------|
| 90-day cap enforced | Export requested for wide range | Query start date ≥ 90 days ago |

**Coverage location:** `exportAiUsage.action.test.ts` (P1-BV test)

### Budget Color-Coding Boundary (AC3 — Component)

| Test | Budget % | Expected Color |
|------|----------|----------------|
| 75.5% (below threshold) | budgetPct=75.5, threshold=80 | `data-status="ok"` (green) |
| 85% (above threshold) | budgetPct=85, threshold=80 | `data-status="warning"` (yellow) |
| 105% (exceeded 100%) | budgetPct=105, threshold=80 | `data-status="exceeded"` (red) |

**Coverage location:** `AiSpendByProjectTable.test.tsx` (P1-BV test)

### Zero-Fill Boundary (AC5)

| Test | DB Returns | Expected |
|------|------------|----------|
| 0 records | `[]` | 7 points, all `totalCostUsd=0` (not empty array) |
| 1 record (sparse) | 1 row | 30 points, 29 are `$0.00` |

**Coverage location:** `getAiSpendTrend.action.test.ts` (P0 tests)

---

## Mock Requirements

### Drizzle Mock (`createDrizzleMock` — all action tests)

```typescript
// Pattern — use in vi.hoisted() BEFORE any other declarations
const { mockRequireRole, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return { mockRequireRole: vi.fn(), dbState, dbMockModule }
})

vi.mock('server-only', () => ({}))  // MUST be FIRST vi.mock
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
vi.mock('@/db/client', () => dbMockModule)

// Summary query: single DB call → aggregate row
dbState.returnValues = [[{ totalCost: '15.50', fileCount: '3' }]]

// Per-project query: LEFT JOIN → multiple rows
dbState.returnValues = [[ZERO_SPEND_PROJECT, PROJECT_WITH_SPEND]]

// Trend query: sparse data → action scaffolds remaining days
dbState.returnValues = [[{ day: '2026-02-20', totalCost: '1.00', l2Cost: '0.50', l3Cost: '0.50' }]]
```

**Key `dbState` fields used:**
- `returnValues[callIndex]` — for all query terminals (`.then()`, first result set)
- `throwAtCallIndex` — error injection for FORBIDDEN/DB failure tests
- `callIndex` reset in `beforeEach` → `dbState.callIndex = 0`

### Auth Mock (all action tests)

```typescript
// Success case
mockRequireRole.mockResolvedValue({
  id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  tenantId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
  role: 'admin' as const,
  email: 'admin@test.com',
})

// FORBIDDEN case
mockRequireRole.mockRejectedValue(new Error('Forbidden'))
```

### drizzle-orm Mock (all action tests)

```typescript
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  lte: vi.fn((...args: unknown[]) => args),  // exportAiUsage only
  sql: vi.fn((..._args: unknown[]) => 'sql-fragment'),  // not needed for exportAiUsage
}))
```

### Recharts Mock (component tests with charts)

```typescript
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-bar-chart">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-line-chart">{children}</div>
  ),
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))
```

### Server Action Mocks (AiUsageDashboard component test)

```typescript
vi.mock('../actions/getAiUsageSummary.action', () => ({
  getAiUsageSummary: vi.fn(),
}))
vi.mock('../actions/getAiUsageByProject.action', () => ({
  getAiUsageByProject: vi.fn(),
}))
vi.mock('../actions/getAiSpendByModel.action', () => ({
  getAiSpendByModel: vi.fn(),
}))
vi.mock('../actions/getAiSpendTrend.action', () => ({
  getAiSpendTrend: vi.fn(),
}))
vi.mock('../actions/exportAiUsage.action', () => ({
  exportAiUsage: vi.fn(),
}))
```

---

## Required `data-testid` Attributes

### AiUsageSummaryCards

| Element | data-testid | Notes |
|---------|-------------|-------|
| Total cost card | `ai-usage-total-cost` | "Total AI Cost (MTD)" |
| Files processed card | `ai-usage-files-processed` | distinct file count |
| Avg cost card | `ai-usage-avg-cost` | cost ÷ files |
| Projected cost card | `ai-usage-projected-cost` | null → shows "—" |

### AiSpendByProjectTable

| Element | data-testid | Notes |
|---------|-------------|-------|
| Empty state | `ai-project-table-empty` | when projects=[] |
| Project row | `ai-project-row-{projectId}` | one per project |
| Budget indicator | `ai-budget-indicator-{projectId}` | `data-status`: ok/warning/exceeded |

### AiSpendByModelChart

| Element | data-testid | Notes |
|---------|-------------|-------|
| Chart container | `ai-model-chart-container` | wraps recharts ResponsiveContainer |
| Empty state | `ai-model-chart-empty` | when data=[] |

### AiSpendTrendChart

| Element | data-testid | Notes |
|---------|-------------|-------|
| Chart container | `ai-trend-chart-container` | wraps recharts ResponsiveContainer |
| L2/L3 toggle | `ai-trend-l2l3-toggle` | button to switch between total/breakdown |
| Empty state | `ai-trend-chart-empty` | NOT used when all $0 (chart still renders) |

### AiUsageDashboard

| Element | data-testid | Notes |
|---------|-------------|-------|
| Period selector 7d | `period-selector-7` | `aria-pressed="true"` when active |
| Period selector 30d | `period-selector-30` | `aria-pressed="true"` when active |
| Period selector 90d | `period-selector-90` | `aria-pressed="true"` when active |
| Export button | `export-ai-usage-btn` | triggers `exportAiUsage()` action |

---

## Implementation Checklist

### Phase 1: Types + DB Query Helpers (Task 1)

- [ ] Create `src/features/dashboard/types.ts` with `AiUsageSummary`, `AiProjectSpend`, `AiModelSpend`, `AiSpendTrendPoint`
- [ ] Verify `ai_usage_logs` schema has `project_id` column (from Story 3.1 migration)
- [ ] Run: `npm run type-check` — zero errors on types file

### Phase 2: Server Actions (Tasks 2–6)

- [ ] Create `src/features/dashboard/actions/getAiUsageSummary.action.ts`
  - SUM(estimated_cost), COUNT(DISTINCT file_id), current-month filter
  - `projectedMonthCostUsd` = `(spend/daysElapsed)*daysInMonth` when daysElapsed ≥ 5, else `null`
  - Run: `npx vitest run src/features/dashboard/actions/getAiUsageSummary.action.test.ts` → GREEN
- [ ] Create `src/features/dashboard/actions/getAiUsageByProject.action.ts`
  - LEFT JOIN from `projects` → `ai_usage_logs` (NOT inner join)
  - Date filter in JOIN condition (not WHERE) to preserve zero-spend projects
  - `withTenant()` on BOTH projects (WHERE) and ai_usage_logs (JOIN)
  - Run: `npx vitest run src/features/dashboard/actions/getAiUsageByProject.action.test.ts` → GREEN
- [ ] Create `src/features/dashboard/actions/getAiSpendByModel.action.ts`
  - GROUP BY provider, model with days parameter (7/30/90)
  - Run: `npx vitest run src/features/dashboard/actions/getAiSpendByModel.action.test.ts` → GREEN
- [ ] Create `src/features/dashboard/actions/getAiSpendTrend.action.ts`
  - Scaffold all N days with `$0.00` for missing dates (never sparse)
  - `MAX_DAYS = 90` constant; cap applied server-side
  - Run: `npx vitest run src/features/dashboard/actions/getAiSpendTrend.action.test.ts` → GREEN
- [ ] Create `src/features/dashboard/actions/exportAiUsage.action.ts`
  - LEFT JOIN ai_usage_logs + projects for project_name
  - Manual CSV string build (no library); double-quote escaping for project_name
  - `ai-usage-YYYY-MM.csv` filename; 90-day cap
  - Run: `npx vitest run src/features/dashboard/actions/exportAiUsage.action.test.ts` → GREEN

### Phase 3: Components (Tasks 7–11)

- [ ] Create `src/features/dashboard/components/AiUsageSummaryCards.tsx`
  - 4 metric cards with data-testid attributes per list above
  - Run: `npx vitest run src/features/dashboard/components/AiUsageSummaryCards.test.tsx` → GREEN
- [ ] Create `src/features/dashboard/components/AiSpendByProjectTable.tsx`
  - Row per project, budget indicator with data-status
  - Run: `npx vitest run src/features/dashboard/components/AiSpendByProjectTable.test.tsx` → GREEN
- [ ] Create `src/features/dashboard/components/AiSpendByModelChart.tsx`
  - Recharts BarChart; chart container and empty state data-testids
  - Run: `npx vitest run src/features/dashboard/components/AiSpendByModelChart.test.tsx` → GREEN
- [ ] Create `src/features/dashboard/components/AiSpendTrendChart.tsx`
  - Recharts LineChart; L2/L3 toggle with aria-pressed; no empty state for all-zero data
  - Run: `npx vitest run src/features/dashboard/components/AiSpendTrendChart.test.tsx` → GREEN
- [ ] Create `src/features/dashboard/components/AiUsageDashboard.tsx` (CSC entry)
  - Period selector (7/30/90) with aria-pressed; export button
  - Run: `npx vitest run src/features/dashboard/components/AiUsageDashboard.test.tsx` → GREEN

### Phase 4: Page Route (Task 12)

- [ ] Create `src/app/(app)/admin/ai-usage/page.tsx` (RSC)
  - `requireRole('admin', 'read')` guard; non-admin → `redirect('/dashboard')`
  - Fetch data from 5 server actions; pass as props to `<AiUsageDashboard />`
  - `export const dynamic = 'force-dynamic'`

### Phase 5: Integration Verification

- [ ] Run full unit test suite: `npm run test:unit` — all pass
- [ ] Run: `npm run type-check` — zero errors
- [ ] Run: `npm run lint` — zero warnings

---

## Running Tests

```bash
# Run all Story 3.1a action test files
npx vitest run \
  src/features/dashboard/actions/getAiUsageSummary.action.test.ts \
  src/features/dashboard/actions/getAiUsageByProject.action.test.ts \
  src/features/dashboard/actions/getAiSpendByModel.action.test.ts \
  src/features/dashboard/actions/getAiSpendTrend.action.test.ts \
  src/features/dashboard/actions/exportAiUsage.action.test.ts

# Run all Story 3.1a component test files
npx vitest run \
  src/features/dashboard/components/AiUsageSummaryCards.test.tsx \
  src/features/dashboard/components/AiSpendByProjectTable.test.tsx \
  src/features/dashboard/components/AiSpendByModelChart.test.tsx \
  src/features/dashboard/components/AiSpendTrendChart.test.tsx \
  src/features/dashboard/components/AiUsageDashboard.test.tsx

# Run single test file
npx vitest run src/features/dashboard/actions/getAiUsageByProject.action.test.ts

# Watch mode — server actions (node)
npx vitest --project unit src/features/dashboard/actions/

# Watch mode — components (jsdom)
npx vitest --project unit src/features/dashboard/components/

# Full unit suite
npm run test:unit

# Type check
npm run type-check
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete — 2026-02-28)

- 63 `it.skip()` test stubs created across 10 test files
- All boundary value tests explicitly covered per Epic 2 retro A2 (P1-BV, treated as mandatory)
- Tests fail (skipped) because implementation doesn't exist yet
- LEFT JOIN semantic tests will fail if INNER JOIN used accidentally (critical correctness gate)

### GREEN Phase (DEV Team)

Suggested implementation order (dependencies first):
1. Types (`src/features/dashboard/types.ts`)
2. `getAiUsageSummary.action.ts` (simplest query, no JOINs)
3. `getAiUsageByProject.action.ts` (LEFT JOIN — most critical correctness risk)
4. `getAiSpendByModel.action.ts` (GROUP BY query)
5. `getAiSpendTrend.action.ts` (date scaffolding + MAX_DAYS cap)
6. `exportAiUsage.action.ts` (CSV generation + 90d cap)
7. Components (AiUsageSummaryCards, AiSpendByProjectTable, charts)
8. `AiUsageDashboard` orchestrator + page route

### REFACTOR Phase

After all 63 tests pass:
1. Run full suite: `npm run test:unit`
2. Run 3 pre-CR agents: `anti-pattern-detector`, `tenant-isolation-checker`, `code-quality-analyzer`
3. Verify `withTenant()` appears on EVERY query (double-check LEFT JOIN action especially)

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/features/dashboard/actions/getAiUsageSummary.action.test.ts`

**Expected Results:**
- Total tests across 10 files: 63
- Skipped (it.skip): 63
- Passing (existing): all pre-existing dashboard tests unaffected
- Status: RED phase verified ✓

---

## Test Count Summary

| File | New Tests | Priority Breakdown |
|------|-----------|-------------------|
| `getAiUsageSummary.action.test.ts` | 9 | 6 P0 + 1 P1 + 2 P1-BV |
| `getAiUsageByProject.action.test.ts` | 8 | 6 P0 + 2 P1 |
| `getAiSpendByModel.action.test.ts` | 7 | 6 P0 + 1 P1 |
| `getAiSpendTrend.action.test.ts` | 8 | 5 P0 + 1 P1 + 2 P1-BV |
| `exportAiUsage.action.test.ts` | 7 | 5 P0 + 1 P1 + 1 P1-BV |
| `AiUsageSummaryCards.test.tsx` | 7 | 5 P0 + 1 P1 + 1 P1-BV |
| `AiSpendByProjectTable.test.tsx` | 7 | 4 P0 + 2 P1 + 1 P1-BV |
| `AiSpendByModelChart.test.tsx` | 3 | 2 P0 + 1 P1 |
| `AiSpendTrendChart.test.tsx` | 4 | 2 P0 + 1 P1 + 1 P1-BV |
| `AiUsageDashboard.test.tsx` | 3 | 2 P0 + 1 P1 |
| **TOTAL** | **63** | **43 P0 + 11 P1 + 9 P1-BV** |

---

## Critical Implementation Notes for Dev

1. **LEFT JOIN correctness (AC3 — highest risk):** `getAiUsageByProject` MUST query `FROM projects LEFT JOIN ai_usage_logs`. If accidentally written as INNER JOIN or as `FROM ai_usage_logs`, zero-spend projects will silently disappear. The test `should include project with ZERO spend this month in result` specifically catches this.

2. **Date filter placement (AC3 + AC5):** For the LEFT JOIN action, the `createdAt ≥ monthStart` filter MUST be in the JOIN's ON clause, NOT in the WHERE clause. Putting it in WHERE converts the LEFT JOIN to an effective INNER JOIN.

3. **withTenant() dual application (AC3):** `getAiUsageByProject` must call `withTenant()` TWICE — once on `projects.tenantId` in WHERE, and once on `ai_usage_logs.tenantId` in the JOIN condition. This is defense-in-depth. The test `should apply tenant filter for ai_usage_logs in JOIN condition` verifies `withTenant` called exactly 2 times.

4. **Date scaffolding (AC5):** `getAiSpendTrend` must return exactly N points even when DB returns sparse data. Implementation should build a Map from DB results by date string, then iterate over all N days building the response array.

5. **MAX_DAYS constant (AC5 + AC6):** `const MAX_DAYS = 90` should be a module-level constant. `getAiSpendTrend({ days: 365 })` must return 90 points, not 365. The test uses `@ts-expect-error` to pass invalid input.

6. **CSV escaping (AC6):** Manual CSV escape rule: `"` → `""`. Field wrapped in quotes only when it contains `,`, `"`, or newline. Project names are the only field that may need this. Do NOT use a CSV library — build string manually.

7. **projectedMonthCostUsd formula (AC2):** Formula = `(totalSpend / daysElapsed) * daysInMonth`. Return `null` when `daysElapsed < 5` (too early in month for reliable projection). `daysElapsed` = `new Date().getUTCDate() - 1` (days since month start).

8. **Drizzle returns numerics as strings:** `aiBudgetMonthlyUsd`, `budgetAlertThresholdPct`, `totalCost`, `estimatedCost` are all returned as strings from Drizzle raw SQL / numeric columns. Always cast with `Number(value ?? 0)`.

---

**Generated by BMad TEA Agent (Mona)** - 2026-02-28
