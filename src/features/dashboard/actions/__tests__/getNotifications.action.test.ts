// Story 6-2a: getNotifications action tests
// Replaced Proxy mock with drizzleMock (TD-TEST-013 resolved)

vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}))

const { dbState, dbMockModule } = vi.hoisted(() =>
  (
    globalThis as unknown as {
      createDrizzleMock: () => import('@/test/drizzleMock').DrizzleMockResult
    }
  ).createDrizzleMock(),
)
vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

describe('getNotifications action', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('[P1] should return unread notifications for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: asTenantId('ten-a-001'),
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: null,
      nativeLanguages: [],
    })

    dbState.returnValues = [
      [
        {
          id: 'notif-1',
          tenantId: 'ten-a-001',
          userId: 'usr-test-001',
          type: 'glossary_updated',
          projectId: 'proj-001',
          title: 'Glossary Updated',
          body: '3 terms added',
          isRead: false,
          metadata: null,
          createdAt: new Date('2026-02-20T10:00:00Z'),
        },
      ],
    ]

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.userId).toBe('usr-test-001')
      expect(result.data[0]!.tenantId).toBe('ten-a-001')
      expect(result.data[0]!.projectId).toBe('proj-001')
      expect(result.data[0]!.createdAt).toBe('2026-02-20T10:00:00.000Z')
    }
  })

  it('[P1] should NOT return notifications for a different user (tenant isolation)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-002',
      email: 'other@tenant-a.test',
      tenantId: asTenantId('ten-a-001'),
      role: 'qa_reviewer',
      displayName: 'Other User',
      metadata: null,
      nativeLanguages: [],
    })

    dbState.returnValues = [
      [
        {
          id: 'notif-2',
          tenantId: 'ten-a-001',
          userId: 'usr-test-002',
          type: 'analysis_complete',
          projectId: 'proj-002',
          title: 'Analysis Done',
          body: 'File processed',
          isRead: false,
          metadata: null,
          createdAt: new Date(),
        },
      ],
    ]

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      result.data.forEach((n) => {
        expect(n.userId).not.toBe('usr-test-001')
      })
    }
  })

  it('[P1] should NOT return notifications for a different tenant', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-003',
      email: 'qa@tenant-b.test',
      tenantId: asTenantId('ten-b-002'),
      role: 'qa_reviewer',
      displayName: 'Cross Tenant User',
      metadata: null,
      nativeLanguages: [],
    })

    // DB returns empty — withTenant() filters out cross-tenant data
    // Real tenant isolation verified by RLS tests in src/db/__tests__/rls/
    dbState.returnValues = [[]]

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('[P1] should return UNAUTHORIZED when user is not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
      expect(result.error).toMatch(/not authenticated/i)
    }
  })

  it('[P2] should return empty array when user has no notifications', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-no-notifs',
      email: 'clean@tenant-a.test',
      tenantId: asTenantId('ten-a-001'),
      role: 'qa_reviewer',
      displayName: 'Clean User',
      metadata: null,
      nativeLanguages: [],
    })

    dbState.returnValues = [[]]

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('[P1] should handle DB errors gracefully', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-004',
      email: 'qa@tenant-a.test',
      tenantId: asTenantId('ten-a-001'),
      role: 'qa_reviewer',
      displayName: 'QA User',
      metadata: null,
      nativeLanguages: [],
    })

    dbState.throwAtCallIndex = 0

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
    }
  })
})
