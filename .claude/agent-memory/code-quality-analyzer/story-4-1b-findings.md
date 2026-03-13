# Story 4.1b Keyboard Navigation & Focus Management CR R1-R2

**Date:** 2026-03-10
**R1 Result:** 1C / 3H / 8M / 4L
**R2 Result:** 0C / 2H / 3S

## Critical Findings

### C1. Missing role="gridcell" in FindingCardCompact (ARIA Grid Pattern violation)

- FindingCardCompact.tsx L82-93: `role="row"` without any `role="gridcell"` children
- WAI-ARIA spec: "Every row MUST contain at least one gridcell"
- Screen readers may ignore grid role entirely or announce incorrect structure
- Fix: wrap row content in `<div role="gridcell">` (single cell) or multiple cells for column nav

## High Findings

### H1. requestAnimationFrame Not Cleaned Up — Memory Leak + Stale DOM Focus

- FindingList.tsx L164-181: useEffect calls rAF but no `cancelAnimationFrame()` in cleanup
- Rapid J/K presses queue multiple rAF callbacks without cancellation
- Also in handleGridFocus L251 (event handler — lower risk)
- Fix: `const rafId = requestAnimationFrame(...); return () => cancelAnimationFrame(rafId)`

### H2. Escape Layer Stack Leak — push/pop logic tracks only activeFindingId

- FindingList.tsx L221-241: escape layer push/pop effect keyed on activeFindingId
- Edge case: expand finding A → navigate to B → A's escape layer not popped (effect only checks activeFindingId)
- Fix: effect should iterate ALL expandedIds vs prev for push/pop, remove activeFindingId from deps

### H3. navigateNext/navigatePrev Stale Closure Risk (Fragile Pattern)

- FindingList.tsx L184-203: uses derived `activeIndex` in useCallback
- React 19 event ordering prevents actual bug, but functional updater would be more robust
- Fix: `setActiveFindingId((prevId) => { const idx = flattenedIds.indexOf(prevId); ... })`

## Medium Findings

- M1: flattenedIdsKey = join(',') creates new string every render (minor perf)
- M2: 3 nested "adjust state during render" blocks hard to maintain — extract to custom hook
- M3: renderCompactWithCard defined inside component body (recreated each render)
- M4: Test T6.4 has conditional assertion (`if calls.length > 0`) — possible false positive
- M5: Test T-IME-01 doesn't test IME guard (mocked hook) — gives false confidence
- M6: E2E skips on !INNGEST_DEV_URL but doesn't use Inngest (PostgREST-only seed)
- M7: aria-expanded="false" on all rows is noise for screen readers (debatable)
- M8: sortFindings [...items] copy inside useMemo (acceptable, just noted)

## Low Findings

- L1: findingIdsKey sorts before join vs flattenedIdsKey doesn't — different purpose but no comment
- L2: tenantId prop mapping in client component (acceptable for initial data)
- L3: E2E seed findings missing ai_confidence for L2 findings
- L4: waitForReviewPageHydrated auto-expands Minor accordion (may interfere with accordion tests)

## Patterns Noted

- React 19 "adjust state during render" used correctly (3 instances)
- CSS.escape() on querySelector — good defense-in-depth, no XSS concern
- ID-based focus tracking instead of index — correct pattern for Realtime updates
- Auto-collapse before navigation (DD#11) — prevents accumulated expanded cards
- useKeyboardActions singleton pattern — works but tests must mock entire module
- Roving tabindex implementation correct (tabIndex={isActive ? 0 : -1})
- Guardrail compliance: #27, #28, #29, #31, #36, #37, #39, #40

## New Anti-Pattern Discovered

### #38: requestAnimationFrame in useEffect Without cancelAnimationFrame Cleanup

- When useEffect calls rAF, MUST cancel in cleanup function
- Especially important when effect deps change frequently (focus tracking)
- Pattern: `const rafId = requestAnimationFrame(...); return () => cancelAnimationFrame(rafId)`

---

## CR R2 Findings (2026-03-10)

### R1 Fix Verification — All 7 CORRECT

| Fix                                                    | Status  | Notes                                                         |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------- |
| H1: Mount guard (L167-171)                             | CORRECT | `prevActiveFindingIdRef.current === null` skip works          |
| H3: cancelAnimationFrame cleanup (L164, 175, 188)      | CORRECT | ref initialized to 0 (safe no-op)                             |
| M1: role="gridcell" (L94, 170)                         | CORRECT | APG compliant single-cell row                                 |
| M2: handleGridClick (L280-290)                         | CORRECT | guards: closest + !== activeFindingId + flattenedIds.includes |
| M3: Escape layer boolean ref (L231-251)                | CORRECT | transition tracking prevents duplicate push/pop               |
| H2: T3.3 rAF mock (L399-411)                           | CORRECT | inline rAF + body check = deterministic                       |
| React Compiler: ref assignment in useEffect (L232-234) | CORRECT | No render-phase mutation                                      |

### R2 New Findings

- **H-R2-1:** T6.4 conditional assertion `if (scrollSpy.mock.calls.length > 0)` = false positive risk (Anti-Pattern #39 recurrence)
- **H-R2-2:** handleGridFocus rAF (L266) has no cleanup — inconsistent with focusRafRef pattern (low severity, null guard protects)
- **S-R2-1:** Wrapper div between rowgroup and row breaks strict ARIA hierarchy — add `role="presentation"`
- **S-R2-2:** T-IME-01 and T-SCROLL-01 are duplicates of T1.1/T1.12
- **S-R2-3:** buildFindingForUI uses `Record<string,unknown>` — loses type safety (pre-existing)
