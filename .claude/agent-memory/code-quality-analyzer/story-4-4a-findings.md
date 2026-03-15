# Story 4.4a — Bulk Operations & Decision Override CR R1

**Date:** 2026-03-15
**Files reviewed:** 12 (4 new, 8 modified) + 3 test files
**Findings:** 1C / 4H / 5M / 4L

## Critical

- C1: `FindingDetailSheet` doesn't pass `projectId` + `fetchOverrideHistory` to `FindingDetailContent` — override history dead on laptop/mobile viewport

## High

- H1: N+1 query in bulkAction transaction — O(N) individual UPDATEs + INSERTs for up to 200 findings
- H2: feedback_events INSERT also N+1 outside transaction (200 individual INSERTs)
- H3: Dynamic import (`await import()`) in `executeBulk` hot path + sequential store updates (N re-renders)
- H4: `OverrideBadge` uses inline Tailwind amber colors instead of tokens.css semantic tokens

## Medium

- M1: `OverrideHistoryEntry` type duplicated in action + component (drift risk)
- M2: `getOverrideHistory` missing `projectId` filter — asymmetric with bulkAction (Guardrail #14)
- M3: `BulkConfirmDialog` severity breakdown hard-codes severity list
- M4: Custom checkbox in `FindingCardCompact` has noop `onKeyDown` — keyboard inaccessible
- M5: `selectRange` store method is dead code — not called from any UI handler

## Low

- L1: `OverrideHistoryPanel` shows "No history" on fetch error (no error state)
- L2: `BulkActionBar` Loader2 `animate-spin` not suppressed by reducedMotion (G#37)
- L3: Bare `string` types in `OverrideHistoryEntry` for status/action fields (G#3)
- L4: Test uses non-UUID IDs ("f001") in store test

## Patterns Observed

- Cross-viewport prop forwarding is a recurring issue (similar to Story 4.1d)
- Bulk operations correctly use transaction + Guardrail #5/6/7 compliance
- Good test boundary coverage (5/200/201 limits)
