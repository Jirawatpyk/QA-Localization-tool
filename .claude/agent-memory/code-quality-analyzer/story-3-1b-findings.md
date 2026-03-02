# Story 3.1b — AI Dashboard UX Polish CR Findings

## CR R1 (2026-02-28)

**Files:** 8 (4 components + 4 test files)
**Findings:** 0C / 2H / 5M / 6L

### HIGH

- H1: Sort initial direction when switching columns — always sets 'asc' regardless of column's natural default (Cost should default desc) — **STATUS: BY DESIGN per AC2**
- H2: useEffect([projects]) — array reference identity triggers reset on every parent re-render, not just data change — **STATUS: FIXED (replaced with store-prev-compare pattern)**

### MEDIUM

- M1: Recharts Tooltip formatter typed as `number | undefined` but actual type is `ValueType = string | number | (string|number)[]` — `.toFixed()` will throw on string — **STATUS: NOT FIXED (pragmatically safe since dataKey is always numeric, carried to R2)**
- M2: Tooltip formatter hardcodes name 'Cost (USD)' — DRY violation with Bar name prop (MEMORY #30 recurrence) — **STATUS: NOT FIXED (carried to R2 as M2)**
- M3: Test "should use 'Cost (USD)' as Bar name prop" only asserts container exists — does NOT verify Bar prop (false confidence) — **STATUS: FIXED (Bar mock now renders name as span)**
- M4: `AiModelSpend.provider` is bare `string` not union type (MEMORY #3 recurrence) — **STATUS: NOT FIXED (type in types.ts, out of story scope)**
- M5: `getBudgetPct()` returns 0 for null budget — unlimited projects sort as "0%" which is semantically misleading — **STATUS: BY DESIGN (tested explicitly, test L3 confirms)**

## CR R2 (2026-02-28) — Adversarial

**Findings:** 0C / 0H / 3M / 4L

### R1 Fix Verification

- H1 Bar mock fix: VERIFIED — renders name prop, assertion correct
- H2 aria-sort transition test: VERIFIED — tests both directions
- M1 aria-sort removed from non-sortable columns: VERIFIED
- M2 BV filesProcessed=1 test: VERIFIED
- M3 sort reset test: VERIFIED — rerender with new array ref
- M4 Budget % second click test: VERIFIED
- L1 sonner mock removed: VERIFIED — only AiUsageDashboard (not in scope) retains it
- L2 Row content assertions: VERIFIED — model/provider names checked
- L3 Unlimited budget sort test: VERIFIED
- Bonus store-prev-compare: VERIFIED — works correctly with parent re-render

### R2 New Findings: 0C / 0H / 3M / 4L

- See main review output for details
