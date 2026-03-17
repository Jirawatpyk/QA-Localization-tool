'use client'

import { createContext, useContext } from 'react'
import { create } from 'zustand'

import type { DetectedPattern, SuppressionRule } from '@/features/review/types'

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
import type { RejectionTracker } from '@/features/review/utils/pattern-detection'
import type {
  DetectedByLayer,
  Finding,
  FindingSeverity,
  FindingStatus,
  LayerCompleted,
  ScoreStatus,
} from '@/types/finding'

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

// ── Suppression Slice (Story 4.6) ──

type SuppressionSlice = {
  rejectionTracker: RejectionTracker
  detectedPattern: DetectedPattern | null
  activeSuppressions: SuppressionRule[]
  trackRejectionInStore: (pattern: DetectedPattern | null) => void
  clearDetectedPattern: () => void
  addSuppression: (rule: SuppressionRule) => void
  removeSuppression: (ruleId: string) => void
  setActiveSuppressions: (rules: SuppressionRule[]) => void
  setRejectionTracker: (tracker: RejectionTracker) => void
}

const createSuppressionSlice = (
  setState: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): SuppressionSlice => ({
  rejectionTracker: new Map(),
  detectedPattern: null,
  activeSuppressions: [],
  trackRejectionInStore: (pattern) => setState({ detectedPattern: pattern }),
  clearDetectedPattern: () => setState({ detectedPattern: null }),
  addSuppression: (rule) =>
    setState((s) => ({
      activeSuppressions: [...s.activeSuppressions, rule],
    })),
  removeSuppression: (ruleId) =>
    setState((s) => ({
      activeSuppressions: s.activeSuppressions.filter((r) => r.id !== ruleId),
    })),
  setActiveSuppressions: (rules) => setState({ activeSuppressions: rules }),
  setRejectionTracker: (tracker) => setState({ rejectionTracker: tracker }),
})

// ── File-Scoped State (TD-ARCH-001 refactor) ──

/** All 25 file-scoped fields — isolated per file in the Map */
export type FileState = {
  // FindingsSlice fields
  findingsMap: Map<string, Finding>
  selectedId: string | null
  filterState: FilterState
  sortedFindingIds: string[]
  searchQuery: string
  aiSuggestionsEnabled: boolean
  // ScoreSlice fields
  currentScore: number | null
  scoreStatus: ScoreStatus
  layerCompleted: LayerCompleted | null
  autoPassRationale: string | null
  isRecalculating: boolean
  // ThresholdSlice fields
  l2ConfidenceMin: number | null
  l3ConfidenceMin: number | null
  // SelectionSlice fields
  selectedIds: Set<string>
  selectionMode: 'single' | 'bulk'
  isBulkInFlight: boolean
  overrideCounts: Map<string, number>
  // UndoRedoSlice fields
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  undoFindingIndex: Map<string, Set<string>>
  // SuppressionSlice fields (Story 4.6)
  rejectionTracker: RejectionTracker
  detectedPattern: DetectedPattern | null
  activeSuppressions: SuppressionRule[]
  // Init guard (replaces processedFileIdRef — F5 fix)
  initialized: boolean
}

/** Frozen default — NEVER mutate. Use createFreshFileState() for mutable copies. */
export const DEFAULT_FILE_STATE: Readonly<FileState> = Object.freeze({
  findingsMap: new Map<string, Finding>(),
  selectedId: null,
  filterState: { ...DEFAULT_FILTER_STATE },
  sortedFindingIds: [] as string[],
  searchQuery: '',
  aiSuggestionsEnabled: true,
  currentScore: null,
  scoreStatus: 'na' as const,
  layerCompleted: null,
  autoPassRationale: null,
  isRecalculating: false,
  l2ConfidenceMin: null,
  l3ConfidenceMin: null,
  selectedIds: new Set<string>(),
  selectionMode: 'single' as const,
  isBulkInFlight: false,
  overrideCounts: new Map<string, number>(),
  undoStack: [] as UndoEntry[],
  redoStack: [] as UndoEntry[],
  undoFindingIndex: new Map<string, Set<string>>(),
  rejectionTracker: new Map() as RejectionTracker,
  detectedPattern: null,
  activeSuppressions: [] as SuppressionRule[],
  initialized: false,
} satisfies FileState)

/** Create a fresh mutable FileState with all collection fields as new instances */
function createFreshFileState(): FileState {
  return {
    findingsMap: new Map(),
    selectedId: null,
    filterState: { ...DEFAULT_FILTER_STATE },
    sortedFindingIds: [],
    searchQuery: '',
    aiSuggestionsEnabled: true,
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
    undoStack: [],
    redoStack: [],
    undoFindingIndex: new Map(),
    rejectionTracker: new Map(),
    detectedPattern: null,
    activeSuppressions: [],
    initialized: false,
  }
}

/** Create a fresh FileState, optionally restoring filter from sessionStorage (L2 fallback) */
function createFileState(fileId: string): FileState {
  const cached = loadFilterCache(fileId)
  if (cached) clearFilterCache(fileId)
  const fs = createFreshFileState()
  if (cached) {
    // CR-H5: defensive merge — old cache may lack new fields (e.g., confidence added in 4.5)
    fs.filterState = { ...DEFAULT_FILTER_STATE, ...cached.filterState }
    fs.searchQuery = typeof cached.searchQuery === 'string' ? cached.searchQuery : ''
    fs.aiSuggestionsEnabled =
      typeof cached.aiSuggestionsEnabled === 'boolean' ? cached.aiSuggestionsEnabled : true
  }
  return fs
}

// ── File-scoped field keys for auto-sync (TD-ARCH-001) ──
// Note: 'initialized' is intentionally EXCLUDED — it is managed directly via
// useReviewStore.setState({ fileStates }) in ReviewPageClient, not through slice actions.
// Including it would create a phantom property on the root ReviewState type.

const FILE_STATE_KEYS: ReadonlySet<string> = new Set<keyof FileState>([
  'findingsMap',
  'selectedId',
  'filterState',
  'sortedFindingIds',
  'searchQuery',
  'aiSuggestionsEnabled',
  'currentScore',
  'scoreStatus',
  'layerCompleted',
  'autoPassRationale',
  'isRecalculating',
  'l2ConfidenceMin',
  'l3ConfidenceMin',
  'selectedIds',
  'selectionMode',
  'isBulkInFlight',
  'overrideCounts',
  'undoStack',
  'redoStack',
  'undoFindingIndex',
  'rejectionTracker',
  'detectedPattern',
  'activeSuppressions',
])

/**
 * Wrap Zustand's `set` to auto-sync flat file-scoped fields → fileStates Map.
 * Skip if the update already includes `fileStates` (e.g. resetForFile manages it directly).
 */
function createSyncingSet(
  rawSet: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void {
  return (fnOrPartial) => {
    rawSet((s) => {
      const update = typeof fnOrPartial === 'function' ? fnOrPartial(s) : fnOrPartial

      // If resetForFile already manages fileStates, skip auto-sync
      if ('fileStates' in update) return update

      const fileId = s.currentFileId
      if (!fileId) return update

      // Check if update contains any file-scoped fields
      const updateKeys = Object.keys(update)
      if (updateKeys.length === 0) return update // L6: early exit for empty partial
      const hasFileFields = updateKeys.some((k) => FILE_STATE_KEYS.has(k))
      if (!hasFileFields) return update

      // Sync flat field changes into the active file's FileState entry
      const newFileStates = new Map(s.fileStates)
      const existing = newFileStates.get(fileId)
      if (!existing) return update // No FileState yet (pre-resetForFile)

      const syncedFs = { ...existing }
      for (const key of updateKeys) {
        if (FILE_STATE_KEYS.has(key)) {
          ;(syncedFs as Record<string, unknown>)[key] = (update as Record<string, unknown>)[key]
        }
      }
      newFileStates.set(fileId, syncedFs)

      return { ...update, fileStates: newFileStates }
    })
  }
}

// ── Selector Functions (Story 4.4b AC6 — NEVER select full stack array) ──
// TODO(TD-ARCH-002): After flat field removal, read from fileStates Map:
//   (s) => (s.fileStates.get(s.currentFileId ?? '')?.undoStack.length ?? 0) > 0

export const selectCanUndo = (s: ReviewState): boolean => s.undoStack.length > 0
export const selectCanRedo = (s: ReviewState): boolean => s.redoStack.length > 0

// ── Composed Store ──

type ReviewState = FindingsSlice &
  ScoreSlice &
  ThresholdSlice &
  SelectionSlice &
  UndoRedoSlice &
  SuppressionSlice & {
    currentFileId: string | null
    fileStates: Map<string, FileState>
    resetForFile: (fileId: string) => void
    selectRange: (fromId: string, toId: string) => void
    selectAllFiltered: () => void
  }

export const useReviewStore = create<ReviewState>()((set, get) => {
  const rawSet = set as (
    fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>),
  ) => void
  // TD-ARCH-001: auto-sync flat fields → fileStates Map on every set() call
  const setState = createSyncingSet(rawSet)

  return {
    ...createFindingsSlice(setState),
    ...createScoreSlice(setState),
    ...createThresholdSlice(setState),
    ...createSelectionSlice(setState),
    ...createUndoRedoSlice(setState, get as () => ReviewState),
    ...createSuppressionSlice(setState),
    currentFileId: null,
    fileStates: new Map<string, FileState>(),
    // TD-ARCH-001: resetForFile switches activeFileId, creates fresh FileState.
    // Always creates fresh entry (Guardrail #35: undo/redo cleared on file switch).
    // Filter restored from sessionStorage L2 fallback only (createFileState handles this).
    // L1 Map cache is read by useFileState() — NOT by resetForFile. This separation ensures
    // that resetForFile always gives a clean slate (important for test isolation), while
    // useFileState provides the preserved state for components after Phase 3 migration.
    resetForFile: (fileId: string) =>
      set((s) => {
        if (!fileId) return {} // L2: guard invalid empty string fileId
        if (s.currentFileId === fileId) return {} // idempotent — same file, no reset needed

        const newFileStates = new Map(s.fileStates)
        // Always create fresh entry — sessionStorage L2 fallback for filter restore
        const freshFs = createFileState(fileId)
        newFileStates.set(fileId, freshFs)
        const fs = freshFs

        return {
          currentFileId: fileId,
          fileStates: newFileStates,
          // Dual-write: flat fields mirror active file's FileState (backward compat during migration)
          findingsMap: fs.findingsMap,
          selectedId: fs.selectedId,
          sortedFindingIds: fs.sortedFindingIds,
          filterState: fs.filterState,
          searchQuery: fs.searchQuery,
          aiSuggestionsEnabled: fs.aiSuggestionsEnabled,
          currentScore: fs.currentScore,
          scoreStatus: fs.scoreStatus,
          layerCompleted: fs.layerCompleted,
          autoPassRationale: fs.autoPassRationale,
          isRecalculating: fs.isRecalculating,
          l2ConfidenceMin: fs.l2ConfidenceMin,
          l3ConfidenceMin: fs.l3ConfidenceMin,
          selectedIds: fs.selectedIds,
          selectionMode: fs.selectionMode,
          isBulkInFlight: fs.isBulkInFlight,
          overrideCounts: fs.overrideCounts,
          undoStack: fs.undoStack,
          redoStack: fs.redoStack,
          undoFindingIndex: fs.undoFindingIndex,
          rejectionTracker: fs.rejectionTracker,
          detectedPattern: fs.detectedPattern,
          activeSuppressions: fs.activeSuppressions,
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
      setState({ selectedIds: newSet, selectionMode: 'bulk' })
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
        setState({ selectedIds: new Set<string>(), selectionMode: 'single' })
        return
      }
      setState({ selectedIds: new Set(filtered), selectionMode: 'bulk' })
    },
  }
})

// ── File-Scoped Context + Selector Wrapper (TD-ARCH-001) ──

/**
 * Context providing the fileId for the current component tree.
 * Each ReviewPageClient instance wraps its children in this provider
 * so useFileState reads the correct file's state — even during
 * React startTransition when old and new trees coexist.
 */
export const ReviewFileIdContext = createContext<string>('')

/**
 * Selector wrapper for file-scoped state. Reads from the fileId provided by:
 * 1. Explicit `overrideFileId` parameter (for ReviewPageClient — has fileId prop)
 * 2. ReviewFileIdContext (for child components — context set by ReviewPageClient)
 * 3. Fallback to currentFileId (for tests / non-context usage)
 *
 * @example
 * // Child component (context): useFileState((fs) => fs.findingsMap)
 * // ReviewPageClient (prop):   useFileState((fs) => fs.findingsMap, fileId)
 */
export function useFileState<T>(
  selector: (fs: FileState) => T,
  overrideFileId?: string | undefined,
): T {
  const contextFileId = useContext(ReviewFileIdContext)
  const resolvedFileId = overrideFileId ?? contextFileId
  return useReviewStore((s) => {
    const fs = s.fileStates.get(resolvedFileId || s.currentFileId || '')
    return selector(fs ?? DEFAULT_FILE_STATE)
  })
}
