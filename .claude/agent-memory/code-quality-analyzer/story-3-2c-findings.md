# Story 3.2c — L2 Results Display & Score Update

## CR R1 (Pre-implementation scan)

**Date:** 2026-03-03
**Files Reviewed:** 10 (5 components, 1 server action, 2 hooks, 1 store, 1 page)
**Result:** 0C / 5H / 8M / 5L
(See git history for original R1 findings — many were fixed during implementation)

## CR R2 (Pre-fix scan — original findings)

**Date:** 2026-03-03
**Files Reviewed:** 10 new + 8 modified
**Result:** 0C / 5H / 8M / 5L

### HIGH (all fixed in R1 fix commit)

1. **H1: Missing UPDATE event in useFindingsSubscription** — FIXED: added handleUpdate handler
2. **H2: languagePairConfigs JOIN missing targetLang** — DEFERRED: TODO(TD-REVIEW-001) added
3. **H3: Unsafe `as unknown as Finding` cast** — FIXED: explicit Finding construction
4. **H4: Duplicated severity sort** — ACCEPTED: server sort for initial load, client sort for realtime
5. **H5: `findings.status: string` in FileReviewData** — STILL OPEN (see R3 M1)

### MED (most fixed)

1. **M1: Duplicated useReducedMotion** — FIXED: cached useState initializer
   2-8: Various cast/validation issues — partially addressed

## CR R3 (R1 fix verification — full analysis)

**Date:** 2026-03-03
**Files Reviewed:** 11 files changed in R1 fix commit
**Result:** 0C / 1H / 3M / 5L — FAIL (1H must fix before merge)

### HIGH

1. **H1: INSERT batch buffer race condition with DELETE** — queueMicrotask defers flush; DELETE fires sync between buffer + flush; flush re-adds deleted finding. Fix: track `deletedIds` Set in buffer, filter before flush.

### MED

1. **M1: FileReviewData.findings[].status still `string`** — R1 H5 not fully fixed. Should be `FindingStatus`
2. **M2: mapRowToFinding casts severity/status/layer without runtime validation** — inconsistent with use-score-subscription.ts which has `isValidScoreStatus()`
3. **M3: projectId missing from useEffect deps** — ReviewPageClient line 66

### LOW

1. No test for UPDATE handler (R1 H1 fix untested)
2. DELETE test uses inline 23-line object instead of buildFinding() factory
3. useReducedMotion doesn't listen for media query changes (acceptable for animation)
4. matchMedia mock in FindingListItem.test.tsx leaks across tests (last test, no impact)
5. eslint-disable for createDrizzleMock any cast (global type declaration missing)

## Patterns Confirmed (Both Rounds)

- withTenant() all queries: PASS
- ActionResult<T>: PASS
- RSC boundary: PASS
- Named exports: PASS
- Design tokens: PASS (R2 fixed inline colors from R1)
- Zustand slice pattern: well-structured
- Polling fallback: both hooks have exponential backoff + cleanup
- E2E critical flow coverage: comprehensive
