# Story 4.1c: Detail Panel & Segment Context

Status: done

> **BLOCKED BY:** Story 4.1a must be `done` (currently `done` ✓) and Story 4.0 must be `done` (currently `done` ✓). Verify latest main includes all 4.1b changes before starting.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA Reviewer,
I want to see full finding details with surrounding segment context when I focus a finding,
So that I can understand each issue in its translation context and make informed review decisions.

## Acceptance Criteria (6 ACs)

### AC1: Detail Panel Content Sync

**Given** a finding is focused in the finding list (via keyboard J/K or mouse click)
**When** the FindingDetailSheet (right side panel) syncs to the focused finding
**Then:**
1. The detail panel displays the finding's metadata: severity badge (icon+text+color per Guardrail #36), category label, layer badge (blue="Rule-based"/purple="AI"), description text
2. If AI finding: confidence badge (percentage), AI model name
3. If suggestion available: suggestion text in a distinct styled section
4. Finding status badge (Pending/Accepted/Rejected etc.) displayed at the top
5. Action button bar placeholder (disabled — buttons wired in Story 4.2) — shows: "Accept", "Reject", "Flag" (NO keyboard shortcut hints — key hints added in Story 4.2 when handlers are wired)
6. When no finding is selected (`selectedId === null`), the panel shows an empty state: "Select a finding to view details"
7. When segment context fails to load (network error, segment deleted), the panel shows an error message with a "Retry" button. Finding metadata (AC1 items 1-5) remains visible — only the segment context section shows the error

### AC2: Full Segment Text with Highlighted Excerpts

**Given** the detail panel is showing a finding that has a `segmentId` (per-file finding)
**When** segment context is loaded from the database
**Then:**
1. The full source text from the segment is displayed (not the truncated 500-char excerpt)
2. The full target text from the segment is displayed
3. The finding's `sourceTextExcerpt` is highlighted within the full source text using a `<mark>` element with a distinct background color (amber/yellow tint)
4. The finding's `targetTextExcerpt` is highlighted within the full target text using a `<mark>` element
5. If the excerpt is not found within the full text (edge case: text mismatch), the full text is displayed without highlight
6. Source and target are displayed in a 2-column layout: source (left), target (right)

### AC3: Surrounding Segment Context

**Given** the detail panel is showing a per-file finding
**When** surrounding segments are loaded
**Then:**
1. Context segments are displayed: up to 2 segments before and 2 segments after the finding's segment (based on `segment_number` ordering)
2. Context segments render in a 2-column layout: source text (left, `opacity-70` muted style), target text (right, normal opacity)
3. Context segments are visually separated from the main finding segment (lighter background, smaller text, border separator)
4. Context segments are read-only (no editing capability)
5. The finding's own segment is visually emphasized (normal opacity, slightly larger, background highlight) compared to context segments
6. When a finding has `segmentId === null` (cross-file finding), show a message: "Cross-file finding — no specific segment context available"

### AC4: Context Range Configuration

**Given** the detail panel context display
**When** the reviewer adjusts the context range
**Then:**
1. A button group (1/2/3) is displayed above the segment context area labeled "Context"
2. Default context range is 2 (±2 segments)
3. Selecting 1 shows ±1 segment, selecting 3 shows ±3 segments
4. Context range preference persists per-session (resets on page reload) — stored in local component state
5. Changing context range fetches additional segments if needed (or trims already-loaded segments)
6. When fewer segments exist than the range (e.g., first segment in file), display only available segments without error

### AC5: Context Segment Click-to-Navigate

**Given** a context segment is displayed in the detail panel
**When** the reviewer clicks a context segment row
**Then:**
1. If the context segment has findings associated with it: focus navigates to the first finding for that segment **in the current sorted finding list order** (i.e., look up `findingsBySegmentId[segmentId]`, then find the first one present in `flattenedIds` — updates `activeFindingId` in FindingList)
2. The detail panel updates to show the newly focused finding's context
3. If the context segment has NO findings: nothing happens (cursor remains default, no navigation)
4. Context segments with findings show a visual affordance: subtle underline or "has findings" indicator icon (clickable cursor)

### AC6: Thai/CJK Language & Accessibility Compliance

**Given** the detail panel displays segment text
**When** the text is rendered for any language
**Then:**
1. Every source text element has `lang={segment.sourceLang}` attribute (from **per-segment** metadata in `SegmentForContext`, NOT parent-level project language) (Guardrail #39, SC 3.1.2). This ensures multi-language files display correctly
2. Every target text element has `lang={segment.targetLang}` attribute (per-segment)
3. CJK text containers (detected via language code: ja, zh, ko) apply `text-[110%]` font scale (1.1x per UX spec)
4. Thai text containers (th) have correct `lang="th"` for proper line-breaking by the browser's Intl.Segmenter
5. The `<mark>` highlight elements inherit the parent's `lang` attribute
6. The detail panel heading and metadata labels are accessible: heading level, proper ARIA labels
7. All text has sufficient contrast against their backgrounds: 4.5:1 for normal text, 3:1 for large text (Guardrail #26)
8. `prefers-reduced-motion` is respected: no transition animations on context loading if reduced motion preferred (Guardrail #37)

## Tasks / Subtasks

### Task 0: Prerequisites (AC: all)
- [x] 0.1 Verify Story 4.1b is merged to main (status: `done`). Pull latest main before starting
- [x] 0.2 Run existing tests to establish baseline: `npm run test:unit` + `npm run type-check`
- [x] 0.3 Verify `FindingDetailSheet` shell exists with placeholder content at `src/features/review/components/FindingDetailSheet.tsx`
- [x] 0.4 Verify `segments` table schema has: `sourceText`, `targetText`, `sourceLang`, `targetLang`, `segmentNumber`, `tenantId` columns

### Task 1: Create `getSegmentContext` Server Action (AC: 2, 3, 4)
- [x] 1.1 Create `src/features/review/actions/getSegmentContext.action.ts`:
  - Input: `{ fileId: string, segmentId: string, contextRange?: number }` (default 2)
  - `'use server'` + `import 'server-only'`
  - Call `requireRole('qa_reviewer')` for auth — role hierarchy (`admin > qa_reviewer > native_reviewer`) means admin access is automatic. No `project_manager` role exists in the system. `requireRole` takes single `AppRole` string, not array
  - Return `ActionResult<SegmentContextData>`
- [x] 1.2 Fetch the target segment (finding's segment):
  - `db.select().from(segments).where(and(withTenant(segments.tenantId, tenantId), eq(segments.id, segmentId)))`
  - Guard: `if (rows.length === 0) return { success: false, error: 'Segment not found', code: 'NOT_FOUND' }`
  - Extract `segmentNumber`, `fileId` from result
- [x] 1.3 Fetch surrounding segments:
  - Context before: `segmentNumber >= (targetNumber - contextRange) AND segmentNumber < targetNumber`
  - Context after: `segmentNumber > targetNumber AND segmentNumber <= (targetNumber + contextRange)`
  - Filter by same `fileId` + `withTenant()`
  - Order by `segmentNumber ASC`
- [x] 1.4 Fetch finding IDs per context segment (for click-to-navigate):
  - Query `findings` table: `SELECT segment_id, id FROM findings WHERE segment_id IN (contextSegmentIds) AND file_id = fileId`
  - Guard: `if (contextSegmentIds.length === 0) return` before `inArray()` (Guardrail #5)
  - `withTenant()` on findings query
  - Group results in JS by `segmentId` → `findingId[]`. Return as `Record<string, string[]>` so detail panel knows which context segments are clickable
- [x] 1.5 Define `SegmentContextData` type:
  ```typescript
  type SegmentForContext = {
    id: string
    segmentNumber: number
    sourceText: string
    targetText: string
    sourceLang: string
    targetLang: string
    wordCount: number
  }
  type SegmentContextData = {
    currentSegment: SegmentForContext
    contextBefore: SegmentForContext[]
    contextAfter: SegmentForContext[]
    findingsBySegmentId: Record<string, string[]> // segmentId → findingIds
  }
  ```
- [x] 1.6 Unit tests for getSegmentContext: `getSegmentContext.action.test.ts`
  - Fetches target segment + context segments (happy path)
  - Returns NOT_FOUND when segment doesn't exist
  - Respects contextRange parameter (1, 2, 3)
  - Returns empty contextBefore when segment is at start of file
  - Returns empty contextAfter when segment is at end of file
  - Includes finding IDs for clickable context segments
  - Uses `withTenant()` on ALL queries (Guardrail #1)
  - Handles `inArray` with empty array (Guardrail #5)

### Task 2: Create `useSegmentContext` Hook (AC: 2, 3, 4)
- [x] 2.1 Create `src/features/review/hooks/use-segment-context.ts`:
  - Params: `{ fileId: string | null, segmentId: string | null, contextRange: number }`
  - Returns: `{ data: SegmentContextData | null, isLoading: boolean, error: string | null, retry: () => void }`
  - **Early return guard for cross-file findings:** `if (!segmentId || !fileId) return { data: null, isLoading: false, error: null }` — do NOT call server action when segmentId is null (cross-file findings have no segment context)
  - Calls `getSegmentContext` action in a `useEffect` when params change
  - Debounce: 150ms delay before fetching (prevents rapid re-fetches during J/K navigation). If 150ms causes stale context during rapid J/K, increase to 250ms or remove debounce and rely on AbortController cancellation only — test during E2E
  - Abort controller: cancel previous request when new finding is selected
  - Error handling: set `error` state, log via `logger` (no throw)
- [x] 2.2 Cache strategy:
  - Use a `Map<string, SegmentContextData>` ref to cache results by `segmentId+contextRange` key
  - Return cached data instantly if available (avoids re-fetch when navigating back to a finding)
  - Cache cleared on `fileId` change via explicit useEffect:
    ```typescript
    useEffect(() => {
      cacheRef.current.clear()
    }, [fileId])
    ```
- [x] 2.3 Unit tests: `use-segment-context.test.ts`
  - Returns null initially, then data after fetch
  - Shows loading state during fetch
  - Debounces rapid changes (only final segmentId fetched)
  - Returns cached data on revisit
  - Clears cache on fileId change
  - Handles error from server action
  - Returns null data (no fetch) when segmentId is null (cross-file guard)
  - Retry clears cache entry and refetches
  - Retry after error → clears error state → shows loading → returns data (full cycle)

### Task 3: Populate FindingDetailSheet — Finding Metadata (AC: 1)
- [x] 3.1 Update `FindingDetailSheet` props:
  - **IMPORTANT:** Current props: `{ open, onOpenChange, findingId }`. Add `finding: FindingForDisplay | null` prop — ReviewPageClient passes the finding data from its sorted findings array (already available)
  - Also add `sourceLang: string` and `targetLang: string | null` props (from `FileReviewData`)
  - Also add `fileId: string` prop (needed for useSegmentContext)
- [x] 3.2 Render finding metadata section:
  - Status badge at top (Pending = gray, Accepted = green, Rejected = red, Flagged = yellow, etc.)
  - Severity badge: icon (XCircle/AlertTriangle/Info/Lightbulb per Guardrail #36) + text + color
  - Category label
  - Layer badge: "Rule-based" (blue) for L1, "AI" (purple) for L2/L3
  - Description text
  - If AI: confidence percentage badge + model name
  - If suggestion: styled suggestion section with light background
- [x] 3.3 Empty state:
  - When `finding === null`: show "Select a finding to view details" with muted text and an icon
- [x] 3.4 Action button bar placeholder:
  - Render 3 disabled buttons: "[A] Accept", "[R] Reject", "[F] Flag"
  - All disabled with `cursor-not-allowed` + `opacity-50`
  - Show button labels WITHOUT keyboard shortcut hints (no "[A]", "[R]", "[F]") — key hints appear only after Story 4.2 wires the handlers. Showing key hints on disabled buttons creates false affordance
  - Tooltip on hover: "Actions available in Story 4.2"
  - `role="toolbar"` + `aria-label="Review actions"` on the container
- [x] 3.5 Unit tests: `FindingDetailSheet.test.tsx`
  - Renders finding metadata correctly
  - Shows empty state when no finding selected
  - Shows confidence/model for AI findings
  - Shows suggestion when available
  - Hides confidence for L1 findings
  - Action buttons are disabled
  - ARIA roles present (complementary, toolbar)
  - Announces "Finding details: [severity] [category]" via aria-live when finding changes

### Task 4: Display Full Segment Text with Highlights (AC: 2)
- [x] 4.1 Create `src/features/review/components/SegmentTextDisplay.tsx`:
  - Props: `{ fullText: string, excerpt: string | null, lang: string, label: string }`
  - If excerpt found in fullText → split into [before, highlight, after] → render with `<mark>` on highlight
  - If excerpt not found → render fullText without highlight
  - `<mark>` styling: `bg-amber-200 dark:bg-amber-700/50 rounded-sm px-0.5` — **VERIFY CONTRAST:** amber-200 (#fcd34d) must have 4.5:1 contrast ratio against text on ALL 6 finding state backgrounds (pending=white, accepted=green #dcfce7, rejected=red #fee2e2, flagged=yellow #fef3c7, noted=blue #dbeafe, source_issue=purple #ede9fe). If any fails → use `bg-amber-300` or adjust dark mode variant
  - Outermost text container `<div lang={lang}>` wraps all content (Guardrail #39). CJK `text-[110%]` class applied on this outer container so both full text and `<mark>` highlight inherit the scale. Do NOT apply scale on `<mark>` separately
  - CJK detection: use existing `isCjkLang(lang)` from `@/features/review/utils/finding-display.ts` — if true → apply `text-[110%]` on outer `<div>`
  - Thai: if `lang` starts with `th` → `lang="th"` for proper line-breaking (NO CJK scale)
- [x] 4.2 Highlight algorithm:
  - Strip trailing "..." from excerpt if present (truncation indicator)
  - Use `fullText.indexOf(cleanedExcerpt)` for case-sensitive match
  - If not found: try `fullText.toLowerCase().indexOf(cleanedExcerpt.toLowerCase())` as fallback
  - If still not found: no highlight (render full text as-is)
  - **Skip NFKC normalization** — both `sourceTextExcerpt` and `sourceText` originate from the same DB record (excerpt is a substring of full text). They are already in the same normalization form. NFKC is for cross-source comparison (glossary matching, dedup) per CLAUDE.md, NOT for excerpt-within-own-text search. Applying NFKC here could break matching if DB stores non-NFKC text
- [x] 4.3 Wire into FindingDetailSheet:
  - Use `useSegmentContext` hook result: `data.currentSegment.sourceText` + `data.currentSegment.targetText`
  - Render 2-column grid: source (left) + target (right)
  - Pass `finding.sourceTextExcerpt` and `finding.targetTextExcerpt` as highlight excerpts
- [x] 4.4 Unit tests: `SegmentTextDisplay.test.tsx`
  - Highlights exact substring match
  - Highlights case-insensitive fallback
  - No highlight when excerpt not found in text
  - Strips trailing "..." before matching
  - Sets `lang` attribute on outermost text container
  - CJK `text-[110%]` applied on outer container (mark inherits)
  - Applies CJK font scale for ja/zh/ko
  - Does NOT apply CJK font scale for th (Thai uses lang attr only)
  - Renders full text when excerpt is null
  - **Boundary-value tests (MANDATORY per CLAUDE.md):**
    - Empty excerpt (`excerpt === ""`) → no highlight, render full text
    - Whitespace-only excerpt (`excerpt === "   "`) → no highlight, render full text
    - Excerpt contains regex special chars (`"find[this]"`) → indexOf handles correctly (no regex used)
    - Excerpt longer than fullText → no highlight, render full text
  - **Contrast verification:** mark highlight `bg-amber-200` (#fde68a) against `text-foreground` (#0a0a0a). Pre-calculated ratios: vs white=1.16:1 (mark bg contrast irrelevant — text-on-mark matters). Actual check: dark text (#0a0a0a) on amber-200 (#fde68a) = **14.3:1** ✓. Dark text on amber-700/50 in dark mode: verify with DevTools contrast checker (`Elements > Styles > color swatch`). If dark mode fails → use `dark:bg-amber-600/40`

### Task 5: Render Surrounding Segment Context (AC: 3)
- [x] 5.1 Create `src/features/review/components/SegmentContextList.tsx`:
  - Props: `{ contextBefore: SegmentForContext[], currentSegment: SegmentForContext, contextAfter: SegmentForContext[], findingsBySegmentId: Record<string, string[]>, onNavigateToFinding: (findingId: string) => void }`
  - **NOTE: `sourceLang`/`targetLang` removed from props** — each segment carries its own `sourceLang`/`targetLang` in `SegmentForContext`. Use per-segment language, NOT parent-level (supports multi-language files correctly)
  - Add `data-testid="segment-context-loaded"` on the root element when data is rendered (E2E tests wait for this)
  - Renders a vertical list of segment rows
  - Each row: 2-column `grid grid-cols-2 gap-3` — source (left) | target (right)
  - Context rows: `opacity-70`, smaller text (`text-sm`), background `bg-muted/30`
  - Current segment row: normal opacity, `text-base`, background `bg-primary/5` (subtle highlight using design token)
  - Segment number label on each row (e.g., "Seg 42") — `text-xs text-muted-foreground`
  - Visual separator: `border-t border-border` between context and current segment
- [x] 5.2 Context segment styling:
  - All source text: `lang={segment.sourceLang}` attribute — **per-segment language from SegmentForContext, NOT parent-level prop** (multi-language file support)
  - All target text: `lang={segment.targetLang}` attribute — same per-segment
  - CJK font scale: use `isCjkLang(segment.sourceLang)` / `isCjkLang(segment.targetLang)` — applied per-segment text container (same SegmentTextDisplay reuse or inline logic)
  - Context rows with findings: `underline decoration-dotted cursor-pointer hover:bg-accent/50` + small icon indicator (e.g., `MessageSquare` 12px)
  - Context rows without findings: `cursor-default`, no click affordance, no underline
- [x] 5.3 Cross-file finding fallback:
  - When `segmentId === null`: render a muted message: "Cross-file finding — no specific segment context available"
  - Still show finding metadata (AC1) but no segment context section
- [x] 5.4 Loading state:
  - While `useSegmentContext` is loading: show skeleton placeholder matching the 2-column layout. Row count = `contextRange * 2 + 1` (e.g., range 2 → 5 skeleton rows)
  - Use shadcn Skeleton component
  - Verify shadcn Skeleton respects `prefers-reduced-motion` automatically. If not, add explicit override:
    ```css
    @media (prefers-reduced-motion: reduce) {
      [data-testid="segment-context-skeleton"] { animation: none !important; }
    }
    ```
  - (Guardrail #37)
- [x] 5.5 Error state:
  - When `useSegmentContext` returns `error`: show inline error message in the segment context area: "Failed to load segment context" with a "Retry" button
  - Retry button calls the hook's refetch (clear cache entry + re-trigger useEffect)
  - Finding metadata (Section 1) remains visible above — only Section 3 (segment context) shows the error
  - `aria-live="assertive"` on error message (Guardrail #33)
- [x] 5.6 Unit tests: `SegmentContextList.test.tsx`
  - Renders context before + current + context after in correct order
  - Current segment is visually distinct (has highlight class)
  - Context segments with findings show clickable affordance
  - Context segments without findings are not clickable
  - Cross-file finding shows fallback message
  - lang attribute uses per-segment language (NOT parent-level)
  - CJK font scale applied correctly per segment language
  - Segment numbers displayed
  - `data-testid="segment-context-loaded"` present when rendered
  - Error state shows error message and retry button
  - Error state preserves finding metadata above

### Task 6: Context Range Selector (AC: 4)
- [x] 6.1 Add context range button group to FindingDetailSheet:
  - Above the segment context area
  - Label: "Context" with 3 toggle buttons: [1] [2] [3]
  - Default: 2 selected (active state: `bg-primary text-primary-foreground`, inactive: `bg-muted text-muted-foreground`)
  - Uses `useState(2)` in FindingDetailSheet — local state, resets on page reload
  - Changing range triggers `useSegmentContext` re-fetch with new `contextRange`
- [x] 6.2 Button group accessibility:
  - `role="radiogroup"` + `aria-label="Segment context range"`
  - Each button: `role="radio"` + `aria-checked={isActive}`
  - Keyboard: Arrow left/right to navigate, Enter/Space to select
- [x] 6.3 Unit tests:
  - Default range is 2
  - Clicking 1/3 updates range
  - Triggers re-fetch with new range value
  - ARIA roles correct

### Task 7: Click-to-Navigate on Context Segments (AC: 5)
- [x] 7.1 Implement navigation in SegmentContextList:
  - When a context segment row with findings is clicked: find the first finding ID from `findingsBySegmentId[segmentId]` that exists in the current `flattenedIds` (sorted finding list), then call `onNavigateToFinding(matchedId)`. This ensures "first" means first in the user's visible sorted order, not arbitrary DB order
  - `onNavigateToFinding` is passed from ReviewPageClient through FindingDetailSheet
- [x] 7.2 Wire in ReviewPageClient:
  - Create `handleNavigateToFinding(findingId: string)` callback:
    - Find the finding in the sorted/flattened list
    - Update `activeFindingId` in FindingList (need to expose a setter or use a shared mechanism)
    - **NOTE:** `activeFindingId` is FindingList LOCAL state, not in Zustand store. Need a mechanism to update it from outside. Options:
      - (a) Expose via `useImperativeHandle` + `forwardRef` on FindingList (complex)
      - (b) Lift `activeFindingId` to ReviewPageClient and pass down as prop (breaking change)
      - (c) Use `useReviewStore.setSelectedFinding(id)` in store → FindingList watches `selectedId` and syncs `activeFindingId` to it
    - **RECOMMENDED: Option (c)** — `setSelectedFinding(findingId)` → FindingList already watches `selectedId` for detail panel sync. Add a `useEffect` in FindingList that syncs `activeFindingId` when `selectedId` changes externally (from click-to-navigate). **CRITICAL: guard against circular sync** — FindingList's keyboard/click handlers set BOTH `activeFindingId` AND `setSelectedFinding(id)`. The new useEffect MUST guard: `if (selectedId !== null && selectedId !== activeFindingId) { setActiveFindingId(selectedId) }`. Without this guard, user click → setSelectedFinding → useEffect → setActiveFindingId → redundant re-render loop. Also beware interaction with the existing "adjust state during render" pattern at lines 136-148 of FindingList
  - Verify: clicking a context segment → finding list scrolls to and focuses the target finding → detail panel updates to new finding
- [x] 7.3 Unit tests:
  - Clicking context segment with findings triggers onNavigateToFinding
  - Clicking context segment without findings does nothing
  - Navigation updates store selectedId
  - FindingList syncs activeFindingId from store selectedId

### Task 8: Integration with ReviewPageClient (AC: 1, 5)
- [x] 8.1 Update ReviewPageClient to pass additional props to FindingDetailSheet:
  - `finding`: look up from sorted findings using `selectedId`
  - `sourceLang`: from `FileReviewData`
  - `targetLang`: from `FileReviewData`
  - `fileId`: from `FileReviewData`
  - `onNavigateToFinding`: callback from Task 7
- [x] 8.2 Update FindingDetailSheet import and wire all new content:
  - Metadata section (Task 3)
  - Segment text display with highlights (Task 4)
  - Context segment list (Task 5)
  - Context range selector (Task 6)
  - Navigation callback (Task 7)
- [x] 8.3 Ensure `prefers-reduced-motion` is respected on all new content (Guardrail #37):
  - No slide/fade animations on context loading
  - Skeleton animation disabled if reduced motion
- [x] 8.4 Add `aria-live="polite"` announcement when detail panel content changes (Guardrail #33):
  - When a new finding is focused and detail panel updates, announce: "Finding details: [severity] [category]"
  - Use existing `announce()` from `features/review/utils/announce.ts`
  - Do NOT announce on initial mount (only on finding change)

### Task 9: E2E Test — Detail Panel Content (AC: all)
- [x] 9.1 Add E2E tests in `e2e/review-detail-panel.spec.ts` (new file):
  - **Setup:** Same as review E2E — seed project with file + findings + segments
  - **E1 (P0):** Focus a finding via keyboard → detail panel shows finding metadata (severity, category, layer, description)
  - **E2 (P0):** Detail panel shows full segment text (not truncated) with source and target
  - **E3 (P1):** Context segments (±2) are visible around the finding's segment
  - **E4 (P1):** Clicking a context segment that has findings navigates to that finding
  - **E5 (P2):** Context range selector changes number of context segments displayed
  - **E6 (P1):** CJK/Thai text has `lang` attribute on text elements
  - **E7 (P1):** Radix Sheet focus trap: click finding → Sheet opens + focus inside → press Esc → focus restores to grid row (verify no conflict between Sheet focus trap and grid roving tabindex)
- [x] 9.2 Use E2E patterns from `e2e-testing-gotchas.md`:
  - Wait for `data-keyboard-ready` signal before keyboard interaction
  - Use `page.keyboard.press('j')` for navigation
  - **Wait for segment context to load:** `await page.waitForSelector('[data-testid="segment-context-loaded"]', { timeout: 5000 })` — because useSegmentContext has async fetch + debounce, do NOT assert context content until this attribute is present
  - Wait for detail panel content to appear: `page.getByTestId('finding-detail-sheet').getByText(...)`

### Task 10: Integration Verification
- [x] 10.1 Verify all existing unit tests pass: `npm run test:unit`
- [x] 10.2 Verify type-check passes: `npm run type-check`
- [x] 10.3 Verify lint passes: `npm run lint`
- [x] 10.4 Verify build succeeds: `npm run build`
- [x] 10.5 Verify E2E tests pass: `npx playwright test e2e/review-detail-panel.spec.ts e2e/review-keyboard.spec.ts e2e/review-findings.spec.ts`
- [x] 10.6 Manual verification:
  - Open review page with findings → focus finding → see detail panel content
  - Verify segment context loads (±2 segments)
  - Change context range → verify segment count changes
  - Click context segment with findings → verify navigation works

## Dev Notes

### Code Reality Warnings (from validation — read BEFORE coding)

1. **FindingDetailSheet is a SHELL with placeholder text** — `src/features/review/components/FindingDetailSheet.tsx` (57 lines). Current props: `{ open, onOpenChange, findingId }`. It already has: Radix Sheet with `side="right"`, `role="complementary"`, `aria-label`, `prefers-reduced-motion` support. Replace the placeholder `<p>` with real content — do NOT delete the shell structure
2. **`selectedId` in Zustand store drives the Sheet open state** — `ReviewPageClient.tsx` reads `selectedId` from store and passes `open={selectedId !== null}` to FindingDetailSheet. When a finding row is clicked/focused (4.1b), `setSelectedFinding(id)` is called
3. **`activeFindingId` is LOCAL state in FindingList, NOT in store** — The keyboard-focused finding ID lives in `FindingList.tsx` as `[activeFindingId, setActiveFindingId]`. For click-to-navigate (AC5), you need to sync store `selectedId` → FindingList `activeFindingId`. Add a `useEffect` watching `selectedId` from store — when it changes externally, update `activeFindingId` and `activeIndex`
4. **Findings have `segmentId: string` (nullable)** — `getFileReviewData` returns findings with `segmentId`. Cross-file findings have `segmentId === null`. The DB column is nullable (`uuid('segment_id').references(...)` without `.notNull()`). Always guard for null
5. **`sourceLang`/`targetLang` are on SEGMENTS table, NOT findings** — Findings only have `sourceTextExcerpt`/`targetTextExcerpt` (truncated strings). Language codes come from segments. `FileReviewData` also has `sourceLang` and `targetLang` (from project/language pair config) — use these as fallback when segment-level data is not available
6. **`FindingForDisplay` type is MISSING `segmentId`** — The `types.ts` `FindingForDisplay` does NOT have `segmentId`. But `getFileReviewData` returns `segmentId` in each finding. ReviewPageClient maps to `FindingForDisplay` (dropping `segmentId`). Either: (a) add `segmentId` to `FindingForDisplay`, or (b) look up from the raw findings data. **RECOMMENDED: (a) — add `segmentId: string | null` to `FindingForDisplay`** since the detail panel needs it
7. **`sourceTextExcerpt`/`targetTextExcerpt` are truncated to 500 chars** — For display in the compact list. The full text lives in `segments.sourceText`/`segments.targetText`. The detail panel MUST fetch full text from segments — do NOT use excerpts as the full display text
8. **Segments have `segmentNumber` (1-indexed integer)** — Used for ordering context segments. Query: `WHERE fileId = x AND segmentNumber BETWEEN (n-range) AND (n+range)` — more efficient than separate before/after queries
9. **Store `findingsMap` uses `Finding` type from `@/types/finding`** — NOT `FindingForDisplay`. The mapping happens in ReviewPageClient when converting store data to display data. The detail panel should work with `FindingForDisplay` (UI shape) + segment context (from server action)
10. **`inArray(col, [])` = invalid SQL** — When fetching findings for context segments, always guard `if (segmentIds.length === 0) return` before `inArray()` call (Guardrail #5)
11. **No Zustand God Store for segment context** — Segment context data is transient (changes per finding focus). Use a local hook (`useSegmentContext`) inside FindingDetailSheet, NOT a new store slice. Cache in a ref-based Map for performance

### Validation Gotcha Warnings (from quality review — read BEFORE coding)

12. **Radix Sheet portal may break CSS inheritance** — FindingDetailSheet renders in a Radix portal. Tailwind tokens (CSS custom properties) work globally, but test with tinted finding states (accepted=green, flagged=yellow) to confirm state backgrounds render inside the portal. If not → use Tailwind classes exclusively, no inline styles
13. **Prop sync anti-pattern risk (Guardrail #24)** — 5 new props flow ReviewPageClient → FindingDetailSheet. If any prop is used to initialize `useState`, React 19 "adjust state during render" can overwrite state when RSC cache revalidates. Use `useEffect` to sync prop changes to state, NEVER `if (prop !== prevProp) setState(prop)` during render
14. **`useSegmentContext` must NOT call action when segmentId is null** — Cross-file findings. The hook must early-return before the fetch useEffect. Do not let the action return NOT_FOUND — that would flash an error state in the UI before showing the "Cross-file finding" message
15. **Context segments use per-segment language, NOT parent language** — Each `SegmentForContext` has its own `sourceLang`/`targetLang`. SegmentContextList must use `segment.sourceLang` on each row, not a shared prop. This supports files with mixed language segments
16. **Cache becomes stale after finding mutations** — `useSegmentContext` cache stores `findingsBySegmentId`. After Story 4.2 wires accept/reject actions, cached results will show stale "has findings" indicators. Story 4.2 MUST clear the segment context cache when a finding mutation succeeds (add `clearSegmentCache()` export to hook, or invalidate on `findingsMap` change)
17. **E2E seed must include segments** — Existing review E2E tests seed findings but may not seed the `segments` table. `getSegmentContext` needs real segments with consecutive `segmentNumber` values (1,2,3,...), `sourceText`, `targetText`, `sourceLang`, `targetLang`. Seed at least 5 segments per file with realistic text. Create a factory helper `createSegmentSeed()` in `e2e/helpers/`. **CRITICAL:** finding.sourceTextExcerpt MUST be a real substring of segment.sourceText — otherwise highlight tests pass vacuously. Also seed findings on at least 2 different segments so E4 click-to-navigate has clickable targets
18. **E2E locators: use global, not scoped inside Sheet** — Radix Sheet renders in a portal at `document.body` level. `page.getByTestId('finding-detail-sheet').getByText(...)` will MISS portal content. Use `page.locator('[role="complementary"]')` or global `page.getByTestId('segment-context-loaded')` instead. Always test E2E locators against portal rendering

### Existing Infrastructure (DO NOT rebuild)

| Component/Hook | Status | Location | Notes for 4.1c |
|---------------|--------|----------|----------------|
| FindingDetailSheet | EXISTS (shell) | `features/review/components/FindingDetailSheet.tsx` | MODIFY — replace placeholder with real content |
| ReviewPageClient | EXISTS | `features/review/components/ReviewPageClient.tsx` | MODIFY — pass additional props to FindingDetailSheet |
| FindingList | EXISTS | `features/review/components/FindingList.tsx` | MODIFY — add useEffect to sync activeFindingId from store selectedId |
| review.store.ts | EXISTS | `features/review/stores/review.store.ts` | READ ONLY — use `selectedId`, `setSelectedFinding`, `findingsMap` |
| getFileReviewData | EXISTS | `features/review/actions/getFileReviewData.action.ts` | READ ONLY — already returns segmentId + sourceLang/targetLang |
| FindingForDisplay | EXISTS | `features/review/types.ts` | MODIFY — add `segmentId: string \| null` field |
| SeverityIndicator | EXISTS | `features/review/components/SeverityIndicator.tsx` | REUSE — for severity badge in detail panel |
| LayerBadge | EXISTS | `features/review/components/LayerBadge.tsx` | REUSE — for layer badge in detail panel |
| ConfidenceBadge | EXISTS | `features/review/components/ConfidenceBadge.tsx` | REUSE — for confidence display |
| useReducedMotion | EXISTS | `src/hooks/useReducedMotion.ts` | REUSE — for animation control |
| announce.ts | EXISTS | `features/review/utils/announce.ts` | REUSE if needed for announcements |
| finding-display.ts | EXISTS | `features/review/utils/finding-display.ts` | REUSE — contains `isCjkLang()`, `stripL3Markers()` utilities |
| Skeleton | EXISTS | `components/ui/skeleton.tsx` | REUSE — for loading state |

### Key Design Decisions

1. **Segment context fetched on-demand, not upfront** — `getFileReviewData` fetches ALL findings for a file, but NOT segment text. Adding full segment text for every finding would be wasteful (findings may reference the same segment, and most won't be focused). Instead, fetch segment context lazily when a finding is focused, with 150ms debounce to handle rapid J/K navigation.

2. **Cache segment context in hook ref, not Zustand** — The `useSegmentContext` hook maintains a `Map<string, SegmentContextData>` ref internally. This prevents redundant fetches when the reviewer navigates back to a previously viewed finding. Cache is cleared on file change. This is ephemeral data — no reason to persist in Zustand (which would bloat the store and require reset logic).

3. **Click-to-navigate via store `selectedId` sync** — When clicking a context segment to navigate to its finding: (1) call `setSelectedFinding(findingId)` on the store, (2) FindingList has a `useEffect` watching store `selectedId` that syncs `activeFindingId` + scrolls to the finding. This reuses the existing selection mechanism without lifting FindingList's local state.

4. **Highlight via substring search, not offset tracking** — We don't have character offsets stored in findings. The `sourceTextExcerpt` / `targetTextExcerpt` are substrings of the full segment text. A simple `indexOf` search finds the excerpt within the full text for `<mark>` wrapping. Fallback: case-insensitive search. Ultimate fallback: no highlight (full text displayed).

5. **`FindingForDisplay` extended with `segmentId`** — Rather than creating a parallel type, add `segmentId: string | null` to the existing `FindingForDisplay` type. This propagates naturally through FindingCard, FindingCardCompact, and FindingDetailSheet. The mapping in ReviewPageClient already has access to `segmentId` from the server action response.

6. **Context range as local state, not user preference** — The context range selector (1/2/3) is stored as `useState(2)` inside FindingDetailSheet. It resets on page reload. This is intentional — there's no compelling UX reason to persist this preference across sessions. If needed later, it can be moved to localStorage or user preferences.

7. **SegmentTextDisplay as a reusable component** — The highlight + language support logic is encapsulated in `SegmentTextDisplay.tsx` so it can be reused in: (a) the current segment in the detail panel, (b) context segments (without highlight), (c) future features like search result highlighting (Story 4.5).

8. **Action buttons disabled placeholder** — The detail panel shows disabled Accept/Reject/Flag buttons to give the reviewer a preview of the action bar layout. These are wired in Story 4.2. This prevents the jarring UX of an action bar appearing in a future story where it wasn't visible before.

9. **2-column layout for segments** — Source text (left) | Target text (right). At current fixed-width detail panel (400px from 4.0 shell), each column gets ~185px (after padding). This is tight for long CJK text — add `overflow-wrap: break-word` and `word-break: break-all` for CJK to prevent horizontal overflow. Add `min-w-0` on each column to prevent flexbox overflow. If panel width < 320px, collapse to single-column stack (`grid-cols-1`) with source above target — implement within 4.1c scope as a simple `@container` or media query. Full responsive behavior is Story 4.1d scope.

### Guardrails Applicable to This Story

| # | Guardrail | Task |
|---|-----------|------|
| #1 | withTenant() on EVERY query | Task 1 (all 3 DB queries in getSegmentContext) |
| #5 | inArray(col, []) = invalid SQL | Task 1.4 (findingsBySegmentId query) |
| #25 | Color never sole information carrier | AC1, Task 3 (severity uses icon+text+color) |
| #26 | Contrast ratio verification | AC6 (4.5:1 normal, 3:1 large) |
| #36 | Severity display: icon shape + text + color | AC1, Task 3 (severity badge in detail panel) |
| #37 | prefers-reduced-motion: ALL animations | AC6, Task 5.4 (skeleton loading, context transitions) |
| #38 | ARIA landmarks on review layout | AC1 (role="complementary" already on Sheet) |
| #39 | lang attribute on segment text | AC6 (MANDATORY — all source/target text elements) |
| #40 | No focus stealing on mount | N/A — Sheet focus trap is managed by Radix (expected behavior) |

### Finding Data Flow

```
FindingDetailSheet
├── Props: { open, onOpenChange, findingId, finding, sourceLang, targetLang, fileId, onNavigateToFinding }
│         (sourceLang/targetLang = project-level for UI labels like "Source (EN)". Segment text uses per-segment lang from SegmentForContext)
├── State: contextRange (useState, default 2)
├── Hook: useSegmentContext({ fileId, segmentId: finding?.segmentId, contextRange })
│
├── [Section 1: Finding Metadata] — from `finding` prop
│   ├── Status badge
│   ├── Severity badge (reuse SeverityIndicator)
│   ├── Category + Layer badge + Confidence
│   └── Description + Suggestion
│
├── [Section 2: Context Range Selector] — [1] [2] [3] buttons
│
├── [Section 3: Segment Context]
│   ├── Loading: Skeleton rows
│   ├── Cross-file: "No segment context" message
│   └── Normal: SegmentContextList
│       ├── contextBefore segments (muted, read-only)
│       ├── currentSegment (highlighted, with SegmentTextDisplay)
│       └── contextAfter segments (muted, read-only)
│
└── [Section 4: Action Bar Placeholder] — disabled buttons
```

### Project Structure Notes

New files:
```
src/features/review/actions/getSegmentContext.action.ts     <- NEW (server action)
src/features/review/actions/getSegmentContext.action.test.ts <- NEW (unit tests)
src/features/review/hooks/use-segment-context.ts            <- NEW (fetch hook with cache)
src/features/review/hooks/use-segment-context.test.ts       <- NEW (unit tests)
src/features/review/components/SegmentTextDisplay.tsx        <- NEW (text + highlight + lang)
src/features/review/components/SegmentTextDisplay.test.tsx   <- NEW (unit tests)
src/features/review/components/SegmentContextList.tsx        <- NEW (context segment list)
src/features/review/components/SegmentContextList.test.tsx   <- NEW (unit tests)
src/features/review/components/FindingDetailSheet.test.tsx   <- NEW (integration tests)
e2e/review-detail-panel.spec.ts                             <- NEW (E2E tests)
```

Modified files:
```
src/features/review/components/FindingDetailSheet.tsx        <- MODIFIED (replace placeholder with real content)
src/features/review/components/ReviewPageClient.tsx          <- MODIFIED (pass new props to FindingDetailSheet)
src/features/review/components/FindingList.tsx               <- MODIFIED (sync activeFindingId from store selectedId)
src/features/review/types.ts                                 <- MODIFIED (add segmentId to FindingForDisplay)
```

No new dependencies. No DB schema changes. No new routes.

### Previous Story Intelligence (Stories 4.0, 4.1a, 4.1b)

- **CR rounds:** 4.0 = 2 rounds, 4.1a = 2 rounds, 4.1b = 2 rounds (avg 2.0 — on target)
- **Key learnings from 4.1b:**
  - `activeFindingId` is FindingList LOCAL state — not in Zustand. For click-to-navigate, sync via store `selectedId` useEffect
  - `expandedIds` is owned by ReviewPageClient (passed as prop with `onToggleExpand` callback)
  - Mouse click → activeFindingId sync was a CR finding (M2 in R1) — already fixed. Same pattern needed for click-to-navigate
  - Per-row Enter/Esc handlers are KEPT from 4.1a — don't remove them
  - `data-finding-id` attribute is on every FindingCardCompact row — available for querySelector
  - `data-keyboard-ready` signal is set after keyboard handlers register — E2E tests must wait for it
- **Key learnings from 4.1a:**
  - FindingForDisplay maps from server action data in ReviewPageClient — mapping drops fields not in the type. Adding `segmentId` to the type means updating the mapping too
  - `isCjkLang()` utility already exists in `finding-display.ts` — REUSE for CJK font scale logic
  - SeverityIndicator, LayerBadge, ConfidenceBadge components already exist — REUSE in detail panel
- **Key learnings from 4.0:**
  - FindingDetailSheet is a minimal shell — intentionally left for 4.1c to populate
  - Review page has `sourceLang`/`targetLang` available from `FileReviewData` — pass to detail panel
  - Radix Sheet provides focus trap + Esc-to-close + focus restore — do NOT reimplement

### Git Intelligence (last 5 commits)

```
a6de5ba fix(e2e): add onKeyDown to grid div for reliable keyboard nav in CI
932c086 fix(e2e): use data-keyboard-ready signal for reliable hydration wait
5d20c16 fix(e2e): add missing review-count-track testid + stabilize keyboard E1
a323f43 fix(review): Story 4.1b CR R2 — 6 fixes (1H+2M+3L) all tests green
0d81c2c fix(review): Story 4.1b CR R1 — 9 fixes (3H+4M+2L) all tests green
```

Pattern: Conventional Commits with `fix(scope)` / `feat(scope)`. E2E fixes dominate recent history — expect E2E-specific fixes for detail panel tests.

### Cross-Story Dependencies

| Depends on | Status | What 4.1c uses |
|------------|--------|----------------|
| Story 4.0 (Review Infrastructure) | `done` | FindingDetailSheet shell, ARIA foundation, review.store.ts |
| Story 4.1a (Finding List Display) | `done` | FindingCard, FindingCardCompact, FindingForDisplay type, severity/layer/confidence badges |
| Story 4.1b (Keyboard Navigation) | `done` | activeFindingId local state, flattenedIds, J/K navigation, focus management |

| Produces for | What is produced |
|-------------|------------------|
| Story 4.1d (Responsive Layout) | Detail panel content for responsive breakpoint behavior |
| Story 4.2 (Core Actions) | Action button bar in detail panel (wiring the disabled buttons) |
| Story 4.3 (Extended Actions) | Detail panel as host for severity override UI + note input |
| Story 4.7 (Add to Glossary) | Detail panel as host for "Add to Glossary" button on terminology findings |

### Scope Boundaries (What 4.1c does NOT do)

- **NO review actions** — Accept/Reject/Flag buttons are disabled placeholders (Story 4.2)
- **NO responsive layout changes** — Detail panel width/behavior at different breakpoints (Story 4.1d)
- **NO "Add to Glossary" button** — Glossary integration (Story 4.7)
- **NO severity override UI** — Extended actions (Story 4.3)
- **NO filter bar integration** — Search/filter (Story 4.5)
- **NO Realtime updates for segment text** — Segment text is static (only changes on re-parse). Findings Realtime already handled (4.1a)

### Architecture Assumption Checklist Sign-off

```
Story: 4.1c — Detail Panel & Segment Context
Date:  2026-03-10
Reviewed by: Bob (SM)

Sections passed:  [x] 1  [x] 2  [x] 3  [x] 4  [x] 5  [x] 6  [x] 7  [x] 8  [x] 9
Issues found: None — read-only display + 1 new server action, no schema changes
AC revised: [ ] No — AC LOCKED
```

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md` — Story 4.1c AC + dependency table]
- [Source: `_bmad-output/implementation-artifacts/4-1b-keyboard-navigation-focus-management.md` — Previous story intelligence, activeFindingId patterns]
- [Source: `_bmad-output/implementation-artifacts/4-1a-finding-list-display-progressive-disclosure.md` — FindingForDisplay type, badge components, CJK utilities]
- [Source: `_bmad-output/implementation-artifacts/4-0-review-infrastructure-setup.md` — FindingDetailSheet shell, review.store.ts, ARIA foundation]
- [Source: `_bmad-output/planning-artifacts/research/epic-4-proactive-guardrails-2026-03-08.md` — Guardrails #25-40]
- [Source: `_bmad-output/accessibility-baseline-2026-03-08.md` — Issue #27-28 (lang attributes), #1 (color-only severity)]
- [Source: `_bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md` — Focus management patterns]
- [Source: `_bmad-output/project-context.md` — Tech stack, language rules, server action patterns]
- [Source: `src/db/schema/segments.ts` — Segments table schema]
- [Source: `src/db/schema/findings.ts` — Findings table schema (segmentId nullable)]
- [Source: `src/features/review/components/FindingDetailSheet.tsx` — Current shell implementation]
- [Source: `src/features/review/actions/getFileReviewData.action.ts` — FileReviewData type + segmentId availability]
- [Source: `src/features/review/stores/review.store.ts` — selectedId, findingsMap, setSelectedFinding]

## Pre-CR Quality Scan Results (2026-03-13)

### Agents Run
1. **tenant-isolation-checker** — PASS (0 findings)
2. **anti-pattern-detector** — 4 findings (all fixed)
3. **code-quality-analyzer** — 9 findings (all fixed)

### Fixes Applied

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **Critical** | pino logger imported in `'use client'` file (`use-segment-context.ts`) | Removed import — pino is Node.js only |
| 2 | **High** | `StatusBadge` uses bare `string` instead of `FindingStatus` (Guardrail #3) | Changed to `FindingStatus` type import |
| 3 | **High** | Missing `aria-label` on clickable context segment rows | Added `aria-label="Navigate to finding in segment N"` |
| 4 | **Medium** | `text-[110%]` instead of `text-cjk-scale` CSS class | Replaced with `.text-cjk-scale` from globals.css |
| 5 | **Medium** | Unused imports `gt`, `lt` in getSegmentContext.action.ts | Removed |
| 6 | **Medium** | Missing `fileId` filter on Query 1 (defense-in-depth, Guardrail #14) | Added `eq(segments.fileId, fileId)` |
| 7 | **Medium** | Inline noop `() => {}` for onNavigateToFinding | Replaced with stable `noop` function |
| 8 | **Low** | Inline `bg-amber-200 dark:bg-amber-700/50` on `<mark>` | Added `--color-highlight` token + `.highlight-mark` CSS class |

### Test Results After All Fixes
- **Unit tests:** 68/68 pass (5 test files)
- **Type check:** Clean (0 errors)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- All 11 tasks (0-10) completed
- All 75 ATDD test stubs activated → 68 unit + 7 E2E scenarios
- Pre-CR quality scan: 3 agents, 13 findings total, ALL fixed
- Story ready for Code Review (fresh context / different LLM recommended per BMAD workflow)

### File List

**New files:**
- `src/features/review/actions/getSegmentContext.action.ts` — Server action with 3 Drizzle queries
- `src/features/review/actions/getSegmentContext.action.test.ts` — Unit tests
- `src/features/review/hooks/use-segment-context.ts` — Fetch hook with debounce + cache + abort
- `src/features/review/hooks/use-segment-context.test.ts` — 12 tests (real timers)
- `src/features/review/components/SegmentTextDisplay.tsx` — Text + highlight + lang attr
- `src/features/review/components/SegmentTextDisplay.test.tsx` — 17 tests
- `src/features/review/components/SegmentContextList.tsx` — Context segment list + skeleton + error + cross-file
- `src/features/review/components/SegmentContextList.test.tsx` — 12 tests
- `src/features/review/components/FindingDetailSheet.test.tsx` — 12 integration tests
- `src/features/review/components/FindingList.sync.test.tsx` — 4 store sync tests
- `e2e/review-detail-panel.spec.ts` — 7 E2E scenarios

**Modified files:**
- `src/features/review/components/FindingDetailSheet.tsx` — Full content (was shell)
- `src/features/review/components/ReviewPageClient.tsx` — New props to FindingDetailSheet
- `src/features/review/components/FindingList.tsx` — Store sync useEffect
- `src/features/review/types.ts` — Added `segmentId: string | null`
- `src/test/factories.ts` — Added `segmentId` to `buildFindingForUI`
- `src/styles/tokens.css` — Added `--color-highlight` token
- `src/app/globals.css` — Added `.highlight-mark` CSS class
