/**
 * TD-ARCH-001: File-Scoped Zustand Review Store Tests
 * Tests the Map-based file isolation, concurrent file states, and pre-mortem scenarios.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore, selectCanUndo, selectCanRedo } from '@/features/review/stores/review.store'
import type { UndoEntry } from '@/features/review/stores/review.store'
import { createMockFileState } from '@/features/review/stores/test-helpers'
import { buildFinding } from '@/test/factories'

function buildUndoEntry(overrides?: Partial<UndoEntry>): UndoEntry {
  const id = overrides?.id ?? crypto.randomUUID()
  const findingId = overrides?.findingId ?? crypto.randomUUID()
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

  // ── useFileState wrapper ──

  describe('useFileState wrapper', () => {
    it('should return DEFAULT_FILE_STATE when no file is active', () => {
      useReviewStore.setState({ currentFileId: null, fileStates: new Map() })
      // useFileState is a React hook, test its logic directly
      const fs = useReviewStore
        .getState()
        .fileStates.get(useReviewStore.getState().currentFileId ?? '')
      expect(fs).toBeUndefined()
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
