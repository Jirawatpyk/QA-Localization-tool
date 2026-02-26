# Story 3.0 Score & Review Infrastructure CR R1

**Date:** 2026-02-26
**Files:** 5 new + 5 test + 4 modified = 14 total
**Findings:** 2C / 5H / 5M / 4L = 16 total

## Critical Issues

### C1: Unsafe `as ScoreStatus` Cast from Supabase Realtime

- File: `src/features/review/hooks/use-score-subscription.ts` line 53
- `payload.new.status as ScoreStatus` — no Zod validation
- Realtime sends raw string — could be empty, null, or future value
- Fix: Zod schema validation before store update

### C2: Polling Fallback Has No Actual Fetch Logic

- File: `src/features/review/hooks/use-score-subscription.ts` lines 30-46
- `startPolling()` creates exponential backoff timer but NEVER fetches score data
- Timer runs indefinitely doing nothing — dead code
- Also: `fileId` not in `startPolling` closure deps

## High Issues

### H1: Unhandled Promise Rejection in Emitter setTimeout

- File: `src/features/review/utils/finding-changed-emitter.ts` line 18-20
- `async` callback in `setTimeout` — rejection unhandled
- `timer = null` never runs if triggerFn throws

### H2: Map Copy O(n) on Every setFinding

- File: `src/features/review/stores/review.store.ts` lines 33-38
- `new Map(s.findingsMap)` copies all entries per update
- Missing `setFindings(map)` for batch initial load

### H3: resetForFile Accepts \_fileId But Ignores It

- File: `src/features/review/stores/review.store.ts` line 121
- Dead parameter — should either use it (store currentFileId) or remove

### H4: Schema Mock Drift in scoreFile.test.ts

- scores mock: 3 columns vs 15 in real schema
- findings mock: missing segmentCount
- notifications mock: missing several columns

### H5: useFindingChangedEmitter Unstable Reference

- File: `src/features/review/hooks/use-finding-changed-emitter.ts` line 15
- `useMemo([triggerFn])` — inline function = new ref every render
- Pending timer abandoned on re-create
- Fix: useRef for triggerFn, empty deps for useMemo

## Medium Issues

- M1: recalculateScore handler no event.data validation
- M2: FilterState.layer is bare `string` not union type
- M3: onFailureFn inline type duplication (fragile)
- M4: scoreFile.test.ts dynamic import in every test case
- M5: Set copy in toggleSelection (minor overhead)

## Key Patterns Confirmed

- withTenant() on all 6 queries in scoreFile.ts: PASS
- Object.assign testability pattern: PASS
- Inngest registered in route.ts: PASS
- Audit log non-fatal pattern: PASS (both scoreFile + onFailure)
- Factory functions in all tests: PASS
- DELETE+INSERT in transaction: PASS
- Event type canonical at @/types/pipeline: PASS
