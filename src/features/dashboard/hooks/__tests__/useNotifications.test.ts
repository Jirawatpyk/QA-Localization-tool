// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// Tests unskipped after implementing useNotifications hook.

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useNotifications } from '@/features/dashboard/hooks/useNotifications'
import type { AppNotification } from '@/features/dashboard/types'

// Mock Supabase Realtime client
const mockChannel = {
  on: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)
mockChannel.subscribe.mockReturnValue(mockChannel)

const mockSupabaseClient = {
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: vi.fn(() => mockSupabaseClient),
}))

const mockGetNotifications = vi.fn()
vi.mock('@/features/dashboard/actions/getNotifications.action', () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
}))

const mockMarkNotificationRead = vi.fn()
vi.mock('@/features/dashboard/actions/markNotificationRead.action', () => ({
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}))

// Must import AFTER vi.mock declarations

describe('useNotifications hook', () => {
  const mockUserId = 'usr-test-001'
  const mockNotification: AppNotification = {
    id: 'notif-001',
    tenantId: 'ten-a-001',
    userId: mockUserId,
    type: 'glossary_updated',
    title: 'Glossary Updated',
    body: '3 terms added to Project Alpha glossary',
    isRead: false,
    metadata: null,
    createdAt: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    mockSupabaseClient.channel.mockReturnValue(mockChannel)
    mockGetNotifications.mockResolvedValue({ success: true, data: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[P1] should subscribe to Supabase Realtime channel on mount', () => {
    renderHook(() => useNotifications(mockUserId))

    expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
      expect.stringContaining('notifications'),
    )
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: expect.stringContaining(mockUserId),
      }),
      expect.any(Function),
    )
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('[P2] should unsubscribe from Realtime channel on unmount (no memory leak)', () => {
    const { unmount } = renderHook(() => useNotifications(mockUserId))
    unmount()

    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel)
  })

  it('[P1] should add new notification to state when Realtime INSERT event fires', async () => {
    const { result } = renderHook(() => useNotifications(mockUserId))

    // Get the realtime callback registered by .on()
    const realtimeCallback = mockChannel.on.mock.calls[0]?.[2] as
      | ((payload: { new: AppNotification }) => void)
      | undefined

    expect(realtimeCallback).toBeDefined()

    // Simulate INSERT event
    act(() => {
      realtimeCallback?.({ new: mockNotification })
    })

    expect(result.current.notifications).toContainEqual(
      expect.objectContaining({ id: 'notif-001', isRead: false }),
    )
    expect(result.current.unreadCount).toBeGreaterThan(0)
  })

  it('[P1] should mark notification as read and update state when markAsRead called', async () => {
    // Initial fetch returns one notification
    mockGetNotifications.mockResolvedValue({ success: true, data: [mockNotification] })
    mockMarkNotificationRead.mockResolvedValue({ success: true, data: undefined })

    const { result } = renderHook(() => useNotifications(mockUserId))

    // Wait for initial async fetch to populate state
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1)
    })

    expect(result.current.unreadCount).toBe(1)

    await act(async () => {
      await result.current.markAsRead('notif-001')
    })

    const updatedNotification = result.current.notifications.find(
      (n: AppNotification) => n.id === 'notif-001',
    )
    expect(updatedNotification?.isRead).toBe(true)
    expect(result.current.unreadCount).toBe(0)
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-001')
  })
})
