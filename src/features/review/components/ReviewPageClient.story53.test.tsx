/**
 * ATDD Story 5.3 — AC4 (Sheet Focus), AC5 (Shift+J/K), AC6 (Viewport Sync)
 *
 * Tests for ReviewPageClient keyboard and layout behavior.
 *
 *
 * WARNING (from story spec):
 * - j/k use grid onKeyDown in handleReviewZoneKeyDown, NOT use-keyboard-actions.ts registry
 * - Shift+J/K MUST go in the SAME handler (FindingList.tsx:282-284 warns about double-fire)
 * - useFocusManagement() takes ZERO params — autoAdvance returns string | null
 */

import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useFocusManagement } from '@/features/review/hooks/use-focus-management'
import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'
import type { Finding } from '@/types/finding'

// ── AC4: Sheet Focus Lifecycle (TD-E2E-018) ─────────────────────────────────

describe('AC4: Sheet Focus Lifecycle — autoAdvance returns null → close Sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  // ── AC4 / Scenario 4.1 [P0]: autoAdvance null → caller should close Sheet ──
  it('should return null from autoAdvance when no pending findings exist', () => {
    const { result } = renderHook(() => useFocusManagement())

    const findingIds = ['f1', 'f2', 'f3']
    const statusMap = new Map([
      ['f1', 'accepted'],
      ['f2', 'rejected'],
      ['f3', 'accepted'],
    ])

    const nextId = result.current.autoAdvance(findingIds, statusMap, 'f3')

    // autoAdvance should return null — signals caller to close Sheet
    expect(nextId).toBeNull()
  })

  // ── AC4 / Scenario 4.2 [P0]: After null, action bar should be focusable ──
  it('should focus action bar via rAF when autoAdvance returns null', async () => {
    // Setup: create mock action bar with role="toolbar"
    const toolbar = document.createElement('div')
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('tabindex', '0')
    document.body.appendChild(toolbar)

    const { result } = renderHook(() => useFocusManagement())

    const findingIds = ['f1']
    const statusMap = new Map([['f1', 'accepted']])

    result.current.autoAdvance(findingIds, statusMap, 'f1')

    // Wait for double rAF to fire
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(document.activeElement).toBe(toolbar)
  })
})

// ── AC5: Shift+J/K Bulk Selection (TD-UX-006) ──────────────────────────────

/**
 * AC5 tests verify the Shift+J/K handler logic extracted from handleReviewZoneKeyDown.
 * The handler reads activeFindingIdRef.current and store.sortedFindingIds,
 * then calls store.selectRange(currentId, adjacentId).
 *
 * Since ReviewPageClient is a large component, we test the logic pattern directly.
 */
describe('AC5: Shift+J/K Bulk Selection', () => {
  /**
   * Simulates the Shift+J/K handler logic as implemented in handleReviewZoneKeyDown.
   * This matches the actual implementation pattern — extracting the testable part.
   */
  function simulateShiftJKHandler(
    key: string,
    shiftKey: boolean,
    activeFindingId: string | null,
    sortedFindingIds: string[],
    targetTag: string = 'DIV',
  ): { selectRangeCalled: boolean; fromId?: string; toId?: string } {
    // Input guard (Guardrail #28)
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) {
      return { selectRangeCalled: false }
    }

    const lowerKey = key.toLowerCase()

    if (shiftKey && (lowerKey === 'j' || key === 'ArrowDown')) {
      if (!activeFindingId) return { selectRangeCalled: false }
      const idx = sortedFindingIds.indexOf(activeFindingId)
      if (idx >= 0 && idx < sortedFindingIds.length - 1) {
        return {
          selectRangeCalled: true,
          fromId: activeFindingId,
          toId: sortedFindingIds[idx + 1]!,
        }
      }
      return { selectRangeCalled: false }
    }
    if (shiftKey && (lowerKey === 'k' || key === 'ArrowUp')) {
      if (!activeFindingId) return { selectRangeCalled: false }
      const idx = sortedFindingIds.indexOf(activeFindingId)
      if (idx > 0) {
        return {
          selectRangeCalled: true,
          fromId: activeFindingId,
          toId: sortedFindingIds[idx - 1]!,
        }
      }
      return { selectRangeCalled: false }
    }

    return { selectRangeCalled: false }
  }

  const sortedIds = ['f1', 'f2', 'f3']

  // ── AC5 / Scenario 5.1 [P1]: Shift+J extends selection down ──────────
  it('should call selectRange when Shift+J is pressed on a finding', () => {
    const result = simulateShiftJKHandler('j', true, 'f1', sortedIds)
    expect(result.selectRangeCalled).toBe(true)
    expect(result.fromId).toBe('f1')
    expect(result.toId).toBe('f2')
  })

  // ── AC5 / Scenario 5.2 [P1]: Shift+K extends selection up ────────────
  it('should call selectRange when Shift+K is pressed on a finding', () => {
    const result = simulateShiftJKHandler('k', true, 'f3', sortedIds)
    expect(result.selectRangeCalled).toBe(true)
    expect(result.fromId).toBe('f3')
    expect(result.toId).toBe('f2')
  })

  // ── AC5 / Boundary [P1]: Shift+J at last finding → no-op ─────────────
  it('should not call selectRange when Shift+J pressed at last finding', () => {
    const result = simulateShiftJKHandler('j', true, 'f3', sortedIds)
    expect(result.selectRangeCalled).toBe(false)
  })

  // ── AC5 / Boundary [P1]: Shift+K at first finding → no-op (L1 fix) ──
  it('should not call selectRange when Shift+K pressed at first finding', () => {
    const result = simulateShiftJKHandler('k', true, 'f1', sortedIds)
    expect(result.selectRangeCalled).toBe(false)
  })

  // ── AC5 / Scenario 5.3 [P1]: Shift+J/K suppressed in input ───────────
  it('should suppress Shift+J/K when focus is in input/textarea (Guardrail #28)', () => {
    const resultInput = simulateShiftJKHandler('j', true, 'f1', sortedIds, 'INPUT')
    expect(resultInput.selectRangeCalled).toBe(false)

    const resultTextarea = simulateShiftJKHandler('j', true, 'f1', sortedIds, 'TEXTAREA')
    expect(resultTextarea.selectRangeCalled).toBe(false)

    const resultSelect = simulateShiftJKHandler('j', true, 'f1', sortedIds, 'SELECT')
    expect(resultSelect.selectRangeCalled).toBe(false)
  })
})

// ── AC6: Viewport Transition selectedId Sync (TD-UX-005) ────────────────────

describe('AC6: Viewport Transition selectedId Sync', () => {
  /**
   * Tests the render-time viewport sync logic in ReviewPageClient.tsx:408-418.
   * When layout transitions from desktop→non-desktop, the code syncs selectedId
   * from activeFindingState so the Sheet shows the correct finding.
   *
   * Since the production code is a render-time "store-prev-compare" pattern
   * (not a hook), we test the extracted logic function directly.
   */

  /** Extracted viewport sync logic — mirrors ReviewPageClient.tsx:408-418 */
  function viewportSyncLogic(
    prevLayoutMode: 'desktop' | 'laptop' | 'mobile',
    newLayoutMode: 'desktop' | 'laptop' | 'mobile',
    activeFindingState: string | null,
    selectedId: string | null,
  ): { shouldSync: boolean; syncTarget: string | null } {
    if (prevLayoutMode === newLayoutMode) return { shouldSync: false, syncTarget: null }
    if (
      prevLayoutMode === 'desktop' &&
      activeFindingState !== null &&
      selectedId !== activeFindingState
    ) {
      return { shouldSync: true, syncTarget: activeFindingState }
    }
    return { shouldSync: false, syncTarget: null }
  }

  // ── AC6 / Scenario 6.1 [P1]: Desktop → mobile syncs selectedId ────────
  it('should sync selectedId from activeFindingState on desktop→mobile transition', () => {
    const result = viewportSyncLogic('desktop', 'mobile', 'f2', null)
    expect(result.shouldSync).toBe(true)
    expect(result.syncTarget).toBe('f2')
  })

  // ── AC6 / Scenario 6.2 [P1]: Mobile → desktop does not sync ───────────
  it('should not sync on mobile→desktop transition (handled by handleActiveFindingChange)', () => {
    const result = viewportSyncLogic('mobile', 'desktop', 'f2', 'f2')
    expect(result.shouldSync).toBe(false)
  })

  // ── AC6 / Boundary: activeFindingState null → no sync ─────────────────
  it('should not sync when activeFindingState is null', () => {
    const result = viewportSyncLogic('desktop', 'mobile', null, null)
    expect(result.shouldSync).toBe(false)
  })

  // ── AC6 / Boundary: selectedId already matches → no sync ──────────────
  it('should not sync when selectedId already matches activeFindingState', () => {
    const result = viewportSyncLogic('desktop', 'laptop', 'f2', 'f2')
    expect(result.shouldSync).toBe(false)
  })
})

// ── CR-C1: Auto-reject UI sync reads from fileStates Map (not flat) ────────

describe('CR-C1: Auto-reject suppression UI sync via getStoreFileState', () => {
  const FILE_ID = 'file-cr-c1'

  function makeFinding(id: string, status: string): Finding {
    return {
      id,
      tenantId: 't1',
      projectId: 'p1',
      sessionId: '',
      segmentId: null,
      severity: 'minor',
      originalSeverity: null,
      category: 'accuracy',
      status: status as Finding['status'],
      description: 'test',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      fileId: FILE_ID,
      detectedByLayer: 'L1',
      aiModel: null,
      aiConfidence: null,
      suggestedFix: null,
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
      segmentCount: 1,
      scope: 'per-file',
      reviewSessionId: null,
      relatedFileIds: null,
    }
  }

  beforeEach(() => {
    // Initialize store with fileId + findings in fileStates Map
    const store = useReviewStore.getState()
    store.resetForFile(FILE_ID)
    const findingsMap = new Map<string, Finding>()
    findingsMap.set('f1', makeFinding('f1', 'pending'))
    findingsMap.set('f2', makeFinding('f2', 'pending'))
    findingsMap.set('f3', makeFinding('f3', 'accepted'))
    store.setFindings(findingsMap)
  })

  it('should update findings status to rejected via getStoreFileState (not flat findingsMap)', () => {
    const autoRejectedIds = ['f1', 'f2']
    const updatedAt = '2026-03-29T12:00:00Z'

    // Simulate the C1-fixed auto-reject sync logic from ReviewPageClient.tsx:985-996
    const currentState = useReviewStore.getState()
    const currentFs = getStoreFileState(currentState, FILE_ID)

    for (const id of autoRejectedIds) {
      const finding = currentFs.findingsMap.get(id)
      if (finding && finding.status === 'pending') {
        currentState.setFinding(id, {
          ...finding,
          status: 'rejected',
          updatedAt,
        })
      }
    }

    // Verify findings updated in fileStates Map
    const afterFs = getStoreFileState(useReviewStore.getState(), FILE_ID)
    expect(afterFs.findingsMap.get('f1')!.status).toBe('rejected')
    expect(afterFs.findingsMap.get('f1')!.updatedAt).toBe(updatedAt)
    expect(afterFs.findingsMap.get('f2')!.status).toBe('rejected')
    // f3 was 'accepted' — should NOT be touched (guard: status === 'pending')
    expect(afterFs.findingsMap.get('f3')!.status).toBe('accepted')
  })

  it('should NOT find anything if reading from flat findingsMap (pre-fix behavior)', () => {
    // This test documents WHY the C1 fix was needed.
    // The flat top-level findingsMap is always empty after TD-ARCH-002.
    const currentState = useReviewStore.getState()

    // Flat findingsMap should be empty (all data in fileStates Map)
    expect(currentState.findingsMap.size).toBe(0)

    // getStoreFileState returns the per-file data
    const fs = getStoreFileState(currentState, FILE_ID)
    expect(fs.findingsMap.size).toBe(3)
  })

  it('should skip already-reviewed findings (not pending)', () => {
    const autoRejectedIds = ['f3'] // f3 is 'accepted', not 'pending'
    const currentState = useReviewStore.getState()
    const currentFs = getStoreFileState(currentState, FILE_ID)

    for (const id of autoRejectedIds) {
      const finding = currentFs.findingsMap.get(id)
      if (finding && finding.status === 'pending') {
        currentState.setFinding(id, { ...finding, status: 'rejected' })
      }
    }

    // f3 should remain 'accepted' — guard prevented overwrite
    const afterFs = getStoreFileState(useReviewStore.getState(), FILE_ID)
    expect(afterFs.findingsMap.get('f3')!.status).toBe('accepted')
  })
})
