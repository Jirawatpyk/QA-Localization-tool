/**
 * Test Automation Expansion — Story 4.2: review.store (Zustand)
 * Regression tests for sortedFindingIds ordering + Realtime INSERT recalculation
 *
 * TA-U5: sortedFindingIds maintains severity order (not Map insertion order)
 * TA-U15: sortedFindingIds recalculates when Realtime INSERT adds new finding
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'

describe('useReviewStore — TA expansion', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('ta-test')
  })

  // TA-U5: sortedFindingIds is set externally by FindingList, but store must not
  // corrupt the order. This verifies setSortedFindingIds preserves exact order.
  it('[P0] should maintain sortedFindingIds in severity order not Map insertion order', () => {
    // Insert findings in reverse severity order (minor first, critical last)
    const minor = buildFinding({ id: 'minor-1', severity: 'minor' })
    const major = buildFinding({ id: 'major-1', severity: 'major' })
    const critical = buildFinding({ id: 'critical-1', severity: 'critical' })

    useReviewStore.getState().setFinding('minor-1', minor)
    useReviewStore.getState().setFinding('major-1', major)
    useReviewStore.getState().setFinding('critical-1', critical)

    // Map insertion order is: minor → major → critical
    const mapKeys = [...useReviewStore.getState().findingsMap.keys()]
    expect(mapKeys).toEqual(['minor-1', 'major-1', 'critical-1'])

    // setSortedFindingIds (called by FindingList) sets severity order
    const severityOrder = ['critical-1', 'major-1', 'minor-1']
    useReviewStore.getState().setSortedFindingIds(severityOrder)

    // Store must preserve the severity order, not Map insertion order
    expect(useReviewStore.getState().sortedFindingIds).toEqual(severityOrder)
  })

  // TA-U15: When a Realtime INSERT adds a new finding, sortedFindingIds must be
  // recalculated by FindingList (store does not auto-update). This test verifies
  // that a stale sortedFindingIds does NOT include the new finding until explicit sync.
  it('[P2] should not auto-include new finding in sortedFindingIds until explicit setSortedFindingIds', () => {
    // Initial state: 2 findings with sorted order set
    const f1 = buildFinding({ id: 'existing-1', severity: 'critical' })
    const f2 = buildFinding({ id: 'existing-2', severity: 'major' })
    useReviewStore.getState().setFinding('existing-1', f1)
    useReviewStore.getState().setFinding('existing-2', f2)
    useReviewStore.getState().setSortedFindingIds(['existing-1', 'existing-2'])

    // Simulate Realtime INSERT adding a new finding via setFindings (batch)
    const newMap = new Map(useReviewStore.getState().findingsMap)
    const f3 = buildFinding({ id: 'new-realtime', severity: 'critical' })
    newMap.set('new-realtime', f3)
    useReviewStore.getState().setFindings(newMap)

    // findingsMap has 3 entries, but sortedFindingIds is stale (2 entries)
    expect(useReviewStore.getState().findingsMap.size).toBe(3)
    expect(useReviewStore.getState().sortedFindingIds).toEqual(['existing-1', 'existing-2'])

    // After FindingList re-renders and calls setSortedFindingIds with new order
    useReviewStore.getState().setSortedFindingIds(['new-realtime', 'existing-1', 'existing-2'])
    expect(useReviewStore.getState().sortedFindingIds).toEqual([
      'new-realtime',
      'existing-1',
      'existing-2',
    ])
  })

  // Additional: selectRange uses sortedFindingIds
  it('[P1] should selectRange based on sortedFindingIds order', () => {
    const ids = ['c1', 'm1', 'm2', 'n1']
    for (const id of ids) {
      useReviewStore.getState().setFinding(id, buildFinding({ id }))
    }
    useReviewStore.getState().setSortedFindingIds(ids)
    useReviewStore.getState().setSelectionMode('bulk')

    useReviewStore.getState().selectRange('m1', 'n1')

    const selected = useReviewStore.getState().selectedIds
    expect(selected.has('m1')).toBe(true)
    expect(selected.has('m2')).toBe(true)
    expect(selected.has('n1')).toBe(true)
    expect(selected.has('c1')).toBe(false)
  })
})
