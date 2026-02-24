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

## Positive Patterns Confirmed

- Pure function isolation (mqmCalculator)
- 3-level penalty weight fallback with documented exception
- Idempotent DELETE+INSERT in transaction
- Audit log non-fatal pattern (try-catch around writeAuditLog)
- withTenant() on all queries (penaltyWeightLoader exception documented)
- JSONB containment dedup for graduation notifications
- Named exports only, no barrel exports
- Server Action compliance ('use server' + 'server-only' + ActionResult<T>)
