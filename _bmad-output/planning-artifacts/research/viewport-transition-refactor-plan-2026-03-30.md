# Viewport Transition Refactor Plan

**Date:** 2026-03-30
**Status:** Planning (NOT code)
**Scope:** Extract scattered responsive viewport transition logic into `useViewportTransition` hook
**Motivation:** 5/6 production bugs in Story 5.3 were responsive-related. Root cause: viewport transition logic scattered across 3 files with no single source of truth.

---

## 1. Current State Analysis

### 1.1 The 6 Responsive Bugs Fixed in Story 5.3

| # | Bug | Root Cause | File(s) |
|---|-----|-----------|---------|
| 1 | Sheet not opening at laptop/mobile on click | `handleFindingSelect` only ran on desktop due to guard logic | `ReviewPageClient.tsx` |
| 2 | Detail finding showed `null` at laptop | `detailFindingId` derivation was wrong for non-desktop | `ReviewPageClient.tsx` |
| 3 | Touch target < 44px | `FindingCardCompact` row height 41.77px | `FindingCardCompact.tsx` (not responsive logic) |
| 4 | J/K at laptop = stale Sheet content | `navigateNext`/`navigatePrev` didn't update `selectedId` or close Sheet | `ReviewPageClient.tsx`, `FindingList.tsx` |
| 5 | Mobile close Sheet -> resize to laptop = phantom Sheet re-open | `selectedId` preserved for toggle button but not cleared on mobile->laptop transition | `ReviewPageClient.tsx` |
| 6 | Mobile close clears `selectedId` | `handleSheetChange` at mobile cleared `selectedId`, preventing toggle button from appearing | `ReviewPageClient.tsx` |

**Pattern:** 5 of 6 bugs are about state synchronization across viewport transitions. Bug #3 is a CSS issue (out of scope).

### 1.2 Responsive State Inventory

All responsive-related state currently scattered in `ReviewPageClient.tsx`:

| State | Location | Purpose |
|-------|----------|---------|
| `isDesktop` | `useIsDesktop()` hook (line 195) | >= 1440px breakpoint |
| `isLaptop` | `useIsLaptop()` hook (line 196) | >= 1024px breakpoint |
| `layoutMode` | Derived from isDesktop/isLaptop (line 197) | `'desktop' \| 'laptop' \| 'mobile'` |
| `selectedId` | Zustand store (`useFileState`) | Which finding is "open" in detail panel |
| `mobileDrawerOpen` | Local `useState` (line 1381) | Whether mobile Sheet is visible |
| `activeFindingState` | Local `useState` (line 435) | Which finding is focused in the list |
| `activeFindingIdRef` | Local `useRef` (line 434) | Synchronous access for hotkeys |
| `selectedIdFromClickRef` | Local `useRef` (line 438) | Guards infinite loop between click -> store sync -> list re-sync |
| `prevLayoutMode` | "Adjust state during render" pattern (line 465) | Detects desktop <-> non-desktop transitions |
| `prevLayoutForSheet` | "Adjust state during render" pattern (line 1392) | Detects mobile -> laptop phantom Sheet |
| `sheetOpen` | Derived (line 1406) | Complex ternary combining isDesktop, isLaptop, selectedId, mobileDrawerOpen |

### 1.3 Responsive Logic Distribution

#### ReviewPageClient.tsx (~2165 lines)

1. **`handleActiveFindingChange`** (line 440-457) — Conditional `setSelectedFinding` based on `isDesktop`. Desktop syncs immediately; laptop/mobile does NOT (to prevent Sheet auto-open).

2. **Viewport transition sync block** (line 465-486) — "Adjust state during render" pattern:
   - Desktop -> non-desktop: sync `selectedId` from `activeFindingState`
   - Non-desktop -> desktop: sync `selectedId` from `activeFindingState` (CR-R2 F8)

3. **Phantom Sheet prevention** (line 1392-1403) — "Adjust state during render" pattern:
   - Mobile -> laptop: if `mobileDrawerOpen=false` and `selectedId !== null`, clear `selectedId`

4. **`handleFindingSelect`** (line 1268-1281) — User click on finding at non-desktop:
   - Sets `selectedId` via store
   - Mobile only: sets `mobileDrawerOpen(true)`

5. **`handleNavigateAway`** (line 1285-1290) — J/K navigation closes Sheet:
   - Non-desktop: clears `selectedId` + `mobileDrawerOpen`

6. **`sheetOpen` derivation** (line 1406-1411) — Complex ternary:
   ```
   desktop ? false : laptop ? selectedId !== null : mobileDrawerOpen && selectedId !== null
   ```

7. **`handleSheetChange`** (line 1412-1422) — Sheet close callback:
   - Laptop: clears `selectedId`
   - Mobile: clears `mobileDrawerOpen` only (preserves `selectedId` for toggle button)

8. **`detailFindingId` derivation** (line 1311) — Desktop uses `activeFindingState`, others use `selectedId`

9. **`showToggleButton`** (line 1382) — Derived: `!isDesktop && !isLaptop && selectedId !== null && !mobileDrawerOpen`

10. **Zone 3 rendering** (line 2042-2096) — Conditional: desktop renders `<aside>` with `FindingDetailContent`, non-desktop renders `<FindingDetailSheet>`

#### FindingList.tsx (~491 lines)

1. **`onFindingSelect` callback** (line 24) — Called on user click/Enter (signals "open Sheet at non-desktop")
2. **`onNavigateAway` callback** (line 26) — Called on J/K navigate (signals "close Sheet at non-desktop")
3. Both called from `navigateNext`/`navigatePrev` (line 271, 280) and `FindingCardCompact`

**Note:** FindingList itself has NO viewport awareness. It delegates viewport decisions to parent via callbacks. This is correct separation of concerns.

#### FindingDetailSheet.tsx (~145 lines)

1. **`useIsLaptop()` hook** (line 76) — Responsive width: laptop=360px, tablet/mobile=300px
2. Width class derivation (line 95-97) — Conditional CSS class based on `isLaptop`

**Note:** This component is self-contained for its width logic. The problematic logic is NOT here -- it's in the parent that decides when to open/close the Sheet.

### 1.4 State Flow Diagram

```
                    Desktop (>= 1440px)
                    ┌──────────────────┐
                    │ activeFindingId   │──→ selectedId (store) ──→ <aside> FindingDetailContent
                    │ (always synced)   │
                    └──────────────────┘
                             │ viewport transition
                             ▼
                    Laptop (1024-1439px)
                    ┌──────────────────┐
                    │ activeFindingId   │──✗── selectedId NOT auto-synced
                    │ (list focus)      │      selectedId ── set by click (handleFindingSelect)
                    │                  │      Sheet open = selectedId !== null
                    └──────────────────┘
                             │ viewport transition
                             ▼
                    Mobile (< 1024px)
                    ┌──────────────────┐
                    │ activeFindingId   │──✗── selectedId NOT auto-synced
                    │ (list focus)      │      selectedId ── set by click (handleFindingSelect)
                    │ mobileDrawerOpen  │      Sheet open = mobileDrawerOpen AND selectedId !== null
                    │ toggleButton      │      toggle visible = selectedId AND NOT mobileDrawerOpen
                    └──────────────────┘
```

---

## 2. Proposed Hook API Design

### 2.1 Hook: `useViewportTransition`

```typescript
type LayoutMode = 'desktop' | 'laptop' | 'mobile'

type UseViewportTransitionOptions = {
  /** Zustand store setter for selectedId */
  setSelectedFinding: (id: string | null) => void
}

type UseViewportTransitionReturn = {
  // ── Read-only state ──
  layoutMode: LayoutMode
  isDesktop: boolean
  isLaptop: boolean

  // ── Sheet state (derived, NOT direct state) ──
  sheetOpen: boolean

  // ── Mobile toggle button ──
  showToggleButton: boolean

  // ── Detail panel finding derivation ──
  /** Desktop: activeFindingId, non-desktop: selectedId */
  detailFindingId: string | null

  // ── Callbacks for consumers ──

  /** Called when user clicks a finding in FindingList (opens Sheet at non-desktop) */
  handleFindingSelect: (id: string) => void

  /** Called when J/K navigates away (closes Sheet at non-desktop) */
  handleNavigateAway: () => void

  /** Called when Sheet open state changes (user closes Sheet) */
  handleSheetChange: (open: boolean) => void

  /** Called when mobile toggle button clicked */
  handleToggleDrawer: () => void

  /** Called when active finding changes in FindingList grid */
  handleActiveFindingChange: (id: string | null) => void

  // ── Refs for hotkey access ──
  activeFindingIdRef: React.RefObject<string | null>
  activeFindingState: string | null
  selectedIdFromClickRef: React.RefObject<boolean>
}
```

### 2.2 Internal State Management

The hook encapsulates:

| Current Location | Hook Internal |
|-----------------|---------------|
| `isDesktop`, `isLaptop` calls | `useIsDesktop()`, `useIsLaptop()` inside hook |
| `layoutMode` derivation | `getLayoutMode()` inside hook |
| `mobileDrawerOpen` useState | Moved inside hook |
| `activeFindingState` useState | Moved inside hook |
| `activeFindingIdRef` useRef | Moved inside hook |
| `selectedIdFromClickRef` useRef | Moved inside hook |
| `prevLayoutMode` render-time sync | Moved inside hook |
| `prevLayoutForSheet` render-time sync | Moved inside hook |
| `sheetOpen` derivation | Moved inside hook |
| `showToggleButton` derivation | Moved inside hook |
| `detailFindingId` derivation | Moved inside hook |
| `handleFindingSelect` callback | Moved inside hook |
| `handleNavigateAway` callback | Moved inside hook |
| `handleSheetChange` callback | Moved inside hook |
| `handleActiveFindingChange` callback | Moved inside hook |

### 2.3 Integration with Zustand Store

The hook reads `selectedId` from the store via `useFileState` and writes via `setSelectedFinding`. It does NOT own `selectedId` -- the store remains the source of truth. The hook owns:

- `mobileDrawerOpen` (local state -- no persistence needed)
- `activeFindingState` / `activeFindingIdRef` (local state + ref for hotkeys)
- `selectedIdFromClickRef` (guard ref)
- Layout transition detection (render-time adjustment pattern)

### 2.4 What Stays in ReviewPageClient

- **Zone 3 rendering logic** (`isDesktop ? <aside> : <FindingDetailSheet>`) -- uses `layoutMode` from hook
- **All non-responsive state** (findingsMap, score, filters, undo/redo, bulk, etc.)
- **`data-layout-mode` attribute** -- uses `layoutMode` from hook
- **All keyboard handlers** -- use `activeFindingIdRef` from hook
- **All action handlers** -- use `activeFindingState` from hook

### 2.5 What Stays in FindingDetailSheet

- **`useIsLaptop()` for width** -- this is self-contained UI concern, not transition logic. Keep as-is.

### 2.6 What Stays in FindingList

- **No change.** FindingList already delegates viewport decisions via callbacks. The parent (ReviewPageClient) passes the hook's callbacks instead of inline functions.

---

## 3. Migration Plan

### Phase 1: Create Hook with Tests (Low Risk)

**Step 1.1:** Create `src/features/review/hooks/use-viewport-transition.ts`
- Extract all state and logic listed in Section 2.2
- Hook accepts `{ setSelectedFinding, selectedId, fileId }` as options
- Hook returns the API from Section 2.1
- No changes to existing files yet

**Step 1.2:** Create `src/features/review/hooks/use-viewport-transition.test.ts`
- Unit tests for all 6 bug scenarios:
  - T1: Desktop -> laptop preserves selectedId
  - T2: Laptop -> desktop preserves selectedId
  - T3: Mobile -> laptop clears selectedId when mobileDrawerOpen=false (phantom prevention)
  - T4: J/K at non-desktop closes Sheet (handleNavigateAway clears state)
  - T5: Mobile Sheet close preserves selectedId for toggle button
  - T6: `sheetOpen` derivation is correct for all 3 layout modes
- Unit tests for all state transitions:
  - T7: handleFindingSelect at desktop = no-op (returns early)
  - T8: handleFindingSelect at laptop = sets selectedId
  - T9: handleFindingSelect at mobile = sets selectedId + mobileDrawerOpen
  - T10: handleActiveFindingChange at desktop = syncs to selectedId
  - T11: handleActiveFindingChange at laptop = does NOT sync to selectedId
  - T12: detailFindingId uses activeFindingState at desktop, selectedId at non-desktop

### Phase 2: Wire Hook into ReviewPageClient (Medium Risk)

**Step 2.1:** Import `useViewportTransition` in ReviewPageClient.tsx
- Replace all extracted state with hook return values
- Specific replacements:
  ```
  - const isDesktop = useIsDesktop()          -> const { isDesktop, ... } = useViewportTransition(...)
  - const isLaptop = useIsLaptop()            -> (from hook)
  - const layoutMode = getLayoutMode(...)     -> (from hook)
  - const [mobileDrawerOpen, set...] = ...    -> (from hook)
  - const [activeFindingState, set...] = ...  -> (from hook)
  - const activeFindingIdRef = useRef(...)     -> (from hook)
  - const selectedIdFromClickRef = useRef(...) -> (from hook)
  - const [prevLayoutMode, set...] = ...      -> (from hook, internal)
  - const [prevLayoutForSheet, set...] = ...  -> (from hook, internal)
  - const sheetOpen = ...                     -> (from hook)
  - const showToggleButton = ...              -> (from hook)
  - const detailFindingId = ...               -> (from hook)
  - const handleFindingSelect = ...           -> (from hook)
  - const handleNavigateAway = ...            -> (from hook)
  - handleSheetChange function                -> (from hook)
  - handleToggleDrawer function               -> (from hook)
  - handleActiveFindingChange callback        -> (from hook)
  ```

**Step 2.2:** Remove now-dead code from ReviewPageClient.tsx
- Remove `getLayoutMode` function (line 164-168)
- Remove all replaced state/ref declarations
- Remove all replaced callback declarations
- Remove all render-time adjustment blocks for viewport transitions

**Estimated line reduction:** ~80-100 lines from ReviewPageClient.tsx (moved to ~120-line hook)

### Phase 3: Verify (Critical)

**Step 3.1:** Run full test suite
```bash
npm run test:unit
npm run lint
npm run type-check
```

**Step 3.2:** Run responsive E2E tests
```bash
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-responsive.spec.ts
```

**Step 3.3:** Run all review-related E2E tests
```bash
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-actions.spec.ts e2e/review-responsive.spec.ts
```

---

## 4. Risk Assessment

### 4.1 High-Risk Areas

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `activeFindingIdRef` used by 6+ hotkey handlers | Broken hotkeys (A/R/F/N/S/O) | Hook returns the same ref, callers use unchanged |
| `selectedIdFromClickRef` prevents infinite loop | Infinite re-render | Hook must expose this ref to pass to FindingList |
| Render-time adjustment pattern (prevLayoutMode) | Must execute during render, not in useEffect | Hook uses same "store-prev-compare" pattern internally |
| `handleActiveFindingChange` is a useCallback dep for multiple effects | Stale closures | Hook must have stable callback identity (useCallback with correct deps) |
| `mobileDrawerOpen` accessed in `showToggleButton` AND `sheetOpen` AND `handleSheetChange` | Sheet logic regression | All 3 derivations moved together into hook -- single source of truth |

### 4.2 E2E Tests at Risk

All 34 responsive E2E tests in `e2e/review-responsive.spec.ts`:

| Test Group | Count | Risk Level |
|------------|-------|-----------|
| T1.x Desktop layout | 6 | Low (no Sheet logic) |
| T2.x Laptop layout | 7 | **High** (Sheet open/close) |
| T3.x Mobile layout | 7 | **High** (mobileDrawerOpen + toggle) |
| T4.x Breakpoint transitions | 6 | **High** (viewport transition sync) |
| RT-x Accessibility/Motion | 8 | Low (no state logic) |

High-risk tests (20/34): All tests involving Sheet open/close, toggle button, viewport transitions.

### 4.3 Incremental vs Big-Bang

**Recommendation: Big-bang within Phase 2**, but with Phase 1 as a safety gate.

Rationale:
- Incremental (move one piece at a time) would create an intermediate state where BOTH the hook AND ReviewPageClient own parts of the responsive logic. This is the exact problem we're solving -- splitting ownership causes bugs.
- Big-bang risk is mitigated by:
  1. Phase 1 creates the hook + tests WITHOUT touching ReviewPageClient
  2. Phase 2 is a single commit that replaces all scattered logic at once
  3. Phase 3 runs all 34 E2E tests before merging

**Branch strategy:** Feature branch `refactor/viewport-transition-hook`, PR to main with all 3 phases.

---

## 5. E2E Test Verification Strategy

### 5.1 Pre-Refactor Baseline

Before starting Phase 2, run responsive E2E and record pass count:
```bash
INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-responsive.spec.ts --reporter=list
```
Expected: 34/34 PASS

### 5.2 Post-Refactor Verification

After Phase 2:
1. `npm run test:unit` -- all unit tests pass (including new hook tests)
2. `npm run lint` + `npm run type-check` -- zero errors
3. Full responsive E2E: 34/34 PASS
4. Review actions E2E: all PASS (hotkeys depend on `activeFindingIdRef`)
5. Manual smoke test: resize browser window through desktop -> laptop -> mobile -> desktop and verify:
   - Sheet opens/closes correctly at each breakpoint
   - J/K navigation works at each breakpoint
   - Mobile toggle button appears/disappears correctly
   - No phantom Sheet on viewport transitions

### 5.3 No New E2E Tests Needed

The existing 34 tests already cover all 6 bug scenarios. The refactor should be behavior-preserving -- same inputs, same outputs, just organized differently.

---

## 6. Complexity Estimate

| Phase | Effort | Files Changed |
|-------|--------|---------------|
| Phase 1: Create hook + tests | 2-3 hours | 2 new files |
| Phase 2: Wire into ReviewPageClient | 1-2 hours | 1 file modified |
| Phase 3: Verify | 1 hour | 0 files |
| **Total** | **4-6 hours** | **2 new + 1 modified** |

**Complexity rating:** Medium. The logic is well-understood (all 6 bugs already fixed), and the extraction is mechanical. The risk is in ensuring no callback identity changes break React memoization or create stale closures.

---

## 7. Non-Goals (Explicitly Out of Scope)

1. **FindingDetailSheet width logic** -- self-contained, works fine, leave it
2. **FindingList callbacks** -- already properly delegated via props, no change needed
3. **Zustand store changes** -- `selectedId` stays in store. Hook is a consumer, not a replacement
4. **`useIsDesktop`/`useIsLaptop`/`useMediaQuery` hooks** -- shared utility hooks, not review-specific. Keep in `src/hooks/`
5. **FindingCardCompact touch target fix** -- CSS concern, already fixed, not responsive logic
6. **Keyboard navigation logic in FindingList** -- J/K handling stays in FindingList. Only the `onNavigateAway` callback (Sheet close) is part of viewport transition

---

## 8. Definition of Done

- [ ] `use-viewport-transition.ts` exists in `src/features/review/hooks/`
- [ ] `use-viewport-transition.test.ts` has >= 12 unit tests covering all state transitions
- [ ] `ReviewPageClient.tsx` imports and uses the hook (net reduction of ~80 lines)
- [ ] `npm run test:unit` GREEN
- [ ] `npm run lint` GREEN
- [ ] `npm run type-check` GREEN
- [ ] `review-responsive.spec.ts` 34/34 PASS
- [ ] `review-actions.spec.ts` all PASS
- [ ] No new responsive bugs introduced (manual smoke test at all 3 breakpoints)
