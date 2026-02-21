vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}))

const mockSet = vi.fn().mockReturnThis()
const mockWhere = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn((..._args: unknown[]) => ({ set: mockSet }))
mockSet.mockReturnValue({ where: mockWhere })

vi.mock('@/db/client', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    id: 'id',
    userId: 'user_id',
    tenantId: 'tenant_id',
    isRead: 'is_read',
  },
}))

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

import { markNotificationRead } from './markNotificationRead.action'

describe('markNotificationRead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return UNAUTHORIZED when user not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const result = await markNotificationRead('550e8400-e29b-41d4-a716-446655440001')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  it('should return VALIDATION_ERROR for invalid notification ID', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    const result = await markNotificationRead('not-a-uuid')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should mark single notification as read', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    const result = await markNotificationRead('550e8400-e29b-41d4-a716-446655440001')

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ isRead: true })
  })

  it('should mark all notifications as read', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    const result = await markNotificationRead('all')

    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ isRead: true })
  })

  it('should use nil UUID for audit log entityId when marking all as read', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    await markNotificationRead('all')

    const NIL_UUID = '00000000-0000-0000-0000-000000000000'
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: NIL_UUID,
        action: 'notification.read_all',
      }),
    )
  })

  it('should use actual notificationId for audit log when marking single as read', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-1',
      email: 'test@test.com',
      tenantId: 'ten-1',
      role: 'qa_reviewer',
      displayName: 'Test',
      metadata: null,
    })

    await markNotificationRead('a1b2c3d4-e5f6-4789-abcd-ef0123456789')

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789',
        action: 'notification.read',
      }),
    )
  })
})
