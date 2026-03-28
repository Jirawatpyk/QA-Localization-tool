/**
 * Story 5.2c: addFindingComment Server Action
 * Tests: insert comment, ownership validation, boundary, audit, notification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { dbState, dbMockModule } = (createDrizzleMock as any)()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: '44444444-4444-4444-8444-444444444444',
        tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
        role: 'native_reviewer' as string,
        nativeLanguages: ['th'] as string[],
      }),
    ),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/db/schema/findingAssignments', () => ({
  findingAssignments: {
    id: 'id',
    findingId: 'finding_id',
    tenantId: 'tenant_id',
    assignedTo: 'assigned_to',
    assignedBy: 'assigned_by',
  },
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
vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    type: 'type',
    title: 'title',
    body: 'body',
    metadata: 'metadata',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { addFindingComment } from '@/features/review/actions/addFindingComment.action'

const TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const NATIVE_USER_ID = '44444444-4444-4444-8444-444444444444'
const FLAGGER_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const FINDING_ID = '11111111-1111-4111-8111-111111111111'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'

const validInput = {
  findingId: FINDING_ID,
  findingAssignmentId: ASSIGNMENT_ID,
  body: 'This looks correct to me',
}

describe('addFindingComment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should insert comment and return commentId and createdAt', async () => {
    const createdAt = new Date()
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, assignedTo: NATIVE_USER_ID, assignedBy: FLAGGER_USER_ID }], // 0: assignment
      [{ id: 'new-comment-id', createdAt }], // 1: INSERT .returning()
      [], // 2: notification
    ]

    const result = await addFindingComment(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.commentId).toBe('new-comment-id')
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'finding_comment', action: 'comment_created' }),
    )
  })

  it('should reject when user is not assigned_to, assigned_by, or admin', async () => {
    mockRequireRole.mockResolvedValueOnce({
      id: 'other-user-id',
      tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
      role: 'native_reviewer' as const,
      nativeLanguages: ['th'],
    })
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, assignedTo: NATIVE_USER_ID, assignedBy: FLAGGER_USER_ID }],
    ]

    const result = await addFindingComment(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Not authorized')
    }
  })

  it('should validate comment body boundary: reject empty, reject 1001', async () => {
    const emptyResult = await addFindingComment({ ...validInput, body: '' })
    expect(emptyResult.success).toBe(false)

    const longResult = await addFindingComment({ ...validInput, body: 'a'.repeat(1001) })
    expect(longResult.success).toBe(false)
  })

  it('should enforce tenant isolation via withTenant', async () => {
    const { withTenant } = await import('@/db/helpers/withTenant')
    const createdAt = new Date()
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, assignedTo: NATIVE_USER_ID, assignedBy: FLAGGER_USER_ID }],
      [{ id: 'cid', createdAt }],
      [],
    ]

    await addFindingComment(validInput)

    expect(withTenant).toHaveBeenCalled()
  })

  it('should write audit log for comment_created', async () => {
    const createdAt = new Date()
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, assignedTo: NATIVE_USER_ID, assignedBy: FLAGGER_USER_ID }],
      [{ id: 'cid', createdAt }],
      [],
    ]

    await addFindingComment(validInput)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'finding_comment', action: 'comment_created' }),
    )
  })

  it('should create notification to other party — non-blocking', async () => {
    const createdAt = new Date()
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, assignedTo: NATIVE_USER_ID, assignedBy: FLAGGER_USER_ID }],
      [{ id: 'cid', createdAt }],
    ]
    dbState.throwAtCallIndex = 2 // notification insert fails

    const result = await addFindingComment(validInput)

    expect(result.success).toBe(true)
  })

  // CR-M6: admin role bypasses ownership check
  it('should allow admin to comment regardless of assignment ownership', async () => {
    const adminUserId = '99999999-9999-4999-8999-999999999999'
    mockRequireRole.mockResolvedValueOnce({
      id: adminUserId,
      tenantId: asTenantId(TENANT_ID),
      role: 'admin',
      nativeLanguages: [],
    })
    const createdAt = new Date()
    dbState.returnValues = [
      // Assignment exists but admin is NOT assignedTo or assignedBy
      [{ id: ASSIGNMENT_ID, assignedTo: NATIVE_USER_ID, assignedBy: FLAGGER_USER_ID }],
      [{ id: 'cid-admin', createdAt }],
    ]

    const result = await addFindingComment(validInput)

    expect(result.success).toBe(true)
  })
})
