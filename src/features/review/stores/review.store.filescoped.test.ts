/**
 * TD-ARCH-001: File-Scoped Zustand Review Store Tests
 * Tests the Map-based file isolation, concurrent file states, and pre-mortem scenarios.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import {
  useReviewStore,
  selectCanUndo,
  selectCanRedo,
  DEFAULT_FILE_STATE,
} from '@/features/review/stores/review.store'
import type { FileState, UndoEntry } from '@/features/review/stores/review.store'
import { createMockFileState } from '@/features/review/stores/test-helpers'
import { buildFinding } from '@/test/factories'

function buildUndoEntry(overrides?: Partial<UndoEntry>): UndoEntry {
  // M6: compute findingId first so previousStates/newStates use the same ID
  const findingId = overrides?.findingId ?? crypto.randomUUID()
  const id = overrides?.id ?? crypto.randomUUID()
  return {
    id,
    type: 'single',
    action: 'accept',
    findingId,
    batchId: null,
    previousStates: new Map([[findingId, 'pending']]),
    newStates: new Map([[findingId, 'accepted']]),
    previousSeverity: null,
    newSeverity: null,
    findingSnapshot: null,
    description: 'Accept Finding',
    timestamp: Date.now(),
    staleFindings: new Set(),
    ...overrides,
  }
}

describe('File-Scoped Store (TD-ARCH-001)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useReviewStore.setState({ currentFileId: null, fileStates: new Map() })
    useReviewStore.getState().resetForFile('file-a')
  })

  // ── PM-1: Realtime writes to correct file ──

  describe('PM-1: Realtime writes target active file only', () => {
    it('should isolate findings between files in fileStates Map', () => {
      const findingA = buildFinding({ id: 'fa', fileId: 'file-a' })
      useReviewStore.getState().setFinding('fa', findingA)

      // Switch to file-b
      useReviewStore.getState().resetForFile('file-b')
      const findingB = buildFinding({ id: 'fb', fileId: 'file-b' })
      useReviewStore.getState().setFinding('fb', findingB)

      // file-b has only fb
      const fsB = useReviewStore.getState().fileStates.get('file-b')
      expect(fsB?.findingsMap.size).toBe(1)
      expect(fsB?.findingsMap.has('fb')).toBe(true)

      // file-a has fa (from earlier, preserved in Map)
      const fsA = useReviewStore.getState().fileStates.get('file-a')
      expect(fsA?.findingsMap.size).toBe(1)
      expect(fsA?.findingsMap.has('fa')).toBe(true)
    })

    it('should update only the active file when setFinding is called', () => {
      useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))

      // Flat field and Map entry should match
      expect(useReviewStore.getState().findingsMap.size).toBe(1)
      const fs = useReviewStore.getState().fileStates.get('file-a')
      expect(fs?.findingsMap.size).toBe(1)
    })
  })

  // ── PM-2: Undo scoped to active file ──

  describe('PM-2: Undo/redo per-file', () => {
    it('should clear undo/redo when switching files (Guardrail #35)', () => {
      useReviewStore.getState().pushUndo(buildUndoEntry())
      expect(selectCanUndo(useReviewStore.getState())).toBe(true)

      // Switch to file-b
      useReviewStore.getState().resetForFile('file-b')

      // file-b has no undo entries
      expect(selectCanUndo(useReviewStore.getState())).toBe(false)
      expect(selectCanRedo(useReviewStore.getState())).toBe(false)
    })

    it('should preserve undo entries in Map for file-a after switch', () => {
      useReviewStore.getState().pushUndo(buildUndoEntry())

      // Switch to file-b
      useReviewStore.getState().resetForFile('file-b')

      // file-a's Map entry should still have the undo entry
      const fsA = useReviewStore.getState().fileStates.get('file-a')
      expect(fsA?.undoStack.length).toBe(1)
    })

    // L4: positive path — push on file-b, verify popUndo returns file-b's entry
    it('should popUndo from active file (not other files)', () => {
      const entryA = buildUndoEntry({ findingId: 'fa' })
      useReviewStore.getState().pushUndo(entryA)

      // Switch to file-b and push a different undo entry
      useReviewStore.getState().resetForFile('file-b')
      const entryB = buildUndoEntry({ findingId: 'fb' })
      useReviewStore.getState().pushUndo(entryB)

      // popUndo should return file-b's entry (not file-a's)
      const popped = useReviewStore.getState().popUndo()
      expect(popped?.findingId).toBe('fb')
    })
  })

  // ── PM-3: selectAllFiltered scoped to active file ──

  describe('PM-3: selectAllFiltered per-file', () => {
    it('should select only findings from active file', () => {
      // Set up findings on file-a
      const f1 = buildFinding({ id: 'f1', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])

      // Switch to file-b with different findings
      useReviewStore.getState().resetForFile('file-b')
      const f3 = buildFinding({ id: 'f3', status: 'pending' })
      useReviewStore.getState().setFinding('f3', f3)
      useReviewStore.getState().setSortedFindingIds(['f3'])

      // selectAllFiltered should only select file-b's finding
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
      expect(useReviewStore.getState().selectedIds.has('f3')).toBe(true)
    })
  })

  // ── PM-6: Initialized guard ──

  describe('PM-6: Init guard via FileState.initialized', () => {
    it('should create FileState with initialized=false', () => {
      const fs = useReviewStore.getState().fileStates.get('file-a')
      expect(fs?.initialized).toBe(false)
    })

    it('should preserve initialized flag in Map after setting it', () => {
      // Simulate component init: set initialized + populate findings
      const fs = useReviewStore.getState().fileStates.get('file-a')
      if (fs) {
        const newFileStates = new Map(useReviewStore.getState().fileStates)
        newFileStates.set('file-a', { ...fs, initialized: true })
        useReviewStore.setState({ fileStates: newFileStates })
      }

      // Verify initialized is true
      expect(useReviewStore.getState().fileStates.get('file-a')?.initialized).toBe(true)

      // Switch away and back → resetForFile creates fresh entry → initialized resets
      useReviewStore.getState().resetForFile('file-b')
      useReviewStore.getState().resetForFile('file-a')
      expect(useReviewStore.getState().fileStates.get('file-a')?.initialized).toBe(false)
    })

    // M2: verify optimistic state preserved when already initialized with findings
    it('should preserve optimistic findingsMap when initialized=true and findingsMap populated', () => {
      // Simulate component init: populate findings + mark initialized
      const finding = buildFinding({ id: 'f1', status: 'accepted' })
      useReviewStore.getState().setFinding('f1', finding)
      const fs = useReviewStore.getState().fileStates.get('file-a')!
      const newFileStates = new Map(useReviewStore.getState().fileStates)
      newFileStates.set('file-a', { ...fs, initialized: true })
      useReviewStore.setState({ fileStates: newFileStates })

      // The init guard pattern from ReviewPageClient: skip re-init when
      // initialized=true AND findingsMap has data (protects optimistic state)
      const fileFs = useReviewStore.getState().fileStates.get('file-a')
      const shouldSkip = fileFs?.initialized === true && fileFs.findingsMap.size > 0
      expect(shouldSkip).toBe(true)

      // Verify the optimistic finding is still there
      expect(fileFs?.findingsMap.get('f1')?.status).toBe('accepted')
    })
  })

  // ── Concurrent file states ──

  describe('Concurrent file states', () => {
    it('should maintain separate score states per file', () => {
      // Set score on file-a
      useReviewStore.getState().updateScore(95, 'calculated', 'L1')

      // Switch to file-b
      useReviewStore.getState().resetForFile('file-b')
      useReviewStore.getState().updateScore(72, 'calculated', 'L1L2')

      // file-b flat fields
      expect(useReviewStore.getState().currentScore).toBe(72)

      // file-a preserved in Map
      const fsA = useReviewStore.getState().fileStates.get('file-a')
      expect(fsA?.currentScore).toBe(95)
    })

    it('should maintain separate selection states per file', () => {
      useReviewStore.getState().toggleSelection('f1')
      expect(useReviewStore.getState().selectedIds.has('f1')).toBe(true)

      // Switch to file-b
      useReviewStore.getState().resetForFile('file-b')
      expect(useReviewStore.getState().selectedIds.size).toBe(0)

      // file-a selection preserved in Map
      const fsA = useReviewStore.getState().fileStates.get('file-a')
      expect(fsA?.selectedIds.has('f1')).toBe(true)
    })
  })

  // ── H3: createSyncingSet edge cases ──

  describe('createSyncingSet auto-sync', () => {
    it('should skip Map sync when update contains fileStates key (resetForFile path)', () => {
      // resetForFile includes fileStates in its update — createSyncingSet should skip auto-sync
      // If this works correctly, resetForFile creates a fresh FileState
      useReviewStore.getState().resetForFile('file-b')
      const fsB = useReviewStore.getState().fileStates.get('file-b')
      expect(fsB).toBeDefined()
      expect(fsB?.initialized).toBe(false) // fresh entry
    })

    it('should skip Map sync when currentFileId is null', () => {
      useReviewStore.setState({ currentFileId: null, fileStates: new Map() })
      // This should not throw — createSyncingSet returns update as-is when no fileId
      expect(() => {
        useReviewStore.getState().setFilter('severity', 'critical')
      }).not.toThrow()
    })

    it('should skip Map sync for non-file-scoped field updates', () => {
      // currentFileId is a global field, not in FILE_STATE_KEYS
      const before = useReviewStore.getState().fileStates.get('file-a')
      // Trigger a global-only update (resetForFile is the only way to change currentFileId,
      // but we can verify that a non-file-scoped partial does not alter the Map entry)
      const fsBeforeRef = before ? { ...before } : null

      // setSelectedFinding writes to selectedId (IS file-scoped) — should sync
      useReviewStore.getState().setSelectedFinding('test-id')
      const fsAfter = useReviewStore.getState().fileStates.get('file-a')
      expect(fsAfter?.selectedId).toBe('test-id')

      // Verify other file-scoped fields in Map unchanged
      if (fsBeforeRef) {
        expect(fsAfter?.currentScore).toBe(fsBeforeRef.currentScore)
      }
    })

    it('should handle empty partial update without error', () => {
      // The L6 early exit: Object.keys({}).length === 0 → return update
      expect(() => {
        useReviewStore.setState({})
      }).not.toThrow()
    })
  })

  // ── resetForFile guards ──

  describe('resetForFile guards', () => {
    it('should be idempotent for same fileId', () => {
      useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))

      // Calling resetForFile for the same file should be a no-op
      useReviewStore.getState().resetForFile('file-a')
      expect(useReviewStore.getState().findingsMap.size).toBe(1) // preserved
    })

    it('should not create Map entry for empty string fileId (L2)', () => {
      const sizeBefore = useReviewStore.getState().fileStates.size
      useReviewStore.getState().resetForFile('')
      expect(useReviewStore.getState().fileStates.size).toBe(sizeBefore)
    })
  })

  // ── useFileState store-level logic ──

  describe('useFileState store-level logic', () => {
    it('should return DEFAULT_FILE_STATE values when no file entry exists', () => {
      useReviewStore.setState({ currentFileId: null, fileStates: new Map() })
      // Test the store-level read path that useFileState uses internally
      const state = useReviewStore.getState()
      const fs = state.fileStates.get(state.currentFileId ?? '')
      expect(fs).toBeUndefined()
      // When fs is undefined, useFileState returns selector(DEFAULT_FILE_STATE)
      expect(DEFAULT_FILE_STATE.findingsMap.size).toBe(0)
      expect(DEFAULT_FILE_STATE.initialized).toBe(false)
    })

    it('should read from the correct file entry when fileId is specified', () => {
      // Set up file-a with findings
      useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))

      // Switch to file-b
      useReviewStore.getState().resetForFile('file-b')

      // Reading file-a's entry should still return the finding
      const fsA = useReviewStore.getState().fileStates.get('file-a')
      expect(fsA?.findingsMap.has('f1')).toBe(true)

      // Reading file-b's entry should be empty
      const fsB = useReviewStore.getState().fileStates.get('file-b')
      expect(fsB?.findingsMap.size).toBe(0)
    })
  })

  // ── DEFAULT_FILE_STATE immutability (M1) ──

  describe('DEFAULT_FILE_STATE', () => {
    it('should be frozen (Object.freeze)', () => {
      expect(Object.isFrozen(DEFAULT_FILE_STATE)).toBe(true)
    })
  })

  // ── createMockFileState helper ──

  describe('createMockFileState helper', () => {
    it('should create a FileState with sensible defaults', () => {
      const fs = createMockFileState()
      expect(fs.findingsMap).toBeInstanceOf(Map)
      expect(fs.findingsMap.size).toBe(0)
      expect(fs.selectedIds).toBeInstanceOf(Set)
      expect(fs.filterState.status).toBe('pending')
      expect(fs.initialized).toBe(false)
    })

    it('should accept overrides', () => {
      const finding = buildFinding({ id: 'f1' })
      const fs = createMockFileState({
        findingsMap: new Map([['f1', finding]]),
        currentScore: 95,
        initialized: true,
      })
      expect(fs.findingsMap.size).toBe(1)
      expect(fs.currentScore).toBe(95)
      expect(fs.initialized).toBe(true)
    })
  })
})
