# Story 3.2b6 -- Orphan Wiring Cleanup CR R1-R2

## CR R1 (2026-03-02 -- initial E2E + seed helpers)

**Findings:** 0C / 3H / 5M / 4L
**Verdict:** Minor cleanup story -- no critical issues

### Key Findings R1

- H1: DRY Violation -- adminHeaders() + seed functions duplicated across 4 E2E spec files
- H2: Unguarded `data[0].id` in E2E seed functions
- H3: Stale `// RED:` comments in AiBudgetCard.test.tsx
- M2: No try-catch in startTransition async callback
- Pattern: E2E PostgREST seeding (seed DB via PostgREST in `[setup]` test)

## CR R2 (2026-03-02 -- ParitySeverity migration + dialog wiring + L1FindingContext fix)

**Commit:** f896793
**Findings:** 0C / 4H / 5M / 4L

### High Findings R2

#### H1-H3: Incomplete ParitySeverity Migration

- `types.ts` XbenchFinding.severity + ParityFinding.severity still `string`
- `ParityResultsTable.tsx` local ParityFinding type still `string`
- `ParityComparisonView.test.tsx` MockCompareResult severity fields still `string`
- Root cause: migration done in comparator + actions but NOT in shared types/components/tests

#### H4: Unsafe `as L1FindingContext[]` cast in runL2ForFile.ts:198

- Drizzle infers varchar as `string`, cast to `FindingSeverity` union bypasses compiler
- WHERE clause guarantees safety but pattern is brittle if domain changes
- Recommend: `.map()` with explicit cast + safety comment

### Medium Findings R2

- M1: VALID_PARITY_SEVERITIES not exported, not derived from `as const` array (SSOT drift risk)
- M2: ComparisonFinding type duplicated in 3 files (action, view, results table)
- M3: xbenchReportParser.ts severity:string acceptable (raw input) but needs JSDoc
- M4: "Report Missing Check" button always visible, even before comparison
- M5: Custom dropdown missing keyboard navigation (Arrow keys, Enter)

### Positive Patterns R2

- toParitySeverity() helper: good defensive coercion (.toLowerCase().trim() + fallback 'minor')
- withTenant() used correctly on all queries
- Audit log pattern correct (try-catch + logger.error for non-fatal)
- Dialog wiring correct (open + onOpenChange + state reset on useEffect)
