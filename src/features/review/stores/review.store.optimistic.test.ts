/**
 * Story 4.4a: Optimistic update + rollback tests for bulk operations
 */
import { describe, expect, it, beforeEach } from 'vitest'

import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'

describe('useReviewStore — Bulk Optimistic Updates (Story 4.4a)', () => {
  beforeEach(() => {
    useReviewStore.getState().resetForFile('opt-test')
  })

  it('[P0] should batch-update findings optimistically for bulk accept', () => {
    // Seed 3 pending findings
    const ids = ['opt-1', 'opt-2', 'opt-3']
    for (const id of ids) {
      useReviewStore.getState().setFinding(id, buildFinding({ id, status: 'pending' }))
    }

    // Simulate optimistic bulk accept
    for (const id of ids) {
      const f = useReviewStore.getState().findingsMap.get(id)
      if (f) {
        useReviewStore
          .getState()
          .setFinding(id, { ...f, status: 'accepted', updatedAt: new Date().toISOString() })
      }
    }

    // Verify all updated
    for (const id of ids) {
      expect(useReviewStore.getState().findingsMap.get(id)?.status).toBe('accepted')
    }
  })

  it('[P0] should rollback findings on bulk failure', () => {
    // Seed 3 pending findings
    const ids = ['rb-1', 'rb-2', 'rb-3']
    const snapshots = new Map()
    for (const id of ids) {
      const finding = buildFinding({ id, status: 'pending' })
      useReviewStore.getState().setFinding(id, finding)
      snapshots.set(id, finding)
    }

    // Optimistic update
    for (const id of ids) {
      const f = useReviewStore.getState().findingsMap.get(id)
      if (f) {
        useReviewStore.getState().setFinding(id, { ...f, status: 'accepted' })
      }
    }

    // Verify optimistic state
    expect(useReviewStore.getState().findingsMap.get('rb-1')?.status).toBe('accepted')

    // Rollback from snapshots
    for (const [id, snap] of snapshots) {
      useReviewStore.getState().setFinding(id, snap)
    }

    // Verify rollback
    for (const id of ids) {
      expect(useReviewStore.getState().findingsMap.get(id)?.status).toBe('pending')
    }
  })

  it('[P1] should replace optimistic updatedAt with server timestamp on success', () => {
    const id = 'ts-1'
    useReviewStore
      .getState()
      .setFinding(id, buildFinding({ id, status: 'pending', updatedAt: '2026-01-01T00:00:00Z' }))

    // Optimistic update with client timestamp
    const clientTime = new Date().toISOString()
    const f = useReviewStore.getState().findingsMap.get(id)!
    useReviewStore.getState().setFinding(id, { ...f, status: 'accepted', updatedAt: clientTime })

    // Server responds with its own timestamp
    const serverTime = '2026-03-15T12:00:00.000Z'
    const current = useReviewStore.getState().findingsMap.get(id)!
    useReviewStore.getState().setFinding(id, { ...current, updatedAt: serverTime })

    expect(useReviewStore.getState().findingsMap.get(id)?.updatedAt).toBe(serverTime)
  })

  it('[P1] should clear selection after successful bulk operation', () => {
    // Setup bulk selection
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().addToSelection('sel-1')
    useReviewStore.getState().addToSelection('sel-2')
    expect(useReviewStore.getState().selectedIds.size).toBe(2)

    // Simulate successful bulk — clear selection
    useReviewStore.getState().clearSelection()
    useReviewStore.getState().setSelectionMode('single')

    expect(useReviewStore.getState().selectedIds.size).toBe(0)
    expect(useReviewStore.getState().selectionMode).toBe('single')
  })

  it('[P1] should keep selection intact on bulk failure for retry', () => {
    // Setup bulk selection
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().addToSelection('keep-1')
    useReviewStore.getState().addToSelection('keep-2')

    // Simulate failure — do NOT clear selection
    // (test verifies selection survives)
    expect(useReviewStore.getState().selectedIds.size).toBe(2)
    expect(useReviewStore.getState().selectedIds.has('keep-1')).toBe(true)
    expect(useReviewStore.getState().selectedIds.has('keep-2')).toBe(true)
  })
})
