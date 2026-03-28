/**
 * Story 5.2c: confirmNativeReview Server Action
 * Tests: confirm flow, re_accepted logic, ownership guard, audit
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

import { confirmNativeReview } from '@/features/review/actions/confirmNativeReview.action'

const FINDING_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ASSIGNMENT_ID = '55555555-5555-4555-8555-555555555555'
const FLAGGER_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const QA_USER_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'

const validInput = { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID }

function setupSuccessState(preFlaggedState = 'pending') {
  dbState.returnValues = [
    [{ id: ASSIGNMENT_ID, status: 'pending', fileId: FILE_ID, assignedBy: FLAGGER_USER_ID }], // 0: SELECT assignment
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
    [{ previousState: preFlaggedState }], // 2: SELECT flag_for_native review_action
    [], // 3: UPDATE finding (tx)
    [], // 4: UPDATE assignment (tx)
    [], // 5: INSERT review_action (tx)
    [], // 6: notification
  ]
}

describe('confirmNativeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  it('should confirm finding and update assignment status to confirmed', async () => {
    setupSuccessState('pending')

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newState).toBe('accepted')
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'finding_assignment', action: 'assignment_confirmed' }),
    )
  })

  it('should set finding status to re_accepted when pre-flagged state was rejected', async () => {
    setupSuccessState('rejected')

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newState).toBe('re_accepted')
    }
  })

  it('should set finding status to accepted when pre-flagged state was NOT rejected', async () => {
    setupSuccessState('accepted')

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newState).toBe('accepted')
    }
  })

  it('should add native_verified metadata without clearing non_native flag', async () => {
    setupSuccessState('pending')

    await confirmNativeReview(validInput)

    // The review_action INSERT should have native_verified metadata
    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: Record<string, unknown>) => c.actionType === 'confirm_native',
    ) as Record<string, unknown> | undefined
    expect(reviewActionInsert).toBeDefined()
    const meta = reviewActionInsert?.metadata as Record<string, unknown>
    expect(meta?.native_verified).toBe(true)
    // CR-L4: assert native_verified_by and native_verified_at metadata
    expect(meta?.native_verified_by).toBe('44444444-4444-4444-8444-444444444444')
    expect(meta?.native_verified_at).toBeDefined()
    expect(typeof meta?.native_verified_at).toBe('string')
  })

  it('should reject when finding is not assigned to current user', async () => {
    dbState.returnValues = [
      [], // no assignment found (query filtered by assignedTo = userId)
    ]

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not assigned')
    }
  })

  it('should reject when assignment status is already confirmed', async () => {
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, status: 'confirmed', fileId: FILE_ID, assignedBy: FLAGGER_USER_ID }],
    ]

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('already completed')
    }
  })

  it('should require native_reviewer, qa_reviewer, or admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AUTH_ERROR')
    }
  })

  it('should write audit log with entityType finding_assignment', async () => {
    setupSuccessState('pending')

    await confirmNativeReview(validInput)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding_assignment',
        action: 'assignment_confirmed',
      }),
    )
  })

  // CR-H9: in_review assignment path
  it('should succeed when assignment status is in_review', async () => {
    setupSuccessState('in_review')

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(true)
  })

  // CR-M3: flagActionRows empty → default to accepted (not re_accepted)
  it('should default to accepted when no flag_for_native review_action found', async () => {
    dbState.returnValues = [
      [{ id: ASSIGNMENT_ID, status: 'pending', fileId: FILE_ID, assignedBy: QA_USER_ID }], // 0
      [
        {
          segmentId: null,
          severity: 'major',
          category: 'Accuracy',
          detectedByLayer: 'L2',
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
        },
      ], // 1
      [], // 2: flag action query — empty (no flag_for_native found)
      [], // 3: UPDATE finding (tx)
      [], // 4: UPDATE assignment (tx)
      [], // 5: INSERT review_action (tx)
    ]

    const result = await confirmNativeReview(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newState).toBe('accepted')
    }
  })
})
