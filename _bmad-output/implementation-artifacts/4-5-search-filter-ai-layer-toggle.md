# Story 4.5: Search, Filter & AI Layer Toggle

Status: done

## Story

As a **QA Reviewer**,
I want to **search and filter findings by severity, type, status, category, confidence, and keyword, toggle AI suggestions on/off, and use a command palette for quick navigation**,
so that **I can efficiently focus on specific finding subsets during review and control AI layer visibility without reprocessing**.

## Acceptance Criteria

### Filter Bar (FR34)

1. **AC1 — Filter bar renders above finding list** with filter dimensions: Severity (All/Critical/Major/Minor), Layer (All/Rule-based/AI), Status (All/Pending/Accepted/Rejected/Flagged), Category (dynamic from findings data), Confidence (All/High >85%/Medium 70–85%/Low <70%). Default: Status = Pending.
2. **AC2 — AND-logic client-side filtering** via Zustand store. Active filters shown as removable badge chips with [X]. "Showing X of Y findings" count updates instantly. "Clear all" link visible when any filter is active.
3. **AC3 — Filter state persists per file within session.** Switching files saves current filter state; returning restores it. File switch resets to default only if never visited before.

### Keyword Search (FR34)

4. **AC4 — Keyword search input** in filter bar searches across: source text, target text, description, suggestion. Highlights matching text in FindingCardCompact results. Supports Thai/CJK text (uses `String.prototype.includes()` for case-insensitive matching with `toLocaleLowerCase()`).
5. **AC5 — Debounced search** (300ms) to prevent excessive re-renders. Empty search = show all (within active filters).

### Command Palette (Ctrl+K)

6. **AC6 — Command palette dialog** opens on Ctrl+K. 3-tier scope: `>` (actions), `#` (findings), `@` (files). Default = all tiers. Selecting a finding navigates to and focuses it in the list. Selecting a file navigates to that file's review page. Selecting an action executes it.
7. **AC7 — Finding search in palette** shows: severity icon, category, source→target preview (truncated 60 chars), confidence %. Fuzzy-match on description + source + target text.

### AI Layer Toggle (FR31)

8. **AC8 — "AI Suggestions" toggle switch** in review header area (separate from Layer filter). When OFF: all L2/L3 findings hidden from list + "AI findings hidden" indicator shown beside score badge (score number remains server-calculated, unchanged). When ON: L2/L3 re-appear with cached results (no re-run). Toggle state saved per file within session (same mechanism as filter persistence). Toggle is display-only — does NOT trigger server-side score recalculation.

### Accessibility & Keyboard

9. **AC9 — Filter bar keyboard accessible.** `role="toolbar"` + `aria-label="Filter findings"`. Tab navigates filter buttons, Enter/Space toggles. Each filter button: `aria-label="{value} {dimension} filter, {N} of {total} findings match"` (e.g., "Critical severity filter, 5 of 28 findings match"). Active filter badge: `aria-label="Remove [filter name] filter"`. Screen reader: `aria-live="polite"` region announces "Showing X of Y findings" on filter change.
10. **AC10 — Command palette accessible.** Focus trap inside dialog. Esc closes. `aria-modal="true"`. Input auto-focused on open. Arrow keys navigate results. Enter selects.

## Scope Table

| Feature | In Scope | Out of Scope |
|---------|----------|-------------|
| Filter bar (5 dimensions) | Yes | Segment range filter (FR34 partial — defer to Epic 5) |
| Keyword search | Yes | Regex search, advanced query syntax |
| Filter badge chips | Yes | Drag-to-reorder chips |
| Command palette (Ctrl+K) | Yes | Server-side search, recent commands history |
| AI toggle (L1-only mode) | Yes | Re-run pipeline on toggle, persisting toggle across sessions |
| Per-file filter state | Yes | Cross-session persistence (localStorage/DB) |
| "Showing X of Y" count | Yes | — |
| Filter interaction with bulk select | Yes (Ctrl+A selects filtered) | — |

## Tasks / Subtasks

### Task 1: Extend FilterState in Zustand store (AC: #1, #2, #3, #8)

- [x] 1.1 Extend `FilterState` type in `review.store.ts`: add `category: string | null`, `confidence: 'high' | 'medium' | 'low' | null`, `searchQuery: string`
- [x] 1.2 Add `aiSuggestionsEnabled: boolean` to findings slice (default `true`)
- [x] 1.3 Add `setAiSuggestionsEnabled: (enabled: boolean) => void` action
- [x] 1.4 Add `perFileFilterCache: Map<string, { filterState: FilterState; aiSuggestionsEnabled: boolean }>` to store
- [x] 1.5 Update `resetForFile(fileId)`: save current filter state to cache before reset, restore from cache if visited before, otherwise set defaults (status='pending', all others null, searchQuery='', aiEnabled=true)
- [x] 1.6 Update `selectAllFiltered()` to include `category`, `confidence`, `searchQuery`, and `aiSuggestionsEnabled` checks
- [x] 1.7 Add `setSearchQuery: (query: string) => void` action
- [x] 1.8 **Update existing `FindingList.filterReset.test.tsx`** — current tests assert filter RESETS on file switch; must update to assert filter PERSISTS per file (AC3). Tests to update: `[P1] filter state resets when resetForFile called`, `[P1] layer filter cleared on file switch`
- [x] 1.9 Add `clearSelectionOnFilterChange` effect: when `filterState`, `searchQuery`, or `aiSuggestionsEnabled` changes, intersect `selectedIds` with currently visible finding IDs — remove any selected IDs no longer visible; if selection becomes empty, exit bulk mode (`selectionMode: 'single'`)
- [x] 1.10 Add `resetSelectedOnFilterChange` logic: when filter changes cause active `selectedId` to become invisible (not in filtered findings), reset `selectedId` to the first filtered finding, or `null` if no results. Use `requestAnimationFrame` to avoid sync focus issues
- [x] 1.11 Unit tests for all new store actions + filter cache + selectAllFiltered with new dimensions + selection clearing on filter change

### Task 2: Create FilterBar component (AC: #1, #2, #9)

- [x] 2.1 Create `src/features/review/components/FilterBar.tsx` — `role="toolbar"` + `aria-label="Filter findings"`
- [x] 2.2 Render filter button groups: Severity (4 options), Layer (3 options), Status (5 options), Category (dynamic), Confidence (4 options) — each as toggle buttons with active state (bg color + border). Each button: `aria-label="{value} {dimension} filter, {N} of {total} findings match"` — compute per-option match counts in single pass via `useMemo`
- [x] 2.3 Category options: derive dynamically from `findingsForDisplay` — extract unique categories, sort alphabetically, add "All" at top
- [x] 2.4 Active filter badge chips row: show selected filters as `Badge` components with X button. "Clear all" link when any filter active
- [x] 2.5 "Showing X of Y findings" count label with `aria-live="polite"` container (mount container first, update text second — Guardrail #33)
- [x] 2.6 Empty filter state: when `filteredFindings.length === 0`, render "No findings match your filters" + filter icon + "[Clear Filters]" link calling `clearAllFilters()`
- [x] 2.7 Unit tests: render, toggle, badge display, clear all, empty state, keyboard nav, aria attributes (including per-button match counts)

### Task 3: Create SearchInput component (AC: #4, #5)

- [x] 3.1 Create `src/features/review/components/SearchInput.tsx` — `Input` with search icon, clear button, placeholder "Search findings..."
- [x] 3.2 Debounce 300ms via `useRef` + `setTimeout` pattern (no external lib)
- [x] 3.3 Call `setSearchQuery(query)` on store after debounce
- [x] 3.4 Escape key when SearchInput focused clears query (innermost Esc layer per Guardrail #31 — does NOT propagate to close panels)
- [x] 3.5 Single-key hotkeys suppressed when search input focused (already handled by Guardrail #28 check in `useKeyboardActions`)
- [x] 3.6 Unit tests: debounce timing, clear button, Escape clear, store integration

### Task 4: Implement client-side filtering in ReviewPageClient (AC: #2, #4, #8)

- [x] 4.1 Add `filteredFindings` useMemo between `findingsForDisplay` and FindingList — apply filterState + searchQuery + aiSuggestionsEnabled
- [x] 4.2 Filter logic: `severity` → exact match, `status` → exact match, `layer` → map 'Rule-based'→'L1', 'AI'→['L2','L3','Manual' excluded for AI filter — actually 'L2'|'L3'], `category` → exact match, `confidence` → thresholds (high: >85, medium: 70–85, low: <70, null=excluded for confidence filter)
- [x] 4.3 AI toggle filter: if `!aiSuggestionsEnabled`, exclude findings where `detectedByLayer` is 'L2' or 'L3'
- [x] 4.4 Search filter: `toLocaleLowerCase()` on query, match against `sourceTextExcerpt`, `targetTextExcerpt`, `description`, `suggestedFix` (all nullable — guard with `?? ''`)
- [x] 4.5 Pass `filteredFindings` to `<FindingList>` instead of `findingsForDisplay`
- [x] 4.6 Update `totalCount` in ReviewProgress to show `allFindings.length` (total), update `findingCountSummary` to show filtered vs total
- [x] 4.7 Render `<FilterBar>` and `<SearchInput>` between ReviewProgress and finding list
- [x] 4.8 Unit tests for filtering logic (each dimension + AND combination + search + AI toggle)

### Task 5: AI Layer Toggle UI (AC: #8)

- [x] 5.1 Add toggle switch in review header area (below ModeBadge or in FilterBar) — label "AI Suggestions" with shadcn switch or custom toggle button
- [x] 5.2 When toggled OFF: visual indicator "AI suggestions: OFF", muted styling
- [x] 5.3 Score display: AI toggle is display-only — score badge number remains the server-calculated value (unchanged). When toggle OFF, show a visual indicator beside score badge: "AI findings hidden" text in muted style. Do NOT attempt client-side MQM score recalculation (requires word counts not available in client). ScoreBadge `badgeState` also unchanged — it reflects server-computed `layerCompleted`, not the client-side filter view
- [x] 5.4 `aria-label="Toggle AI suggestions, currently [on/off]"` on toggle control
- [x] 5.5 Unit tests for toggle state, filter effect, aria label

### Task 6: Install cmdk + Create CommandPalette component (AC: #6, #7, #10)

- [x] 6.1 Install `cmdk` package — verify React 19 peer dependency compatibility first. If `cmdk@latest` requires React 18, use `cmdk@next` (v2 RC) or build minimal palette without cmdk. Document the decision
- [x] 6.2 Generate shadcn command component: create `src/components/ui/command.tsx` (cmdk-based)
- [x] 6.3 Create `src/features/review/components/CommandPalette.tsx` using `Command` dialog pattern
- [x] 6.4 Scope prefix parsing: `>` filters to actions group, `#` filters to findings group, `@` filters to files group
- [x] 6.5 Findings group: show top 20 matching findings (severity icon via SeverityIndicator, category, truncated source→target, confidence) with "Show more..." if >20 results. On select → `setSelectedFinding(id)` + scroll into view
- [x] 6.6 Files group: list sibling files in current review session. On select → `router.push()` to file's review page
- [x] 6.7 Actions group: list available actions (Accept, Reject, Flag, Note, Source Issue, **Clear All Filters**, Toggle AI Suggestions, etc.). On select → execute action on active finding or global action
- [x] 6.8 Register Ctrl+K in `useKeyboardActions` — opens CommandPalette, suppresses browser default
- [x] 6.9 Focus trap + Esc closes + `aria-modal="true"` (Guardrail #30)
- [x] 6.10 Unit tests for palette open/close, scope filtering, finding navigation, action execution

### Task 7: Search highlight in FindingCardCompact (AC: #4)

- [x] 7.1 Add `searchQuery` prop to `FindingCardCompact`
- [x] 7.2 Highlight matching text using `<mark>` element (accessible — no color-only indicator). Use `String.prototype.indexOf()` for splitting text (NOT regex) to avoid escaping issues with special characters `(`, `[`, `*`, etc.
- [x] 7.3 Highlight in: source→target preview text, description text
- [x] 7.4 Wrap `FindingCardCompact` in `React.memo` — `searchQuery` changes trigger re-render across all cards; memo prevents unnecessary re-renders when only other props change
- [x] 7.5 Unit tests for highlight rendering, no highlight when empty query, special characters in query

### Task 8: Integration & E2E (AC: all)

- [x] 8.1 Wire all components in ReviewPageClient: FilterBar → SearchInput → FindingList → CommandPalette
- [x] 8.2 Verify keyboard flow: Tab through filter bar → Enter toggle → Tab to search → type query → Tab to finding list → J/K navigate filtered results
- [x] 8.3 Verify AI toggle: toggle OFF → L2/L3 hidden, count updates, toggle ON → restored
- [x] 8.4 Verify Ctrl+K → palette opens, type `#term` → findings filtered, select → navigates
- [x] 8.5 E2E test spec: `e2e/review-search-filter.spec.ts`

## Dev Notes

### Existing Code to Extend (VERIFIED against codebase)

| File | What exists | What to change |
|------|-------------|---------------|
| `src/features/review/stores/review.store.ts` | `FilterState { severity, status, layer }`, `setFilter()`, `selectAllFiltered()`, `resetForFile()` | Extend FilterState + add category/confidence/searchQuery/aiSuggestionsEnabled + per-file cache |
| `src/features/review/components/ReviewPageClient.tsx` | `findingsForDisplay` (unfiltered), `severityCounts`, renders FindingList directly | Add `filteredFindings` useMemo, render FilterBar/SearchInput above list, pass filtered to FindingList |
| `src/features/review/components/FindingList.tsx` | Accepts `findings: FindingForDisplay[]` prop | No change needed — receives pre-filtered array |
| `src/features/review/components/FindingCardCompact.tsx` | Renders source→target preview | Add optional `searchQuery` prop for highlight |
| `src/features/review/hooks/use-keyboard-actions.ts` | Hotkey registry, Ctrl+? cheat sheet | Add Ctrl+K registration for CommandPalette |
| `src/features/review/types.ts` | `FindingForDisplay` type | No change needed |
| `src/types/finding.ts` | `FindingSeverity`, `FindingStatus`, `DetectedByLayer` consts | No change needed |

### New Files to Create

| File | Purpose |
|------|---------|
| `src/features/review/components/FilterBar.tsx` | Filter toolbar with 5 dimensions + badge chips |
| `src/features/review/components/FilterBar.test.tsx` | Unit tests |
| `src/features/review/components/SearchInput.tsx` | Debounced keyword search input |
| `src/features/review/components/SearchInput.test.tsx` | Unit tests |
| `src/features/review/components/CommandPalette.tsx` | Ctrl+K command palette (cmdk) |
| `src/features/review/components/CommandPalette.test.tsx` | Unit tests |
| `src/components/ui/command.tsx` | shadcn/cmdk base component |
| `e2e/review-search-filter.spec.ts` | E2E test for filter + search + AI toggle |

### Architecture Compliance

- **Client-side only:** All filtering is client-side via Zustand store — no server queries for filter. Findings are already loaded in `findingsMap`
- **No new Server Actions:** AI toggle is display-only filter, not server-side score recalc. Score badge shows server-computed value unchanged; "AI findings hidden" indicator shown when toggle OFF
- **No DB changes:** All filter state is ephemeral (Zustand, per-tab, cleared on session end)
- **No new Inngest functions:** Toggle does not re-run pipeline
- **RSC boundary:** FilterBar, SearchInput, CommandPalette are all client components within existing `ReviewPageClient` boundary — no `"use client"` needed on new files (they're imported into already-client component)
- **Zustand pattern:** Extend existing review.store.ts slices, don't create separate store

### Critical Architecture Decisions

**DECISION: `sortedFindingIds` scope and filter architecture**

`FindingList.tsx` syncs `allSortedIds` to the store via `setSortedFindingIds()` (line 150). This array drives `autoAdvance()` in `use-review-actions.ts` (line 182) and `selectAllFiltered()` in the store (line 458). Since Story 4.5 passes `filteredFindings` to `<FindingList>`, `sortedFindingIds` will contain only filtered IDs. This means:

- **Auto-advance** navigates to the next Pending finding **within the filtered view only**. If no filtered Pending remains, focus moves to action bar. This is the intended UX — "Showing X of Y findings" keeps the user aware unfiltered findings exist.
- **Ctrl+A (selectAllFiltered)** selects only visible filtered findings — correct because store re-filters `sortedFindingIds` with `filterState`.
- **Consistency requirement:** ALL filter dimensions (severity, status, layer, category, confidence, searchQuery, aiSuggestionsEnabled) MUST be in the Zustand store — not local `useState`. This ensures `selectAllFiltered()` and `sortedFindingIds` stay consistent. No split-brain between store filter and UI-only filter.

**DECISION: Filter change clears stale selections and active finding**

When any filter dimension changes:
1. Intersect `selectedIds` with visible finding IDs — remove hidden selections, exit bulk mode if empty
2. If `selectedId` (active finding) is no longer visible, reset to first filtered finding or `null`
3. Use `requestAnimationFrame` for focus reset (DOM may not be updated yet — Guardrail #32)

**DECISION: Per-file filter cache scope**

`perFileFilterCache` saves ONLY `filterState` + `aiSuggestionsEnabled`. Undo/redo stacks are NOT cached — always cleared on file switch per Guardrail #35. Implementation in `resetForFile`: (1) save filter to cache, (2) reset everything including undo stacks, (3) restore only filter from cache if previously visited.

**DECISION: AI toggle is display-only, score unchanged**

AI toggle hides L2/L3 findings in the UI but does NOT modify the server-computed MQM score. The score badge shows the actual server value. A muted "AI findings hidden" text indicator appears beside the score badge when toggle is OFF. No client-side score recalculation — this avoids complexity and keeps score as single source of truth from server.

**DECISION: Realtime new findings while toggle OFF**

When AI toggle is OFF and a new L2/L3 finding arrives via Supabase Realtime, `findingsMap` grows (finding is added to store) but `FindingList` filters it out. No "new finding" animation or announcement plays for the hidden finding. This is acceptable — user chose to hide AI findings.

### Key Implementation Details

**Layer filter vs AI toggle — DISTINCT concepts:**
- Layer filter (in FilterBar): hides findings by specific layer (L1/L2/L3). User can show "only L1" or "only AI"
- AI toggle: global switch that hides ALL AI-generated findings (L2+L3). When OFF, it's as if AI never ran. This is separate from the Layer filter dimension

**Confidence filter thresholds:**
- High: `aiConfidence > 85`
- Medium: `aiConfidence >= 70 && aiConfidence <= 85`
- Low: `aiConfidence < 70`
- Findings with `aiConfidence === null` (L1 rule-based, Manual): excluded from confidence filter unless "All" selected

**Search matching (Thai/CJK safe):**
```typescript
const lowerQuery = query.toLocaleLowerCase()
const matches = (text: string | null) => text?.toLocaleLowerCase().includes(lowerQuery) ?? false
const isMatch = matches(f.sourceTextExcerpt) || matches(f.targetTextExcerpt) || matches(f.description) || matches(f.suggestedFix)
```

**Per-file filter cache pattern:**
```typescript
// On file switch (resetForFile):
// 1. Save current: perFileFilterCache.set(currentFileId, { filterState, aiSuggestionsEnabled })
// 2. Restore or default: const cached = perFileFilterCache.get(newFileId)
//    if cached → restore. else → { severity: null, status: 'pending', ... }
```

**CommandPalette — cmdk integration:**
- Uses `cmdk` (Command Menu for React) — standard shadcn pattern
- Wrap in `Dialog` for modal behavior
- `CommandInput` for search, `CommandList` > `CommandGroup` > `CommandItem` for results
- Scope filtering: parse first char of input, if `>` → show only actions group, if `#` → only findings, if `@` → only files

**Existing `selectAllFiltered()` at store line 457** already filters by severity/status/layer — Task 1.6 extends this with category, confidence, searchQuery, and aiSuggestionsEnabled checks so Ctrl+A selects only visible findings after filter.

**Performance: Zustand shallow selectors**
Use `shallow` equality for `filterState` reads to avoid unnecessary re-renders:
```typescript
import { shallow } from 'zustand/shallow'
const filterState = useReviewStore(s => s.filterState, shallow)
```
Without this, every store update (including score changes, undo stack pushes) triggers FilterBar re-render.

**Performance: Single-pass per-filter-option match counts**
Computing per-button match counts (for AC9 aria-labels like "Critical: 5 of 28") requires iterating all findings. Do this in a single pass via `useMemo` that builds a `Record<dimension, Record<value, number>>` map, not N separate iterations per dimension.

### Previous Story Intelligence (from 4.4b)

**Key learnings to apply:**
1. **Cross-file data flow (Guardrail #44):** FilterBar writes to store → ReviewPageClient reads from store → derives `filteredFindings` → passes to FindingList. Verify iteration order consistency
2. **useRef not reset on prop change (Guardrail #12):** SearchInput debounce timer ref must clear on unmount
3. **Zustand getState() in handlers:** CommandPalette actions that read active finding should use `getState()` not stale closure
4. **Toast between actions:** If CommandPalette executes an action, ensure `inFlightRef` check passes before executing
5. **CR R3 lesson (4.4b):** Every cross-file fix must trace full producer→consumer→store chain

**Files established in 4.4b that interact with this story:**
- `use-undo-redo.ts` — undo works on filtered view; after undo, finding may reappear if filter changed. No special handling needed (undo operates on IDs regardless of filter visibility)
- `use-findings-subscription.ts` — new findings from Realtime appear in filtered list only if they match active filter. No change needed (filtering happens in ReviewPageClient useMemo)

### Testing Requirements

**Unit test naming:** `describe("FilterBar")` → `it("should show active badge chip when severity filter selected")`

**Boundary value tests (MANDATORY per CLAUDE.md):**
- Confidence thresholds: test at 70 (medium), 69.99 (low), 85 (medium), 85.01 (high), 0, 100, null
- Search: empty string, single char, Thai text "คำแปล", CJK text "翻訳", whitespace-only, special chars `(`, `[`, `*`
- Filter combinations: all filters active, single filter, no filters, filter producing 0 results

**Cross-feature interaction tests (MANDATORY):**
- Auto-advance with filter active: accept finding → advances to next filtered Pending, not next overall Pending
- Bulk selection + filter change: select 5 → filter hides 3 → selectedIds reduced to 2 visible
- Active finding filtered out: apply filter that hides selectedId → selectedId resets to first visible
- AI toggle OFF + Realtime new L2 finding → findingsMap grows but FindingList unchanged

**E2E test strategy:** Full E2E (critical flow) — this is part of the review→accept/reject→score critical path. Spec: `e2e/review-search-filter.spec.ts`

**Test data:** Use existing factories from `src/test/factories.ts`. Seed findings with varied severity/layer/status/category/confidence to cover all filter dimensions.

### Guardrails Checklist

| # | Guardrail | Applies? | How |
|---|-----------|----------|-----|
| 25 | Color never sole info carrier | Yes | Filter active state uses bg+border+text, not just color |
| 26 | Contrast ratio | Yes | Active filter buttons must meet 4.5:1 |
| 27 | Focus indicator 2px indigo 4px offset | Yes | All filter buttons + search input + palette items |
| 28 | Single-key hotkeys scoped | Yes | Suppress A/R/F etc. when SearchInput focused |
| 30 | Modal focus trap | Yes | CommandPalette dialog |
| 31 | Escape hierarchy | Yes | Palette Esc closes palette (not filter/list) |
| 33 | aria-live polite | Yes | "Showing X of Y" count changes |
| 34 | No browser shortcut override | Yes | Ctrl+K overrides only when review page focused, not in text inputs |
| 37 | prefers-reduced-motion | Yes | Filter chip add/remove animation |
| 38 | ARIA landmarks | Yes | FilterBar = `role="toolbar"` |
| 40 | No focus stealing on mount | Yes | FilterBar does NOT auto-focus on page load |
| 44 | Cross-file data flow | Yes | FilterBar store → ReviewPageClient memo → FindingList props |

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md — Story 4.5]
- [Source: _bmad-output/planning-artifacts/prd.md — FR31, FR34]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md — Search & Filter Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md — FilterBar anatomy]
- [Source: _bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md — Zustand store template]
- [Source: _bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md — Ctrl+K palette]
- [Source: _bmad-output/planning-artifacts/research/epic-4-proactive-guardrails-2026-03-08.md — WCAG toolbar pattern]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Cache bleed fix: perFileFilterCache persisted across tests via global Zustand store; fixed by clearing cache in beforeEach
- userEvent + fake timers: userEvent.type hangs with vi.useFakeTimers; switched to fireEvent.change
- cmdk jsdom: Required ResizeObserver + scrollIntoView mocks; Enter key unreliable → click-based selection tests
- Store mock gap: 5 ReviewPageClient test files lacked new filterState/searchQuery/aiSuggestionsEnabled fields

### Completion Notes List
- Task 1: Extended FilterState with category + confidence, added per-file filter cache, selection clearing on filter change, AI toggle. Changed setFilter API from full-object to per-key setter. Exported findingMatchesFilters as shared util
- Task 2: FilterBar with 5 dimensions, dynamic categories, badge chips, clear all, per-button match counts, aria-live, empty state
- Task 3: SearchInput with 300ms debounce (useRef+setTimeout), Escape clear with stopPropagation (Guardrail #31), cleanup on unmount (Guardrail #12)
- Task 4: filteredFindings useMemo in ReviewPageClient using findingMatchesFilters, wired FilterBar + SearchInput + AiToggle
- Task 5: AiToggle component with aria-label, "AI findings hidden" indicator beside ScoreBadge
- Task 6: Installed cmdk (React 19 compatible), created shadcn command.tsx, CommandPalette with 3-tier scope (>/# /@), Ctrl+K via document.addEventListener
- Task 7: highlightText using indexOf (not regex), React.memo wrapper on FindingCardCompact, searchQuery prop
- Task 8: All components wired in ReviewPageClient, updated 5 existing test file mocks, 3645 unit tests pass

### CR R1 Fixes Applied (2026-03-17)
- **H1:** Wired searchQuery prop through FindingList → FindingCardCompact (AC4 highlight was dead code)
- **H2:** Layer filter 'AI' now matches L2+L3 (was L2-only, excluded L3 findings)
- **H3:** Strengthened E2E assertions: E-02/E-07/E-09 now verify exact filtered counts
- **H4:** CommandPalette receives filteredFindings (was findingsForDisplay → silent no-op on filtered-out findings)
- **H5:** Defensive merge with DEFAULT_FILTER_STATE in createFileState() — prevents old cache corruption
- **H6:** Extracted getConfidenceBucket() shared function (FilterBar + filter-helpers single source)
- **M1:** Status filter 'accepted' now includes 're_accepted' (semantic grouping)
- **M2:** Created filter-helpers.test.ts with 37 direct tests (boundaries, Thai/CJK/Korean, special chars)
- **L2:** Guard for empty flattenedIds → null instead of undefined
- **L3:** Updated File List with 5 missing files
- **L4:** Added Thai/CJK/Korean highlight tests

### CR R2 Fixes Applied (2026-03-17)
- **R2 regression:** FilterBar match counts bucket L3→L2 key + re_accepted→accepted key (consistent with filter group behavior)
- **L2 (agent):** Wired onNavigateToFile in CommandPalette — save filter cache + navigate
- **M1:** Extracted FilterableFinding type — removed `as Parameters<...>` cast in FilterBar + ReviewPageClient
- **M5:** Replaced E2E waitForTimeout(500) with Playwright auto-retry expect (5s timeout)
- **E2E E-09:** Fixed assertion — bulk mode stays active with 1 remaining selected (not exited to 0)
- **CR exit:** 0C + 0H — all sub-agents (code-quality, cross-file, testing-qa) confirmed clean

### File List
- src/features/review/stores/review.store.ts (MODIFIED)
- src/features/review/utils/filter-helpers.ts (NEW)
- src/features/review/components/FilterBar.tsx (NEW)
- src/features/review/components/FilterBar.test.tsx (MODIFIED — ATDD adapted)
- src/features/review/components/SearchInput.tsx (NEW)
- src/features/review/components/SearchInput.test.tsx (MODIFIED — ATDD adapted)
- src/features/review/components/CommandPalette.tsx (NEW)
- src/features/review/components/CommandPalette.test.tsx (MODIFIED — ATDD adapted)
- src/features/review/components/AiToggle.tsx (NEW)
- src/features/review/components/FindingCardCompact.tsx (MODIFIED — searchQuery prop + highlight + memo)
- src/features/review/components/FindingCardCompact.highlight.test.tsx (MODIFIED — ATDD adapted)
- src/features/review/components/ReviewPageClient.tsx (MODIFIED — wiring)
- src/components/ui/command.tsx (NEW — shadcn cmdk wrapper)
- src/features/review/stores/review.store.filter.test.ts (MODIFIED — ATDD adapted)
- src/features/review/stores/review.store.test.ts (MODIFIED — setFilter API)
- src/features/review/stores/review.store.keyboard.test.ts (MODIFIED — setFilter API + default filter)
- src/features/review/stores/review.store.bulk.test.ts (MODIFIED — setFilter API)
- src/features/review/components/FindingList.filterReset.test.tsx (MODIFIED — AC3 persistence)
- src/features/review/components/ReviewPageClient.nullScore.test.tsx (MODIFIED — mock fields)
- src/features/review/components/ReviewPageClient.scoreTransition.test.tsx (MODIFIED — mock fields)
- src/features/review/components/ReviewPageClient.story33.test.tsx (MODIFIED — mock fields)
- src/features/review/components/ReviewPageClient.story34.test.tsx (MODIFIED — mock fields)
- src/features/review/components/ReviewPageClient.story35.test.tsx (MODIFIED — mock fields)
- _bmad-output/implementation-artifacts/sprint-status.yaml (MODIFIED — status)
- src/features/review/utils/filter-cache.ts (NEW — sessionStorage persistence)
- src/features/review/utils/filter-cache.test.ts (NEW — cache unit tests)
- src/features/review/utils/filter-helpers.test.ts (NEW — CR M2: direct filter logic tests)
- src/features/review/components/FindingList.tsx (MODIFIED — CR H1: searchQuery prop wiring)
- e2e/review-search-filter.spec.ts (NEW — E2E test spec)
- package.json (MODIFIED — cmdk dep)
- package-lock.json (MODIFIED — cmdk dep)
