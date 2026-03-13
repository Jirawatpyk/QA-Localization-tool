# Story 4.1c: Detail Panel & Segment Context — CR R1-R2

## R1 (2026-03-13, prior)

**Result:** 1C / 3H / 5M / 0L

- C1: pino in 'use client' hook — FIXED
- H1: StatusBadge bare string — FIXED (now uses FindingStatus)
- H2: Unbounded cache — STILL OPEN (R2 H3)
- H3: Missing aria-label on clickable rows — FIXED
- M1: No Zod validation — STILL OPEN (R2 H1, upgraded)
- M2: Unused imports gt/lt — FIXED
- M3: Query 1 missing fileId — FIXED
- M4: Inline function ref — FIXED (stable noop)
- M5: AbortController comment — STILL OPEN (R2 M1)

## R2 (2026-03-13, current re-review)

**Result:** 0C / 3H / 5M / 5L

### HIGH

- **H1:** No Zod input validation on getSegmentContext (was M1 in R1, upgraded to H for consistency with sibling actions)
- **H2:** Invalid Tailwind class `overflow-wrap-break-word` in SegmentContextList.tsx:86,101 (correct: `break-words`)
- **H3:** Hook cache no max size — memory leak potential (carried from R1 H2)

### MEDIUM

- **M1:** AbortController comment misleading (carried from R1 M5)
- **M2:** AC4 specifies "button group" but implementation uses `<select>`
- **M3:** E2E tests all `test.skip` — need TD entry
- **M4:** noop comment not in TODO(story-X.X) format
- **M5:** buildFindingForUI uses Record<string, unknown> instead of Partial<FindingForDisplay>

### LOW

- L1: Redundant guard (defense-in-depth, correct)
- L2: Accordion race (works due to React 19 batch, tests pass)
- L3: Missing focus-visible ring on clickable context rows
- L4: Empty text nodes from highlightExcerpt
- L5: E2E seed missing file_hash

### Key Fixes Confirmed from R1

- pino removed from client hook
- StatusBadge now typed FindingStatus
- aria-label added to clickable rows
- fileId filter added to Query 1
- Stable noop function (not inline)
- Unused imports cleaned
