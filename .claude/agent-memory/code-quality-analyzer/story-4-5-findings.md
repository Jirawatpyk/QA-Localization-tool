# Story 4.5 — Search, Filter & AI Layer Toggle CR

## R1 (2026-03-16) — 1C / 5H / 5M / 4L

- C1: Confidence boundary mismatch (filter-helpers vs ConfidenceBadge)
- H1-H5: computeMatchCounts O(5N), unbounded cache Map, memo ineffective, `as never` cast, stale closure
- M1-M5: highlightText single-match, duplicated DEFAULT_FILTER, 5x setFilter, no dialog reset, show-more count
- L1-L4: toolbar nav, re-render, redundant aria-modal, exported from component

## R2 (2026-03-17) — 0C / 3H / 5M / 5L

Most R1 findings FIXED. New findings from updated code:

### HIGH (must fix)

- **H1:** Confidence bucket logic STILL duplicated — `filter-helpers.ts:46-56` vs `FilterBar.tsx:98-101`. Need shared `getConfidenceBucket()`.
- **H2:** `filter-cache.ts:35` — `JSON.parse(raw) as FilterCacheEntry` no runtime validation. Stale schema → undefined fields.
- **H3:** `FindingList.tsx:391-407` — `searchQuery` prop NOT passed to `FindingCardCompact`. Search highlight NEVER works.

### MEDIUM

- **M1:** `FilterBar.tsx:74-103` — computeMatchCounts 5N object allocations (pre-compute filter variants outside loop)
- **M2:** `ReviewPageClient.tsx:1011-1014` — inline arrow breaks FindingCardCompact memo
- **M3:** `review.store.ts:510-532` — DEFAULT_FILE_STATE shallow freeze (Map/Set still mutable)
- **M4:** `ReviewPageClient.tsx:668` + `FilterBar.tsx:78-79` — unsafe `as Parameters<>` cast, fix with Pick type
- **M5:** CommandPalette actions missing keyboard shortcut hints

### LOW

- L1: animate-pulse no prefers-reduced-motion check (ReviewPageClient:912)
- L2: highlight-mark contrast ratio unverified
- L3: search omits category field (filter-helpers:63-69)
- L4: CommandPalette search inconsistent (no suggestedFix field)
- L5: Unnecessary `as ReviewState` casts in store setters
