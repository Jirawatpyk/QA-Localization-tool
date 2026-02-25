# Story 2.5 MQM Score Calculation — Code Review Findings

## CR Round 1 (2C, 5H, 6L)

### Critical

- **C1: Graduation notification no try-catch at caller level** — `createGraduationNotification` has internal try-catch but if it throws before entering the try block, outer catch returns INTERNAL_ERROR despite score being committed. Score committed to DB but client sees error = inconsistent state.
- **C2: No UNIQUE constraint on scores(file_id, tenant_id)** — DELETE+INSERT in transaction is not safe from concurrent execution. Two concurrent requests can both DELETE nothing and INSERT, creating duplicate scores. Need partial unique index: `UNIQUE (file_id, tenant_id) WHERE file_id IS NOT NULL`.

### High

- **H1: `findingRows as ContributingFinding[]` unsafe cast** — Drizzle returns `severity: string` but `ContributingFinding.severity` is `Severity` union. Cast bypasses type check. Mitigated: switch statement in calculator safely skips unrecognized values.
- **H2: `ContributingFinding.status` is bare `string`** — Should be FindingStatus union type. Recurring anti-pattern across project (also in RecentFileRow.status, AppNotification.type, etc.).
- **H3: `autoPassThreshold` is `integer` not `real`** — Cannot set decimal thresholds like 97.5. May be intentional per spec.
- **H4: `fileId` unused in `AutoPassInput` type** — Present in type and caller but never destructured. MEMORY.md says it was removed but it's still in code.
- **H5: `ScoreResult.status` is bare `string`** — Should be `'calculated' | 'auto_passed' | 'na'`.

### Low

- **L1: CONTRIBUTING_STATUSES typed as `ReadonlySet<string>`** — Could use narrower FindingStatus type.
- **L2: Redundant null coalescing in penaltyWeightLoader return** — Loop guarantees all 3 severities are set.
- **L3: `status` variable typed as `string` in calculateScore** — Should be union type.
- **L4: AutoPassResult discriminated union has identical branches** — Both branches have same shape; simpler as single type with `eligible: boolean`.
- **L5: `mqmScore` not rounded after subtraction** — `100 - npt` may produce floating point artifacts.
- **L6: Test data uses non-UUID strings** — autoPassChecker tests use 'file-abc' etc. instead of valid UUIDs.

## Files Reviewed

1. `src/features/scoring/types.ts` (34 lines)
2. `src/features/scoring/constants.ts` (22 lines)
3. `src/features/scoring/validation/scoreSchema.ts` (9 lines)
4. `src/features/scoring/mqmCalculator.ts` (74 lines)
5. `src/features/scoring/penaltyWeightLoader.ts` (69 lines)
6. `src/features/scoring/autoPassChecker.ts` (113 lines)
7. `src/features/scoring/actions/calculateScore.action.ts` (291 lines)

## CR Round 2 (1C, 3H, 4M, 2L)

### Critical

- **C1: Findings query missing projectId filter** — segments query has `eq(segments.projectId, projectId)` (H2 fix from R1) but findings query at line 111-117 does NOT have `eq(findings.projectId, projectId)`. Defense-in-depth violation — same pattern asymmetry as R1-H2.

### High

- **H1: Graduation notification caller missing try-catch** — R1-C1 reported this but fix was internal try-catch only. Caller at line 202-209 still inside outer try block — if function throws before internal try, outer catch returns INTERNAL_ERROR despite score committed.
- **H2: CONTRIBUTING_STATUSES still `ReadonlySet<string>`** — R1-M3 added FindingStatus type but did NOT update constants.ts line 11 to use it. No compile-time safety against adding new statuses.
- **H3: fileCount off-by-one** — checkAutoPass query runs BEFORE score INSERT. First-run: fileCount excludes current file. File 51 graduation triggered at file 52 instead.

### Medium

- **M1: Double cast `as unknown as ContributingFinding[]`** — R1-H1 noted but not fixed. Could use per-field cast instead.
- **M2: Graduation dedup query missing projectId** — JSONB containment checks `{sourceLang, targetLang}` but not `projectId`. Multi-project tenants with same language pair: Project B graduation notification skipped.
- **M3: Auto-pass JOIN multiplies rows** — `innerJoin(segments, ...)` with `count(distinct)` is correct but produces O(files\*segments) intermediate rows. Use EXISTS subquery for better performance.
- **M4: Missing test for findings projectId filter** — Test exists for segments projectId (line 461) but not for findings.

### Low

- **L1: AutoPassResult identical union branches** — R1-L4 noted, still not fixed. Simpler as `eligible: boolean`.
- **L2: Factory status default mismatch** — `buildScoreRecord` defaults `status: 'calculated'` but DB schema defaults to `'calculating'`.

## Positive Patterns Confirmed

- Pure function isolation (mqmCalculator)
- 3-level penalty weight fallback with documented exception
- Idempotent DELETE+INSERT in transaction
- Audit log non-fatal pattern (try-catch around writeAuditLog)
- withTenant() on all queries (penaltyWeightLoader exception documented)
- JSONB containment dedup for graduation notifications
- Named exports only, no barrel exports
- Server Action compliance ('use server' + 'server-only' + ActionResult<T>)
