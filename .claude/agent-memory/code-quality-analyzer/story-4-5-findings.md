# Story 4.5 — Search, Filter & AI Layer Toggle CR R1

**Date:** 2026-03-16
**Result:** 1C / 5H / 5M / 4L

## Critical

- **C1:** Confidence boundary mismatch — `filter-helpers.ts` uses `> 85` for high, `ConfidenceBadge.tsx` uses `>= 85`. Value 85 shows "High" badge but filtered as "Medium". Same bug in `FilterBar.tsx` `computeMatchCounts`. Fix: shared `getConfidenceBucket()` function as SSOT.

## High

- **H1:** `computeMatchCounts` creates 5 spread objects per finding (O(5N) allocations)
- **H2:** `perFileFilterCache` unbounded Map — no eviction policy
- **H3:** `FindingCardCompact` memo ineffective — Zustand `selectedIds` Set recreation triggers all cards
- **H4:** `as never` cast in FilterBar (lines 89, 190) bypasses type safety
- **H5:** `CommandPalette` `toggle-ai` captures stale `aiSuggestionsEnabled` closure — should use `getState()`

## Medium

- **M1:** `highlightText` only highlights first match occurrence
- **M2:** Duplicated `DEFAULT_FILTER` between `FilterBar.tsx` and `review.store.ts`
- **M3:** `clearAllFilters` calls `setFilter()` 5 times — 5 separate store updates
- **M4:** CommandPalette missing state reset on close (Guardrail #11 violation)
- **M5:** "Show more..." count uses total findings instead of matched-but-sliced count

## Low

- **L1:** `role="toolbar"` without keyboard nav implementation (APG Toolbar Pattern)
- **L2:** SearchInput unnecessary re-render on debounce fire (store sync effect)
- **L3:** Redundant `aria-modal="true"` on DialogContent (Radix sets it)
- **L4:** `highlightText` exported from component file — should be in utils/

## Patterns Noted

- Confidence threshold boundaries are defined in 3 places (ConfidenceBadge, filter-helpers, FilterBar computeMatchCounts) — SSOT needed
- `clearAllFilters` pattern (5 individual setFilter calls) appears in both FilterBar and CommandPalette — need batch setter
