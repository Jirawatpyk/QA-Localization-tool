# Story 4.2 — Core Review Actions CR R1-R3

**Date:** 2026-03-14
**Findings R1 (initial):** 0C / 4H / 6M / 5L (pre-fix)
**Findings R1 (re-scan):** 0C / 4H / 5M / 5L
**Findings R2 (final):** 0C / 3H / 5M / 5L
**Findings R3 (final):** 0C / 1H / 3M / 5L

## R2 → R3 Fix Verification

| R2 Finding                         | Status                                        |
| ---------------------------------- | --------------------------------------------- |
| H1: inngest.send() no try-catch    | FIXED — executeReviewAction.ts:191-210        |
| H2: Spinner on all buttons         | FIXED — activeAction state + per-button check |
| H3: isActionInFlight not threaded  | FIXED — prop threaded to all 4 components     |
| M5: animate-spin no reduced-motion | FIXED — conditional class in ReviewActionBar  |

## R3 HIGH Findings (1 — pre-existing)

### H1: `Finding` type `segmentId: string` vs DB nullable — type mismatch

- File: `src/types/finding.ts:63`
- DB schema segmentId is nullable, `FindingForDisplay` has `string | null`, but `Finding` type has `string`
- Pre-existing issue, not introduced by Story 4.2 but relied upon for optimistic update
- Cross-file findings with null segmentId will cause runtime issues

## R3 MEDIUM Findings (3 — carried from R2)

- M1: Triple array allocation in use-review-actions.ts auto-advance path
- M2: findIndex O(n) every render for findingNumber in ReviewPageClient
- M3: `sessionId: ''` not a valid UUID in Finding initialization

## R4 (commit 12eec7a — production bug fixes) — 0C / 1H / 2M / 5L

### H1: Mock drift — conflict test missing sortedFindingIds

- `use-review-actions.conflict.test.ts` mock store lacks `sortedFindingIds` + `setSortedFindingIds`
- autoAdvance receives undefined instead of array — test passes but doesn't verify real behavior

### M1: sortedFindingIds sync lag (low-risk race)

- FindingList syncs via useEffect (post-paint), tiny window where hotkey reads stale store
- Consider "adjust state during render" pattern as alternative

### M2: toast.error(undefined) missing fallback

- ReviewPageClient L222 `toast.error(result.error)` — no fallback for undefined error

### New Patterns Confirmed

- processedFileIdRef guard > initialDataRef for RSC revalidation protection
- serverUpdatedAt full loop prevents permanent Realtime block
- allSortedIds includes minor (accordion closed) for autoAdvance -> elegant
- getState() (not selector) for non-subscribing sortedFindingIds access — no re-render

## Positive Patterns (carried from R1-R2, still excellent)

- State transition matrix: exhaustive, type-safe, 24-cell coverage
- DRY executeReviewAction helper shared across 3 actions
- withTenant() on every query (SELECT, UPDATE, segment lookup)
- Optimistic update + smart rollback using fresh Zustand state
- Transaction for UPDATE + INSERT (Guardrail #6)
- Post-commit try-catch for audit + Inngest (Anti-pattern #38 resolved)
- Reduced-motion compliance throughout
- Runtime type validation for DB varchar → union type
- ARIA: toolbar, aria-keyshortcuts, role="grid"/"row"/"gridcell", aria-live
