# Story 3.2c — L2 Results Display & Score Update

## CR R1 (Pre-implementation scan)

**Date:** 2026-03-03
**Files Reviewed:** 10 (5 components, 1 server action, 2 hooks, 1 store, 1 page)
**Result:** 0C / 5H / 8M / 5L
(See git history for original R1 findings — many were fixed during implementation)

## CR R2 (Post-implementation scan)

**Date:** 2026-03-03
**Files Reviewed:** 10 new + 8 modified
**Result:** 0C / 5H / 8M / 5L

### HIGH

1. **H1: Missing UPDATE event in useFindingsSubscription** — only INSERT+DELETE. Accept/reject won't sync via Realtime.
2. **H2: languagePairConfigs JOIN missing targetLang** — wrong l2ConfidenceMin for multi-target projects.
3. **H3: Unsafe `as unknown as Finding` cast** — ReviewPageClient:45. Partial data stored as full Finding type.
4. **H4: Duplicated severity sort + bare `Record<string, number>`** — server action + client both have same sort, bare string key.
5. **H5: `findings.status: string` in FileReviewData** — Should be `FindingStatus` union (anti-pattern #3).

### MED

1. **M1: Duplicated `useReducedMotion`** — sync (FindingListItem) vs reactive (ScoreBadge). Extract shared hook.
2. **M2: Map identity → useMemo re-sort every insert** — O(n log n) per Realtime event.
3. **M3: severityCounts no guard for unknown severity** — phantom key breaks Total display.
4. **M4: L1L2L3 same badge as L1L2** — both "AI Screened".
5. **M5: findingRows cast bypasses severity validation** — Drizzle varchar → union without runtime check.
6. **M6: Realtime payload cast without validation** — findings subscription casts severity/status/layer without validator.
7. **M7: console.warn in E2E cleanup** — acceptable for test code.
8. **M8: file.status cast without DbFileStatus validation** — same pattern as M5.

### LOW

1. processingMode cast without validation
2. layerCompleted cast without validation
3. isNew prop never true — fade-in animation dead code
4. No Zod input validation for UUID params
5. Default score object uses cast instead of type annotation

## Patterns Confirmed (Both Rounds)

- withTenant() all queries: PASS
- ActionResult<T>: PASS
- RSC boundary: PASS
- Named exports: PASS
- Design tokens: PASS (R2 fixed inline colors from R1)
- Zustand slice pattern: well-structured
- Polling fallback: both hooks have exponential backoff + cleanup
- E2E critical flow coverage: comprehensive
