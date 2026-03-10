# Story 4.1b: Keyboard Navigation & Focus Management

Status: done

> **BLOCKED BY:** Story 4.1a must be `done` (currently `done` ✓). Verify latest main includes all 4.1a changes before starting.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA Reviewer,
I want to navigate findings using keyboard shortcuts with clear focus indicators,
So that I can review 300+ findings per day efficiently without switching between mouse and keyboard.

## Acceptance Criteria (6 ACs)

### AC1: J/K/Arrow Navigation with Roving Tabindex

**Given** the finding list is displayed with findings across severity groups
**When** the reviewer uses keyboard navigation
**Then:**
1. `J` or `↓` moves focus to the next finding row (crosses severity group boundaries seamlessly)
2. `K` or `↑` moves focus to the previous finding row
3. Focus movement uses roving tabindex: active row gets `tabIndex={0}`, all others `tabIndex={-1}` (Guardrail #29)
4. DOM focus moves to the active row via `element.focus()` — triggering native browser `scrollIntoView` behavior
5. The focused row shows a visible focus indicator: `outline: 2px solid var(--color-primary)`, `outline-offset: 4px` (Guardrail #27)
6. J/K on the last finding wraps to the first finding (and vice versa) — wrap is always on (no preference toggle in this story)
7. J/K navigation ONLY activates when the finding list grid (`role="grid"`) or a finding row has focus — suppressed in `<input>`, `<textarea>`, `<select>`, `[contenteditable]`, and modals (Guardrail #28)
8. Navigation works across all three severity groups: Critical → Major → Minor (including inside expanded Minor accordion)

### AC2: Enter/Esc Expand/Collapse with Escape Hierarchy

**Given** a finding row is focused via keyboard
**When** the reviewer presses `Enter`
**Then:**
1. A collapsed FindingCardCompact expands inline to show the full FindingCard detail
2. `aria-expanded` toggles from `"false"` to `"true"`
3. Focus remains on the same row (does NOT move into the expanded content)

**Given** an expanded finding is focused
**When** the reviewer presses `Esc`
**Then:**
4. The finding collapses back to FindingCardCompact
5. `aria-expanded` toggles from `"true"` to `"false"`
6. Focus remains on the same row
7. Escape follows the hierarchy (Guardrail #31): expanded finding card collapses FIRST, before any parent layer (detail panel, page). `event.stopPropagation()` after handling

### AC3: Tab Order — Filter Bar → Finding List → Action Bar

**Given** the review page is loaded
**When** the reviewer navigates via Tab key
**Then:**
1. Tab order follows logical sequence: filter bar → finding list grid → detail panel toggle (if visible) → action bar
2. First Tab into the finding list grid sets focus on the first finding row (or the previously focused row if returning)
3. Once inside the grid, J/K/Arrow keys navigate between findings (Tab exits the grid to the next landmark)
4. Shift+Tab moves focus backward through the same sequence
5. Initial page load does NOT auto-focus the finding list — focus starts at the first interactive element in the natural tab order (Guardrail #40)

### AC4: Minor Accordion Keyboard Interaction

**Given** the Minor findings are collapsed under the "Minor (N)" accordion
**When** the reviewer navigates via J/K from the last Major finding
**Then:**
1. Focus moves to the Minor accordion trigger (header)
2. `Enter` or `Space` on the accordion trigger opens/closes the accordion (shadcn/Radix built-in behavior)
3. When the accordion is OPEN: J/K continues into Minor findings seamlessly (first Minor finding after the trigger)
4. When the accordion is CLOSED: J/K skips Minor findings and wraps to the first Critical finding (top of list)
5. From inside Minor findings, K/↑ on the first Minor finding moves focus back to the accordion trigger, then to the last Major finding

### AC5: Focus Stability on Realtime Updates

**Given** the reviewer is navigating findings via keyboard and new AI findings arrive via Supabase Realtime
**When** `useFindingsSubscription` inserts new findings into the store
**Then:**
1. The currently focused finding retains focus (tracked by finding ID, not by positional index)
2. If new findings are inserted above the focused row (e.g., a new Critical finding), the focused finding's visual position may shift but DOM focus stays on the same element
3. `activeIndex` is recalculated to match the new position of the focused finding ID in the re-sorted list
4. If the focused finding is removed (edge case: finding deleted by another user), focus advances to the next available finding

### AC6: Keyboard Accessibility Compliance

**Given** the review page with keyboard navigation enabled
**When** accessibility is verified
**Then:**
1. All findings are reachable via keyboard only — no mouse required (SC 2.1.1)
2. Focus indicator has >= 3:1 contrast against adjacent backgrounds (all state tints: green/red/yellow/blue/purple) (Guardrail #27, SC 1.4.11)
3. Single-key hotkeys (J/K) are suppressed when typing in search/filter inputs (Guardrail #28, SC 2.1.4)
4. Screen reader announces focused finding position: "Finding N of M" via `aria-label` on the focused row
5. Navigation between severity groups is announced: screen reader hears the `aria-label` of the `role="rowgroup"` when crossing group boundaries
6. `prefers-reduced-motion` is respected: no scroll animation if reduced motion is preferred — instant jump to focused row (Guardrail #37)

## Tasks / Subtasks

### Task 0: Prerequisites (AC: all)
- [x] 0.1 Verify Story 4.1a is merged to main (status: `done`). Pull latest main before starting
- [x] 0.2 Run existing tests to establish baseline: `npm run test:unit` + `npm run type-check`
- [x] 0.3 Verify `useKeyboardActions` and `useFocusManagement` hooks exist and tests pass

### Task 1: Wire J/K/Arrow Navigation in FindingList (AC: 1, 4, 5)
- [x] 1.1 Add `useKeyboardNavigation` local hook inside `FindingList.tsx`:
  - Import `useKeyboardActions` from existing hook
  - Register J/↓ handler: `setActiveIndex(prev => wrap(prev + 1, totalRows))` + focus DOM element
  - Register K/↑ handler: `setActiveIndex(prev => wrap(prev - 1, totalRows))` + focus DOM element
  - `wrap()` function: `(index + length) % length` for circular navigation
  - Handlers registered with scope `'review'` so they're suppressed in modals/inputs
  - Cleanup: unregister on unmount
- [x] 1.2 DOM focus wiring:
  - After `activeIndex` changes, query `[data-finding-id]` rows to find the target element
  - Call `targetRow.focus()` — this triggers native scrollIntoView
  - Use `useEffect` watching `activeIndex` to move DOM focus
  - If `prefers-reduced-motion`: use `scrollIntoView({ behavior: 'instant' })` instead of smooth
- [x] 1.3 `flattenedIds` computation:
  - Compute flat array of all finding IDs in display order: `[...criticalIds, ...majorIds, ...minorIds]` (only include Minor IDs when accordion is open)
  - Use `useMemo` to memoize based on `findings` + `minorAccordionOpen`
  - `activeIndex` indexes into `flattenedIds`
  - Include Minor accordion trigger as a virtual entry in the flat list (for Tab focus target between Major and Minor findings)
- [x] 1.4 Focus stability on Realtime updates (AC5):
  - Track `activeFindingId: string | null` alongside `activeIndex`
  - When `findings` prop changes, recalculate `activeIndex` from `flattenedIds.indexOf(activeFindingId)`
  - If `activeFindingId` not found (finding removed), set `activeIndex` to nearest valid index
- [x] 1.5 Minor accordion integration (AC4):
  - When accordion is closed: `flattenedIds` excludes Minor IDs → J from last Major wraps to first Critical
  - When accordion opens: recalculate `flattenedIds` to include Minor IDs
  - Accordion trigger is focusable by Tab but NOT included in J/K traversal (J skips trigger, goes to first Minor finding when open)
  - From last Major finding, J moves focus to accordion trigger IF accordion is closed, or first Minor finding if open
- [x] 1.6 Unit tests: `FindingList.keyboard.test.tsx` (new file)
  - J/↓ moves activeIndex forward, wraps at end
  - K/↑ moves activeIndex backward, wraps at start
  - Navigation crosses severity groups (Critical → Major → Minor)
  - Focus stays on correct finding when list re-sorts (Realtime insertion)
  - Minor accordion closed: J/K skips Minor findings
  - Minor accordion open: J/K traverses Minor findings
  - DOM focus() called on active row after navigation
  - Hotkeys suppressed when input element has focus

### Task 2: Wire Enter/Esc Expand/Collapse (AC: 2)
- [x] 2.1 Expand/collapse via `onToggleExpand` callback:
  - **IMPORTANT:** `expandedIds` is owned by ReviewPageClient (NOT FindingList local state). FindingList receives `expandedIds` as a prop and `onToggleExpand` as a callback
  - On `Enter` key at grid level: call `onToggleExpand(activeFindingId)` — this toggles the expand state via the parent's handler
  - Focus remains on the same FindingCardCompact row (NOT on expanded content)
  - **Per-row Enter/Esc handlers:** FindingCardCompact already handles Enter/Esc per-row (from 4.1a) via `onExpand(finding.id)`. These handlers should be KEPT — they handle click and per-row keyboard events correctly. The grid-level J/K handlers are ADDITIVE (navigation), not replacing per-row Enter/Esc. If adding a grid-level Enter handler, ensure it doesn't conflict by checking if the event already reached the target row (per-row handler fires first due to bubbling)
- [x] 2.2 Esc handler via escape layer:
  - Register Esc as an escape layer via `useFocusManagement.pushEscapeLayer('expanded', collapseFn)`
  - Only active when the active finding is expanded
  - On Esc: call `onToggleExpand(activeFindingId)` to collapse the active finding
  - `event.stopPropagation()` to prevent bubbling to parent layers (Guardrail #31)
  - Push escape layer when finding expands, pop when it collapses
- [x] 2.3 Unit tests (add to `FindingList.keyboard.test.tsx`):
  - Enter expands collapsed finding
  - Enter collapses expanded finding
  - Esc collapses expanded finding
  - Esc on collapsed finding does nothing (does NOT bubble to parent)
  - Focus stays on row after expand/collapse
  - `aria-expanded` toggles correctly

### Task 3: Tab Order & Grid Entry/Exit (AC: 3)
- [x] 3.1 Grid entry via Tab:
  - When Tab focus enters the `role="grid"` container, focus the row at `activeIndex` (or first row if `activeIndex === 0`)
  - Set `tabIndex={0}` on the grid container itself? **No** — the grid container should NOT be focusable. Only rows have tabIndex. Tab naturally lands on the first row with `tabIndex={0}`
  - When focus leaves the grid (Tab past last interactive element inside grid), let native Tab move to next landmark (action bar)
- [x] 3.2 Grid re-entry:
  - When the user Shift+Tabs back into the grid, restore focus to the previously active row (not first row)
  - `activeFindingId` persists across Tab/Shift+Tab — use `onFocus` on grid to detect re-entry and set focus to stored active row
- [x] 3.3 Initial page load (Guardrail #40):
  - DO NOT auto-focus the grid on mount
  - Let natural Tab order start from the first interactive element (header/filter bar)
  - Set `activeIndex = 0` as default (first Critical finding is pre-selected visually but NOT focused)
- [x] 3.4 Unit tests:
  - Tab into grid → focus lands on activeIndex row
  - Tab out of grid → focus moves to next landmark
  - Shift+Tab back → focus returns to previously active row
  - No auto-focus on mount (Guardrail #40)

### Task 4: Screen Reader Announcements (AC: 6)
- [x] 4.1 Add `findingIndex` and `totalFindings` props to FindingCardCompact:
  - **PREREQUISITE:** These props do NOT exist yet on FindingCardCompact — add them
  - Add to `FindingCardCompactProps`: `findingIndex: number` (0-based), `totalFindings: number`
  - Pass from FindingList rendering loop: `findingIndex={flattenedIds.indexOf(finding.id)}`, `totalFindings={flattenedIds.length}`
  - Build `aria-label`: `"Finding {findingIndex+1} of {totalFindings}, {severity} severity, {category}, {status}"`
  - Also add `aria-rowindex={findingIndex + 1}` on each row, `aria-rowcount={totalFindings}` on the grid container
  - Keep existing `role="row"` (set in 4.1a)
- [x] 4.2 Rowgroup labels:
  - Verify `aria-label` on each `role="rowgroup"`: "Critical findings", "Major findings", "Minor findings" (already set in 4.1a — verify unchanged)
- [x] 4.3 Navigation announcement:
  - No additional live region needed — `aria-label` on focused row is read by screen reader on focus change (roving tabindex + `.focus()` triggers announcement)
- [x] 4.4 Unit tests:
  - Finding row has correct `aria-label` format
  - Label includes severity, category, status
  - Label updates when finding state changes

### Task 5: Tech Debt Resolution — TD-E2E-014
- [x] 5.1 Rewrite E2E test E1 in `e2e/review-keyboard.spec.ts`:
  - **IMPORTANT:** The existing skipped test E1 expects Enter to open the FindingDetailSheet (`page.getByRole('complementary')`), but AC2 specifies Enter expands inline (`aria-expanded`). The test must be REWRITTEN to match inline expand/collapse behavior, NOT Sheet open
  - Remove `test.skip()` and rewrite assertions for real DOM behavior
  - Use E2E keyboard patterns from `e2e-testing-gotchas.md` Section 10
  - Test: navigate with J to 3rd finding → press Enter → verify `aria-expanded="true"` on the row → press Esc → verify `aria-expanded="false"` + focus stays on same row
  - Also verify: J/K moves `tabindex="0"` between rows, wrap works at list boundaries
- [x] 5.2 Update tech-debt-tracker.md: TD-E2E-014 → RESOLVED
- [x] 5.3 Verify existing keyboard E2E tests still pass: `npx playwright test e2e/review-keyboard.spec.ts`

### Task 6: Integration Verification
- [x] 6.1 Verify all existing unit tests pass: `npm run test:unit`
- [x] 6.2 Verify type-check passes: `npm run type-check`
- [x] 6.3 Verify lint passes: `npm run lint`
- [x] 6.4 Verify build succeeds: `npm run build`
- [x] 6.5 Verify E2E tests pass: `npx playwright test e2e/review-keyboard.spec.ts e2e/review-score.spec.ts e2e/review-l3-findings.spec.ts`
- [x] 6.6 Manual keyboard testing (Guardrail #24 — CR fix → E2E mandatory):
  - Open review page with findings
  - Tab to finding list → J/K through all severities → Enter/Esc expand/collapse → Tab out to action bar
  - Verify Minor accordion open/close interaction with J/K
  - Verify focus indicator visible on all state backgrounds (pending, accepted, rejected, flagged, noted, source_issue)

## Dev Notes

### Code Reality Warnings (from validation — read BEFORE coding)

1. **`expandedIds` is a PROP, not local state** — FindingList receives `expandedIds: Set<string>` and `onToggleExpand: (id: string) => void` from ReviewPageClient. To expand/collapse, call `onToggleExpand(id)` — never `setExpandedIds()` directly
2. **`minorAccordionValue` is `string[]`, not `string`** — Accordion uses `type="multiple"`. Check: `minorAccordionValue.includes('minor-group')` (NOT `=== 'minor'`)
3. **`role="grid"` is on ReviewPageClient wrapper** — NOT on FindingList root. Either move it to FindingList root (recommended) or use `document.querySelector('[role="grid"]')` for DOM queries
4. **`activeIndex` resets to 0 on length change** — FindingList lines 110-114 reset `activeIndex` when `sorted.length` changes. REMOVE this reset and replace with ID-based tracking (AC5)
5. **Per-row Enter/Esc handlers EXIST and should be KEPT** — FindingCardCompact has `onKeyDown` for Enter/Esc. Do NOT remove them. Grid-level J/K are additive
6. **`findingIndex`/`totalFindings` props do NOT exist on FindingCardCompact yet** — Must be added as new props for `aria-label` (Task 4.1)
7. **E2E test E1 tests Sheet open (wrong)** — Must be REWRITTEN to test inline expand (`aria-expanded`), not FindingDetailSheet open

### Existing Infrastructure (DO NOT rebuild)

All of these exist from Story 4.0 and 4.1a. **Verify, wire, don't recreate:**

| Component/Hook | Status | Location | Notes for 4.1b |
|---------------|--------|----------|----------------|
| useKeyboardActions | EXISTS | `features/review/hooks/use-keyboard-actions.ts` | WIRE — register J/K/Enter/Esc handlers |
| useFocusManagement | EXISTS | `features/review/hooks/use-focus-management.ts` | WIRE — pushEscapeLayer for expanded cards |
| FindingList | EXISTS | `features/review/components/FindingList.tsx` | MODIFY — add keyboard navigation logic |
| FindingCardCompact | EXISTS | `features/review/components/FindingCardCompact.tsx` | MODIFY — update aria-label, verify tabIndex wiring |
| FindingCard | EXISTS | `features/review/components/FindingCard.tsx` | DO NOT MODIFY |
| ReviewPageClient | EXISTS | `features/review/components/ReviewPageClient.tsx` | VERIFY — keyboard hooks already called |
| ReviewActionBar | EXISTS | `features/review/components/ReviewActionBar.tsx` | DO NOT MODIFY — Tab target for grid exit |
| KeyboardCheatSheet | EXISTS | `features/review/components/KeyboardCheatSheet.tsx` | DO NOT MODIFY |
| review.store.ts | EXISTS | `features/review/stores/review.store.ts` | DO NOT MODIFY — selectedId + filterState used |
| announce.ts | EXISTS | `features/review/utils/announce.ts` | REUSE if needed for navigation announcements |
| useReducedMotion | EXISTS | `src/hooks/useReducedMotion.ts` | REUSE — scroll behavior |
| useReviewHotkeys | EXISTS (in use-keyboard-actions.ts) | `features/review/hooks/use-keyboard-actions.ts` | Already called in ReviewPageClient — A/R/F no-op |

### Key Design Decisions

1. **Navigation via `flattenedIds` array** — Rather than tracking `activeIndex` as a simple counter, compute a `flattenedIds: string[]` array that represents the visual order of all navigable findings. This handles: (a) severity group transitions, (b) Minor accordion open/close (exclude IDs when closed), (c) Realtime insertions (recalculate from sorted findings). `activeIndex` = index into `flattenedIds`. `activeFindingId` = `flattenedIds[activeIndex]` — used for focus stability across re-sorts.

2. **Grid-level J/K handlers are ADDITIVE, per-row Enter/Esc handlers KEPT** — Register J/K/Arrow handlers at the FindingList grid level via `useKeyboardActions` (not per-row). This prevents N handler registrations for N findings. However, per-row Enter/Esc `onKeyDown` handlers on FindingCardCompact (from 4.1a) should be KEPT — they handle click+keyboard expand/collapse correctly and fire first via event bubbling. The grid-level Enter handler (if added) must check it doesn't double-fire with per-row handler. Simplest approach: rely on per-row Enter for expand/collapse, grid-level only for J/K navigation.

3. **DOM focus via `useEffect` + `requestAnimationFrame`** — After `activeIndex` changes, use `useEffect` to find the target row via `document.querySelector([data-finding-id="${targetId}"])` and call `.focus()`. Wrap in `requestAnimationFrame` to ensure DOM has updated after React render. This is the standard roving tabindex pattern (WAI-ARIA APG).

4. **Minor accordion trigger in navigation flow** — The accordion trigger header is NOT included in J/K traversal (it's a separate Tab stop). When navigating J from the last Major finding: if accordion is closed → wrap to first Critical. If accordion is open → jump to first Minor finding. The accordion trigger is reachable via Tab but not J/K. This prevents the accordion trigger from being a "dead end" in the J/K flow.

5. **Focus stability: ID-based, not index-based** — When Realtime inserts a new finding (changing the flat list), `activeFindingId` stays the same. A `useEffect` watching `flattenedIds` recalculates `activeIndex` from `flattenedIds.indexOf(activeFindingId)`. This is the documented handoff from Story 4.1a Dev Notes #11. If the finding is removed (not found), advance to `Math.min(oldIndex, flattenedIds.length - 1)`.

6. **No Zustand for keyboard/focus state** — `activeIndex` and `activeFindingId` are local state in FindingList. `expandedIds` is owned by ReviewPageClient (passed as prop with `onToggleExpand` callback). Keyboard/focus state is ephemeral — resetting on file navigation is expected. The existing `keyboard.store.ts` is unused and should remain as-is (no changes).

7. **`role="grid"` container location** — The `role="grid"` div is in ReviewPageClient (wrapping the FindingList), NOT on FindingList's root element. For DOM focus wiring, FindingList should use `document.querySelector('[role="grid"] [data-finding-id="..."]')` or receive a `gridRef` from the parent. Alternatively, add `role="grid"` to FindingList's root div and remove from ReviewPageClient wrapper (cleaner — keeps grid semantics co-located with grid keyboard handlers).

8. **Existing `activeIndex` reset must be removed** — FindingList currently resets `activeIndex` to 0 whenever `findings.length` changes (for Realtime insertion highlight). This conflicts with AC5 (focus stability). Replace this reset with the ID-based tracking: when length changes, recalculate `activeIndex` from `flattenedIds.indexOf(activeFindingId)` instead of resetting to 0.

9. **No J/K registration in `useReviewHotkeys`** — The existing `REVIEW_HOTKEYS` array in `use-keyboard-actions.ts` contains A/R/F/N/S (review action keys). J/K are NAVIGATION keys and are registered separately in FindingList with scope `'review'`. This separation is intentional — review action keys (A/R/F) will be wired in Story 4.2, while J/K are wired here.

10. **IME guard already handled** — The `useKeyboardActions` hook already includes IME composition guard (`event.isComposing || keyCode === 229`) for CJK/Thai input. No additional guard needed in 4.1b — the hook handles it transparently.

11. **J on expanded finding behavior** — When J is pressed while a finding is expanded: move focus to the next finding and auto-collapse the current expanded finding. This prevents accumulated expanded cards cluttering the view (keyboard spike Section 2.5 recommendation). The dev should call `onToggleExpand(activeFindingId)` before advancing if the finding is currently expanded.

### FindingList State After 4.1b

```typescript
// FindingList internal state (component-level, not Zustand)
// NOTE: expandedIds is NOT here — it lives in ReviewPageClient (passed as prop)
// NOTE: minorAccordionValue is string[] (Accordion type="multiple"), value is 'minor-group'
const [activeIndex, setActiveIndex] = useState(0)
const [activeFindingId, setActiveFindingId] = useState<string | null>(null)
// These already exist from 4.1a:
// const [minorAccordionValue, setMinorAccordionValue] = useState<string[]>([])
// expandedIds: Set<string> — from props (ReviewPageClient)

// Derived — NEW in 4.1b
const minorAccordionOpen = minorAccordionValue.includes('minor-group')
const flattenedIds = useMemo(() => {
  const ids = [...criticalIds, ...majorIds]
  if (minorAccordionOpen) ids.push(...minorIds)
  return ids
}, [criticalIds, majorIds, minorIds, minorAccordionOpen])

// Focus stability: recalculate activeIndex when list changes (REPLACES existing reset-to-0)
// Must REMOVE the existing `if (sorted.length !== prevSortedLength) setActiveIndex(0)` logic
useEffect(() => {
  if (!activeFindingId) return
  const newIndex = flattenedIds.indexOf(activeFindingId)
  if (newIndex !== -1) {
    setActiveIndex(newIndex)
  } else {
    // Finding was removed — advance to nearest
    const safeIndex = Math.min(activeIndex, flattenedIds.length - 1)
    setActiveIndex(safeIndex)
    setActiveFindingId(flattenedIds[safeIndex] ?? null)
  }
}, [flattenedIds]) // eslint-disable-line react-hooks/exhaustive-deps
```

### Keyboard Handler Registration Pattern

```typescript
// In FindingList component — ONLY J/K/Arrow registered here
// Enter/Esc handled by per-row onKeyDown on FindingCardCompact (KEEP from 4.1a)
// Esc escape layer managed via useFocusManagement.pushEscapeLayer
const { register } = useKeyboardActions()

useEffect(() => {
  const cleanups = [
    register('j', () => navigateNext(), { scope: 'review', description: 'Next finding' }),
    register('ArrowDown', () => navigateNext(), { scope: 'review', description: 'Next finding' }),
    register('k', () => navigatePrev(), { scope: 'review', description: 'Previous finding' }),
    register('ArrowUp', () => navigatePrev(), { scope: 'review', description: 'Previous finding' }),
  ]
  return () => cleanups.forEach(fn => fn())
}, [navigateNext, navigatePrev])

// navigateNext should auto-collapse current finding before moving (Design Decision #11)
const navigateNext = useCallback(() => {
  if (activeFindingId && expandedIds.has(activeFindingId)) {
    onToggleExpand(activeFindingId) // auto-collapse before moving
  }
  setActiveIndex(prev => (prev + 1) % flattenedIds.length)
}, [activeFindingId, expandedIds, onToggleExpand, flattenedIds.length])
```

### DOM Focus Wiring Pattern

```typescript
// Focus DOM element when activeIndex changes
const gridRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!activeFindingId || !gridRef.current) return
  requestAnimationFrame(() => {
    const row = gridRef.current?.querySelector(
      `[data-finding-id="${activeFindingId}"]`
    ) as HTMLElement | null
    if (row && document.activeElement !== row) {
      row.focus({ preventScroll: false }) // native scrollIntoView
    }
  })
}, [activeFindingId])
```

### Guardrails Applicable to This Story

| # | Guardrail | Task |
|---|-----------|------|
| #27 | Focus indicator: 2px indigo, 4px offset | AC1, AC6 (visible on all state backgrounds) |
| #28 | Single-key hotkeys: scoped + suppressible | AC1, AC6 (J/K suppressed in inputs/modals) |
| #29 | Grid navigation: roving tabindex | AC1 (DOM focus via roving tabindex) |
| #31 | Escape key hierarchy | AC2 (expanded card collapses before parent) |
| #32 | Auto-advance to next Pending | NOT in 4.1b scope (Story 4.2 — after review action) |
| #34 | No browser shortcut override | AC3 (Ctrl+Z/A not intercepted in 4.1b) |
| #37 | prefers-reduced-motion | AC6 (scroll behavior instant if reduced) |
| #40 | No focus stealing on mount | AC3 (no auto-focus on page load) |

### Project Structure Notes

Modified files:
```
src/features/review/components/FindingList.tsx              <- MODIFIED (keyboard nav logic, flattenedIds, focus stability)
src/features/review/components/FindingList.keyboard.test.tsx <- NEW (keyboard-specific tests)
src/features/review/components/FindingCardCompact.tsx        <- MODIFIED (add findingIndex/totalFindings props, aria-label, aria-rowindex)
src/features/review/components/FindingCardCompact.test.tsx   <- MODIFIED (update for new props + aria-label tests)
src/features/review/components/ReviewPageClient.tsx          <- MODIFIED (aria-rowcount on grid, possibly move role="grid" to FindingList)
e2e/review-keyboard.spec.ts                                 <- MODIFIED (rewrite TD-E2E-014 for inline expand, not Sheet)
_bmad-output/implementation-artifacts/tech-debt-tracker.md   <- TD-E2E-014 RESOLVED
```

No new hooks. No new components. No new dependencies.

### Previous Story Intelligence (Story 4.1a)

- **CR rounds:** 2 (12 findings R1 + 12 findings R2)
- **Key learnings from 4.1a:**
  - `FindingList.tsx` has `activeIndex` state but it's only used for isActive prop — NOT wired to DOM focus yet. 4.1b wires it
  - `FindingCardCompact` has per-row `onKeyDown` for Enter/Esc — 4.1b KEEPS these (additive J/K at grid level)
  - `flattenedIds` concept doesn't exist yet — 4.1b introduces it for navigation across severity groups
  - Dev Note #11 from 4.1a explicitly calls out focus stability on Realtime insertion as a 4.1b handoff
  - `animate-fade-in` on new findings works — no changes needed for 4.1b
  - `data-finding-id` attribute is already on every FindingCardCompact row — ready for `.querySelector()`

- **Files from 4.1a that 4.1b touches:** FindingList.tsx, FindingCardCompact.tsx
- **Files from 4.0 that 4.1b uses (read-only):** use-keyboard-actions.ts, use-focus-management.ts, ReviewPageClient.tsx

### Git Intelligence (last 5 commits)

```
1499dfc fix(review): Story 4.1a CR R2 — 12 fixes (3H+5M+4L) all tests green
bcc4562 fix(e2e): expand minor accordion before checking finding visibility
047f6e2 fix(review): Story 4.1a CR R1 — 12 fixes (3H+5M+4L) all tests green
7efd0d8 fix(e2e): update E2E specs for Story 4.1a progressive disclosure changes
9bb9944 feat(review): Story 4.1a — Finding List Display & Progressive Disclosure
```

Pattern: Conventional Commits, `fix(scope): description`. Recent focus on review component refactoring (FindingCard/Compact split, progressive disclosure, CR fixes). E2E assertion updates for new component structure.

### Cross-Story Dependencies

| Depends on | Status | What 4.1b uses |
|------------|--------|----------------|
| Story 4.0 (Review Infrastructure) | `done` | useKeyboardActions, useFocusManagement, ARIA grid/row foundation |
| Story 4.1a (Finding List Display) | `done` ✓ | FindingList, FindingCardCompact, roving tabIndex, data-finding-id |

| Produces for | What is produced |
|-------------|------------------|
| Story 4.1c (Detail Panel) | Keyboard focus selection → detail sheet content sync |
| Story 4.2 (Core Actions) | J/K + Enter/Esc foundation → 4.2 adds A/R/F handlers + auto-advance |
| Story 4.4a (Bulk Operations) | Focused row + Shift+J/K range selection |
| Story 4.5 (Filter/Search) | Focus management integration with filter bar Tab order |

### E2E Testing Patterns (from e2e-testing-gotchas.md Section 10)

Key patterns to use for TD-E2E-014:

```typescript
// Navigate to Nth finding via J presses
async function navigateToFinding(page: Page, grid: Locator, position: number) {
  await grid.focus()
  for (let i = 0; i < position; i++) {
    await page.keyboard.press('j')
    await page.waitForTimeout(100) // animation frame
  }
}

// Verify roving tabindex — check which row has tabIndex=0
async function assertActiveFinding(grid: Locator, expectedId: string) {
  const activeRow = grid.locator('[tabindex="0"]')
  await expect(activeRow).toHaveAttribute('data-finding-id', expectedId)
}

// Test expand/collapse
await page.keyboard.press('Enter')
await expect(grid.locator(`[data-finding-id="${id}"]`))
  .toHaveAttribute('aria-expanded', 'true')

await page.keyboard.press('Escape')
await expect(grid.locator(`[data-finding-id="${id}"]`))
  .toHaveAttribute('aria-expanded', 'false')
```

### Scope Boundaries (What 4.1b does NOT do)

- **NO review action handlers** — A/R/F/N/S remain no-op (Story 4.2)
- **NO auto-advance after action** — useFocusManagement.autoAdvance is called in Story 4.2
- **NO Ctrl+Z undo** — Story 4.4b
- **NO Shift+Click/Shift+J bulk selection** — Story 4.4a
- **NO Command Palette (Ctrl+K)** — Story 4.5
- **NO detail panel content sync** — Story 4.1c (FindingDetailSheet population)
- **NO focus wrap preference toggle** — focus wrap is always on

### Architecture Assumption Checklist Sign-off

```
Story: 4.1b — Keyboard Navigation & Focus Management
Date:  2026-03-10
Reviewed by: Bob (SM)

Sections passed:  [x] 1  [x] 2  [x] 3  [x] 4  [x] 5  [x] 6  [x] 7  [x] 8  [x] 9
Issues found: None — pure UI/keyboard work, no DB/API/new routes
AC revised: [ ] No — AC LOCKED
```

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md` — Story 4.1b AC]
- [Source: `_bmad-output/planning-artifacts/research/keyboard-focus-spike-2026-03-08.md` — Roving tabindex, useKeyboardActions API, useFocusManagement API]
- [Source: `_bmad-output/planning-artifacts/research/epic-4-proactive-guardrails-2026-03-08.md` — Guardrails #27-31, #34, #37, #40]
- [Source: `_bmad-output/accessibility-baseline-2026-03-08.md` — Issues #13-15 (keyboard nav), #19 (focus order)]
- [Source: `_bmad-output/e2e-testing-gotchas.md` — Section 10: E2E keyboard testing patterns]
- [Source: `_bmad-output/implementation-artifacts/4-1a-finding-list-display-progressive-disclosure.md` — Previous story intelligence, Dev Note #11 (focus stability handoff)]
- [Source: `_bmad-output/implementation-artifacts/tech-debt-tracker.md` — TD-E2E-014]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- React Compiler lint: `initializedRef.current` during render → replaced with state-based init
- React Compiler lint: `setActiveFindingId` in useEffect → converted to "adjust state during render" pattern
- 39 regressions in ReviewPageClient tests → missing `useKeyboardActions`/`useFocusManagement` mocks
- 1 regression in story40 test → `role="grid"` moved to FindingList, need findings to render grid

### Pre-CR Scan Documentation

Ran 3 mandatory pre-CR agents before CR R1 submission:
1. **code-quality-analyzer** — Identified: 1C (false positive — mount guard present), 3H, 8M, 4L
2. **anti-pattern-detector** — No anti-pattern violations found
3. **tenant-isolation-checker** — N/A (no DB queries in 4.1b)

### Completion Notes List

- All 44 ATDD keyboard tests pass (0 skipped)
- 398 review unit tests pass (0 failures)
- Type-check clean, lint clean on modified files
- TD-E2E-014 resolved — E1 test unskipped with inline expand assertions
- Pre-existing flaky tests (TaxonomyManager DnD) pass individually — not a regression
- **CR R1 fix (9 findings: 3H+4M+2L):**
  - H1: DOM focus useEffect mount guard — skip `.focus()` on null→first ID transition (G#40)
  - H2: T3.3 test strengthened with rAF mock for proper focus stealing detection
  - H3: `cancelAnimationFrame` cleanup added to DOM focus useEffect
  - M1: Added `role="gridcell"` wrapper in FindingCardCompact (ARIA Grid Pattern)
  - M2: Mouse click → activeFindingId sync via handleGridClick + new T3.5 test
  - M3: Escape layer boolean tracking with ref for latest activeFindingId (prevents accumulation)
  - M4: Pre-CR scan documentation added to story file
  - L1: handleGridFocus simplified with comment (rAF null safety)
  - L2: Escape layer comment clarifying hierarchy intent
  - React Compiler lint fix: `activeFindingIdRef.current` assignment moved to useEffect
  - Post-fix: 45 keyboard tests pass, 399 review tests pass, type-check + lint clean
- **CR R2 fix (6 findings: 0C+1H+2M+3L):**
  - H1: T6.4 conditional assertion removed — unconditional `expect(scrollSpy)` (anti-pattern #39)
  - M1: T3.2 test renamed to match actual behavior (`roving tabindex` not `DOM focus`)
  - M2: T3.6 new test — Minor click with accordion OPEN syncs activeFindingId
  - L1: `gridFocusRafRef` + `cancelAnimationFrame` in handleGridFocus (leak prevention)
  - L2: T-IME-01 improved — asserts all 4 registered keys (j/k/ArrowDown/ArrowUp)
  - L3: T-SCROLL-01 deduplicated — focus spy assertion replaces coverage-only test
  - Post-fix: 46 keyboard tests pass, 400 review tests pass, type-check + lint clean
- **CR exit: 0C+0H after R2 fixes — Story DONE**

### File List

| File | Action | Description |
|------|--------|-------------|
| `src/features/review/components/FindingList.tsx` | MODIFIED | Core keyboard navigation: flattenedIds, ID-based focus tracking, J/K/Arrow registration, auto-collapse (DD#11), escape layers, Tab re-entry, Minor accordion integration, focus stability (AC5). CR R1: mount guard (H1), rAF cleanup (H3), mouse sync (M2), escape layer fix (M3), ref-in-useEffect lint fix. CR R2: gridFocusRafRef leak fix (L1) |
| `src/features/review/components/FindingList.keyboard.test.tsx` | MODIFIED | 46 ATDD tests (44 original + T3.5 + T3.6). CR R1: T3.3 rAF mock (H2), T3.5 mouse click sync (M2). CR R2: T6.4 unconditional assertion (H1), T3.2 rename (M1), T3.6 Minor accordion click (M2), T-IME-01 improved (L2), T-SCROLL-01 deduplicated (L3) |
| `src/features/review/components/FindingCardCompact.tsx` | MODIFIED | Added `findingIndex`/`totalFindings` props, `aria-label`, `aria-rowindex`. CR R1: `role="gridcell"` wrapper (M1) |
| `src/features/review/components/FindingCardCompact.test.tsx` | MODIFIED | Updated all renders with new required props |
| `src/features/review/components/ReviewPageClient.tsx` | MODIFIED | Removed `role="grid"` from wrapper (moved to FindingList) |
| `src/features/review/components/ReviewPageClient.test.tsx` | MODIFIED | Added `useKeyboardActions`/`useFocusManagement` mocks |
| `src/features/review/components/ReviewPageClient.story33.test.tsx` | MODIFIED | Added `useKeyboardActions`/`useFocusManagement` mocks |
| `src/features/review/components/ReviewPageClient.story34.test.tsx` | MODIFIED | Added `useKeyboardActions`/`useFocusManagement` mocks |
| `src/features/review/components/ReviewPageClient.story35.test.tsx` | MODIFIED | Added `useKeyboardActions`/`useFocusManagement` mocks |
| `src/features/review/components/ReviewPageClient.story40.test.tsx` | MODIFIED | Added mocks + provided finding for grid test |
| `e2e/review-keyboard.spec.ts` | MODIFIED | E1 unskipped, seed updated (3 major), inline expand assertions |
| `_bmad-output/implementation-artifacts/tech-debt-tracker.md` | MODIFIED | TD-E2E-014 → RESOLVED |
