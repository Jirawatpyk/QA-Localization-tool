# Story 4.1a: Finding List Display & Progressive Disclosure

Status: review

> **BLOCKED BY:** Story 4.0 must be `done` (currently `done` ✓). Verify latest main includes all 4.0 changes before starting.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA Reviewer,
I want to see findings organized by severity with critical issues expanded first,
So that I can focus on the most important issues first.

## Acceptance Criteria (4 ACs)

### AC1: Severity-Sorted Finding List with Progressive Disclosure

**Given** a file has findings from any completed pipeline layer (L1, L2, or L3)
**When** the QA Reviewer opens the file review view
**Then:**
1. Findings are displayed in a FindingList sorted by severity: Critical first, then Major, then Minor
2. Critical findings are auto-expanded showing full FindingCard detail (`aria-expanded="true"` on load) — auto-expand is VISUAL ONLY, NOT auto-focus (Guardrail #40)
3. Major findings show as collapsed FindingCardCompact rows (severity icon + category + layer badge + preview + confidence)
4. Minor findings are collapsed under a "Minor (N)" accordion header (FR24) — clicking expands to reveal FindingCardCompact rows
5. Clicking/pressing Enter on a FindingCardCompact row expands it inline to show full FindingCard detail
6. Each finding row maintains `role="row"` inside `role="rowgroup"` (already established in 4.0, Guardrail #29)
7. Sort order within each severity group: by AI confidence descending (highest confidence first), L1 findings (no confidence) sorted after AI findings

### AC2: FindingCardCompact Scanning Format

**Given** a finding row in FindingCardCompact format
**When** the reviewer scans it
**Then:**
1. They see in a single dense row: severity icon (16px, distinct shape per severity per NFR27), category label (text), layer badge (blue="Rule", purple="AI"), source→target preview (truncated to fit row), confidence % (AI only, hidden for L1), and quick action icon placeholders (Accept/Reject)
2. Quick action icons are **disabled** (greyed out, `cursor-not-allowed`, 50% opacity) until Story 4.2 implements action logic
3. Each FindingCardCompact row has `tabIndex` per roving tabindex pattern (Guardrail #29): active row `tabIndex={0}`, others `tabIndex={-1}`
4. Focus indicator on row: `outline: 2px solid var(--color-primary)`, `outline-offset: 4px` (Guardrail #27)
5. L3 markers (`[L3 Confirmed]`, `[L3 Disagrees]`) shown as badges when present
6. Fallback model badge shown when AI model differs from primary

### AC3: Progressive Loading with Dual-Track ReviewProgress

**Given** the finding list with mixed layer results
**When** L1 results are available but AI is still processing
**Then:**
1. L1 findings are displayed immediately
2. ReviewProgress component shows dual-track synchronized display:
   - Track 1 (Reviewed count): "Reviewed: 0/14" with progress bar — counts findings where `status !== 'pending'`
   - Track 2 (AI processing): "AI: analyzing..." or "AI: complete" — reflects pipeline layer status
3. States: Active (both updating), AI Complete (track 2 shows 100%), Review Complete (track 1 shows 100%), All Done (both complete)
4. "Processing L2..." / "Processing L3..." label shown during AI work
5. All animations respect `prefers-reduced-motion` (Guardrail #37) — use existing `useReducedMotion()` hook
6. New AI findings appear in real-time via Supabase Realtime push, inserted at correct severity position (existing sort logic handles this)
7. Screen reader announcement via `announce()` utility: "N new AI findings added" when new findings arrive (Guardrail #33)

### AC4: Accessibility — Severity Display & Contrast

**Given** accessibility requirements
**When** the finding list renders
**Then:**
1. Severity uses icon + text_label + color (never color alone) — EVERY severity badge contains {icon, text_label, color} and icon is distinct per severity (Guardrail #25, NFR27):
   - Critical: XCircle icon (octagon shape) + "Critical" text + red color
   - Major: AlertTriangle icon + "Major" text + orange color (`--color-severity-major: #b45309`)
   - Minor: Info icon (circle shape) + "Minor" text + blue color
2. Icons are `aria-hidden="true"` (text label is accessible name) (Guardrail #36)
3. Contrast ratios meet WCAG 2.1 AA: 4.5:1 normal text, 3:1 large text (NFR28, Guardrail #26)
4. Source/target text excerpts have `lang` attribute set from file metadata (`lang="th"`, `lang="ja"`, etc.) (Guardrail #39)
5. CJK text containers apply 1.1x font scale per UX accessibility spec

## Tasks / Subtasks

### Task 0: Prerequisites (AC: all)
- [ ] 0.1 Verify Story 4.0 is merged to main (status: `done` ✓ — pull latest main before starting)
- [ ] 0.2 Install shadcn Accordion: `npx shadcn@latest add accordion` — needed for Minor findings accordion group. Note: shadcn Progress is already installed (no install needed for dual-track). Note: Accordion keyboard handling (ArrowUp/Down, Home/End, Enter/Space) is built-in via Radix Accordion primitive — no custom keyboard code needed
- [ ] 0.3 **TD-TENANT-003**: Thread `tenantId` from `page.tsx` → `ReviewPageClient` → `useFindingsSubscription` + `useScoreSubscription`
  - **tenantId source:** `page.tsx` does NOT call `requireAuth()` directly. Extract `tenantId` from the `getFileReviewData` Server Action response — add `tenantId` to `FileReviewData` return type if not already present
  - Add `tenantId` to ReviewPageClient props
  - **Hook signature changes:** `useFindingsSubscription(fileId, tenantId)` and `useScoreSubscription(fileId, tenantId)` — add `tenantId` as required 2nd parameter
  - Add compound Realtime filter: `file_id=eq.${fileId}&tenant_id=eq.${tenantId}`
  - Add `.eq('tenant_id', tenantId)` on polling fallback queries
  - Unit tests: verify subscription includes tenant_id in filter
- [ ] 0.4 Extract `FindingForDisplay` type to `src/features/review/types.ts` — MUST include `status: FindingStatus` field (needed for state-based backgrounds in Task 1). Currently `FindingForDisplay` may lack `status` — verify against `Finding` type from `@/types/finding.ts` and align fields

### Task 1: FindingCard Component — Expanded View (AC: 1, 4)
- [ ] 1.1 Create `src/features/review/components/FindingCard.tsx`
  - Refactor expanded view logic from existing `FindingListItem.tsx`
  - Anatomy (3-second decision scan per UX spec):
    - **Header row:** Severity badge (icon+text+color) | Category label | Layer badge | Finding number
    - **Content row:** Source text with `lang` attr | Target text with `lang` attr
    - **Footer row:** AI suggestion (italic) | Confidence badge | Quick action icons (disabled)
  - L3 markers: `[L3 Confirmed]` / `[L3 Disagrees]` badges
  - Fallback model badge when `aiModel !== primary model`
  - State-based background colors using tokens from Story 4.0:
    - Pending: default (no tint)
    - Accepted: `--color-finding-accepted` (#dcfce7)
    - Rejected: `--color-finding-rejected` (#fee2e2)
    - Flagged: `--color-finding-flagged` (#fef3c7)
    - Noted: `--color-finding-noted` (#dbeafe)
    - Source Issue: `--color-finding-source-issue` (#ede9fe)
  - `lang` attribute on source/target text containers (Guardrail #39)
  - CJK containers: 1.1x font scale class
  - `role="row"` wrapper, `aria-expanded="true"`
  - Animation: `animate-fade-in` if new finding + `!reducedMotion` (Guardrail #37)
- [ ] 1.2 Props interface:
  ```typescript
  type FindingCardProps = {
    finding: FindingForDisplay
    findingIndex: number
    totalFindings: number
    sourceLang?: string | undefined
    targetLang?: string | undefined
    l2ConfidenceMin?: number | null | undefined
    l3ConfidenceMin?: number | null | undefined
    isNew?: boolean | undefined
  }
  ```
- [ ] 1.3 Unit tests: `FindingCard.test.tsx`
  - Renders all severity types with correct icon+text+color
  - Shows source/target with `lang` attribute
  - Shows L3 markers when present
  - Shows fallback badge when model differs
  - Respects prefers-reduced-motion
  - State-based backgrounds render correctly

### Task 2: FindingCardCompact Component — Scanning Row (AC: 2, 4)
- [ ] 2.1 Create `src/features/review/components/FindingCardCompact.tsx`
  - Dense single-row layout: `severity icon | category | layer badge | preview | confidence | quick actions`
  - Severity icon: 16px, `aria-hidden="true"`, distinct shape per severity (Guardrail #36)
  - Category: text label (truncate if >20 chars)
  - Layer badge: reuse existing `LayerBadge` component
  - Preview: source→target truncated (use `textContent.slice(0, 60) + '...'`)
  - Confidence: reuse `ConfidenceBadge` (hidden for L1)
  - Quick action icons: Accept (Check) + Reject (X) — **disabled**, 50% opacity, `cursor-not-allowed`
  - L3 markers + fallback badge (compact versions)
  - `role="row"`, roving `tabIndex` (Guardrail #29)
  - Focus ring: `focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4` (Guardrail #27)
  - Click/Enter: expands inline to FindingCard
  - `aria-expanded="false"` attribute
  - `lang` on source/target preview spans (Guardrail #39)
- [ ] 2.2 Props interface:
  ```typescript
  type FindingCardCompactProps = {
    finding: FindingForDisplay
    findingIndex: number
    totalFindings: number
    isExpanded: boolean
    onToggle: () => void
    sourceLang?: string | undefined
    targetLang?: string | undefined
    l2ConfidenceMin?: number | null | undefined
    l3ConfidenceMin?: number | null | undefined
    isNew?: boolean | undefined
    isFirstRow?: boolean | undefined
  }
  ```
- [ ] 2.3 Unit tests: `FindingCardCompact.test.tsx`
  - Renders compact row with all data fields
  - Quick action icons are disabled
  - Click triggers onToggle callback
  - Enter key triggers onToggle
  - Roving tabindex: first row tabIndex=0, others tabIndex=-1
  - Focus indicator visible on keyboard focus
  - `aria-expanded` toggles on expand/collapse
  - L3 markers shown as compact badges
  - Hidden for L1 findings (no confidence shown)

### Task 3: Progressive Disclosure Logic in FindingList (AC: 1, 3)
- [ ] 3.1 Refactor `ReviewPageClient.tsx` finding list rendering:
  - Compute severity groups using `useMemo` — memoize `{ critical, major, minor }` arrays derived from `sortedFindings` to avoid re-grouping on every render
  - Group sorted findings into 3 severity sections:
    - **Critical section:** Render each as `<FindingCardCompact isExpanded={true}>` + inline `<FindingCard>` (auto-expanded). Compact header stays visible as collapsible toggle — intentional so reviewers can collapse Critical findings to manage screen space
    - **Major section:** Render each as `<FindingCardCompact isExpanded={expanded[id]}>`
    - **Minor section:** Wrap in shadcn `<Accordion>` with header "Minor (N)" — collapsed by default
  - Maintain `expandedIds: Set<string>` in component state for tracking which findings are expanded. **React immutability:** always create new Set on update — `setExpandedIds(prev => { const next = new Set(prev); next.add(id); return next })` — never mutate Set directly
  - Critical findings: pre-populate `expandedIds` with all critical finding IDs on initial load
  - `role="rowgroup"` around each severity group
  - Finding number displayed as `#index/total` (e.g., "#3/28") — pass `findingIndex={index}` and `totalFindings={sortedFindings.length}` in the rendering loop for each FindingCard/Compact
- [ ] 3.2 Expand/collapse interaction:
  - Click on FindingCardCompact → toggle expanded state
  - Enter key on focused FindingCardCompact → toggle expanded state
  - Esc on expanded FindingCard → collapse back to compact (Guardrail #31 — Esc hierarchy)
  - Expanded FindingCard shows inline below the compact header (NOT a separate panel)
- [ ] 3.3 New findings from Realtime:
  - When `useFindingsSubscription` inserts new findings, they automatically appear in correct severity group (existing sort handles position)
  - Call `announce('N new AI findings added')` inside `useFindingsSubscription.ts` `flushInsertBuffer()` function (NOT in ReviewPageClient) — announce at the source of the batch insert (polite) (Guardrail #33)
  - New finding row has `isNew={true}` → `animate-fade-in` (respects reduced motion)
- [ ] 3.4 Remove old `FindingListItem` rendering — replace with new FindingCard/Compact pattern
  - `FindingListItem.tsx` can be deprecated (functionality split into FindingCard + FindingCardCompact)
  - Update all imports and references in ReviewPageClient
  - **Delete or migrate test files:** `FindingListItem.story34.test.tsx` and `FindingListItem.story35.test.tsx` — move relevant test cases to `FindingCard.test.tsx` / `FindingCardCompact.test.tsx`, then delete old files
- [ ] 3.5 Unit tests for progressive disclosure:
  - Critical findings auto-expanded on initial render
  - Major findings collapsed by default
  - Minor findings hidden under accordion
  - Accordion header shows correct count "Minor (N)"
  - Expand/collapse toggles work
  - New Realtime findings appear in correct severity group

### Task 4: ReviewProgress Dual-Track Redesign (AC: 3)
- [ ] 4.1 Redesign `ReviewProgress.tsx` to dual-track layout:
  - **Track 1 — Review progress:**
    - "Reviewed: X/N" where X = findings with `status !== 'pending'`, N = total findings
    - Use shadcn `<Progress>` component for bar visualization
    - Green fill as percentage increases
  - **Track 2 — AI processing status:**
    - Label: "AI: analyzing...", "Processing L2...", "Processing L3...", "AI: complete"
    - Use existing pipeline layer status logic (fileStatus + layerCompleted)
    - Show spinner icon during processing, checkmark when complete
  - **Combined states:**
    - Active: both tracks updating
    - AI Complete: track 2 = 100%, label = "AI: complete"
    - Review Complete: track 1 = 100%, label = "All reviewed"
    - All Done: both = 100%
  - Animations respect `prefers-reduced-motion` (Guardrail #37)
  - `aria-live="polite"` on progress text (already in parent from 4.0)
  - `role="progressbar"` + `aria-valuenow` + `aria-valuemin` + `aria-valuemax` on each bar
- [ ] 4.2 New props interface:
  ```typescript
  type ReviewProgressProps = {
    layerCompleted: LayerCompleted | null
    fileStatus: DbFileStatus
    processingMode: ProcessingMode
    reviewedCount: number    // NEW — findings with status !== 'pending'
    totalFindings: number    // NEW — total finding count
  }
  ```
- [ ] 4.3 Wire `reviewedCount` + `totalFindings` from ReviewPageClient:
  - `totalFindings`: `sortedFindings.length`
  - `reviewedCount`: `sortedFindings.filter(f => f.status !== 'pending').length`
  - These values update automatically when store changes (Realtime + review actions)
  - **Note:** In 4.1a scope, `reviewedCount` will always be 0 (no review actions until Story 4.2). Track 1 showing "Reviewed: 0/N" is expected — the infrastructure is established here, populated in 4.2
- [ ] 4.4 Unit tests: `ReviewProgress.test.tsx` (update existing tests + add new)
  - Dual-track renders both bars
  - Reviewed count shows correct X/N
  - AI status shows correct processing label
  - All 4 combined states render correctly
  - Animations respect reduced-motion
  - ARIA attributes present on progress bars

### Task 5: Tech Debt Resolution (2 items)
- [ ] 5.1 **TD-TENANT-003**: Realtime subscriptions tenant_id filter (see Task 0.3 for details)
  - Update tech-debt-tracker.md: TD-TENANT-003 → RESOLVED
- [ ] 5.2 **TD-E2E-014**: Evaluate E1 keyboard review flow E2E test
  - Test depends on J/K navigation being wired to DOM focus — this is **Story 4.1b scope** (NOT 4.1a)
  - Keep test skipped in 4.1a. Update tech-debt-tracker.md target: `Story 4.1a` → `Story 4.1b`
  - Verify the assertion setup is correct for when 4.1b enables J/K

### Task 6: Integration Verification
- [ ] 6.1 Verify all existing unit tests still pass after refactoring (`npm run test:unit`)
- [ ] 6.2 Verify type-check passes (`npm run type-check`)
- [ ] 6.3 Verify lint passes (`npm run lint`)
- [ ] 6.4 Verify build succeeds (`npm run build`)
- [ ] 6.5 Verify existing E2E tests pass (`npx playwright test e2e/review-score.spec.ts`)

## Dev Notes

### Existing Infrastructure (DO NOT rebuild)

All of these exist from Story 4.0 and earlier. **Verify, extend, don't recreate:**

| Component | Status | Location | Notes for 4.1a |
|-----------|--------|----------|----------------|
| ReviewPageClient | EXISTS | `features/review/components/ReviewPageClient.tsx` | MODIFY — new FindingCard/Compact rendering |
| FindingListItem | EXISTS (DEPRECATE) | `features/review/components/FindingListItem.tsx` | Functionality split into FindingCard + FindingCardCompact |
| ReviewProgress | EXISTS | `features/review/components/ReviewProgress.tsx` | MODIFY — dual-track redesign |
| FindingDetailSheet | EXISTS (shell) | `features/review/components/FindingDetailSheet.tsx` | DO NOT MODIFY — populated in Story 4.1c |
| ReviewActionBar | EXISTS | `features/review/components/ReviewActionBar.tsx` | DO NOT MODIFY — actions wired in Story 4.2 |
| KeyboardCheatSheet | EXISTS | `features/review/components/KeyboardCheatSheet.tsx` | DO NOT MODIFY |
| LayerBadge | EXISTS | `features/review/components/LayerBadge.tsx` | REUSE in FindingCard/Compact |
| ConfidenceBadge | EXISTS | `features/review/components/ConfidenceBadge.tsx` | REUSE in FindingCard/Compact |
| ScoreBadge | EXISTS | `features/batch/components/ScoreBadge.tsx` | DO NOT MODIFY |
| review.store.ts | EXISTS | `features/review/stores/review.store.ts` | DO NOT MODIFY — filterState already available |
| use-findings-subscription | EXISTS | `features/review/hooks/use-findings-subscription.ts` | MODIFY — add tenantId filter (TD-TENANT-003) |
| use-score-subscription | EXISTS | `features/review/hooks/use-score-subscription.ts` | MODIFY — add tenantId filter (TD-TENANT-003) |
| use-threshold-subscription | EXISTS (VERIFY) | `features/review/hooks/use-threshold-subscription.ts` | VERIFY — may need tenantId filter too (check if TD-TENANT-003 scope) |
| use-keyboard-actions | EXISTS | `features/review/hooks/use-keyboard-actions.ts` | DO NOT MODIFY |
| use-focus-management | EXISTS | `features/review/hooks/use-focus-management.ts` | DO NOT MODIFY |
| announce.ts | EXISTS | `features/review/utils/announce.ts` | REUSE — announce new AI findings |
| useReducedMotion | EXISTS | `src/hooks/useReducedMotion.ts` | REUSE — all animations |
| tokens.css | EXISTS | `src/styles/tokens.css` | DO NOT MODIFY — contrast + state tokens already fixed in 4.0 |

### Key Design Decisions

1. **FindingCard/FindingCardCompact split from FindingListItem** — The existing `FindingListItem` handles both expanded and collapsed states in one component. Story 4.1a splits this into two components for cleaner separation: `FindingCardCompact` (scanning row) and `FindingCard` (expanded detail). This enables the progressive disclosure pattern where Critical findings use FindingCard directly while Major/Minor use FindingCardCompact with toggle.

2. **Minor findings accordion** — shadcn Accordion wraps Minor findings group. Install required: `npx shadcn@latest add accordion`. The accordion header shows "Minor (N)" where N is the count. Default state: collapsed. This prevents information overload per UX spec Safeguard #1.

3. **ReviewProgress redesign (NOT replacement)** — The current ReviewProgress shows L1/L2/L3 layer status. The new design adds a "Reviewed: X/N" track alongside the AI processing status. This is a redesign of the SAME component (not a new one) to maintain backward compatibility with existing tests. Both tracks are always visible.

4. **Quick action icons disabled** — FindingCardCompact shows Accept/Reject quick action icon placeholders but they are disabled (50% opacity, cursor-not-allowed, no click handler). Story 4.2 enables them with real handlers.

5. **FindingListItem deprecation path** — After FindingCard/Compact are working, update all imports to use the new components. `FindingListItem.tsx` may be deleted or kept as a re-export wrapper during transition. Decision: **delete after migration** — no re-export wrapper to avoid dead code.

6. **Expand/collapse state management** — Use local component state (`expandedIds: Set<string>`) in ReviewPageClient, NOT Zustand store. Expand/collapse is ephemeral UI state — resetting on file navigation is desired behavior. Critical findings pre-populate the set on initial render.

7. **Real-time insertion** — No additional logic needed for severity-sorted insertion. The existing `sortedFindings` derived value in ReviewPageClient sorts by `severity → confidence`. When a new finding arrives via Realtime → `setFinding()` → store triggers re-render → `sortedFindings` recalculates → finding appears in correct position.

8. **tenantId threading for TD-TENANT-003** — The `page.tsx` does NOT call `requireAuth()` directly. Extract `tenantId` from the `getFileReviewData` Server Action response (add `tenantId` to `FileReviewData` return type if needed). Pass via props: `<ReviewPageClient tenantId={data.tenantId} ...>`.

9. **Manual grid over shadcn Data Table** — The epic spec mentions "shadcn Data Table" for the finding list, but this story uses a custom grid (`role="grid"` + FindingCard/Compact) instead. Rationale: (a) Progressive disclosure (auto-expand Critical, accordion Minor) requires custom rendering logic incompatible with Data Table's row model, (b) roving tabindex with `aria-expanded` on individual rows needs per-row control, (c) Data Table's column-based layout doesn't match the FindingCard anatomy (header/content/footer). This is a deliberate deviation — Data Table is better suited for tabular data (e.g., batch list), not card-based progressive disclosure.

10. **UX Edge Case #2: New finding insertion vs sort position** — UX spec Core Experience doc says "append new items to END of list." However, AC1 specifies severity-sorted display and AC3.6 says "inserted at correct severity position." Resolution: **sort-into-position wins** — new AI findings insert at the correct severity→confidence sort position (existing `sortedFindings` logic handles this automatically). The UX "append to END" rule applies to unsorted lists only. Screen reader announces "N new AI findings added" so users know new items appeared even if not at bottom.

11. **Focus shift risk from Realtime insertion (cross-story note for 4.1b)** — When a new finding is inserted at its severity-sorted position (e.g., new Critical at row #3), all rows below shift down by one. If the reviewer's keyboard focus is on row #5, it becomes row #6 visually but the DOM element is the same — roving tabindex should hold. However, **Story 4.1b MUST verify focus stability** when the finding list changes underneath an active keyboard session. If `sortedFindings` re-renders and the focused row's index changes, the `useFocusManagement` hook must reconcile. This is NOT a 4.1a blocker but a documented handoff to 4.1b.

### FindingListItem → FindingCard/Compact Migration

Current `FindingListItem.tsx` contains:
- **Severity badge** (icon+text+color) → moves to BOTH FindingCard and FindingCardCompact
- **Expand/collapse toggle** → becomes FindingCardCompact's click/Enter handler
- **Expanded detail view** (source/target/suggestion) → moves to FindingCard
- **L3 markers** → moves to BOTH (compact version for FindingCardCompact)
- **Fallback badge** → moves to BOTH
- **`animate-fade-in`** for new findings → moves to BOTH
- **ARIA attributes** (`role="row"`, `tabIndex`, `aria-expanded`) → distributed appropriately
- **`lang` attributes** on source/target text → maintained in FindingCard, added to FindingCardCompact preview spans

### Severity Icons (already implemented in FindingListItem)

| Severity | Icon | Color Token | Text |
|----------|------|-------------|------|
| Critical | `XCircle` (lucide) | `text-severity-critical` | "Critical" |
| Major | `AlertTriangle` (lucide) | `text-severity-major` | "Major" |
| Minor | `Info` (lucide) | `text-severity-minor` | "Minor" |

> **Note:** Enhancement severity (Lightbulb icon per Guardrail #36) is NOT in the current `FindingSeverity` type scope (Critical/Major/Minor only). If Enhancement findings appear in data, they should be treated as Minor for display grouping. Adding Enhancement as a first-class severity is a future scope item.

All icons are `aria-hidden="true"` — text label carries the accessible name (Guardrail #36).

### Finding State Background Colors (tokens from Story 4.0)

| State | Token | Hex | Use in 4.1a |
|-------|-------|-----|-------------|
| Pending | default | — | No background tint |
| Accepted | `--color-finding-accepted` | #dcfce7 | Green tint (display only until 4.2) |
| Rejected | `--color-finding-rejected` | #fee2e2 | Red tint |
| Flagged | `--color-finding-flagged` | #fef3c7 | Yellow tint |
| Noted | `--color-finding-noted` | #dbeafe | Blue tint |
| Source Issue | `--color-finding-source-issue` | #ede9fe | Purple tint |

### ReviewProgress Dual-Track States

```
State: Active
┌──────────────────────────────────────────────┐
│ Reviewed: 3/14        AI: Processing L2...   │
│ ████░░░░░░░░░░░░░░░░  ⟳ analyzing...        │
└──────────────────────────────────────────────┘

State: AI Complete
┌──────────────────────────────────────────────┐
│ Reviewed: 7/28        AI: Complete ✓         │
│ ████████░░░░░░░░░░░░  ████████████████████   │
└──────────────────────────────────────────────┘

State: All Done
┌──────────────────────────────────────────────┐
│ Reviewed: 28/28 ✓     AI: Complete ✓         │
│ ████████████████████  ████████████████████   │
└──────────────────────────────────────────────┘
```

### Guardrails Applicable to This Story

| # | Guardrail | Task |
|---|-----------|------|
| #25 | Color never sole information carrier | AC4 (severity icons + text + color) |
| #26 | Contrast ratio 4.5:1 / 3:1 | AC4 (tokens already fixed in 4.0) |
| #27 | Focus indicator: 2px indigo, 4px offset | AC2 (on FindingCardCompact rows) |
| #29 | Grid navigation: roving tabindex | AC2 (FindingCardCompact tabIndex) |
| #33 | aria-live: polite/assertive | AC3 (announce new findings) |
| #36 | Severity display: icon + text + color | AC1, AC2, AC4 |
| #37 | prefers-reduced-motion | AC3 (ReviewProgress, new finding animation) |
| #39 | lang attribute on segment text | AC1, AC4 (source/target excerpts) |
| #31 | Escape key hierarchy | AC1 (Esc on expanded FindingCard → collapse one layer) |
| #40 | No focus stealing on mount | AC1 (Critical auto-expand is visual only, not auto-focus) |

### Project Structure Notes

New files created by this story:
```
src/features/review/
├── components/
│   ├── FindingCard.tsx                ← NEW (Task 1)
│   ├── FindingCard.test.tsx           ← NEW (Task 1)
│   ├── FindingCardCompact.tsx         ← NEW (Task 2)
│   ├── FindingCardCompact.test.tsx    ← NEW (Task 2)
│   ├── ReviewPageClient.tsx           ← MODIFIED (progressive disclosure logic)
│   ├── ReviewProgress.tsx             ← MODIFIED (dual-track redesign)
│   └── FindingListItem.tsx            ← DEPRECATED → replaced by FindingCard/Compact
src/components/ui/
│   └── accordion.tsx                  ← NEW (Task 0.2 — `npx shadcn@latest add accordion`)
```

Modified files:
```
src/features/review/components/ReviewPageClient.tsx      ← Progressive disclosure rendering + tenantId prop
src/features/review/components/ReviewProgress.tsx        ← Dual-track redesign
src/features/review/components/ReviewProgress.test.tsx   ← Updated tests for dual-track
src/features/review/hooks/use-findings-subscription.ts   ← TD-TENANT-003 tenantId filter + announce()
src/features/review/hooks/use-score-subscription.ts      ← TD-TENANT-003 tenantId filter
src/features/review/hooks/use-findings-subscription.test.ts ← Updated tests for tenantId
src/features/review/hooks/use-score-subscription.test.ts    ← Updated tests for tenantId
src/features/review/components/ReviewPageClient.test.tsx     ← Updated for new rendering
src/features/review/components/FindingListItem.test.tsx             ← UPDATE imports or delete if fully migrated
src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx ← Pass tenantId to ReviewPageClient
src/features/review/types.ts                                ← NEW — FindingForDisplay extracted (Task 0.4)
_bmad-output/implementation-artifacts/tech-debt-tracker.md  ← TD-TENANT-003 RESOLVED, TD-E2E-014 target → 4.1b
```

Deleted files:
```
src/features/review/components/FindingListItem.tsx               ← DEPRECATED → replaced by FindingCard/Compact
src/features/review/components/FindingListItem.story34.test.tsx  ← Migrated to FindingCard/Compact tests
src/features/review/components/FindingListItem.story35.test.tsx  ← Migrated to FindingCard/Compact tests
```

### Page.tsx tenantId Threading (TD-TENANT-003)

> **IMPORTANT:** `page.tsx` does NOT call `requireAuth()` directly. The `tenantId` must be extracted from the `getFileReviewData` Server Action response.

```typescript
// src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx
// Step 1: Add tenantId to FileReviewData return type (in getFileReviewData.action.ts)
// Step 2: Extract from response:
const data = await getFileReviewData({ projectId, fileId })
// data.tenantId is now available

// Step 3: Pass to ReviewPageClient:
<ReviewPageClient
  fileId={fileId}
  projectId={projectId}
  tenantId={data.tenantId}   // ← NEW (from FileReviewData)
  initialData={data}
/>
```

### Test Factories Needed

Ensure `src/test/factories.ts` has `buildFinding()` with severity variants:
- `buildFinding({ severity: 'critical' })` — auto-expanded
- `buildFinding({ severity: 'major' })` — compact row
- `buildFinding({ severity: 'minor' })` — accordion group

Also need a factory that creates multiple findings across severities:
```typescript
function buildFindingSet(counts: { critical: number; major: number; minor: number }): FindingForDisplay[]
```

### Accessibility Testing Notes

- **Contrast verification:** All severity text colors already pass AA via tokens.css fix in Story 4.0
- **Screen reader:** New findings announced via `announce()` utility (polite). Score changes already announced from 4.0.
- **Keyboard:** Tab into finding list → roving tabindex on rows → Enter to expand → Esc to collapse. J/K navigation is Story 4.1b scope.
- **Motion:** All animations gated by `useReducedMotion()` — test with `prefers-reduced-motion: reduce`

### Previous Story Intelligence (Story 4.0)

- **CR rounds:** done (completed within target)
- **Key learnings from 4.0:**
  - `deriveScoreBadgeState()` is a private function inside `ReviewPageClient.tsx` (lines 32-45) — NOT in scoring module. Keep it there during refactoring
  - All animations use `useReducedMotion()` hook — continue this pattern
  - Realtime subscriptions use burst batching via `queueMicrotask` — maintain for consistency
  - ARIA foundation (grid/row/rowgroup) is already established — extend, don't rebuild
  - `announce()` utility already mounted via `useEffect` in ReviewPageClient — just call it
- **Files from 4.0 that 4.1a touches:** ReviewPageClient.tsx, ReviewProgress.tsx, use-findings-subscription.ts, use-score-subscription.ts

### Git Intelligence (last 5 commits)

```
579cda5 fix(rls): increase afterAll timeout to 30s for all RLS tests
b6f7480 fix(e2e): increase timeouts for Shard 3 tests under concurrent DB load
12180a7 fix(e2e): C1e strict mode — use exact text match for J/K hotkey assertions
a75e0cc fix(review): selector-based focus restore + lenient E2E assertion
d96bd1f fix(review): focus restore via useEffect + setTimeout post-animation (Guardrail #30)
```

Pattern: Conventional Commits, `fix(scope): description`. Recent focus on E2E stability (timeouts, strict mode assertions) and review infrastructure bug fixes (focus restore patterns).

### Cross-Story Dependencies

| Depends on | Status | What 4.1a uses |
|------------|--------|----------------|
| Story 4.0 (Review Infrastructure) | `done` ✓ | Hooks, ARIA foundation, tokens, layout |
| Story 3.2c (L2 Results Display) | `done` | Realtime subscriptions, score subscription |
| Story 3.5 (Score Lifecycle) | `done` | ReviewProgress, ScoreBadge, autoPassRationale |

| Produces for | What is produced |
|-------------|------------------|
| Story 4.1b (Keyboard Nav) | FindingCard/Compact with roving tabindex — 4.1b adds J/K DOM focus |
| Story 4.1c (Detail Panel) | Finding selection → detail sheet content population |
| Story 4.2 (Core Actions) | FindingCard/Compact + quick action icons → 4.2 enables handlers |
| Story 4.3 (Extended Actions) | FindingCard state backgrounds → 4.3 adds Note/Source/Override |
| Story 4.4a (Bulk Operations) | FindingCardCompact selection → 4.4a adds Shift+Click bulk |

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md` — Story 4.1a AC + Gap Analysis]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md` — FindingCard anatomy, 3-second scan]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md` — Progressive disclosure rules, safeguards]
- [Source: `_bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md` — Roving tabindex, ARIA grid]
- [Source: `_bmad-output/accessibility-baseline-2026-03-08.md` — Issues #13-15 (keyboard nav), #27-28 (lang attr)]
- [Source: `_bmad-output/implementation-artifacts/tech-debt-tracker.md` — TD-TENANT-003, TD-E2E-014]
- [Source: `_bmad-output/implementation-artifacts/4-0-review-infrastructure-setup.md` — Previous story intelligence]
- [Source: `_bmad-output/e2e-testing-gotchas.md` — E2E keyboard testing patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

1. **FindingCard/FindingCardCompact split** — Refactored FindingListItem into 2 components: FindingCard (expanded detail) + FindingCardCompact (compact scanning row). FindingListItem + 5 test files deleted (−1,259 lines dead code).
2. **finding-display.ts utility extraction** — 5 pure functions (stripL3Markers, isCjkLang, isFallbackModel, computeConfidenceMin, truncate) extracted for DRY across Card/Compact. 32 dedicated unit tests.
3. **Progressive disclosure** — FindingList sorts by severity→confidence, groups into Critical (auto-expanded)/Major (compact)/Minor (accordion). Accordion state preserved across Realtime re-renders.
4. **ReviewProgress dual-track** — Redesigned to show "Reviewed: X/N" + "AI: status" tracks. `deriveStatusFromLayer()` maps Realtime `layerCompleted` to `DbFileStatus` with failed/partial priority guard.
5. **TD-TENANT-003 resolved** — tenantId threaded through page.tsx → ReviewPageClient → all 3 subscription hooks (findings, score, threshold). Compound Realtime filter + polling fallback.
6. **TD-E2E-014 deferred** — J/K keyboard nav E2E skipped → Story 4.1b target.
7. **buildFindingForUI factory** — Shared factory extracted to `src/test/factories.ts`, used by 3 test files.
8. **CR R1 (12 findings)** — All fixed: DRY extraction (M1), dead code deletion (H2+M5), STATUS_BG typing (H1), role="row" consolidation (M3), announce tests (M4), SeverityIndicator cleanup (M2).
9. **CR R2 (12 findings)** — All fixed: failed status priority (H1), E2E text mismatch (H2), finding-display tests (H3), deriveStatusFromLayer tests (M1), CJK scale on compact (M2), toBeTruthy→toBeInTheDocument (M3), animate-fade-in regex (M4), aria-live container (M5), role="group" on FindingCard (L2), layerCompleted type tightened (L3), factory id fix (L4).

### File List

**New files:**
- `src/features/review/components/FindingCard.tsx` — Expanded detail view
- `src/features/review/components/FindingCard.test.tsx` — 22 tests
- `src/features/review/components/FindingCardCompact.tsx` — Compact scanning row
- `src/features/review/components/FindingCardCompact.test.tsx` — 16 tests
- `src/features/review/components/FindingList.tsx` — Progressive disclosure container
- `src/features/review/components/FindingList.test.tsx` — 20 tests
- `src/features/review/components/SeverityIndicator.tsx` — Pure severity badge
- `src/features/review/components/SeverityIndicator.test.tsx` — 4 tests
- `src/features/review/utils/finding-display.ts` — Shared utility functions
- `src/features/review/utils/finding-display.test.ts` — 32 tests
- `src/features/review/types.ts` — FindingForDisplay type

**Modified files:**
- `src/features/review/components/ReviewPageClient.tsx` — Progressive disclosure rendering, tenantId prop, aria-live fix
- `src/features/review/components/ReviewProgress.tsx` — Dual-track redesign, deriveStatusFromLayer, failed priority guard
- `src/features/review/components/ReviewProgress.test.tsx` — 18 tests (12 original + 6 layerCompleted override)
- `src/features/review/hooks/use-findings-subscription.ts` — TD-TENANT-003 tenantId filter + announce()
- `src/features/review/hooks/use-findings-subscription.test.ts` — 18 tests (+2 announce)
- `src/features/review/hooks/use-score-subscription.ts` — TD-TENANT-003 tenantId filter
- `src/features/review/hooks/use-score-subscription.test.ts` — 21 tests (+1 tenantId)
- `src/features/review/hooks/use-threshold-subscription.ts` — TD-TENANT-003 tenantId filter
- `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — Pass tenantId
- `src/test/factories.ts` — buildFindingForUI shared factory
- `e2e/review-l3-findings.spec.ts` — L3 Confirmed text fix
- `_bmad-output/implementation-artifacts/tech-debt-tracker.md` — TD-TENANT-003 RESOLVED

**Deleted files:**
- `src/features/review/components/FindingListItem.tsx` (212 lines)
- `src/features/review/components/FindingListItem.test.tsx` (224 lines)
- `src/features/review/components/FindingListItem.story33.test.tsx` (113 lines)
- `src/features/review/components/FindingListItem.story34.test.tsx` (181 lines)
- `src/features/review/components/FindingListItem.story35.test.tsx` (314 lines)
- `src/features/review/hooks/use-announce.ts` (10 lines)
