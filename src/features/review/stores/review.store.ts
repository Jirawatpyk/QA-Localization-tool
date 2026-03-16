'use client'

import { create } from 'zustand'

import type {
  DetectedByLayer,
  Finding,
  FindingSeverity,
  FindingStatus,
  LayerCompleted,
  ScoreStatus,
} from '@/types/finding'

// ── Undo/Redo Types (Story 4.4b — SINGLE SOURCE OF TRUTH) ──

/** Full snapshot of a finding row — for undo-delete re-insert */
export type FindingSnapshot = {
  id: string
  segmentId: string | null
  fileId: string
  projectId: string
  tenantId: string
  reviewSessionId: string | null
  status: FindingStatus
  severity: FindingSeverity
  originalSeverity: FindingSeverity | null
  category: string
  description: string
  detectedByLayer: DetectedByLayer
  aiModel: string | null
  aiConfidence: number | null
  suggestedFix: string | null
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  scope: 'per-file' | 'cross-file'
  relatedFileIds: string[] | null
  segmentCount: number
  createdAt: string
  updatedAt: string
}

export type UndoEntryAction =
  | 'accept'
  | 'reject'
  | 'flag'
  | 'note'
  | 'source_issue'
  | 'severity_override'
  | 'add'
  | 'delete'

export type UndoEntry = {
  id: string
  type: 'single' | 'bulk'
  action: UndoEntryAction
  findingId: string | null
  batchId: string | null
  previousStates: Map<string, FindingStatus>
  newStates: Map<string, FindingStatus>
  previousSeverity: {
    severity: FindingSeverity
    originalSeverity: FindingSeverity | null
  } | null
  newSeverity: FindingSeverity | null
  findingSnapshot: FindingSnapshot | null
  description: string
  timestamp: number
  staleFindings: Set<string>
}

// ── Filter State (Story 4.5: extended with category + confidence) ──
// Types and filter helper re-exported from shared util (so store mocks don't break it)

import { loadFilterCache, clearFilterCache } from '@/features/review/utils/filter-cache'
import { findingMatchesFilters, DEFAULT_FILTER_STATE } from '@/features/review/utils/filter-helpers'
import type { FilterState } from '@/features/review/utils/filter-helpers'

/** Compute selection adjustments after any filter/search/AI-toggle change */
function computeSelectionAfterFilterChange(state: ReviewState): Partial<ReviewState> {
  const visibleIds = new Set<string>()
  for (const id of state.sortedFindingIds) {
    const finding = state.findingsMap.get(id)
    if (
      finding &&
      findingMatchesFilters(
        finding,
        state.filterState,
        state.searchQuery,
        state.aiSuggestionsEnabled,
      )
    ) {
      visibleIds.add(id)
    }
  }

  // Intersect selectedIds with visible
  const newSelectedIds = new Set<string>()
  for (const id of state.selectedIds) {
    if (visibleIds.has(id)) newSelectedIds.add(id)
  }

  // Exit bulk mode if selection became empty
  const newSelectionMode: 'single' | 'bulk' =
    newSelectedIds.size === 0 && state.selectionMode === 'bulk' ? 'single' : state.selectionMode

  // Reset selectedId if not visible
  let newSelectedId = state.selectedId
  if (newSelectedId !== null && !visibleIds.has(newSelectedId)) {
    newSelectedId = state.sortedFindingIds.find((id) => visibleIds.has(id)) ?? null
  }

  return {
    selectedIds: newSelectedIds,
    selectionMode: newSelectionMode,
    selectedId: newSelectedId,
  }
}

// ── Findings Slice (Story 4.5: + searchQuery, aiSuggestionsEnabled, per-key setFilter) ──

type FindingsSlice = {
  findingsMap: Map<string, Finding>
  selectedId: string | null
  filterState: FilterState
  /** Visual sort order of finding IDs (synced from FindingList flattenedIds) */
  sortedFindingIds: string[]
  searchQuery: string
  aiSuggestionsEnabled: boolean
  setFinding: (id: string, finding: Finding) => void
  setFindings: (findings: Map<string, Finding>) => void
  removeFinding: (id: string) => void
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  setSelectedFinding: (id: string | null) => void
  setSortedFindingIds: (ids: string[]) => void
  setSearchQuery: (query: string) => void
  setAiSuggestionsEnabled: (enabled: boolean) => void
  /** Batch reset all filters + search to defaults (single state update) */
  resetFilters: () => void
}

const createFindingsSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): FindingsSlice => ({
  findingsMap: new Map(),
  selectedId: null,
  filterState: { ...DEFAULT_FILTER_STATE },
  sortedFindingIds: [],
  searchQuery: '',
  aiSuggestionsEnabled: true,
  setFinding: (id, finding) =>
    set((s) => {
      const newMap = new Map(s.findingsMap)
      newMap.set(id, finding)
      return { findingsMap: newMap }
    }),
  setFindings: (findings) => set({ findingsMap: findings }),
  removeFinding: (id) =>
    set((s) => {
      const newMap = new Map(s.findingsMap)
      newMap.delete(id)
      return { findingsMap: newMap }
    }),
  setFilter: (key, value) =>
    set((s) => {
      const newFilterState = { ...s.filterState, [key]: value }
      const hypothetical: ReviewState = { ...s, filterState: newFilterState } as ReviewState
      return {
        filterState: newFilterState,
        ...computeSelectionAfterFilterChange(hypothetical),
      }
    }),
  setSelectedFinding: (id) => set({ selectedId: id }),
  setSortedFindingIds: (ids) => set({ sortedFindingIds: ids }),
  setSearchQuery: (query) =>
    set((s) => {
      const hypothetical: ReviewState = { ...s, searchQuery: query } as ReviewState
      return {
        searchQuery: query,
        ...computeSelectionAfterFilterChange(hypothetical),
      }
    }),
  setAiSuggestionsEnabled: (enabled) =>
    set((s) => {
      const hypothetical: ReviewState = { ...s, aiSuggestionsEnabled: enabled } as ReviewState
      return {
        aiSuggestionsEnabled: enabled,
        ...computeSelectionAfterFilterChange(hypothetical),
      }
    }),
  resetFilters: () =>
    set((s) => {
      const hypothetical: ReviewState = {
        ...s,
        filterState: { ...DEFAULT_FILTER_STATE },
        searchQuery: '',
        aiSuggestionsEnabled: true,
      } as ReviewState
      return {
        filterState: { ...DEFAULT_FILTER_STATE },
        searchQuery: '',
        aiSuggestionsEnabled: true,
        ...computeSelectionAfterFilterChange(hypothetical),
      }
    }),
})

// ── Score Slice ──

type ScoreSlice = {
  currentScore: number | null
  scoreStatus: ScoreStatus
  layerCompleted: LayerCompleted | null
  autoPassRationale: string | null
  isRecalculating: boolean
  updateScore: (
    score: number,
    status: ScoreStatus,
    layerCompleted?: LayerCompleted | null | undefined,
    autoPassRationale?: string | null | undefined,
  ) => void
  setRecalculating: () => void
}

const createScoreSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): ScoreSlice => ({
  currentScore: null,
  scoreStatus: 'na',
  layerCompleted: null,
  autoPassRationale: null,
  isRecalculating: false,
  updateScore: (score, status, layerCompleted, autoPassRationale) =>
    set({
      currentScore: score,
      scoreStatus: status,
      isRecalculating: false,
      ...(layerCompleted !== undefined ? { layerCompleted } : {}),
      ...(autoPassRationale !== undefined ? { autoPassRationale } : {}),
    }),
  setRecalculating: () => set({ isRecalculating: true, scoreStatus: 'calculating' }),
})

// ── Threshold Slice ──

type ThresholdSlice = {
  l2ConfidenceMin: number | null
  l3ConfidenceMin: number | null
  updateThresholds: (thresholds: { l2ConfidenceMin: number; l3ConfidenceMin: number }) => void
}

const createThresholdSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): ThresholdSlice => ({
  l2ConfidenceMin: null,
  l3ConfidenceMin: null,
  updateThresholds: (thresholds) =>
    set({
      l2ConfidenceMin: thresholds.l2ConfidenceMin,
      l3ConfidenceMin: thresholds.l3ConfidenceMin,
    }),
})

// ── Selection Slice ──

type SelectionSlice = {
  selectedIds: Set<string>
  selectionMode: 'single' | 'bulk'
  isBulkInFlight: boolean
  overrideCounts: Map<string, number>
  toggleSelection: (id: string) => void
  addToSelection: (id: string) => void
  setSelections: (ids: Set<string>) => void
  clearSelection: () => void
  setSelectionMode: (mode: 'single' | 'bulk') => void
  setBulkInFlight: (v: boolean) => void
  setOverrideCounts: (counts: Map<string, number>) => void
  setOverrideCount: (findingId: string, count: number) => void
  incrementOverrideCount: (findingId: string) => void
}

const createSelectionSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): SelectionSlice => ({
  selectedIds: new Set(),
  selectionMode: 'single',
  isBulkInFlight: false,
  overrideCounts: new Map(),
  toggleSelection: (id) =>
    set((s) => {
      const newSet = new Set(s.selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { selectedIds: newSet }
    }),
  addToSelection: (id) =>
    set((s) => {
      const newSet = new Set(s.selectedIds)
      newSet.add(id)
      return { selectedIds: newSet }
    }),
  setSelections: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: new Set() }),
  setSelectionMode: (mode) =>
    set((s) => {
      // Clear selectedIds when switching from bulk to single
      if (s.selectionMode === 'bulk' && mode === 'single') {
        return { selectionMode: mode, selectedIds: new Set() }
      }
      return { selectionMode: mode }
    }),
  setBulkInFlight: (v) => set({ isBulkInFlight: v }),
  setOverrideCounts: (counts) => set({ overrideCounts: counts }),
  setOverrideCount: (findingId, count) =>
    set((s) => {
      const newMap = new Map(s.overrideCounts)
      newMap.set(findingId, count)
      return { overrideCounts: newMap }
    }),
  incrementOverrideCount: (findingId) =>
    set((s) => {
      const newMap = new Map(s.overrideCounts)
      newMap.set(findingId, (newMap.get(findingId) ?? 0) + 1)
      return { overrideCounts: newMap }
    }),
})

// ── UndoRedo Slice (Story 4.4b) ──

const UNDO_STACK_MAX = 20

type UndoRedoSlice = {
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  /** findingId → Set of UndoEntry IDs for O(1) Realtime conflict lookup */
  undoFindingIndex: Map<string, Set<string>>
  pushUndo: (entry: UndoEntry) => void
  popUndo: () => UndoEntry | undefined
  pushRedo: (entry: UndoEntry) => void
  popRedo: () => UndoEntry | undefined
  clearUndoRedo: () => void
  markEntryStale: (findingId: string) => void
  removeEntriesForFinding: (findingId: string) => void
}

/** Extract all finding IDs referenced by an UndoEntry */
function getEntryFindingIds(entry: UndoEntry): string[] {
  if (entry.type === 'single' && entry.findingId) {
    return [entry.findingId]
  }
  // Bulk: all keys from previousStates
  return [...entry.previousStates.keys()]
}

/** Rebuild the undoFindingIndex from scratch */
function rebuildIndex(stack: UndoEntry[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const entry of stack) {
    for (const fId of getEntryFindingIds(entry)) {
      const set = index.get(fId) ?? new Set<string>()
      set.add(entry.id)
      index.set(fId, set)
    }
  }
  return index
}

const createUndoRedoSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
  get: () => ReviewState,
): UndoRedoSlice => ({
  undoStack: [],
  redoStack: [],
  undoFindingIndex: new Map(),
  pushUndo: (entry) =>
    set((s) => {
      const newStack = [...s.undoStack, entry].slice(-UNDO_STACK_MAX)
      return {
        undoStack: newStack,
        redoStack: [], // Clear redo on new action (AC6)
        undoFindingIndex: rebuildIndex(newStack),
      }
    }),
  popUndo: () => {
    const state = get()
    if (state.undoStack.length === 0) return undefined
    const entry = state.undoStack[state.undoStack.length - 1]!
    const newStack = state.undoStack.slice(0, -1)
    set({
      undoStack: newStack,
      undoFindingIndex: rebuildIndex(newStack),
    })
    return entry
  },
  pushRedo: (entry) =>
    set((s) => ({
      redoStack: [...s.redoStack, entry],
    })),
  popRedo: () => {
    const state = get()
    if (state.redoStack.length === 0) return undefined
    const entry = state.redoStack[state.redoStack.length - 1]!
    set({ redoStack: state.redoStack.slice(0, -1) })
    return entry
  },
  clearUndoRedo: () =>
    set({
      undoStack: [],
      redoStack: [],
      undoFindingIndex: new Map(),
    }),
  markEntryStale: (findingId) =>
    set((s) => {
      // C2 fix: mark stale in BOTH undo and redo stacks
      const markStaleInStack = (stack: UndoEntry[]): UndoEntry[] =>
        stack.map((entry) => {
          const fIds = getEntryFindingIds(entry)
          if (!fIds.includes(findingId)) return entry
          const newStale = new Set(entry.staleFindings)
          newStale.add(findingId)
          return { ...entry, staleFindings: newStale }
        })
      return {
        undoStack: markStaleInStack(s.undoStack),
        redoStack: markStaleInStack(s.redoStack),
      }
    }),
  removeEntriesForFinding: (findingId) =>
    set((s) => {
      // For single entries: remove entirely if they reference this finding
      // For bulk entries: remove the finding from the entry (keep entry if other findings remain)
      const filterStack = (stack: UndoEntry[]): UndoEntry[] => {
        const result: UndoEntry[] = []
        for (const entry of stack) {
          if (entry.type === 'single' && entry.findingId === findingId) {
            continue // Remove entirely
          }
          if (entry.type === 'bulk') {
            const hasFinding = entry.previousStates.has(findingId) || entry.newStates.has(findingId)
            if (hasFinding) {
              // Remove this finding from the bulk entry
              const newPrev = new Map(entry.previousStates)
              const newNew = new Map(entry.newStates)
              const newStale = new Set(entry.staleFindings)
              newPrev.delete(findingId)
              newNew.delete(findingId)
              newStale.delete(findingId)
              // If no findings left, drop the entire entry
              if (newPrev.size === 0) continue
              result.push({
                ...entry,
                previousStates: newPrev,
                newStates: newNew,
                staleFindings: newStale,
              })
              continue
            }
          }
          result.push(entry)
        }
        return result
      }
      const newUndo = filterStack(s.undoStack)
      const newRedo = filterStack(s.redoStack)
      return {
        undoStack: newUndo,
        redoStack: newRedo,
        undoFindingIndex: rebuildIndex(newUndo),
      }
    }),
})

// ── Selector Functions (Story 4.4b AC6 — NEVER select full stack array) ──

export const selectCanUndo = (s: ReviewState): boolean => s.undoStack.length > 0
export const selectCanRedo = (s: ReviewState): boolean => s.redoStack.length > 0

// ── Composed Store ──

type ReviewState = FindingsSlice &
  ScoreSlice &
  ThresholdSlice &
  SelectionSlice &
  UndoRedoSlice & {
    currentFileId: string | null
    resetForFile: (fileId: string) => void
    selectRange: (fromId: string, toId: string) => void
    selectAllFiltered: () => void
  }

export const useReviewStore = create<ReviewState>()((set, get) => {
  const setState = set as (
    fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>),
  ) => void

  return {
    ...createFindingsSlice(setState),
    ...createScoreSlice(setState),
    ...createThresholdSlice(setState),
    ...createSelectionSlice(setState),
    ...createUndoRedoSlice(setState, get as () => ReviewState),
    currentFileId: null,
    // Story 4.5 CR fix: resetForFile restores from sessionStorage (survives full reload)
    resetForFile: (fileId: string) =>
      set((s) => {
        if (s.currentFileId === fileId) return {} // idempotent — same file, no reset needed

        // Restore filter from sessionStorage (saved by FileNavigationDropdown before navigate)
        const cached = loadFilterCache(fileId)
        if (cached) clearFilterCache(fileId) // consume and clear — prevent stale restore
        const restoredFilter = cached ? { ...cached.filterState } : { ...DEFAULT_FILTER_STATE }
        const restoredSearch = cached?.searchQuery ?? ''
        const restoredAiEnabled = cached ? cached.aiSuggestionsEnabled : true

        return {
          currentFileId: fileId,
          findingsMap: new Map(),
          selectedId: null,
          sortedFindingIds: [],
          filterState: restoredFilter,
          searchQuery: restoredSearch,
          aiSuggestionsEnabled: restoredAiEnabled,
          currentScore: null,
          scoreStatus: 'na',
          layerCompleted: null,
          autoPassRationale: null,
          isRecalculating: false,
          l2ConfidenceMin: null,
          l3ConfidenceMin: null,
          selectedIds: new Set(),
          selectionMode: 'single',
          isBulkInFlight: false,
          overrideCounts: new Map(),
          // Story 4.4b: Clear undo/redo on file switch (AC6, Guardrail #35)
          undoStack: [],
          redoStack: [],
          undoFindingIndex: new Map(),
        }
      }),
    // Task 4.4: selectRange — needs get() for sortedFindingIds
    selectRange: (fromId: string, toId: string) => {
      const state = get()
      const ids = state.sortedFindingIds
      const fromIdx = ids.indexOf(fromId)
      const toIdx = ids.indexOf(toId)
      if (fromIdx === -1 || toIdx === -1) return
      const start = Math.min(fromIdx, toIdx)
      const end = Math.max(fromIdx, toIdx)
      const rangeIds = ids.slice(start, end + 1)
      const newSet = new Set(state.selectedIds)
      for (const id of rangeIds) {
        newSet.add(id)
      }
      set({ selectedIds: newSet, selectionMode: 'bulk' })
    },
    // Story 4.5: selectAllFiltered — extended with category, confidence, searchQuery, aiSuggestionsEnabled
    selectAllFiltered: () => {
      const state = get()
      const { filterState, findingsMap, sortedFindingIds, searchQuery, aiSuggestionsEnabled } =
        state
      const filtered = sortedFindingIds.filter((id) => {
        const finding = findingsMap.get(id)
        if (!finding) return false
        return findingMatchesFilters(finding, filterState, searchQuery, aiSuggestionsEnabled)
      })
      // CR-M2+L-R2-1: 0 match → clear selection + exit bulk mode (not silent no-op)
      if (filtered.length === 0) {
        set({ selectedIds: new Set<string>(), selectionMode: 'single' })
        return
      }
      set({ selectedIds: new Set(filtered), selectionMode: 'bulk' })
    },
  }
})
