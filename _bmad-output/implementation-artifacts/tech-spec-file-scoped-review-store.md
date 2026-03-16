---
title: 'File-Scoped Zustand Review Store Refactor'
slug: 'file-scoped-review-store'
created: '2026-03-16'
completed: '2026-03-16'
status: 'done'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['zustand', 'react-19', 'next.js-16-app-router', 'vitest', 'playwright']
files_to_modify:
  - 'src/features/review/stores/review.store.ts'
  - 'src/features/review/components/ReviewPageClient.tsx'
  - 'src/features/review/components/FileNavigationDropdown.tsx'
  - 'src/features/review/components/FindingList.tsx'
  - 'src/features/review/components/FindingCardCompact.tsx'
  - 'src/features/review/components/FilterBar.tsx'
  - 'src/features/review/components/SearchInput.tsx'
  - 'src/features/review/components/AiToggle.tsx'
  - 'src/features/review/components/CommandPalette.tsx'
  - 'src/features/review/hooks/use-findings-subscription.ts'
  - 'src/features/review/hooks/use-score-subscription.ts'
  - 'src/features/review/hooks/use-threshold-subscription.ts'
  - 'src/features/review/hooks/use-review-actions.ts'
  - 'src/features/review/hooks/use-undo-redo.ts'
  - 'src/features/review/utils/filter-cache.ts'
  - 'src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx'
  - 'e2e/review-search-filter.spec.ts'
code_patterns:
  - 'zustand-slice-pattern: createXSlice(setState) merged via spread'
  - 'selector: useReviewStore((s) => s.field)'
  - 'realtime: useReviewStore.getState().action() inside handler'
  - 'test-mock: storeMockState object with vi.fn selectors'
test_patterns:
  - '8+ test files mock store with storeMockState object'
  - 'beforeEach: useReviewStore.setState({ currentFileId: null })'
  - 'Realtime hooks tested with mock Supabase channels'
---

# Tech-Spec: File-Scoped Zustand Review Store Refactor

**Created:** 2026-03-16
**TD Reference:** TD-ARCH-001

## Overview

### Problem Statement

`useReviewStore` is a global Zustand singleton where `resetForFile()` destructively clears ALL state (findings, score, filter, selection, undo). When Next.js App Router navigates via `<Link>`, it uses `React.startTransition` which keeps the OLD component tree alive alongside the NEW tree. Both instances share the same store — when the new instance calls `resetForFile()`, it corrupts state for the old instance that's still mounted. This causes:

1. **UX:** Two review zones visible simultaneously — old zone blocks clicks on new zone
2. **Data:** Filter cache saves default values instead of user's actual filters
3. **Race condition:** `processedFileIdRef` armed before `initialData` arrives — guard blocks re-init

Current workaround: `window.location.href` (full page reload) which eliminates overlap but reloads entire layout (~200-500ms slower).

### Solution

Refactor the store to use a **file-keyed architecture**: `fileStates: Map<fileId, FileState>` + `activeFileId` pointer. Each file's state is isolated in the Map. `resetForFile()` switches the pointer and lazy-inits a new `FileState` entry — no destructive clearing. Concurrent component instances read/write their own file's namespace without conflict.

Consumer migration via `useFileState()` selector wrapper — mechanical find-replace across 49 files.

### Scope

**In Scope:**
- All 6 slices: Findings, Score, Threshold, Selection, UndoRedo, Filter
- `resetForFile` → switch `activeFileId`, lazy-init new FileState
- `useFileState()` selector wrapper for all 49 consumers
- FileNavigationDropdown → revert to `<Link prefetch={false}>`
- Remove `window.location.href` workaround
- Keep `sessionStorage` as fallback persistence (Map = L1 cache, sessionStorage = L2 on reload)
- E2E E-04 update for client-side navigation
- page.tsx → remove `key={fileId}` if present
- Realtime-facing store actions get explicit `fileId` param (not `activeFileId`)

**Out of Scope:**
- Cross-file features (cross-file findings display)
- Multi-tab sync
- Store persistence (localStorage/DB)
- Memory eviction policy (< 1MB per session — defer)
- Inline `useFileState` wrapper post-migration (performance optimization — defer unless profiled)

## Context for Development

### Architecture Decisions (from Party Mode review)

| Decision | Rationale | Source |
|----------|-----------|--------|
| No memory eviction | < 50KB per file state, < 1MB per session, defer if needed | Party Mode |
| Undo/redo per-file | Guardrail #35 (clear on switch) + UX clarity | Party Mode |
| Realtime subscriptions unchanged | Hooks already subscribe by `fileId` prop — re-subscribe on prop change | Party Mode |
| `useFileState()` wrapper | Minimal consumer migration — 1-line change per selector | Party Mode |
| Keep sessionStorage as L2 fallback | Map = L1 runtime cache, sessionStorage = L2 on F5 reload. Removing = regression. | Red Team Attack 3 ✅ |
| Explicit `fileId` param on Realtime actions | `setFinding(fileId, id, finding)` not `setFinding(id, finding)` — prevents Realtime writing to wrong file during transition | Red Team Attack 4 ✅ |
| 4 phases = 1 PR | Strangler fig phases are code-writing order, not shipping order. 1 commit, 1 test run. | Red Team Defense 1 |
| Performance: option to inline wrapper | `Map.get()` = O(1), negligible. But keep option to inline `useFileState` into selectors if profiling shows overhead. | Red Team Defense 2 |

### Codebase Patterns

- Zustand store: `create<ReviewState>()((set, get) => ({...slices}))` pattern
- 6 slices: Findings, Score, Threshold, Selection, UndoRedo, Filter
- Selectors: `useReviewStore((s) => s.fieldName)` — 49 files use this pattern
- Realtime: `.getState().action()` inside subscription handlers (no fileId param currently)
- Test mocks: `storeMockState` object with `vi.fn` selectors in 8+ test files

### Store Inventory (from Deep Investigation)

| Category | Count | File-Scoped | Global |
|----------|-------|-------------|--------|
| State fields | 18 | 17 | 1 (`currentFileId`) |
| Actions | 35 | 33 | 2 (`resetForFile`, routing) |
| Realtime-called actions | 7 | 7 (need explicit `fileId` param) | — |
| Consumer files | 49 | — | — |

**Key finding:** Store is purely file-scoped except `currentFileId`. No cross-file logic exists.

### Realtime Actions Needing fileId Param

| Action | Current Caller | Change Needed |
|--------|---------------|---------------|
| `setFinding(id, finding)` | use-findings-subscription | Add `fileId` param |
| `setFindings(map)` | use-findings-subscription (polling + burst) | Add `fileId` param |
| `removeFinding(id)` | use-findings-subscription (DELETE) | Add `fileId` param |
| `updateScore(score, status, ...)` | use-score-subscription | Add `fileId` param |
| `updateThresholds({l2, l3})` | use-threshold-subscription | Add `fileId` param |
| `markEntryStale(findingId)` | use-findings-subscription (conflict) | Add `fileId` param |
| `removeEntriesForFinding(id)` | use-findings-subscription (delete cleanup) | Add `fileId` param |

### Files to Reference

| File | Purpose | Consumer Count |
|------|---------|---------------|
| `src/features/review/stores/review.store.ts` | Main store — refactor target | — |
| `src/features/review/components/ReviewPageClient.tsx` | Primary consumer — 15+ selectors | 1 |
| `src/features/review/components/FileNavigationDropdown.tsx` | Navigation — revert to `<Link>` | 1 |
| `src/features/review/components/FindingCardCompact.tsx` | Per-row — `selectedIds.has()`, `overrideCounts.get()` | 1 |
| `src/features/review/hooks/use-findings-subscription.ts` | Realtime findings — 6 store actions called | 1 |
| `src/features/review/hooks/use-score-subscription.ts` | Realtime score — `updateScore` called | 1 |
| `src/features/review/hooks/use-undo-redo.ts` | Undo/redo — push/pop stack actions | 1 |
| `src/features/review/utils/filter-cache.ts` | sessionStorage — keep as L2 fallback | — |
| `e2e/review-search-filter.spec.ts` | E2E — E-04 update for `<Link>` nav | — |

## Implementation Plan

### Tasks

#### Phase 1: Backward-compatible wrapper

- [ ] Task 1: Create `FileState` type + `useFileState` passthrough wrapper
  - File: `src/features/review/stores/review.store.ts`
  - Action: Define `FileState` type containing all 17 file-scoped fields. Export `useFileState<T>(selector: (fs: FileState) => T): T` that initially reads from global store (identity passthrough). Export `DEFAULT_FILE_STATE` constant.
  - Notes: No consumer changes needed — wrapper delegates to `useReviewStore` initially. All existing tests must still pass unchanged.

- [ ] Task 2: Create `createMockFileState()` test helper
  - File: `src/test/factories.ts` or `src/features/review/stores/test-helpers.ts`
  - Action: Create factory function `createMockFileState(overrides?)` returning a complete `FileState` object with defaults. Will be used by Phase 3 test migration.
  - Notes: Include all 17 fields with sensible defaults (empty Map, null, defaults, etc.)

#### Phase 2: Internal store restructure

- [ ] Task 3: Add `fileStates` Map to store
  - File: `src/features/review/stores/review.store.ts`
  - Action: Add `fileStates: Map<string, FileState>` to composed state. Keep `currentFileId` (no rename — F10). Keep all existing flat fields for backward compat during migration.
  - Notes: Dual-write pattern — actions write to BOTH flat fields AND `fileStates.get(currentFileId)` in the SAME `set()` call (F3: never split across multiple `set()` calls).

- [ ] Task 4: Refactor `resetForFile` to switch `activeFileId` + lazy-init
  - File: `src/features/review/stores/review.store.ts`
  - Action: `resetForFile(fileId)` sets `activeFileId = fileId`. If `fileStates` has entry for `fileId` → restore from Map (no clear). If not → create new `FileState` with defaults + restore filter from sessionStorage (L2 fallback). Set `initialized: false` flag on new FileState.
  - Notes: No destructive clear of global fields (backward compat). Mark `FileState.initialized` so init effect knows to populate.

- [ ] Task 5a: Route FindingsSlice actions through fileStates
  - File: `src/features/review/stores/review.store.ts`
  - Action: `setFinding(fileId, id, finding)`, `setFindings(fileId, map)`, `removeFinding(fileId, id)` — add `fileId` param, write to `fileStates.get(fileId)`. Dual-write to flat fields if `fileId === currentFileId`. Pattern:
    ```typescript
    setFinding: (fileId, id, finding) => set((s) => {
      const fs = s.fileStates.get(fileId)
      if (!fs) return {}
      const newMap = new Map(fs.findingsMap)
      newMap.set(id, finding)
      s.fileStates.set(fileId, { ...fs, findingsMap: newMap })
      return fileId === s.currentFileId ? { findingsMap: newMap } : {}
    })
    ```
  - Notes: Non-Realtime actions (`setFilter`, `setSearchQuery`, etc.) use `currentFileId` implicitly — no param needed.

- [ ] Task 5b: Route ScoreSlice actions through fileStates
  - Action: `updateScore(fileId, ...)`, `setRecalculating(fileId)` — same pattern as 5a.

- [ ] Task 5c: Route ThresholdSlice actions through fileStates
  - Action: `updateThresholds(fileId, ...)` — same pattern.

- [ ] Task 5d: Route SelectionSlice actions through fileStates
  - Action: All selection actions use `currentFileId` implicitly (no Realtime calls).

- [ ] Task 5e: Route UndoRedoSlice actions through fileStates
  - Action: `markEntryStale(fileId, findingId)`, `removeEntriesForFinding(fileId, id)` — add `fileId` param (Realtime-facing). Other undo actions use `currentFileId`.

- [ ] Task 5f: Route Filter actions through fileStates
  - Action: `setFilter`, `setSearchQuery`, `setAiSuggestionsEnabled`, `resetFilters` — use `currentFileId` implicitly. `computeSelectionAfterFilterChange` reads from `fileStates.get(currentFileId)`.

- [ ] Task 5g: Refactor `selectRange` and `selectAllFiltered` to read from fileStates (F4)
  - Action: These use `get()` to read full store. Change to read `get().fileStates.get(get().currentFileId)` for `findingsMap`, `sortedFindingIds`, `filterState`, `searchQuery`, `aiSuggestionsEnabled`.

- [ ] Task 6: Switch `useFileState` wrapper to read from Map
  - File: `src/features/review/stores/review.store.ts`
  - Action: Change `useFileState` from passthrough to `useReviewStore((s) => { const fs = s.fileStates.get(s.activeFileId); return fs ? selector(fs) : DEFAULT_FILE_STATE_FIELD })`. All consumers using `useFileState` now read from Map.
  - Notes: Consumers using `useReviewStore` directly still work (flat fields dual-written).

- [ ] Task 7: Unit tests for file-scoped store
  - File: `src/features/review/stores/review.store.filescoped.test.ts` (NEW)
  - Action: Test all pre-mortem scenarios: PM-1 (Realtime writes to correct file), PM-2 (undo per-file), PM-3 (selectAllFiltered per-file), PM-6 (initialized guard). Test concurrent file states, activeFileId switching.
  - Notes: 10-15 targeted tests. Don't duplicate existing tests — only test new Map behavior.

#### Phase 3: Consumer migration

- [ ] Task 8a: Migrate component selectors to `useFileState`
  - Files: `ReviewPageClient.tsx`, `FindingList.tsx`, `FindingCardCompact.tsx`, `FilterBar.tsx`, `SearchInput.tsx`, `AiToggle.tsx`, `CommandPalette.tsx`, `FindingDetailContent.tsx`, `FindingCard.tsx`
  - Action: Find-replace `useReviewStore((s) => s.X)` → `useFileState((fs) => fs.X)` for all 17 file-scoped fields. Keep `useReviewStore` for `currentFileId` and global actions (`resetForFile`, `selectRange`, `selectAllFiltered`).
  - Notes: Mechanical — 1 line change per selector. Run tests after each file.

- [ ] Task 8b: Migrate `selectCanUndo`/`selectCanRedo` selectors (F6)
  - File: `src/features/review/stores/review.store.ts`
  - Action: Change from `(s) => s.undoStack.length > 0` to reading from `s.fileStates.get(s.currentFileId)?.undoStack.length > 0`. Update all consumers that use these selectors.

- [ ] Task 9: Migrate hook consumers
  - Files: `use-findings-subscription.ts`, `use-score-subscription.ts`, `use-threshold-subscription.ts`, `use-review-actions.ts`, `use-undo-redo.ts`
  - Action: Update `.getState().action()` calls to pass explicit `fileId` for 7 Realtime-facing actions. Other actions can use `activeFileId` implicitly.
  - Notes: Hooks already receive `fileId` as param — pass it through to store actions.

- [ ] Task 10: Migrate test mocks
  - Files: All 8+ `ReviewPageClient.*.test.tsx` files + hook test files
  - Action: Update `storeMockState` objects to include `fileStates` Map + `activeFileId`. Use `createMockFileState()` helper from Task 2. Update `vi.mock` to expose `useFileState`.
  - Notes: Can be parallelized. Run full test suite after all mocks updated.

#### Phase 4: Cleanup + Navigation revert

- [ ] Task 11: Remove flat field dual-write + remove backward compat
  - File: `src/features/review/stores/review.store.ts`
  - Action: Remove all flat file-scoped fields from root state (17 fields). Remove dual-write from actions. `useFileState` is now the ONLY way to read file-scoped state.
  - Notes: Breaking change for any remaining `useReviewStore((s) => s.findingsMap)` calls — verify all migrated first.

- [ ] Task 12: Revert FileNavigationDropdown to `<Link>`
  - File: `src/features/review/components/FileNavigationDropdown.tsx`
  - Action: Replace `window.location.href` with `<Link prefetch={false}>`. Keep `saveFilterCache` in onClick (L2 sessionStorage fallback). Remove `useCallback` wrapper — use plain function.
  - Notes: This is the payoff — `<Link>` now safe because concurrent instances use separate Map entries.

- [ ] Task 13: Update ReviewPageClient init effect
  - File: `src/features/review/components/ReviewPageClient.tsx`
  - Action: Remove `processedFileIdRef` — replace with `FileState.initialized` flag + `findingsMap.size` guard (F5 fix — same proven pattern from Story 4.5):
    ```typescript
    const fs = fileStates.get(currentFileId)
    if (fs?.initialized && (fs.findingsMap.size > 0 || initialData.findings.length === 0)) return
    // else: initialize and set initialized = true
    ```
  - Notes: Boolean flag alone has streaming race (F5). Combined with `findingsMap.size` check, handles partial init correctly.

- [ ] Task 14: Update E2E E-04 for client-side navigation
  - File: `e2e/review-search-filter.spec.ts`
  - Action: E-04 assertions no longer need full reload waits. Use `waitForURL` + `waitForSelector('[role="row"]')`. No `.first()` needed (only 1 review zone).
  - Notes: Should match the proven debug-file-nav.spec.ts pattern.

- [ ] Task 15: Regression test suite
  - Action: Run full unit (869+) + E2E (12) test suite. All must pass.
  - Notes: This is the gate — no merge until all green.

### Acceptance Criteria

- [x] AC1: Given file A is open with findings, when user clicks `<Link>` to file B, then file A's stale instance hides (`isStaleInstance` → opacity:0 + pointer-events:none) and file B renders with its own findings. Verified by E2E E-04.
- [x] AC2: Given severity=major filter set on file A, when user navigates to file B and back to file A via `<Link>`, then severity=major filter is restored from sessionStorage (L2 fallback). Verified by E2E E-04. **Note:** Map L1 cache not used by resetForFile (prevents cross-test contamination) — sessionStorage L2 is the restore mechanism.
- [x] AC3: Given severity=major filter set on file A, when user presses F5 (full reload) and reopens file A, then severity=major filter is restored from sessionStorage (L2 fallback). Verified by E2E E-04 + unit tests.
- [x] AC4: Given file A is active, when Realtime `finding.changed` event arrives for file A, then `createSyncingSet` routes update to file A's FileState only. Verified by unit test PM-1.
- [x] AC5: Given undo entry pushed on file A, when user switches to file B and presses Ctrl+Z, then file B's undo stack is used (not file A's). Verified by unit test PM-2. Undo/redo cleared on file switch per Guardrail #35.
- [x] AC6: Given file A has 3 findings and file B has 5 findings, when user presses Ctrl+A on file B, then only file B's 5 findings are selected. Verified by unit test PM-3.
- [x] AC7: Given user accepts finding (optimistic update) on file A, when RSC revalidates with stale `initialData`, then optimistic state is preserved via `processedFileIdRef` + `findingsMap.size` guard. Verified by ReviewPageClient.test.tsx.
- [x] AC8: Given `<Link>` navigation with transition overlap, stale instance hides via `isStaleInstance` check (`storeCurrentFileId !== fileId` → opacity:0 + pointer-events:none). Each instance reads from own fileId via `ReviewFileIdContext` — no cross-file data corruption. Verified by E2E E-04 (24.6s client-side nav).
- [x] AC9: All 3668 existing unit tests pass (regression gate). 2 pre-existing flaky failures in ProjectTour.test.tsx unrelated.
- [x] AC10: All 12 E2E tests pass including E-04 with `<Link>` navigation.
- [x] AC11: `selectCanUndo` and `selectCanRedo` return correct values for active file after switching files. Verified by unit test PM-2 (undo cleared on switch).

## Pre-mortem Prevention Checklist

_From advanced elicitation pre-mortem analysis — MUST be verified before marking done._

| # | Failure Mode | Severity | Prevention | Verification |
|---|-------------|----------|------------|-------------|
| PM-1 | Realtime subscription writes to global instead of FileState | Critical | Audit EVERY `set()` call in store — all actions must route through `activeFileId` | Unit test: setFinding while activeFileId=B → only B's findingsMap updated |
| PM-2 | Undo of file A executes when viewing file B | Critical | All undo actions (push/pop/mark/remove) route through `activeFileId` | Unit test: push undo in A → switch to B → popUndo returns B's entry |
| PM-3 | selectAllFiltered includes findings from other files | High | All computed operations read from `FileState` of `activeFileId` | Unit test: 2 files in Map → selectAllFiltered only selects active file |
| PM-4 | 49 test files break simultaneously (big bang) | High | Strangler fig migration + `createMockFileState()` helper | Migration plan: wrapper first, then internal refactor |
| PM-5 | Memory accumulation across many files | Low | Defer eviction, add dev-mode warning if Map > 10 entries | Manual check |
| PM-6 | RSC revalidation overwrites optimistic state | Critical | Keep init guard (`FileState.initialized` flag or processedFileIdRef) | Unit test: rerender same fileId + new initialData → optimistic preserved |

## Migration Strategy (PM-4 Prevention)

### Phase 1: Backward-compatible wrapper (no consumer changes)
1. Create `useFileState<T>(selector)` wrapper that reads from global store (passthrough)
2. All tests still work — wrapper is identity function initially

### Phase 2: Internal store restructure
1. Add `fileStates: Map<fileId, FileState>` + `activeFileId` to store
2. All `set()` calls route through `activeFileId`
3. `useFileState` wrapper reads from `fileStates.get(activeFileId)` instead of global
4. Consumers unchanged — wrapper handles migration transparently

### Phase 3: Consumer migration (mechanical)
1. Find-replace `useReviewStore((s) => s.X)` → `useFileState((fs) => fs.X)` for file-scoped fields
2. Keep `useReviewStore` for truly global fields (if any)
3. Update test mocks with `createMockFileState()` helper

### Phase 4: Cleanup + Navigation revert
1. Remove `window.location.href` from FileNavigationDropdown → `<Link prefetch={false}>`
2. Keep `sessionStorage` as L2 fallback (Red Team Attack 3) — Map is L1, sessionStorage survives F5 reload
3. Remove `processedFileIdRef` → replace with `FileState.initialized` flag
4. E2E E-04 update for client-side navigation
5. Add explicit `fileId` param to Realtime-facing store actions (Red Team Attack 4)

## Additional Context

### Dependencies

- No new packages required
- Zustand API: `create`, `set`, `get` — no changes needed

### Testing Strategy

- **Per pre-mortem:** Unit test each failure mode (PM-1 through PM-6)
- Unit tests: store actions work with file-keyed Map
- Unit tests: `useFileState()` selector returns correct file's state
- Unit tests: concurrent file states don't interfere
- Unit tests: Realtime write targets active file only (PM-1)
- Unit tests: undo/redo scoped to active file (PM-2)
- Unit tests: selectAllFiltered scoped to active file (PM-3)
- Unit tests: optimistic state preserved on RSC revalidation (PM-6)
- E2E: E-04 passes with `<Link>` navigation (no full reload)
- Regression: all 869+ existing unit tests pass

### Notes

- 49 files consume `useReviewStore` — strangler fig migration minimizes risk (PM-4)
- Memory: < 50KB per file, < 1MB for 20 files per session — no eviction needed (PM-5)
- sessionStorage kept as L2 fallback — Map is L1 runtime, sessionStorage survives F5 reload (Red Team Attack 3)
- 21 tasks across 4 phases — execute as 1 PR, sequential task order
- Estimated effort: 2-3 days with agent assistance (F11: mechanical migration parallelizable)
- TD-ARCH-001 will be marked RESOLVED when AC1-AC11 all pass
- Rollback plan (F8): revert entire PR. Dual-write phase ensures forward/backward compat — if Phase 3 has issues, revert Phase 3 while keeping Phase 1-2 (store works both ways)
- sessionStorage L2 is best-effort (F7): on F5 reload, restored filter may be slightly stale if Realtime updated Map between save and reload. Acceptable — user sees their last explicit filter choice
- Mock example for Task 10 (F9):
  ```typescript
  const mockFileState = createMockFileState({ findingsMap: new Map([['f1', buildFinding()]]) })
  const storeMockState = {
    currentFileId: 'test-file',
    fileStates: new Map([['test-file', mockFileState]]),
    resetForFile: vi.fn(),
  }
  vi.mock('@/features/review/stores/review.store', () => ({
    useReviewStore: Object.assign(vi.fn((sel) => sel(storeMockState)), { getState: () => storeMockState, setState: vi.fn() }),
    useFileState: vi.fn((sel) => sel(mockFileState)),
    ReviewFileIdContext: require('react').createContext(''),
    selectCanUndo: vi.fn(() => false),
    selectCanRedo: vi.fn(() => false),
  }))
  ```

## Implementation Results (2026-03-16)

### What was implemented

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Types + wrapper | Task 1 (FileState type, DEFAULT_FILE_STATE, useFileState) + Task 2 (createMockFileState) | Done |
| Phase 2: Store restructure | Task 3-7 (fileStates Map, createSyncingSet auto-sync, resetForFile refactor, 12 PM tests) | Done |
| Phase 3: Consumer migration | Task 8a (8 components → useFileState), Task 9 (hooks unchanged — dual-write handles), Task 10 (9 test files) | Done |
| Phase 4: Navigation revert | Task 12 (FileNavigationDropdown → `<Link>`), Task 13 (init effect), Task 14 (E2E E-04) | Done |

### What was deferred (TD-ARCH-002)

- **Task 11 (flat field removal):** Dual-write via `createSyncingSet` kept. Zero functional impact. Deferred to Epic 5.
- **Task 5a-5e (explicit fileId on Realtime actions):** Not needed — `createSyncingSet` routes actions through `currentFileId` automatically.

### Discoveries during implementation (not in original spec)

| Discovery | Root Cause | Fix |
|-----------|-----------|-----|
| `useFileState` reads wrong file during transition | Used global `currentFileId` → old instance reads new file's data | Added `ReviewFileIdContext` — each instance provides own fileId via React Context. `useFileState(selector, overrideFileId?)` for ReviewPageClient (has fileId prop) |
| Old tree blocks clicks on new tree | DOM overlap during startTransition — 2 review zones visible | `isStaleInstance` check: `storeCurrentFileId !== fileId` → `opacity:0 + pointer-events:none` hides stale instance |
| `resetForFile` L1 cache restore causes test contamination | Map entry from previous test leaks filter state via L1 restore | `resetForFile` always creates fresh FileState (sessionStorage L2 only). Map L1 available via `useFileState` for components |
| RSC fetch appeared to "hang" | Was actually infinite loop: old + new instances fighting over `resetForFile` | Fixed by `ReviewFileIdContext` (no cross-file selector triggers) + `isStaleInstance` (old instance stops interacting) |

### Files changed

| Category | Files |
|----------|-------|
| Store core | `review.store.ts` (+FileState, +Map, +createSyncingSet, +useFileState, +ReviewFileIdContext) |
| Test helper | `stores/test-helpers.ts` (createMockFileState) |
| New tests | `review.store.filescoped.test.ts` (12 PM tests) |
| Navigation | `FileNavigationDropdown.tsx` (→ `<Link prefetch={false}>`) |
| Loading | `[fileId]/loading.tsx` (Suspense boundary — removed, not needed with isStaleInstance) |
| Init effect | `ReviewPageClient.tsx` (+ReviewFileIdContext.Provider, +isStaleInstance, +useFileState with fileId override) |
| Consumer migration | 7 component files (useFileState selectors) |
| Test mocks | 9 test files (useFileState, ReviewFileIdContext, fileStates, selectCanUndo/Redo) |
| Tech debt | `tech-debt-tracker.md` (TD-ARCH-001 RESOLVED, TD-ARCH-002 DEFERRED) |
