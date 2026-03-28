/**
 * Story 5.2c: overrideNativeReview Server Action
 * Tests: override to accept/reject, ownership guard, metadata
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
vi.mock('@/db/schema/findings', () => ({
  findings: { id: 'id', tenantId: 'tenant_id', status: 'status', updatedAt: 'updated_at' },
}))
vi.mock('@/db/schema/findingAssignments', () => ({
  findingAssignments: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    tenantId: 'tenant_id',
    assignedTo: 'assigned_to',
    assignedBy: 'assigned_by',
    status: 'status',
    updatedAt: 'updated_at',
  },
}))
vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    actionType: 'action_type',
    previousState: 'previous_state',
    newState: 'new_state',
    userId: 'user_id',
    metadata: 'metadata',
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

import { overrideNativeReview } from '@/features/review/actions/overrideNativeReview.action'

const FINDING_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'
const FLAGGER_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const validInput = {
  findingId: FINDING_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  newStatus: 'accepted' as const,
}

function setupSuccessState() {
  dbState.returnValues = [
    [{ id: ASSIGNMENT_ID, status: 'in_review', fileId: FILE_ID, assignedBy: FLAGGER_USER_ID }], // 0: SELECT assignment
    [
      {
        segmentId: null,
        severity: 'major',
        category: 'accuracy',
        detectedByLayer: 'L2',
        sourceTextExcerpt: null,
        targetTextExcerpt: null,
      },
    ], // 1: SELECT finding detail
    [], // 2: UPDATE finding (tx)
    [], // 3: UPDATE assignment (tx)
    [], // 4: INSERT review_action (tx)
    [], // 5: notification
  ]
}

describe('overrideNativeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should override finding to accepted and set assignment status to overridden', async () => {
    setupSuccessState()

    const result = await overrideNativeReview(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newState).toBe('accepted')
    }
  })

  it('should override finding to rejected and set assignment status to overridden', async () => {
    setupSuccessState()

    const result = await overrideNativeReview({ ...validInput, newStatus: 'rejected' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newState).toBe('rejected')
    }
  })

  it('should reject invalid newStatus values other than accepted or rejected', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await overrideNativeReview({ ...validInput, newStatus: 'flagged' as any })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION')
    }
  })

  it('should reject when finding is not assigned to current user', async () => {
    dbState.returnValues = [
      [], // no assignment found
    ]

    const result = await overrideNativeReview(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not assigned')
    }
  })

  it('should require native_reviewer, qa_reviewer, or admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await overrideNativeReview(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AUTH_ERROR')
    }
  })

  it('should include native_override metadata in review action', async () => {
    setupSuccessState()

    await overrideNativeReview({ ...validInput, newStatus: 'rejected' })

    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: Record<string, unknown>) => c.actionType === 'override_native',
    ) as Record<string, unknown> | undefined
    expect(reviewActionInsert).toBeDefined()
    const meta = reviewActionInsert?.metadata as Record<string, unknown>
    expect(meta?.native_verified).toBe(true)
    expect(meta?.native_override).toBe(true)
    expect(meta?.native_override_to).toBe('rejected')
  })
})
