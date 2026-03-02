# Story 3.1a — AI Usage Dashboard & Reporting CR

## CR R1 (2026-02-28)

**Result:** 0C / 3H / 6M / 4L (13 total findings)
**Tests:** 63/63 passed, 0 it.skip()

### HIGH Findings (all FIXED)

- H1: `void handleExport()` swallows errors — Fix: `.catch(() => toast.error(...))`
- H2: Fragile division-by-zero guard in projected cost — Fix: `&& daysElapsed > 0`
- H3: Test data has extra properties — Fix: type annotations

### MEDIUM Findings (all FIXED)

- M1-M6: STATUS_COLORS tokens, CSV injection, DATE UTC, Zod validation, single-now, etc.

### LOW Findings

- L1-L4: test assertion strength, period switching, bare string type, import pattern

## CR R2 (2026-02-28)

**Result:** 0C / 3H / 5M / 4L (12 total findings)
**All R1 fixes verified effective**

### HIGH Findings (MUST FIX before exit)

**H1: AC2 empty state text missing from AiUsageSummaryCards**

- AC: "No AI processing recorded yet. Process your first file to see usage data." when 0 cost + 0 files
- Task 3.3: render `data-testid="ai-usage-empty-state"`
- File: AiUsageSummaryCards.tsx — no condition, no text, no testid

**H2: AC3 AiSpendByProjectTable not sortable**

- AC: "sortable table" with per-column sort (A-Z, up-down)
- Task 4.1: "client component with sort state"
- File: AiSpendByProjectTable.tsx — no 'use client', no useState, no onClick handlers
- Also: AC says 5 columns (Project, Spend, Monthly Budget, Budget Used, Files) — implementation has 4

**H3: AC4 AiSpendByModelChart missing summary table below chart**

- AC: "below the chart, a summary table shows per-model breakdown: Model | Provider | Total Cost | Input Tokens | Output Tokens"
- File: AiSpendByModelChart.tsx — only BarChart, no table, inputTokens/outputTokens unused in UI

### MEDIUM Findings

- **M1:** CSV sanitize order — formula char embedded in quoted string bypasses first-char regex
- **M2:** rangeStart Date mutation fragile (currently safe but future-refactor risky)
- **M3:** Period labels "7d|30d|90d" vs AC "Last 7 days|Last 30 days|Last 90 days"
- **M4:** AiSpendTrendChart Tooltip formatter ['$x', ''] — empty label in L2/L3 mode
- **M5:** AiSpendByModelChart Tooltip formatter hardcodes 'Cost' vs Line name='Cost (USD)'

### LOW Findings

- L1: provider type bare string (Guardrail #3)
- L2: CSV export doesn't quote/escape model field
- L3: Missing test for empty state text
- L4: Dead code `?? ''` on toISOString().split('T')[0]

## Patterns Observed (across R1+R2)

- Tenant isolation: PERFECT (5/5 actions, double-apply on LEFT JOIN)
- Error handling: PERFECT (consistent pattern)
- UTC date math: CORRECT (R1 fixes effective)
- RSC boundary: CORRECT
- **Recurring pattern: AC compliance gaps** — code works correctly but features specified in AC are not implemented (H1-H3 are all missing features, not bugs)
