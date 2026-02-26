/**
 * ATDD Tests — Story 3.0: Score & Review Infrastructure
 * AC1: Zustand Review Store (`useReviewStore`)
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'

describe('useReviewStore', () => {
  beforeEach(() => {
    useReviewStore.getState().resetForFile('test-file-id')
  })

  // ── P0: Findings Slice ──

  it('should initialize with empty findingsMap', () => {
    const state = useReviewStore.getState()
    expect(state.findingsMap).toBeInstanceOf(Map)
    expect(state.findingsMap.size).toBe(0)
  })

  it('should add finding to findingsMap via setFinding', () => {
    const finding = buildFinding({ id: 'f1' })
    useReviewStore.getState().setFinding('f1', finding)
    expect(useReviewStore.getState().findingsMap.get('f1')).toEqual(finding)
  })

  it('should remove finding from findingsMap via removeFinding', () => {
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    useReviewStore.getState().removeFinding('f1')
    expect(useReviewStore.getState().findingsMap.has('f1')).toBe(false)
  })

  it('should update filterState via setFilter', () => {
    useReviewStore.getState().setFilter({ severity: 'major', status: null, layer: 'L1' })
    expect(useReviewStore.getState().filterState.severity).toBe('major')
    expect(useReviewStore.getState().filterState.layer).toBe('L1')
  })

  // ── P0: Score Slice ──

  it('should update score and status via updateScore', () => {
    useReviewStore.getState().updateScore(85, 'calculated')
    const state = useReviewStore.getState()
    expect(state.currentScore).toBe(85)
    expect(state.scoreStatus).toBe('calculated')
    expect(state.isRecalculating).toBe(false)
  })

  it('should set isRecalculating=true and scoreStatus=calculating via setRecalculating', () => {
    useReviewStore.getState().setRecalculating()
    const state = useReviewStore.getState()
    expect(state.isRecalculating).toBe(true)
    expect(state.scoreStatus).toBe('calculating')
  })

  // ── P0: Selection Slice ──

  it('should add id to selectedIds via toggleSelection', () => {
    useReviewStore.getState().toggleSelection('f1')
    expect(useReviewStore.getState().selectedIds.has('f1')).toBe(true)
  })

  it('should remove id from selectedIds when already selected', () => {
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().toggleSelection('f1')
    expect(useReviewStore.getState().selectedIds.has('f1')).toBe(false)
  })

  // ── P0: File Reset ──

  it('should clear ALL state on resetForFile', () => {
    // Populate state first
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    useReviewStore.getState().updateScore(85, 'calculated')
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().setSelectionMode('bulk')

    useReviewStore.getState().resetForFile('new-file-id')

    const state = useReviewStore.getState()
    expect(state.findingsMap.size).toBe(0)
    expect(state.currentScore).toBeNull()
    expect(state.scoreStatus).toBe('na')
    expect(state.isRecalculating).toBe(false)
    expect(state.selectedIds.size).toBe(0)
    expect(state.selectedId).toBeNull()
    expect(state.selectionMode).toBe('single')
    expect(state.currentFileId).toBe('new-file-id')
  })

  // ── P1: Extended State ──

  it('should update selectedId via setSelectedFinding', () => {
    useReviewStore.getState().setSelectedFinding('f1')
    expect(useReviewStore.getState().selectedId).toBe('f1')
  })

  it('should toggle selectionMode between single and bulk', () => {
    expect(useReviewStore.getState().selectionMode).toBe('single')
    useReviewStore.getState().setSelectionMode('bulk')
    expect(useReviewStore.getState().selectionMode).toBe('bulk')
  })

  it('should clear selectedIds when switching from bulk to single mode', () => {
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().toggleSelection('f2')
    useReviewStore.getState().setSelectionMode('single')
    expect(useReviewStore.getState().selectedIds.size).toBe(0)
  })

  // ── P1-BV: Boundary Values ──

  it('should handle resetForFile with empty findingsMap', () => {
    // No findings added — reset should still work cleanly
    useReviewStore.getState().resetForFile('file-id')
    expect(useReviewStore.getState().findingsMap.size).toBe(0)
  })

  it('should handle resetForFile with null score', () => {
    // Score never set — reset should leave null
    useReviewStore.getState().resetForFile('file-id')
    expect(useReviewStore.getState().currentScore).toBeNull()
  })

  it('should handle updateScore with score=100 (0 contributing findings)', () => {
    useReviewStore.getState().updateScore(100, 'calculated')
    expect(useReviewStore.getState().currentScore).toBe(100)
  })

  // ── P1: Batch Setters ──

  it('should replace entire findingsMap via setFindings (batch)', () => {
    // Pre-populate with a finding
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))

    // Batch replace
    const batchMap = new Map<string, ReturnType<typeof buildFinding>>()
    batchMap.set('f2', buildFinding({ id: 'f2' }))
    batchMap.set('f3', buildFinding({ id: 'f3' }))
    useReviewStore.getState().setFindings(batchMap)

    const state = useReviewStore.getState()
    expect(state.findingsMap.size).toBe(2)
    expect(state.findingsMap.has('f1')).toBe(false)
    expect(state.findingsMap.has('f2')).toBe(true)
    expect(state.findingsMap.has('f3')).toBe(true)
  })

  it('should replace entire selectedIds via setSelections (batch)', () => {
    useReviewStore.getState().toggleSelection('f1')

    const batchSet = new Set(['f2', 'f3', 'f4'])
    useReviewStore.getState().setSelections(batchSet)

    const state = useReviewStore.getState()
    expect(state.selectedIds.size).toBe(3)
    expect(state.selectedIds.has('f1')).toBe(false)
    expect(state.selectedIds.has('f2')).toBe(true)
  })

  // ── P1: currentFileId ──

  it('should store currentFileId on resetForFile', () => {
    useReviewStore.getState().resetForFile('new-file-id')
    expect(useReviewStore.getState().currentFileId).toBe('new-file-id')
  })

  it('should track currentFileId across multiple resetForFile calls', () => {
    // beforeEach sets currentFileId to 'test-file-id'
    expect(useReviewStore.getState().currentFileId).toBe('test-file-id')

    useReviewStore.getState().resetForFile('second-file')
    expect(useReviewStore.getState().currentFileId).toBe('second-file')

    useReviewStore.getState().resetForFile('third-file')
    expect(useReviewStore.getState().currentFileId).toBe('third-file')
  })
})
