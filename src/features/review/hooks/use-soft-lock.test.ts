import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/features/project/actions/updateAssignmentStatus.action', () => ({
  updateAssignmentStatus: vi.fn().mockResolvedValue({ success: true, data: {} }),
}))

import { useSoftLock } from './use-soft-lock'

describe('useSoftLock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const baseAssignment = {
    id: 'a-1',
    fileId: 'f-1',
    projectId: 'p-1',
    assignedTo: 'user-other',
    assignedBy: 'user-admin',
    status: 'in_progress' as const,
    assigneeName: 'Other User',
  }

  it('should return unlocked when no assignment', () => {
    const { result } = renderHook(() => useSoftLock({ assignment: null, currentUserId: 'user-me' }))
    expect(result.current.lockState).toBe('unlocked')
    expect(result.current.isReadOnly).toBe(false)
  })

  it('should return unlocked for own assignment', () => {
    const { result } = renderHook(() =>
      useSoftLock({
        assignment: {
          ...baseAssignment,
          assignedTo: 'user-me',
          lastActiveAt: new Date().toISOString(),
        },
        currentUserId: 'user-me',
      }),
    )
    expect(result.current.lockState).toBe('unlocked')
    expect(result.current.isOwnAssignment).toBe(true)
    expect(result.current.isReadOnly).toBe(false)
  })

  it('should return locked when another user active within 2 minutes', () => {
    // 119 seconds ago — still within threshold
    const activeAt = new Date(Date.now() - 119_000).toISOString()
    const { result } = renderHook(() =>
      useSoftLock({
        assignment: { ...baseAssignment, lastActiveAt: activeAt },
        currentUserId: 'user-me',
      }),
    )
    expect(result.current.lockState).toBe('locked')
    expect(result.current.isStale).toBe(false)
    expect(result.current.isReadOnly).toBe(true)
  })

  it('should return locked at exactly 120 seconds (boundary)', () => {
    // Exactly at 2 minute threshold
    const activeAt = new Date(Date.now() - 120_000).toISOString()
    const { result } = renderHook(() =>
      useSoftLock({
        assignment: { ...baseAssignment, lastActiveAt: activeAt },
        currentUserId: 'user-me',
      }),
    )
    // At exactly 120_000ms, the check is > not >=, so this is NOT stale yet
    expect(result.current.lockState).toBe('locked')
    expect(result.current.isStale).toBe(false)
  })

  it('should return stale after 2 minutes (121 seconds)', () => {
    // 121 seconds ago — past threshold
    const activeAt = new Date(Date.now() - 121_000).toISOString()
    const { result } = renderHook(() =>
      useSoftLock({
        assignment: { ...baseAssignment, lastActiveAt: activeAt },
        currentUserId: 'user-me',
      }),
    )
    expect(result.current.lockState).toBe('stale')
    expect(result.current.isStale).toBe(true)
    expect(result.current.isReadOnly).toBe(false) // I-5: stale = not read-only (takeover offered)
  })

  it('should return stale when lastActiveAt is null on assigned status', () => {
    const { result } = renderHook(() =>
      useSoftLock({
        assignment: { ...baseAssignment, status: 'assigned' as const, lastActiveAt: null },
        currentUserId: 'user-me',
      }),
    )
    // I-6: null lastActiveAt on 'assigned' = nobody started work → stale
    expect(result.current.lockState).toBe('stale')
    expect(result.current.isStale).toBe(true)
  })

  it('should return unlocked for completed assignment by another user', () => {
    const { result } = renderHook(() =>
      useSoftLock({
        assignment: {
          ...baseAssignment,
          status: 'completed',
          lastActiveAt: new Date().toISOString(),
        },
        currentUserId: 'user-me',
      }),
    )
    expect(result.current.lockState).toBe('unlocked')
  })
})
