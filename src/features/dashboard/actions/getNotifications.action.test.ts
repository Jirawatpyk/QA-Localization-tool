vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}))

const mockLimit = vi.fn().mockResolvedValue([])
const mockOrderBy = vi.fn((..._args: unknown[]) => ({ limit: mockLimit }))
const mockWhere = vi.fn((..._args: unknown[]) => ({ orderBy: mockOrderBy }))
const mockFrom = vi.fn((..._args: unknown[]) => ({ where: mockWhere }))
const mockSelect = vi.fn((..._args: unknown[]) => ({ from: mockFrom }))

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    id: 'id',
    userId: 'user_id',
    tenantId: 'tenant_id',
    type: 'type',
    title: 'title',
    body: 'body',
    isRead: 'is_read',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
}))

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

import { getNotifications } from './getNotifications.action'

const MOCK_USER = {
  id: 'usr-1',
  email: 'test@test.com',
  tenantId: 'ten-1',
  role: 'qa_reviewer' as const,
  displayName: 'Test',
  metadata: null,
}

describe('getNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockResolvedValue([])
  })

  it('should return UNAUTHORIZED when user not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const result = await getNotifications()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  it('should return empty array when no notifications exist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_USER)
    mockLimit.mockResolvedValue([])

    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('should return mapped notifications with ISO dates', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_USER)
    const now = new Date('2026-02-20T10:00:00Z')
    mockLimit.mockResolvedValue([
      {
        id: 'notif-1',
        tenantId: 'ten-1',
        userId: 'usr-1',
        type: 'pipeline_complete',
        title: 'Pipeline Done',
        body: 'File processed',
        isRead: false,
        metadata: { fileId: 'f-1' },
        createdAt: now,
      },
    ])

    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual({
        id: 'notif-1',
        tenantId: 'ten-1',
        userId: 'usr-1',
        type: 'pipeline_complete',
        title: 'Pipeline Done',
        body: 'File processed',
        isRead: false,
        metadata: { fileId: 'f-1' },
        createdAt: '2026-02-20T10:00:00.000Z',
      })
    }
  })

  it('should handle null metadata gracefully', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_USER)
    mockLimit.mockResolvedValue([
      {
        id: 'notif-2',
        tenantId: 'ten-1',
        userId: 'usr-1',
        type: 'info',
        title: 'Info',
        body: 'Some info',
        isRead: true,
        metadata: null,
        createdAt: new Date('2026-02-19T12:00:00Z'),
      },
    ])

    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]?.metadata).toBeNull()
    }
  })

  it('should query with user and tenant filters', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_USER)

    await getNotifications()

    expect(mockSelect).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalled()
    expect(mockWhere).toHaveBeenCalled()
    expect(mockLimit).toHaveBeenCalledWith(50)
  })
})
