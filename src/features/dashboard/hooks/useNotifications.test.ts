/**
 * TDD RED PHASE — Story 4.0: Review Infrastructure Setup
 * TD-UX-003 Regression: useNotifications Realtime payload validation
 */
vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client
const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => mockSupabase,
}))

// Mock server actions
vi.mock('@/features/dashboard/actions/getNotifications.action', () => ({
  getNotifications: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: [] })),
}))

vi.mock('@/features/dashboard/actions/markNotificationRead.action', () => ({
  markNotificationRead: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true })),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}))

import { useNotifications } from '@/features/dashboard/hooks/useNotifications'

describe('useNotifications — TD-UX-003', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
  })

  it('[P1] TD6: should validate Realtime payload with Zod and skip invalid', () => {
    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    // Find the INSERT handler registered on the channel
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    expect(insertCall).toBeTruthy()

    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    act(() => {
      // Send an invalid payload (id is number, missing title/body/etc.)
      onInsertHandler({
        new: { id: 123, tenant_id: 'tenant-1' },
      })
    })

    // Notifications should remain empty — invalid payload silently rejected by Zod
    expect(result.current.notifications).toHaveLength(0)
  })

  it('[P2] should skip notification from different tenant (defense-in-depth)', () => {
    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    act(() => {
      onInsertHandler({
        new: {
          id: 'n-1',
          tenant_id: 'tenant-other',
          user_id: 'user-1',
          type: 'file_assigned',
          title: 'Cross-tenant',
          body: 'Should be blocked',
          is_read: false,
          metadata: null,
          created_at: '2026-03-28T00:00:00Z',
        },
      })
    })

    expect(result.current.notifications).toHaveLength(0)
  })

  it('[P2] should mark single notification as read (markAsRead success branch)', async () => {
    const { markNotificationRead } =
      await import('@/features/dashboard/actions/markNotificationRead.action')
    const mockMark = vi.mocked(markNotificationRead)

    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    // Wait for initial fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Inject a notification via setNotifications (direct state setter)
    act(() => {
      result.current.setNotifications([
        {
          id: 'n-2',
          tenantId: 'tenant-1',
          userId: 'user-1',
          type: 'file_assigned',
          title: 'Test',
          body: 'Body',
          isRead: false,
          metadata: null,
          createdAt: '2026-03-28T00:00:00Z',
        },
      ])
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)

    mockMark.mockResolvedValueOnce({ success: true, data: undefined })

    await act(async () => {
      await result.current.markAsRead('n-2')
    })

    expect(result.current.notifications[0]!.isRead).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('[P2] should toast error when markAsRead fails', async () => {
    const { toast } = await import('sonner')
    const { markNotificationRead } =
      await import('@/features/dashboard/actions/markNotificationRead.action')
    const mockMark = vi.mocked(markNotificationRead)
    mockMark.mockResolvedValueOnce({
      success: false,
      error: 'Not found',
      code: 'NOT_FOUND',
    } as never)

    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    await act(async () => {
      await result.current.markAsRead('n-missing')
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to mark notification as read')
  })

  it('[P2] should mark all notifications as read', async () => {
    const { markNotificationRead } =
      await import('@/features/dashboard/actions/markNotificationRead.action')
    const mockMark = vi.mocked(markNotificationRead)

    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    // Wait for initial fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Inject notification via setNotifications
    act(() => {
      result.current.setNotifications([
        {
          id: 'n-3',
          tenantId: 'tenant-1',
          userId: 'user-1',
          type: 'file_assigned',
          title: 'Test',
          body: 'Body',
          isRead: false,
          metadata: null,
          createdAt: '2026-03-28T00:00:00Z',
        },
      ])
    })

    mockMark.mockResolvedValueOnce({ success: true, data: undefined })

    await act(async () => {
      await result.current.markAllAsRead()
    })

    expect(mockMark).toHaveBeenCalledWith('all')
    expect(result.current.notifications[0]!.isRead).toBe(true)
  })

  it('[P2] should toast error when markAllAsRead fails', async () => {
    const { toast } = await import('sonner')
    const { markNotificationRead } =
      await import('@/features/dashboard/actions/markNotificationRead.action')
    const mockMark = vi.mocked(markNotificationRead)
    mockMark.mockResolvedValueOnce({
      success: false,
      error: 'Server error',
      code: 'INTERNAL',
    } as never)

    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    await act(async () => {
      await result.current.markAllAsRead()
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to mark notifications as read')
  })

  // ── AC7: visibilitychange re-fetch ──

  it('[P1] should re-fetch notifications when tab becomes visible', async () => {
    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const mockGet = vi.mocked(getNotifications)
    // Initial fetch returns empty
    mockGet.mockResolvedValueOnce({ success: true, data: [] })

    const { result } = renderHook(() => useNotifications('user-1', 'tenant-1'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.notifications).toHaveLength(0)

    // Simulate tab becoming visible with fresh data
    mockGet.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'n-fresh',
          tenantId: 'tenant-1',
          userId: 'user-1',
          type: 'file_assigned',
          title: 'Fresh',
          body: 'From other tab',
          isRead: true,
          metadata: null,
          createdAt: '2026-04-01T00:00:00Z',
        },
      ],
    })

    // Fire visibilitychange with document.visibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0]!.id).toBe('n-fresh')
  })

  it('[P2] should NOT re-fetch when tab becomes hidden', async () => {
    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const mockGet = vi.mocked(getNotifications)
    mockGet.mockResolvedValueOnce({ success: true, data: [] })

    renderHook(() => useNotifications('user-1', 'tenant-1'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    const callCountAfterInit = mockGet.mock.calls.length

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise((r) => setTimeout(r, 0))
    })

    // No additional calls — only fires on 'visible'
    expect(mockGet.mock.calls.length).toBe(callCountAfterInit)
  })

  it('[P2] should toast error when initial fetch fails', async () => {
    const { toast } = await import('sonner')
    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const mockGet = vi.mocked(getNotifications)
    mockGet.mockResolvedValueOnce({ success: false, error: 'Auth error', code: 'UNAUTHORIZED' })

    renderHook(() => useNotifications('user-1', 'tenant-1'))

    // Wait for the async fetchInitial to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to load notifications')
  })
})
