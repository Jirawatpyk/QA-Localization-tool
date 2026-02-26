'use client'

import { create } from 'zustand'

import type {
  DetectedByLayer,
  Finding,
  FindingSeverity,
  FindingStatus,
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
  setFinding: (id: string, finding: Finding) => void
  setFindings: (findings: Map<string, Finding>) => void
  removeFinding: (id: string) => void
  setFilter: (filter: FilterState) => void
  setSelectedFinding: (id: string | null) => void
}

const createFindingsSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): FindingsSlice => ({
  findingsMap: new Map(),
  selectedId: null,
  filterState: { severity: null, status: null, layer: null },
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
})

// ── Score Slice ──

type ScoreSlice = {
  currentScore: number | null
  scoreStatus: ScoreStatus
  isRecalculating: boolean
  updateScore: (score: number, status: ScoreStatus) => void
  setRecalculating: () => void
}

const createScoreSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): ScoreSlice => ({
  currentScore: null,
  scoreStatus: 'na',
  isRecalculating: false,
  updateScore: (score, status) =>
    set({ currentScore: score, scoreStatus: status, isRecalculating: false }),
  setRecalculating: () => set({ isRecalculating: true, scoreStatus: 'calculating' }),
})

// ── Selection Slice ──

type SelectionSlice = {
  selectedIds: Set<string>
  selectionMode: 'single' | 'bulk'
  toggleSelection: (id: string) => void
  setSelections: (ids: Set<string>) => void
  clearSelection: () => void
  setSelectionMode: (mode: 'single' | 'bulk') => void
}

const createSelectionSlice = (
  set: (fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>)) => void,
): SelectionSlice => ({
  selectedIds: new Set(),
  selectionMode: 'single',
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
})

// ── Composed Store ──

type ReviewState = FindingsSlice &
  ScoreSlice &
  SelectionSlice & {
    currentFileId: string | null
    resetForFile: (fileId: string) => void
  }

export const useReviewStore = create<ReviewState>()((set, _get) => {
  const setState = set as (
    fn: Partial<ReviewState> | ((s: ReviewState) => Partial<ReviewState>),
  ) => void

  return {
    ...createFindingsSlice(setState),
    ...createScoreSlice(setState),
    ...createSelectionSlice(setState),
    currentFileId: null,
    resetForFile: (fileId: string) =>
      set({
        currentFileId: fileId,
        findingsMap: new Map(),
        selectedId: null,
        filterState: { severity: null, status: null, layer: null },
        currentScore: null,
        scoreStatus: 'na',
        isRecalculating: false,
        selectedIds: new Set(),
        selectionMode: 'single',
      }),
  }
})
