# Story 4.1b Keyboard Navigation & Focus Management CR R1

**Date:** 2026-03-10
**Result:** 0C / 4H / 6M / 5L

## High Findings

### H1. Stale Closure in Escape Layer pushEscapeLayer Callback

- FindingList.tsx L227-229: `pushEscapeLayer('expanded', () => onToggleExpand(activeFindingId))`
- `activeFindingId` captured at push time — may change before Escape pressed
- Fix: use ref to track current activeFindingId
- Risk: low in practice (auto-collapse on J resets layer) but theoretically possible with rapid key presses

### H2. Missing role="gridcell" in FindingCardCompact

- FindingCardCompact.tsx L82-93: `role="row"` without any `role="gridcell"` children
- ARIA Grid Pattern spec: "Every row must contain at least one gridcell"
- Fix: wrap content in `role="gridcell"` div

### H3. AC4 Implementation Deviates from Spec

- AC4.1 says "Focus moves to accordion trigger" — implementation skips trigger in J/K
- Design Decision #4 consciously excludes trigger from flattenedIds
- Need SM confirmation that DD#4 overrides AC4 text

### H4. prevExpandedForEscape Effect Creates new Set Every Run

- FindingList.tsx L235: `prevExpandedForEscape.current = new Set(expandedIds)`
- Unnecessary allocation — can assign reference directly since expandedIds is already new object per toggle
- Also: escape layer push closure captures potentially stale values (related to H1)

## Medium Findings

- M1: Variable shadowing `prevIds` used with 2 meanings
- M2: findingIdsKey sort+join O(n log n) every findings change
- M3: renderCompactWithCard inline function recreated each render
- M4: Reduced motion path missing explicit scrollIntoView for non-reduced case
- M5: E2E waitForReviewPageHydrated auto-expands Minor accordion unconditionally
- M6: allIndexMap includes all findings but flattenedIds excludes closed Minor — different numbering systems

## Patterns Noted

- React 19 "adjust state during render" used correctly (3 instances)
- CSS.escape() on querySelector — good defense-in-depth
- ID-based focus tracking instead of index — correct pattern for Realtime updates
- Auto-collapse before navigation (DD#11) — prevents accumulated expanded cards
- useKeyboardActions singleton pattern — works but tests must mock entire module
