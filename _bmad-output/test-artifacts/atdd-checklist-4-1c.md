---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-11'
---

# ATDD Checklist - Epic 4, Story 4.1c: Detail Panel & Segment Context

**Date:** 2026-03-11
**Author:** Mona
**Primary Test Level:** Unit (Component + Hook + Action) + E2E

---

## Story Summary

QA Reviewer sees full finding details with surrounding segment context when focusing a finding in the review page. This includes metadata display, full segment text with highlighted excerpts, ±N surrounding segments, context range configuration, click-to-navigate between context segments, and Thai/CJK language compliance.

**As a** QA Reviewer
**I want** to see full finding details with surrounding segment context when I focus a finding
**So that** I can understand each issue in its translation context and make informed review decisions

---

## Acceptance Criteria

1. **AC1** Detail Panel Content Sync — metadata, severity badge, layer badge, confidence, suggestion, empty state, error state, disabled action buttons
2. **AC2** Full Segment Text with Highlighted Excerpts — full source/target text, `<mark>` highlight, case-insensitive fallback, 2-column layout
3. **AC3** Surrounding Segment Context — ±2 segments, visual distinction, cross-file fallback, loading skeleton
4. **AC4** Context Range Configuration — 1/2/3 selector, local state, re-fetch on change
5. **AC5** Context Segment Click-to-Navigate — clickable segments with findings, store sync, FindingList sync
6. **AC6** Thai/CJK Language & Accessibility — per-segment lang attr, CJK 1.1x scale, contrast, reduced-motion

---

## Test Strategy

### AC → Test Scenario Mapping

#### Server Action: getSegmentContext (Unit)

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| T-SA.1 | Happy path: returns segment + context ±2 | AC2,3 | P0 | Module not found |
| T-SA.2 | NOT_FOUND when segment doesn't exist | AC2 | P0 | Module not found |
| T-SA.3 | Respects contextRange parameter (1, 2, 3) | AC4 | P1 | Module not found |
| T-SA.4 | Empty contextBefore at file start (segment #1) | AC3 | P1 | Module not found |
| T-SA.5 | Empty contextAfter at file end (last segment) | AC3 | P1 | Module not found |
| T-SA.6 | Includes finding IDs for clickable context segments | AC5 | P1 | Module not found |
| T-SA.7 | withTenant() on ALL 3 queries (Guardrail #1) | AC2,3 | P0 | Module not found |
| T-SA.8 | inArray guard when no context segments have findings | AC5 | P1 | Module not found |
| T-SA.9 | Non-contiguous segment numbers (gaps from deletions) — returns correct context | AC3 | P1 | Module not found |
| T-SA.10 | contextRange=0 or negative → clamp to 1 or reject with validation error | AC4 | P1 | Module not found |
| T-SA.11 | contextRange=4 → clamped to 3 (above-max partition) | AC4 | P1 | Module not found |

#### Hook: useSegmentContext (Unit)

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| T-H.1 | Returns data after successful fetch | AC2,3 | P0 | Module not found |
| T-H.2 | Shows loading state during fetch | AC3 | P1 | Module not found |
| T-H.3 | Debounces rapid segmentId changes (only final fetched) | AC2 | P1 | Module not found |
| T-H.4 | Returns cached data on revisit (no re-fetch) | AC2 | P1 | Module not found |
| T-H.5 | Clears cache on fileId change | AC3 | P1 | Module not found |
| T-H.6 | Sets error state on server action failure | AC1 | P1 | Module not found |
| T-H.7 | Cross-file guard: null segmentId → no fetch, data=null | AC3 | P0 | Module not found |
| T-H.8 | Retry clears cache entry and refetches | AC1 | P1 | Module not found |
| T-H.9 | Retry cycle: error → retry → loading → success | AC1 | P1 | Module not found |
| T-H.10 | Aborts in-flight request when segmentId changes before response arrives (stale prevention) | AC2 | P1 | Module not found |
| T-H.11 | Unmount during in-flight fetch → no setState warning (cleanup) | AC2 | P1 | Module not found |
| T-H.12 | fileId becomes null (cross-file edge) → clears data, no fetch | AC3 | P2 | Module not found |

#### Component: SegmentTextDisplay (Unit)

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| T-C1.1 | Highlights exact substring match with `<mark>` | AC2 | P0 | Module not found |
| T-C1.2 | Case-insensitive fallback highlight | AC2 | P1 | Module not found |
| T-C1.3 | No highlight when excerpt not found in text | AC2 | P1 | Module not found |
| T-C1.4 | Strips trailing "..." before matching | AC2 | P1 | Module not found |
| T-C1.5 | Renders full text when excerpt is null | AC2 | P1 | Module not found |
| T-C1.6 | lang attribute on outermost text container | AC6 | P0 | Module not found |
| T-C1.7 | CJK text-[110%] for ja/zh/ko on outer container | AC6 | P1 | Module not found |
| T-C1.8 | Thai: lang="th", NO CJK scale | AC6 | P1 | Module not found |
| T-C1.9 | Empty excerpt → no highlight | AC2 | P1 | Boundary |
| T-C1.10 | Whitespace-only excerpt → no highlight | AC2 | P1 | Boundary |
| T-C1.11 | Regex special chars in excerpt → indexOf handles | AC2 | P1 | Boundary |
| T-C1.12 | Excerpt longer than fullText → no highlight | AC2 | P1 | Boundary |
| T-C1.13 | Multiple occurrences of excerpt in text → only first highlighted | AC2 | P1 | Module not found |
| T-C1.14 | Excerpt with HTML-like content (`<script>`) → rendered as text, not HTML (XSS) | AC2 | P2 | Module not found |
| T-C1.15 | Excerpt at start of text (position 0) → no stray empty before-span | AC2 | P2 | Module not found |
| T-C1.16 | Excerpt at end of text → no trailing empty after-span | AC2 | P2 | Module not found |
| T-C1.17 | RTL language (lang="ar") → correct lang attr, no 2-column layout break | AC6 | P2 | Module not found |

#### Component: SegmentContextList (Unit)

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| T-C2.1 | Renders context before + current + context after in order | AC3 | P0 | Module not found |
| T-C2.2 | Current segment has distinct highlight class | AC3 | P1 | Module not found |
| T-C2.3 | Context segments with findings show clickable affordance | AC5 | P1 | Module not found |
| T-C2.4 | Context segments without findings are not clickable | AC5 | P1 | Module not found |
| T-C2.5 | Cross-file finding shows fallback message | AC3 | P1 | Module not found |
| T-C2.6 | Per-segment lang attribute (NOT parent-level) | AC6 | P1 | Module not found |
| T-C2.7 | CJK font scale per segment language | AC6 | P1 | Module not found |
| T-C2.8 | Segment numbers displayed | AC3 | P2 | Module not found |
| T-C2.9 | data-testid="segment-context-loaded" present | AC3 | P1 | Module not found |
| T-C2.10 | Error state: error message + retry button | AC1 | P1 | Module not found |
| T-C2.11 | Error state preserves finding metadata above | AC1 | P1 | Module not found |
| T-C2.12 | All context segments have findings → every row shows clickable affordance | AC5 | P1 | Module not found |

#### Component: FindingDetailSheet (Unit — update existing shell)

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| T-C3.1 | Renders finding metadata (severity, category, layer, status) | AC1 | P0 | Missing content |
| T-C3.2 | Shows AI confidence + model for L2/L3 findings | AC1 | P1 | Missing content |
| T-C3.3 | Shows suggestion section when available | AC1 | P1 | Missing content |
| T-C3.4 | Hides confidence for L1 findings | AC1 | P1 | Missing content |
| T-C3.5 | Empty state: "Select a finding to view details" | AC1 | P0 | Missing content |
| T-C3.6 | Disabled action buttons (Accept, Reject, Flag) without key hints | AC1 | P1 | Missing content |
| T-C3.7 | ARIA roles: complementary, toolbar | AC1 | P1 | Passes (shell exists) |
| T-C3.8 | aria-live announcement on finding change | AC1 | P1 | Missing announce call |
| T-C3.9 | Sheet reopen cycle: open→close→reopen shows correct state (cached or fresh) | AC1 | P1 | Missing lifecycle test |
| T-C3.10 | finding prop becomes null during loading → shows empty state, no crash | AC1 | P1 | Module not found |
| T-C3.11 | sourceLang is empty string → lang attr omitted or defaults to "en" | AC6 | P2 | Module not found |
| T-C3.12 | L3 finding shows model="claude-sonnet-*" distinct from L2 "gpt-4o-mini" | AC1 | P1 | Module not found |

#### Integration: FindingList sync (Unit)

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| T-I.1 | selectedId change → syncs activeFindingId | AC5 | P1 | Missing useEffect |
| T-I.2 | Guard: same selectedId → no redundant update | AC5 | P1 | Missing useEffect |
| T-I.3 | selectedId points to finding filtered out by current filter → no crash, no navigation | AC5 | P1 | Missing guard |
| T-I.4 | Navigate to Minor finding → accordion auto-expands Minor group if collapsed | AC5 | P1 | Missing auto-expand |

#### E2E Tests

| ID | Scenario | AC | Priority | Red Phase Failure |
|----|----------|-----|----------|-------------------|
| E1 | Focus finding → detail panel shows metadata | AC1 | P0 | Missing content |
| E2 | Detail panel shows full segment text (not truncated) with `<mark>` highlight visible | AC2 | P0 | Missing content |
| E3 | Context segments ±2 visible around finding's segment | AC3 | P1 | Missing content |
| E4 | Click context segment with findings → navigates | AC5 | P1 | Missing content |
| E5 | Context range selector changes segment count | AC4 | P2 | Missing content |
| E6 | CJK/Thai text has lang attribute | AC6 | P1 | Missing content |
| E7 | Sheet focus trap → Esc → focus restores to grid | AC1 | P1 | Focus trap works but no grid restore test |

---

## Boundary Value Tests (Epic 2 Retro A2 — MANDATORY)

### AC4: Context Range (1-3)

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| contextRange min=1 | range=1 → ±1 segments | range=0 → default to 2 or reject | N/A | N/A |
| contextRange max=3 | range=3 → ±3 segments | range=2 → ±2 | range=4 → cap to 3 | N/A |
| contextRange default | range=2 → ±2 segments | N/A | N/A | N/A |

**Tests:** T-SA.3 covers range 1,2,3. T4.1 covers default=2.

### AC3: Segment Position Boundaries

| Boundary | At | Below | Above | Zero/Empty |
|----------|----|-------|-------|------------|
| segmentNumber=1 (first in file) | contextBefore=[] | N/A | contextBefore has segments | N/A |
| segmentNumber=max (last in file) | contextAfter=[] | contextAfter has segments | N/A | N/A |
| Only 1 segment in file | contextBefore=[], contextAfter=[] | N/A | N/A | N/A |

**Tests:** T-SA.4 (first), T-SA.5 (last). P1 boundary tests.

### AC2: Excerpt Matching Boundaries

| Boundary | Value | Expected | Priority |
|----------|-------|----------|----------|
| Empty excerpt (`""`) | No highlight, render full text | P1 |
| Whitespace-only (`"   "`) | No highlight, render full text | P1 |
| Regex special chars (`"find[this]"`) | indexOf handles correctly | P1 |
| Excerpt longer than fullText | No highlight, render full text | P1 |
| Excerpt === fullText (exact match) | Entire text highlighted | P1 |

**Tests:** T-C1.9 through T-C1.12. All P1.

---

## Test Count Summary

| Level | P0 | P1 | P2 | Total |
|-------|----|----|-----|-------|
| Unit — Action | 3 | 8 | 0 | 11 |
| Unit — Hook | 2 | 9 | 1 | 12 |
| Unit — SegmentTextDisplay | 2 | 11 | 4 | 17 |
| Unit — SegmentContextList | 1 | 10 | 1 | 12 |
| Unit — FindingDetailSheet | 2 | 9 | 1 | 12 |
| Unit — FindingList sync | 0 | 4 | 0 | 4 |
| E2E | 2 | 4 | 1 | 7 |
| **Total** | **12** | **55** | **8** | **75** |

---

## Pre-mortem Findings (Applied)

### FM1: E2E seed must guarantee highlight match
- Seed `segments.sourceText` = `"The quick brown fox jumps over the lazy dog"`
- Seed `findings.sourceTextExcerpt` = `"brown fox"` (guaranteed substring)
- E2 MUST assert `<mark>` element exists, not just "full text displays"

### FM2: AbortController not tested → T-H.10 added
- Mock slow fetch for first segmentId, fast for second
- Verify only second result is set in state

### FM3: Sheet reopen cycle → T-C3.9 added
- Render open=true → close → reopen → verify data (cached) or fresh fetch
- Ensures hook state doesn't go stale across open/close cycles

### FM4: Radix Sheet portal locator strategy
- **Dev Note #18:** E2E tests MUST use `page.locator('[role="complementary"]')` or global `page.getByTestId('segment-context-loaded')` — NOT `page.getByTestId('finding-detail-sheet').getByText(...)` because Radix Sheet renders in a portal at document.body level. Scoped locators inside the Sheet testid will miss portal content.

### FM5: E4 seed must include findings on adjacent segments
- Seed at least 2 segments with findings (e.g., segment #3 and #4)
- E4 test must assert clickable context row exists before attempting click

### FM6: Cache key correctness
- Comment in T-H.4: `// NOTE: cache invalidation on finding mutation is Story 4.2 scope`

## Failure Mode Analysis (Applied)

### FM-A1: Segment number gaps (T-SA.9)
- Real-world SDLXLIFF files may have non-contiguous segment numbers (deleted/merged segments)
- Context query must use `ORDER BY segment_number` and count rows, not assume consecutive numbers

### FM-A2: Invalid contextRange (T-SA.10)
- UI selector limits 1-3, but direct server action call could pass 0 or negative
- Action must clamp or reject invalid range values

### FM-A3: Unmount during fetch (T-H.11)
- User rapidly navigates away → component unmounts while fetch in-flight
- Must abort + guard setState to prevent React "Can't perform state update on unmounted" warning

### FM-A4: Null fileId edge (T-H.12)
- Cross-file finding selected → fileId becomes null before new file loads
- Hook must handle null fileId gracefully (clear data, skip fetch)

### FM-A5: Multiple excerpt occurrences (T-C1.13)
- Excerpt "the" appears multiple times in "the quick brown the fox"
- Spec: highlight only first occurrence (indexOf behavior)

### FM-A6: XSS via excerpt content (T-C1.14)
- Excerpt containing `<script>` or HTML tags must render as text, not parsed HTML
- React's default JSX escaping handles this, but mark/split logic must not use dangerouslySetInnerHTML

### FM-A7: Finding becomes null mid-render (T-C3.10)
- Store update clears selectedFinding while sheet is open (e.g., realtime event removes finding)
- Sheet must gracefully show empty state, not crash

### FM-A8: Empty sourceLang (T-C3.11)
- File metadata may have empty string for language code
- Must omit lang attr or default to "en" — empty `lang=""` is invalid HTML

### FM-A9: Filtered-out finding navigation (T-I.3)
- Context click navigates to findingId that's hidden by current severity filter
- Must not crash; either clear filter or show "finding not visible" state

### FM-A10: Accordion auto-expand on navigate (T-I.4)
- FindingList groups by severity in collapsible accordion
- Navigate to Minor finding when Minor group is collapsed → must auto-expand

---

## Equivalence Partitioning (Applied)

### Input Domain Analysis

| Input Domain | Equivalence Classes | Tests Covering |
|-------------|---------------------|----------------|
| contextRange | {1}, {2}, {3}, {≤0}, {>3} | T-SA.3, T-SA.10, T-SA.11 |
| severity | {critical}, {major}, {minor}, {enhancement} | T-C3.1 (generic render) |
| layer | {L1}, {L2}, {L3} | T-C3.2, T-C3.4, T-C3.12 |
| language | {Latin}, {CJK}, {Thai}, {RTL} | T-C1.6-8, T-C1.17 |
| excerpt position | {start}, {middle}, {end}, {full} | T-C1.1, T-C1.15, T-C1.16, boundary |
| context findings | {all}, {none}, {mixed} | T-C2.12, T-SA.8, T-C2.3-4 |
| suggestion | {present}, {null} | T-C3.3 |

---

## Generated Test Files (RED Phase)

### Unit Tests (68 tests — all `it.skip`)

| # | File | Tests | Component |
|---|------|-------|-----------|
| 1 | `src/features/review/actions/getSegmentContext.action.test.ts` | 11 | Server Action |
| 2 | `src/features/review/hooks/use-segment-context.test.ts` | 12 | Hook |
| 3 | `src/features/review/components/SegmentTextDisplay.test.tsx` | 17 | Component |
| 4 | `src/features/review/components/SegmentContextList.test.tsx` | 12 | Component |
| 5 | `src/features/review/components/FindingDetailSheet.test.tsx` | 12 | Component |
| 6 | `src/features/review/components/FindingList.sync.test.tsx` | 4 | Integration |

### E2E Tests (7 tests — all `test.skip`)

| # | File | Tests |
|---|------|-------|
| 1 | `e2e/review-detail-panel.spec.ts` | 7 + 1 setup |

### TDD Red Phase Verification

```
Test Files  6 skipped (6)
     Tests  68 skipped (68)
  Duration  5.97s
```

- All tests use `it.skip()` / `test.skip()`
- No placeholder assertions found
- Tests assert expected behavior (not implemented yet)

---

## Running Tests

```bash
# Run all unit tests for this story (RED phase — all skipped)
npx vitest run src/features/review/actions/getSegmentContext.action.test.ts src/features/review/hooks/use-segment-context.test.ts src/features/review/components/SegmentTextDisplay.test.tsx src/features/review/components/SegmentContextList.test.tsx src/features/review/components/FindingDetailSheet.test.tsx src/features/review/components/FindingList.sync.test.tsx

# Run E2E tests for this story
npx playwright test e2e/review-detail-panel.spec.ts

# Run single test file
npx vitest run src/features/review/components/SegmentTextDisplay.test.tsx

# Watch mode
npx vitest --project unit src/features/review/components/SegmentTextDisplay.test.tsx
```

---

## Generation Mode

**Mode:** AI Generation
**Reason:** All 6 ACs have clear, testable criteria. Standard patterns (server action, hook, component, E2E navigation). No complex UI recording needed.
