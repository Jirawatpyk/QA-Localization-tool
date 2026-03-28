/**
 * Story 5.2c: startNativeReview Server Action
 * Tests: pending→in_review, idempotent, role guard, audit
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
        role: 'native_reviewer' as const,
        nativeLanguages: ['th'],
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
    status: 'status',
    updatedAt: 'updated_at',
  },
}))

import { startNativeReview } from '@/features/review/actions/startNativeReview.action'

const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'

describe('startNativeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should transition assignment status from pending to in_review', async () => {
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, status: 'pending' }], // SELECT
      [], // UPDATE
    ]

    const result = await startNativeReview(ASSIGNMENT_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newStatus).toBe('in_review')
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'assignment_started' }),
    )
  })

  it('should be idempotent when assignment is already in_review', async () => {
    dbState.returnValues = [[{ id: ASSIGNMENT_ID, status: 'in_review' }]]

    const result = await startNativeReview(ASSIGNMENT_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newStatus).toBe('in_review')
    }
    // No audit log written for idempotent case
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('should require native_reviewer role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await startNativeReview(ASSIGNMENT_ID)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AUTH_ERROR')
    }
  })

  it('should write audit log with action assignment_started', async () => {
    dbState.returnValues = [[{ id: ASSIGNMENT_ID, status: 'pending' }], []]

    await startNativeReview(ASSIGNMENT_ID)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding_assignment',
        action: 'assignment_started',
        oldValue: expect.objectContaining({ status: 'pending' }),
        newValue: expect.objectContaining({ status: 'in_review' }),
      }),
    )
  })
})
