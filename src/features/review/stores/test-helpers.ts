import { createContext } from 'react'
import { vi } from 'vitest'

import type { FileState, UndoEntry } from '@/features/review/stores/review.store'
import { DEFAULT_FILE_STATE } from '@/features/review/stores/review.store'
import type { FilterState } from '@/features/review/utils/filter-helpers'
import type { Finding } from '@/types/finding'

/**
 * Factory for a complete FileState with sensible defaults.
 * Use in unit tests to mock file-scoped store state.
 *
 * @example
 * const fs = createMockFileState({ findingsMap: new Map([['f1', buildFinding()]]) })
 */
export function createMockFileState(overrides?: Partial<FileState>): FileState {
  return {
    ...DEFAULT_FILE_STATE,
    // Create fresh instances to prevent shared references across tests
    findingsMap: new Map<string, Finding>(),
    selectedIds: new Set<string>(),
    overrideCounts: new Map<string, number>(),
    undoStack: [] as UndoEntry[],
    redoStack: [] as UndoEntry[],
    undoFindingIndex: new Map<string, Set<string>>(),
    filterState: { ...DEFAULT_FILE_STATE.filterState } as FilterState,
    ...overrides,
  }
}

/**
 * M3: Shared factory for the full store mock state object used in component tests.
 * Eliminates 40-line duplication across 5+ ReviewPageClient test files.
 *
 * @example
 * const { storeMockState, createStoreMock } = createStoreMockState({ currentScore: 95 })
 * vi.mock('@/features/review/stores/review.store', () => createStoreMock())
 */
export function createStoreMockState(stateOverrides?: Record<string, unknown>) {
  const mockFileState = createMockFileState()
  const storeMockState: Record<string, unknown> = {
    resetForFile: vi.fn(),
    setFindings: vi.fn(),
    setFinding: vi.fn(),
    findingsMap: new Map(),
    currentScore: null,
    layerCompleted: null,
    scoreStatus: null,
    updateScore: vi.fn(),
    l2ConfidenceMin: null,
    l3ConfidenceMin: null,
    selectedId: null,
    setSelectedFinding: vi.fn(),
    sortedFindingIds: [],
    setSortedFindingIds: vi.fn(),
    selectedIds: new Set(),
    selectionMode: 'single' as const,
    filterState: {
      severity: null,
      status: 'pending',
      layer: null,
      category: null,
      confidence: null,
    },
    searchQuery: '',
    aiSuggestionsEnabled: true,
    setFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setAiSuggestionsEnabled: vi.fn(),
    resetFilters: vi.fn(),
    isBulkInFlight: false,
    clearSelection: vi.fn(),
    setSelectionMode: vi.fn(),
    setBulkInFlight: vi.fn(),
    overrideCounts: new Map(),
    setOverrideCounts: vi.fn(),
    setOverrideCount: vi.fn(),
    incrementOverrideCount: vi.fn(),
    selectRange: vi.fn(),
    selectAllFiltered: vi.fn(),
    addToSelection: vi.fn(),
    toggleSelection: vi.fn(),
    fileStates: new Map(),
    currentFileId: null,
    ...stateOverrides,
  }

  const createStoreMock = () => ({
    useReviewStore: Object.assign(
      vi.fn((selector?: (state: Record<string, unknown>) => unknown) =>
        selector ? selector(storeMockState) : storeMockState,
      ),
      {
        getState: vi.fn(() => storeMockState),
        setState: vi.fn(),
      },
    ),
    useFileState: vi.fn((selector?: (state: Record<string, unknown>) => unknown) =>
      selector ? selector(mockFileState as unknown as Record<string, unknown>) : mockFileState,
    ),
    ReviewFileIdContext: createContext(''),
    selectCanUndo: vi.fn(() => false),
    selectCanRedo: vi.fn(() => false),
  })

  return { storeMockState, mockFileState, createStoreMock }
}
