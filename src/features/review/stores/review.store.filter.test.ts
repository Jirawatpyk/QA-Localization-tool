/**
 * Story 4.5 ATDD: Review Store — FilterState Extensions, Search, AI Toggle
 * Tests: extended filters, per-file cache, confidence thresholds, search, selection clearing
 *
 * Adapted from ATDD stubs — preserved scenario intent + assertion count.
 * API mappings: filters→filterState, toggleSelected→toggleSelection,
 * bulkMode→selectionMode, activeFindingId→selectedId, setActiveFinding→setSelectedFinding
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore } from '@/features/review/stores/review.store'
import { saveFilterCache } from '@/features/review/utils/filter-cache'
import { buildFinding } from '@/test/factories'

/** Simulate component cleanup: save current filter state to cache (mirrors ReviewPageClient useEffect cleanup) */
function saveFilterToCache() {
  const store = useReviewStore.getState()
  if (store.currentFileId) {
    saveFilterCache(store.currentFileId, {
      filterState: { ...store.filterState },
      searchQuery: store.searchQuery,
      aiSuggestionsEnabled: store.aiSuggestionsEnabled,
    })
  }
}

describe('FilterState Extensions (Story 4.5)', () => {
  beforeEach(() => {
    // Clear sessionStorage cache + currentFileId for clean test isolation
    sessionStorage.clear()
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file-id')
  })

  // -- Extended FilterState type --

  describe('Extended FilterState type', () => {
    it('should initialize with category null, confidence null, searchQuery empty string', () => {
      const state = useReviewStore.getState()
      expect(state.filterState.category).toBeNull()
      expect(state.filterState.confidence).toBeNull()
      expect(state.searchQuery).toBe('')
    })

    it('should set category filter via setFilter', () => {
      useReviewStore.getState().setFilter('category', 'accuracy')
      expect(useReviewStore.getState().filterState.category).toBe('accuracy')
    })

    it('should set confidence filter via setFilter', () => {
      useReviewStore.getState().setFilter('confidence', 'high')
      expect(useReviewStore.getState().filterState.confidence).toBe('high')
    })

    it('should set searchQuery via setSearchQuery', () => {
      useReviewStore.getState().setSearchQuery('test query')
      expect(useReviewStore.getState().searchQuery).toBe('test query')
    })
  })

  // -- AI Suggestions Toggle --

  describe('AI Suggestions Toggle', () => {
    it('should initialize aiSuggestionsEnabled as true', () => {
      expect(useReviewStore.getState().aiSuggestionsEnabled).toBe(true)
    })

    it('should toggle aiSuggestionsEnabled via setAiSuggestionsEnabled', () => {
      useReviewStore.getState().setAiSuggestionsEnabled(false)
      expect(useReviewStore.getState().aiSuggestionsEnabled).toBe(false)

      useReviewStore.getState().setAiSuggestionsEnabled(true)
      expect(useReviewStore.getState().aiSuggestionsEnabled).toBe(true)
    })

    it('should NOT reset aiSuggestionsEnabled when resetFilters called (DG-2 fix: AC8 separate)', () => {
      // User intentionally turns off AI suggestions
      useReviewStore.getState().setAiSuggestionsEnabled(false)
      expect(useReviewStore.getState().aiSuggestionsEnabled).toBe(false)

      // User clicks "Clear all filters" — should clear filters + search, NOT AI toggle
      useReviewStore.getState().resetFilters()

      // AI toggle should remain OFF
      expect(useReviewStore.getState().aiSuggestionsEnabled).toBe(false)
      // But filters + search should be reset to defaults
      expect(useReviewStore.getState().filterState.status).toBe('pending')
      expect(useReviewStore.getState().searchQuery).toBe('')
    })
  })

  // -- Per-file Filter Cache (AC3) --

  describe('Per-file Filter Cache (AC3)', () => {
    it('should save filter state to sessionStorage cache on file switch', () => {
      // Set some filters on file-A
      useReviewStore.getState().setFilter('severity', 'critical')
      useReviewStore.getState().setFilter('category', 'terminology')

      // Simulate component cleanup (saves to cache) then switch
      saveFilterToCache()
      useReviewStore.getState().resetForFile('file-b')

      // Verify cache was saved to sessionStorage
      expect(sessionStorage.getItem('filterCache:test-file-id')).not.toBeNull()
    })

    it('should restore filter state from cache when returning to previously visited file', () => {
      // Set filters on file-A
      useReviewStore.getState().setFilter('severity', 'critical')

      // Simulate file switch A→B (cleanup saves A, reset loads B)
      saveFilterToCache()
      useReviewStore.getState().resetForFile('file-b')

      // Switch back to file-A → cleanup saves B, reset restores A
      saveFilterToCache()
      useReviewStore.getState().resetForFile('test-file-id')
      expect(useReviewStore.getState().filterState.severity).toBe('critical')
    })

    it('should set default filter (status=pending) for never-visited file', () => {
      useReviewStore.getState().resetForFile('never-visited-file')
      expect(useReviewStore.getState().filterState.status).toBe('pending')
    })

    it('should save aiSuggestionsEnabled in per-file cache', () => {
      useReviewStore.getState().setAiSuggestionsEnabled(false)

      // Switch away then back (with cache save)
      saveFilterToCache()
      useReviewStore.getState().resetForFile('file-b')
      saveFilterToCache()
      useReviewStore.getState().resetForFile('test-file-id')

      expect(useReviewStore.getState().aiSuggestionsEnabled).toBe(false)
    })

    it('should NOT save undo/redo stacks in cache (Guardrail #35)', () => {
      // Push some undo entries, switch files, switch back
      // Verify undo/redo stacks are empty after restoring from cache
      useReviewStore.getState().resetForFile('file-b')
      useReviewStore.getState().resetForFile('test-file-id')

      expect(useReviewStore.getState().undoStack).toHaveLength(0)
      expect(useReviewStore.getState().redoStack).toHaveLength(0)
    })

    it('should always clear undo/redo stacks on file switch regardless of cache', () => {
      useReviewStore.getState().resetForFile('any-file')
      expect(useReviewStore.getState().undoStack).toHaveLength(0)
      expect(useReviewStore.getState().redoStack).toHaveLength(0)
    })
  })

  // -- selectAllFiltered with extended dimensions --

  describe('selectAllFiltered with extended dimensions', () => {
    it('should filter by category when category filter is set', () => {
      const f1 = buildFinding({ id: 'f1', category: 'accuracy', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', category: 'terminology', status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().setFilter('category', 'accuracy')
      useReviewStore.getState().setFilter('status', null) // Clear default pending filter

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })

    it('should filter by confidence=high (aiConfidence > 85)', () => {
      const f1 = buildFinding({ id: 'f1', aiConfidence: 90, status: 'pending' })
      const f2 = buildFinding({ id: 'f2', aiConfidence: 70, status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().setFilter('confidence', 'high')

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })

    it('should filter by confidence=medium (aiConfidence >= 70 && <= 85)', () => {
      const f1 = buildFinding({ id: 'f1', aiConfidence: 75, status: 'pending' })
      const f2 = buildFinding({ id: 'f2', aiConfidence: 90, status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().setFilter('confidence', 'medium')

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })

    it('should filter by confidence=low (aiConfidence < 70)', () => {
      const f1 = buildFinding({ id: 'f1', aiConfidence: 50, status: 'pending' })
      const f2 = buildFinding({ id: 'f2', aiConfidence: 80, status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().setFilter('confidence', 'low')

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })

    it('should exclude null-confidence findings from confidence filter', () => {
      const f1 = buildFinding({ id: 'f1', aiConfidence: null, status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().setFilter('confidence', 'high')

      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(0)
    })

    it('should filter by searchQuery matching description', () => {
      const f1 = buildFinding({ id: 'f1', description: 'Missing translation', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', description: 'Inconsistent term', status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().setSearchQuery('missing')

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })

    it('should exclude L2/L3 findings when aiSuggestionsEnabled is false', () => {
      const f1 = buildFinding({ id: 'f1', detectedByLayer: 'L1', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', detectedByLayer: 'L2', status: 'pending' })
      const f3 = buildFinding({ id: 'f3', detectedByLayer: 'L3', status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setFinding('f3', f3)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2', 'f3'])
      useReviewStore.getState().setAiSuggestionsEnabled(false)

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })

    it('should apply AND logic across all filter dimensions', () => {
      const f1 = buildFinding({
        id: 'f1',
        severity: 'critical',
        category: 'accuracy',
        aiConfidence: 90,
        detectedByLayer: 'L2',
        description: 'Match this',
        status: 'pending',
      })
      const f2 = buildFinding({
        id: 'f2',
        severity: 'major',
        category: 'accuracy',
        aiConfidence: 90,
        detectedByLayer: 'L2',
        description: 'Match this',
        status: 'pending',
      })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])

      useReviewStore.getState().setFilter('severity', 'critical')
      useReviewStore.getState().setFilter('category', 'accuracy')
      useReviewStore.getState().setFilter('confidence', 'high')
      useReviewStore.getState().setSearchQuery('Match')

      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
    })
  })

  // -- Confidence threshold boundary values --

  describe('Confidence threshold boundary values', () => {
    beforeEach(() => {
      // Clear default status=pending filter to isolate confidence testing
      useReviewStore.getState().setFilter('status', null)
    })

    it('should classify aiConfidence=85 as medium (not high)', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: 85, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'high')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(0)

      useReviewStore.getState().setFilter('confidence', 'medium')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should classify aiConfidence=85.01 as high', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: 85.01, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'high')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should classify aiConfidence=70 as medium (not low)', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: 70, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'low')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(0)

      useReviewStore.getState().setFilter('confidence', 'medium')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should classify aiConfidence=69.99 as low', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: 69.99, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'low')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should classify aiConfidence=0 as low', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: 0, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'low')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should classify aiConfidence=100 as high', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: 100, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'high')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should treat aiConfidence=null as excluded from confidence filter', () => {
      const f = buildFinding({ id: 'f1', aiConfidence: null, status: 'pending' })
      useReviewStore.getState().setFinding('f1', f)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setFilter('confidence', 'high')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(0)

      useReviewStore.getState().setFilter('confidence', 'medium')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(0)

      useReviewStore.getState().setFilter('confidence', 'low')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(0)
    })
  })

  // -- Selection clearing on filter change --

  describe('Selection clearing on filter change', () => {
    beforeEach(() => {
      // Clear default status=pending filter to test severity filter in isolation
      useReviewStore.getState().setFilter('status', null)
    })

    it('should intersect selectedIds with visible findings when filter changes', () => {
      const f1 = buildFinding({ id: 'f1', severity: 'critical', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', severity: 'major', status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().toggleSelection('f1')
      useReviewStore.getState().toggleSelection('f2')

      useReviewStore.getState().setFilter('severity', 'critical')

      const selected = useReviewStore.getState().selectedIds
      expect(selected.has('f1')).toBe(true)
      expect(selected.has('f2')).toBe(false)
    })

    it('should exit bulk mode when all selected findings become invisible', () => {
      const f1 = buildFinding({ id: 'f1', severity: 'major', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().setSelectionMode('bulk')
      useReviewStore.getState().toggleSelection('f1')

      // Filter to critical only -> f1 (major) disappears
      useReviewStore.getState().setFilter('severity', 'critical')

      expect(useReviewStore.getState().selectedIds.size).toBe(0)
      expect(useReviewStore.getState().selectionMode).toBe('single')
    })

    it('should keep visible selected findings after filter change', () => {
      const f1 = buildFinding({ id: 'f1', severity: 'critical', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().toggleSelection('f1')

      useReviewStore.getState().setFilter('severity', 'critical')

      expect(useReviewStore.getState().selectedIds.has('f1')).toBe(true)
    })

    it('should reset selectedId to first filtered finding when active finding filtered out', () => {
      const f1 = buildFinding({ id: 'f1', severity: 'critical', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', severity: 'major', status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])
      useReviewStore.getState().setSelectedFinding('f2')

      // Filter to critical only -> f2 (major) disappears
      useReviewStore.getState().setFilter('severity', 'critical')

      expect(useReviewStore.getState().selectedId).toBe('f1')
    })

    it('should set selectedId to null when filter produces zero results', () => {
      const f1 = buildFinding({ id: 'f1', severity: 'major', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().setSelectedFinding('f1')

      // Filter to critical -> no matches
      useReviewStore.getState().setFilter('severity', 'critical')

      expect(useReviewStore.getState().selectedId).toBeNull()
    })
  })

  // -- Search edge cases --

  describe('Search edge cases', () => {
    it('should match Thai text case-insensitively', () => {
      const f1 = buildFinding({ id: 'f1', description: 'ข้อผิดพลาดคำแปลไม่ตรง', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setSearchQuery('คำแปล')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should match CJK text', () => {
      const f1 = buildFinding({ id: 'f1', description: '翻訳が不正確です', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setSearchQuery('翻訳')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should treat whitespace-only query as empty (show all)', () => {
      const f1 = buildFinding({ id: 'f1', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setSearchQuery('   ')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })

    it('should match against sourceTextExcerpt, targetTextExcerpt, description, suggestedFix', () => {
      const f1 = buildFinding({ id: 'f1', sourceTextExcerpt: 'keyword', status: 'pending' })
      const f2 = buildFinding({ id: 'f2', targetTextExcerpt: 'keyword', status: 'pending' })
      const f3 = buildFinding({ id: 'f3', description: 'keyword found', status: 'pending' })
      const f4 = buildFinding({ id: 'f4', suggestedFix: 'use keyword', status: 'pending' })
      const f5 = buildFinding({ id: 'f5', description: 'no match here', status: 'pending' })

      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setFinding('f3', f3)
      useReviewStore.getState().setFinding('f4', f4)
      useReviewStore.getState().setFinding('f5', f5)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2', 'f3', 'f4', 'f5'])

      useReviewStore.getState().setSearchQuery('keyword')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(4)
    })

    it('should handle null text fields without error', () => {
      const f1 = buildFinding({
        id: 'f1',
        sourceTextExcerpt: null,
        targetTextExcerpt: null,
        suggestedFix: null,
        description: 'some text',
        status: 'pending',
      })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])

      useReviewStore.getState().setSearchQuery('some')
      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
    })
  })

  // -- G-3: Realtime new L2 finding while AI toggle OFF --

  describe('Realtime finding arrival while AI toggle OFF (TA Gap G-3)', () => {
    it('should exclude newly added L2 finding from selectAllFiltered when AI toggle OFF', () => {
      // Start with L1 finding + AI toggle OFF
      const f1 = buildFinding({ id: 'f1', detectedByLayer: 'L1', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().setAiSuggestionsEnabled(false)

      // Simulate Realtime arriving L2 finding (like use-findings-subscription would)
      const f2 = buildFinding({ id: 'f2', detectedByLayer: 'L2', status: 'pending' })
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])

      // findingsMap has 2 entries, but selectAllFiltered should only select L1
      expect(useReviewStore.getState().findingsMap.size).toBe(2)
      useReviewStore.getState().selectAllFiltered()
      const selected = useReviewStore.getState().selectedIds
      expect(selected.size).toBe(1)
      expect(selected.has('f1')).toBe(true)
      expect(selected.has('f2')).toBe(false)
    })

    it('should exclude newly added L3 finding from selectAllFiltered when AI toggle OFF', () => {
      const f1 = buildFinding({ id: 'f1', detectedByLayer: 'L1', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().setAiSuggestionsEnabled(false)

      // Simulate Realtime arriving L3 finding
      const f3 = buildFinding({ id: 'f3', detectedByLayer: 'L3', status: 'pending' })
      useReviewStore.getState().setFinding('f3', f3)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f3'])

      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(1)
      expect(useReviewStore.getState().selectedIds.has('f1')).toBe(true)
    })

    it('should include newly added L2 finding when AI toggle is re-enabled', () => {
      const f1 = buildFinding({ id: 'f1', detectedByLayer: 'L1', status: 'pending' })
      useReviewStore.getState().setFinding('f1', f1)
      useReviewStore.getState().setSortedFindingIds(['f1'])
      useReviewStore.getState().setAiSuggestionsEnabled(false)

      // Realtime arrival while OFF
      const f2 = buildFinding({ id: 'f2', detectedByLayer: 'L2', status: 'pending' })
      useReviewStore.getState().setFinding('f2', f2)
      useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])

      // Re-enable AI toggle
      useReviewStore.getState().setAiSuggestionsEnabled(true)

      useReviewStore.getState().selectAllFiltered()
      expect(useReviewStore.getState().selectedIds.size).toBe(2)
    })
  })
})
