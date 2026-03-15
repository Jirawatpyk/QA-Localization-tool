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

// ── Filter State ──

type FilterState = {
  severity: FindingSeverity | null
  status: FindingStatus | null
  layer: DetectedByLayer | null
}

// ── Findings Slice ──

type FindingsSlice = {
  findingsMap: Map<string, Finding>
  selectedId: string | null
  filterState: FilterState
  /** Visual sort order of finding IDs (synced from FindingList flattenedIds) */
  sortedFindingIds: string[]
  setFinding: (id: string, finding: Finding) => void
  setFindings: (findings: Map<string, Finding>) => void
  removeFinding: (id: string) => void
  setFilter: (filter: FilterState) => void
  setSelectedFinding: (id: string | null) => void
  setSortedFindingIds: (ids: string[]) => void
}

const createFindingsSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): FindingsSlice => ({
  findingsMap: new Map(),
  selectedId: null,
  filterState: { severity: null, status: null, layer: null },
  sortedFindingIds: [],
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
  setFilter: (filter) => set({ filterState: filter }),
  setSelectedFinding: (id) => set({ selectedId: id }),
  setSortedFindingIds: (ids) => set({ sortedFindingIds: ids }),
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

// ── Composed Store ──

type ReviewState = FindingsSlice &
  ScoreSlice &
  ThresholdSlice &
  SelectionSlice & {
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
    currentFileId: null,
    resetForFile: (fileId: string) =>
      set({
        currentFileId: fileId,
        findingsMap: new Map(),
        selectedId: null,
        sortedFindingIds: [],
        filterState: { severity: null, status: null, layer: null },
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
    // Task 4.5: selectAllFiltered — needs get() for sortedFindingIds + filterState
    selectAllFiltered: () => {
      const state = get()
      const { filterState, findingsMap, sortedFindingIds } = state
      const filtered = sortedFindingIds.filter((id) => {
        const finding = findingsMap.get(id)
        if (!finding) return false
        if (filterState.severity !== null && finding.severity !== filterState.severity) return false
        if (filterState.status !== null && finding.status !== filterState.status) return false
        if (filterState.layer !== null && finding.detectedByLayer !== filterState.layer)
          return false
        return true
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
