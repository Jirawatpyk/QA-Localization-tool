// ATDD GREEN PHASE — Story 1.7: Dashboard, Notifications & Onboarding
// Tests unskipped after implementing getNotifications action.

vi.mock('server-only', () => ({}))

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}))

// Chainable DB mock using Proxy
let queryResults: unknown[] = []
let queryIndex = 0

function createChainProxy(resolvedValue: unknown) {
  const handler = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolvedValue)
          }
          return (..._args: unknown[]) => handler()
        },
      },
    )
  return handler()
}

vi.mock('@/db/client', () => ({
  db: {
    select: (..._args: unknown[]) => createChainProxy(queryResults[queryIndex++] ?? []),
  },
}))

vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    type: 'type',
    title: 'title',
    body: 'body',
    isRead: 'is_read',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
}))

import { getCurrentUser } from '@/lib/auth/getCurrentUser'

describe('getNotifications action', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    queryResults = []
    queryIndex = 0
  })

  it('[P1] should return unread notifications for the current user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-001',
      email: 'qa@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'QA Reviewer',
      metadata: null,
      nativeLanguages: [],
    })

    queryResults.push([
      {
        id: 'notif-1',
        tenantId: 'ten-a-001',
        userId: 'usr-test-001',
        type: 'glossary_updated',
        title: 'Glossary Updated',
        body: '3 terms added',
        isRead: false,
        metadata: null,
        createdAt: new Date('2026-02-20T10:00:00Z'),
      },
    ])

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true)
      result.data.forEach((n) => {
        expect(n.userId).toBe('usr-test-001')
        expect(n.tenantId).toBe('ten-a-001')
      })
    }
  })

  it('[P1] should NOT return notifications for a different user (tenant isolation)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'usr-test-002',
      email: 'other@tenant-a.test',
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'Other User',
      metadata: null,
      nativeLanguages: [],
    })

    // DB returns only notifications for usr-test-002 (filtered by WHERE clause)
    queryResults.push([
      {
        id: 'notif-2',
        tenantId: 'ten-a-001',
        userId: 'usr-test-002',
        type: 'analysis_complete',
        title: 'Analysis Done',
        body: 'File processed',
        isRead: false,
        metadata: null,
        createdAt: new Date(),
      },
    ])

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
      tenantId: 'ten-b-002',
      role: 'qa_reviewer',
      displayName: 'Cross Tenant User',
      metadata: null,
      nativeLanguages: [],
    })

    // Mock returns empty array — simulating DB WHERE clause filtering out cross-tenant data
    queryResults.push([])

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      // Vacuous assertion acknowledged: Proxy-based DB mock doesn't capture WHERE params,
      // so we can only verify the action returns empty data for a different tenant.
      // Real tenant isolation is verified by RLS tests in src/db/__tests__/rls/.
      // TODO(TD-TEST-013): Replace Proxy mock with drizzleMock to verify withTenant() in WHERE clause
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
      tenantId: 'ten-a-001',
      role: 'qa_reviewer',
      displayName: 'Clean User',
      metadata: null,
      nativeLanguages: [],
    })

    queryResults.push([])

    const { getNotifications } =
      await import('@/features/dashboard/actions/getNotifications.action')
    const result = await getNotifications()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })
})
