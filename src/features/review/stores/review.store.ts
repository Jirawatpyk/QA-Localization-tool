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

/**
 * TD-ARCH-002: Get the active file's FileState from the Map.
 * All store-internal reads MUST use this instead of flat fields.
 */
function getActiveFs(s: ReviewState): FileState {
  return s.fileStates.get(s.currentFileId ?? '') ?? DEFAULT_FILE_STATE
}

/**
 * TD-ARCH-002: Update the active file's FileState in the Map.
 * Returns a partial ReviewState with only `fileStates` (no flat field dual-write).
 */
function updateActiveFs(
  s: ReviewState,
  patch: Partial<FileState>,
): { fileStates: Map<string, FileState> } {
  const fileId = s.currentFileId
  if (!fileId) return { fileStates: s.fileStates }
  const newMap = new Map(s.fileStates)
  const existing = newMap.get(fileId) ?? createFreshFileState()
  newMap.set(fileId, { ...existing, ...patch })
  return { fileStates: newMap }
}

/** Compute selection adjustments after any filter/search/AI-toggle change */
function computeSelectionAfterFilterChange(fs: FileState): Partial<FileState> {
  const visibleIds = new Set<string>()
  for (const id of fs.sortedFindingIds) {
    const finding = fs.findingsMap.get(id)
    if (
      finding &&
      findingMatchesFilters(finding, fs.filterState, fs.searchQuery, fs.aiSuggestionsEnabled)
    ) {
      visibleIds.add(id)
    }
  }

  // Intersect selectedIds with visible
  const newSelectedIds = new Set<string>()
  for (const id of fs.selectedIds) {
    if (visibleIds.has(id)) newSelectedIds.add(id)
  }

  // Exit bulk mode if selection became empty
  const newSelectionMode: 'single' | 'bulk' =
    newSelectedIds.size === 0 && fs.selectionMode === 'bulk' ? 'single' : fs.selectionMode

  // Reset selectedId if not visible
  let newSelectedId = fs.selectedId
  if (newSelectedId !== null && !visibleIds.has(newSelectedId)) {
    newSelectedId = fs.sortedFindingIds.find((id) => visibleIds.has(id)) ?? null
  }

  return {
    selectedIds: newSelectedIds,
    selectionMode: newSelectionMode,
    selectedId: newSelectedId,
  }
}

// ── Findings Slice (Story 4.5: + searchQuery, aiSuggestionsEnabled, per-key setFilter) ──

// TD-ARCH-002: State fields live in FileState only. Slice types declare actions + initial values.
type FindingsSlice = {
  findingsMap: Map<string, Finding>
  selectedId: string | null
  filterState: FilterState
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
  resetFilters: () => void
}

const createFindingsSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): FindingsSlice => ({
  // TD-ARCH-002: flat fields kept for backward compat (type system) but writes go to fileStates Map
  findingsMap: new Map(),
  selectedId: null,
  filterState: { ...DEFAULT_FILTER_STATE },
  sortedFindingIds: [],
  searchQuery: '',
  aiSuggestionsEnabled: true,
  setFinding: (id, finding) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newMap = new Map(fs.findingsMap)
      newMap.set(id, finding)
      return updateActiveFs(s, { findingsMap: newMap })
    }),
  setFindings: (findings) => set((s) => updateActiveFs(s, { findingsMap: findings })),
  removeFinding: (id) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newMap = new Map(fs.findingsMap)
      newMap.delete(id)
      return updateActiveFs(s, { findingsMap: newMap })
    }),
  setFilter: (key, value) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newFilterState = { ...fs.filterState, [key]: value }
      const hypothetical: FileState = { ...fs, filterState: newFilterState }
      return updateActiveFs(s, {
        filterState: newFilterState,
        ...computeSelectionAfterFilterChange(hypothetical),
      })
    }),
  setSelectedFinding: (id) => set((s) => updateActiveFs(s, { selectedId: id })),
  setSortedFindingIds: (ids) => set((s) => updateActiveFs(s, { sortedFindingIds: ids })),
  setSearchQuery: (query) =>
    set((s) => {
      const fs = getActiveFs(s)
      const hypothetical: FileState = { ...fs, searchQuery: query }
      return updateActiveFs(s, {
        searchQuery: query,
        ...computeSelectionAfterFilterChange(hypothetical),
      })
    }),
  setAiSuggestionsEnabled: (enabled) =>
    set((s) => {
      const fs = getActiveFs(s)
      const hypothetical: FileState = { ...fs, aiSuggestionsEnabled: enabled }
      return updateActiveFs(s, {
        aiSuggestionsEnabled: enabled,
        ...computeSelectionAfterFilterChange(hypothetical),
      })
    }),
  resetFilters: () =>
    set((s) => {
      const fs = getActiveFs(s)
      const hypothetical: FileState = {
        ...fs,
        filterState: { ...DEFAULT_FILTER_STATE },
        searchQuery: '',
      }
      return updateActiveFs(s, {
        filterState: { ...DEFAULT_FILTER_STATE },
        searchQuery: '',
        ...computeSelectionAfterFilterChange(hypothetical),
      })
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
    set((s) =>
      updateActiveFs(s, {
        currentScore: score,
        scoreStatus: status,
        isRecalculating: false,
        ...(layerCompleted !== undefined ? { layerCompleted } : {}),
        ...(autoPassRationale !== undefined ? { autoPassRationale } : {}),
      }),
    ),
  setRecalculating: () =>
    set((s) => updateActiveFs(s, { isRecalculating: true, scoreStatus: 'calculating' })),
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
    set((s) =>
      updateActiveFs(s, {
        l2ConfidenceMin: thresholds.l2ConfidenceMin,
        l3ConfidenceMin: thresholds.l3ConfidenceMin,
      }),
    ),
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
      const fs = getActiveFs(s)
      const newSet = new Set(fs.selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return updateActiveFs(s, { selectedIds: newSet })
    }),
  addToSelection: (id) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newSet = new Set(fs.selectedIds)
      newSet.add(id)
      return updateActiveFs(s, { selectedIds: newSet })
    }),
  setSelections: (ids) => set((s) => updateActiveFs(s, { selectedIds: ids })),
  clearSelection: () => set((s) => updateActiveFs(s, { selectedIds: new Set() })),
  setSelectionMode: (mode) =>
    set((s) => {
      const fs = getActiveFs(s)
      if (fs.selectionMode === 'bulk' && mode === 'single') {
        return updateActiveFs(s, { selectionMode: mode, selectedIds: new Set() })
      }
      return updateActiveFs(s, { selectionMode: mode })
    }),
  setBulkInFlight: (v) => set((s) => updateActiveFs(s, { isBulkInFlight: v })),
  setOverrideCounts: (counts) => set((s) => updateActiveFs(s, { overrideCounts: counts })),
  setOverrideCount: (findingId, count) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newMap = new Map(fs.overrideCounts)
      newMap.set(findingId, count)
      return updateActiveFs(s, { overrideCounts: newMap })
    }),
  incrementOverrideCount: (findingId) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newMap = new Map(fs.overrideCounts)
      newMap.set(findingId, (newMap.get(findingId) ?? 0) + 1)
      return updateActiveFs(s, { overrideCounts: newMap })
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
  /** Re-insert entry to undo stack WITHOUT clearing redo stack (for retry on failure) */
  reinsertUndo: (entry: UndoEntry) => void
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
      const fs = getActiveFs(s)
      const newStack = [...fs.undoStack, entry].slice(-UNDO_STACK_MAX)
      return updateActiveFs(s, {
        undoStack: newStack,
        redoStack: [],
        undoFindingIndex: rebuildIndex(newStack),
      })
    }),
  reinsertUndo: (entry) =>
    set((s) => {
      const fs = getActiveFs(s)
      const newStack = [...fs.undoStack, entry].slice(-UNDO_STACK_MAX)
      return updateActiveFs(s, {
        undoStack: newStack,
        undoFindingIndex: rebuildIndex(newStack),
      })
    }),
  popUndo: () => {
    // P1-1 fix: read + write inside set() to avoid TOCTOU
    let popped: UndoEntry | undefined
    set((s) => {
      const fs = getActiveFs(s)
      if (fs.undoStack.length === 0) return {}
      popped = fs.undoStack[fs.undoStack.length - 1]!
      const newStack = fs.undoStack.slice(0, -1)
      return updateActiveFs(s, {
        undoStack: newStack,
        undoFindingIndex: rebuildIndex(newStack),
      })
    })
    return popped
  },
  pushRedo: (entry) =>
    set((s) => {
      const fs = getActiveFs(s)
      return updateActiveFs(s, { redoStack: [...fs.redoStack, entry] })
    }),
  popRedo: () => {
    // P1-1 fix: read + write inside set() to avoid TOCTOU
    let popped: UndoEntry | undefined
    set((s) => {
      const fs = getActiveFs(s)
      if (fs.redoStack.length === 0) return {}
      popped = fs.redoStack[fs.redoStack.length - 1]!
      return updateActiveFs(s, { redoStack: fs.redoStack.slice(0, -1) })
    })
    return popped
  },
  clearUndoRedo: () =>
    set((s) =>
      updateActiveFs(s, {
        undoStack: [],
        redoStack: [],
        undoFindingIndex: new Map(),
      }),
    ),
  markEntryStale: (findingId) =>
    set((s) => {
      const fs = getActiveFs(s)
      const markStaleInStack = (stack: UndoEntry[]): UndoEntry[] =>
        stack.map((entry) => {
          const fIds = getEntryFindingIds(entry)
          if (!fIds.includes(findingId)) return entry
          const newStale = new Set(entry.staleFindings)
          newStale.add(findingId)
          return { ...entry, staleFindings: newStale }
        })
      return updateActiveFs(s, {
        undoStack: markStaleInStack(fs.undoStack),
        redoStack: markStaleInStack(fs.redoStack),
      })
    }),
  removeEntriesForFinding: (findingId) =>
    set((s) => {
      const fs = getActiveFs(s)
      const filterStack = (stack: UndoEntry[]): UndoEntry[] => {
        const result: UndoEntry[] = []
        for (const entry of stack) {
          if (entry.type === 'single' && entry.findingId === findingId) {
            continue
          }
          if (entry.type === 'bulk') {
            const hasFinding = entry.previousStates.has(findingId) || entry.newStates.has(findingId)
            if (hasFinding) {
              const newPrev = new Map(entry.previousStates)
              const newNew = new Map(entry.newStates)
              const newStale = new Set(entry.staleFindings)
              newPrev.delete(findingId)
              newNew.delete(findingId)
              newStale.delete(findingId)
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
      const newUndo = filterStack(fs.undoStack)
      const newRedo = filterStack(fs.redoStack)
      return updateActiveFs(s, {
        undoStack: newUndo,
        redoStack: newRedo,
        undoFindingIndex: rebuildIndex(newUndo),
      })
    }),
})

// ── Suppression Slice (Story 4.6) ──

type SuppressionSlice = {
  rejectionTracker: RejectionTracker
  detectedPattern: DetectedPattern | null
  activeSuppressions: SuppressionRule[]
  setDetectedPattern: (pattern: DetectedPattern | null) => void
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
  setDetectedPattern: (pattern) => setState((s) => updateActiveFs(s, { detectedPattern: pattern })),
  clearDetectedPattern: () => setState((s) => updateActiveFs(s, { detectedPattern: null })),
  addSuppression: (rule) =>
    setState((s) => {
      const fs = getActiveFs(s)
      return updateActiveFs(s, { activeSuppressions: [...fs.activeSuppressions, rule] })
    }),
  removeSuppression: (ruleId) =>
    setState((s) => {
      const fs = getActiveFs(s)
      return updateActiveFs(s, {
        activeSuppressions: fs.activeSuppressions.filter((r) => r.id !== ruleId),
      })
    }),
  setActiveSuppressions: (rules) =>
    setState((s) => updateActiveFs(s, { activeSuppressions: rules })),
  setRejectionTracker: (tracker) =>
    setState((s) => updateActiveFs(s, { rejectionTracker: tracker })),
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

// TD-ARCH-002: createSyncingSet + FILE_STATE_KEYS removed.
// All slice setters now write directly to fileStates Map via updateActiveFs().

// ── Selector Functions (Story 4.4b AC6 — NEVER select full stack array) ──
// TD-ARCH-002: Read from fileStates Map (no more flat fields)

/**
 * TD-ARCH-002: Get file's FileState from store snapshot.
 * @param storeOrFileId — pass store snapshot, or omit to use getState()
 * @param fileId — explicit fileId (hooks MUST pass this). Falls back to currentFileId if omitted.
 */
export function getStoreFileState(
  storeOrFileId?: ReturnType<typeof useReviewStore.getState> | string,
  fileId?: string,
): FileState {
  if (typeof storeOrFileId === 'string') {
    // Called as getStoreFileState(fileId)
    const s = useReviewStore.getState()
    return s.fileStates.get(storeOrFileId) ?? DEFAULT_FILE_STATE
  }
  const s = storeOrFileId ?? useReviewStore.getState()
  const resolvedFileId = fileId ?? s.currentFileId ?? ''
  return s.fileStates.get(resolvedFileId) ?? DEFAULT_FILE_STATE
}

export const selectCanUndo = (s: ReviewState): boolean => getActiveFs(s).undoStack.length > 0
export const selectCanRedo = (s: ReviewState): boolean => getActiveFs(s).redoStack.length > 0

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
  // TD-ARCH-002: slices write directly to fileStates Map via updateActiveFs()
  const setState = rawSet

  return {
    ...createFindingsSlice(setState),
    ...createScoreSlice(setState),
    ...createThresholdSlice(setState),
    ...createSelectionSlice(setState),
    ...createUndoRedoSlice(setState, get as () => ReviewState),
    ...createSuppressionSlice(setState),
    currentFileId: null,
    fileStates: new Map<string, FileState>(),
    // TD-ARCH-002: resetForFile creates fresh FileState in Map. No more flat field dual-write.
    resetForFile: (fileId: string) =>
      set((s) => {
        if (!fileId) return {}
        if (s.currentFileId === fileId) return {}

        const newFileStates = new Map(s.fileStates)
        const freshFs = createFileState(fileId)
        newFileStates.set(fileId, freshFs)

        return {
          currentFileId: fileId,
          fileStates: newFileStates,
        }
      }),
    // TD-ARCH-002: selectRange reads from fileStates Map
    selectRange: (fromId: string, toId: string) => {
      const fs = getActiveFs(get())
      const ids = fs.sortedFindingIds
      const fromIdx = ids.indexOf(fromId)
      const toIdx = ids.indexOf(toId)
      if (fromIdx === -1) {
        setState((s) => updateActiveFs(s, { selectedIds: new Set([toId]), selectionMode: 'bulk' }))
        return
      }
      if (toIdx === -1) return
      const start = Math.min(fromIdx, toIdx)
      const end = Math.max(fromIdx, toIdx)
      const rangeIds = ids.slice(start, end + 1)
      const newSet = new Set(fs.selectedIds)
      for (const id of rangeIds) {
        newSet.add(id)
      }
      setState((s) => updateActiveFs(s, { selectedIds: newSet, selectionMode: 'bulk' }))
    },
    // TD-ARCH-002: selectAllFiltered reads from fileStates Map
    selectAllFiltered: () => {
      const fs = getActiveFs(get())
      const filtered = fs.sortedFindingIds.filter((id) => {
        const finding = fs.findingsMap.get(id)
        if (!finding) return false
        return findingMatchesFilters(
          finding,
          fs.filterState,
          fs.searchQuery,
          fs.aiSuggestionsEnabled,
        )
      })
      if (filtered.length === 0) {
        setState((s) =>
          updateActiveFs(s, { selectedIds: new Set<string>(), selectionMode: 'single' }),
        )
        return
      }
      setState((s) => updateActiveFs(s, { selectedIds: new Set(filtered), selectionMode: 'bulk' }))
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
