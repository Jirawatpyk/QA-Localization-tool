/**
 * Story 5.2c: getFindingComments Server Action
 * Tests: load comments with author details, empty result, tenant isolation
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
        id: '44444444-4444-4444-8444-444444444444',
        tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
        role: 'native_reviewer' as const,
        nativeLanguages: ['th'],
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
  asc: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => 'sql-expr'),
}))
vi.mock('@/db/schema/findingComments', () => ({
  findingComments: {
    id: 'id',
    findingId: 'finding_id',
    findingAssignmentId: 'finding_assignment_id',
    tenantId: 'tenant_id',
    authorId: 'author_id',
    body: 'body',
    createdAt: 'created_at',
  },
}))
vi.mock('@/db/schema/users', () => ({
  users: { id: 'id', displayName: 'display_name' },
}))
vi.mock('@/db/schema/userRoles', () => ({
  userRoles: { userId: 'user_id', role: 'role', tenantId: 'tenant_id' },
}))

import { getFindingComments } from '@/features/review/actions/getFindingComments.action'

const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'

describe('getFindingComments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should return comments ordered by createdAt ASC with author details', async () => {
    dbState.returnValues = [
      [
        {
          id: 'c1',
          authorId: 'u1',
          authorName: 'Reviewer A',
          authorRole: 'qa_reviewer',
          body: 'Needs review',
          createdAt: new Date('2026-03-28T10:00:00Z'),
        },
        {
          id: 'c2',
          authorId: 'u2',
          authorName: 'Native B',
          authorRole: 'native_reviewer',
          body: 'Looks correct',
          createdAt: new Date('2026-03-28T10:05:00Z'),
        },
      ],
    ]

    const result = await getFindingComments(ASSIGNMENT_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0]!.authorName).toBe('Reviewer A')
      expect(result.data[1]!.body).toBe('Looks correct')
    }
  })

  it('should return empty array when no comments exist', async () => {
    dbState.returnValues = [[]]

    const result = await getFindingComments(ASSIGNMENT_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('should enforce tenant isolation via withTenant', async () => {
    const { withTenant } = await import('@/db/helpers/withTenant')
    dbState.returnValues = [[]]

    await getFindingComments(ASSIGNMENT_ID)

    expect(withTenant).toHaveBeenCalled()
  })

  it('should require native_reviewer, qa_reviewer, or admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await getFindingComments(ASSIGNMENT_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AUTH_ERROR')
    }
  })
})
