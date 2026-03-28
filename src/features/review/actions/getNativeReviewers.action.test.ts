/**
 * Story 5.2c: getNativeReviewers Server Action
 * Tests: list native reviewers by language, empty result, tenant isolation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

const { dbState, dbMockModule, mockRequireRole } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { dbState, dbMockModule } = (createDrizzleMock as any)()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
        role: 'qa_reviewer' as const,
        nativeLanguages: [] as string[],
      }),
    ),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/db/schema/users', () => ({
  users: {
    id: 'id',
    tenantId: 'tenant_id',
    displayName: 'display_name',
    nativeLanguages: 'native_languages',
  },
}))
vi.mock('@/db/schema/userRoles', () => ({
  userRoles: { userId: 'user_id', role: 'role' },
}))

import { getNativeReviewers } from '@/features/review/actions/getNativeReviewers.action'

describe('getNativeReviewers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should return users with native_reviewer role', async () => {
    dbState.returnValues = [
      [
        { id: 'u1', displayName: 'Native A', nativeLanguages: ['th'] },
        { id: 'u2', displayName: 'Native B', nativeLanguages: ['th', 'ja'] },
      ],
    ]

    const result = await getNativeReviewers()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0]).toEqual(expect.objectContaining({ id: 'u1', displayName: 'Native A' }))
    }
  })

  it('should return empty array when no matching reviewers exist', async () => {
    dbState.returnValues = [[]]

    const result = await getNativeReviewers()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('should enforce tenant isolation via withTenant', async () => {
    const { withTenant } = await import('@/db/helpers/withTenant')
    dbState.returnValues = [[]]

    await getNativeReviewers()

    expect(withTenant).toHaveBeenCalled()
  })

  it('should require qa_reviewer or admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await getNativeReviewers()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AUTH_ERROR')
    }
  })
})
