/**
 * TDD RED PHASE — Story 4.0: Review Infrastructure Setup
 * TD-UX-003 Regression: useNotifications Realtime payload validation
 */
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
})
