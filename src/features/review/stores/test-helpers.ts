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
