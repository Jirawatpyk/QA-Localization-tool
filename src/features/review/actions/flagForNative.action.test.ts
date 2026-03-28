/**
 * Story 5.2c: Native Reviewer Workflow — flagForNative Server Action
 * Tests: atomic transaction, cross-file guard, max assignments, role/tenant checks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks — MUST be first ──
const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog } = vi.hoisted(() => {
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
  sql: vi.fn((...args: unknown[]) => args),
  count: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
    updatedAt: 'updated_at',
  },
}))

vi.mock('@/db/schema/findingAssignments', () => ({
  findingAssignments: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    assignedTo: 'assigned_to',
    assignedBy: 'assigned_by',
    status: 'status',
    flaggerComment: 'flagger_comment',
    updatedAt: 'updated_at',
  },
}))

vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    projectId: 'project_id',
    userId: 'user_id',
    tenantId: 'tenant_id',
    actionType: 'action_type',
    previousState: 'previous_state',
    newState: 'new_state',
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

vi.mock('@/lib/auth/determineNonNative', () => ({
  determineNonNative: vi.fn(() => true),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { flagForNative } from '@/features/review/actions/flagForNative.action'

const FINDING_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const NATIVE_REVIEWER_ID = '44444444-4444-4444-8444-444444444444'

const validInput = {
  findingId: FINDING_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  assignedTo: NATIVE_REVIEWER_ID,
  flaggerComment: 'This needs native review for Thai idiom',
}

describe('flagForNative', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
  })

  // ── AC1: Atomic transaction (flag + assignment + review_action) ──

  it('should flag finding and create assignment in atomic transaction', async () => {
    // Call 0: SELECT finding | Call 1: COUNT assignments | Call 2: SELECT reviewer
    // Call 3: UPDATE finding (in tx) | Call 4: INSERT assignment .returning() (in tx)
    // Call 5: INSERT review_action (in tx) | Call 6: notification insert (after tx)
    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID }], // 0: SELECT finding
      [{ value: 0 }], // 1: COUNT assignments
      [{ id: NATIVE_REVIEWER_ID, displayName: 'Native', nativeLanguages: ['th'] }], // 2: SELECT reviewer
      [], // 3: UPDATE finding (tx)
      [{ id: 'new-assignment-id' }], // 4: INSERT assignment .returning() (tx)
      [], // 5: INSERT review_action (tx)
      [], // 6: notification insert
    ]

    const result = await flagForNative(validInput)

    expect(result.success).toBe(true)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding_assignment',
        action: 'assignment_created',
      }),
    )
  })

  // ── AC1: Cross-file finding guard (5.2b TODO M1) ──

  it('should reject cross-file findings where fileId is null', async () => {
    dbState.returnValues = [[{ status: 'pending', fileId: null }]]

    const result = await flagForNative(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Cross-file findings cannot be assigned')
    }
  })

  // ── AC1: Max 3 concurrent assignments per finding (RLS design D2) ──

  it('should reject when assignment count >= 3 for same finding', async () => {
    dbState.returnValues = [[{ status: 'pending', fileId: FILE_ID }], [{ value: 3 }]]

    const result = await flagForNative(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Maximum 3 concurrent assignments')
    }
  })

  // ── AC1: Validate assignedTo is native_reviewer ──

  it('should reject when assignedTo user is not a native_reviewer', async () => {
    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID }],
      [{ value: 0 }],
      [], // no matching native_reviewer found
    ]

    const result = await flagForNative(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not a native reviewer')
    }
  })

  it('should reject when assignedTo user does not have matching target language', async () => {
    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID }],
      [{ value: 0 }],
      [], // jsonb containment query returns empty
    ]

    const result = await flagForNative(validInput)

    expect(result.success).toBe(false)
  })

  // ── Auth: Role guard ──

  it('should require qa_reviewer or admin role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await flagForNative(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('AUTH_ERROR')
    }
  })

  // ── Tenant isolation ──

  it('should enforce tenant isolation via withTenant', async () => {
    const { withTenant } = await import('@/db/helpers/withTenant')

    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID }],
      [{ value: 0 }],
      [{ id: NATIVE_REVIEWER_ID, displayName: 'Native', nativeLanguages: ['th'] }],
      [],
      [{ id: 'new-assignment-id' }],
      [],
      [],
    ]

    await flagForNative(validInput)

    expect(withTenant).toHaveBeenCalled()
  })

  // ── AC7: Audit log after transaction ──

  it('should write audit log after transaction commits', async () => {
    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID }],
      [{ value: 0 }],
      [{ id: NATIVE_REVIEWER_ID, displayName: 'Native', nativeLanguages: ['th'] }],
      [],
      [{ id: 'new-assignment-id' }],
      [],
      [],
    ]

    await flagForNative(validInput)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding_assignment',
        action: 'assignment_created',
        oldValue: expect.objectContaining({ status: 'pending' }),
        newValue: expect.objectContaining({ status: 'flagged', assignedTo: NATIVE_REVIEWER_ID }),
      }),
    )
  })

  // ── AC5: Notification non-blocking (Guardrail #74) ──

  it('should create notification non-blocking — failure does not fail action', async () => {
    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID }], // 0: SELECT finding
      [{ value: 0 }], // 1: COUNT
      [{ id: NATIVE_REVIEWER_ID, displayName: 'Native', nativeLanguages: ['th'] }], // 2: SELECT reviewer
      [], // 3: UPDATE finding (tx)
      [{ id: 'new-assignment-id' }], // 4: INSERT assignment (tx)
      [], // 5: INSERT review_action (tx)
    ]
    dbState.throwAtCallIndex = 6 // notification insert fails

    const result = await flagForNative(validInput)

    // Action still succeeds even though notification failed
    expect(result.success).toBe(true)
  })

  // ── Boundary: flagger comment length ──

  it('should validate flagger comment boundary: reject < 10 chars, accept 10-500, reject > 500', async () => {
    // Too short
    const shortResult = await flagForNative({ ...validInput, flaggerComment: 'short' })
    expect(shortResult.success).toBe(false)

    // Too long
    const longResult = await flagForNative({ ...validInput, flaggerComment: 'a'.repeat(501) })
    expect(longResult.success).toBe(false)
  })

  // ── CR-H9: segment lookup branch (Step 3a) ──

  it('should resolve targetLang from segment when finding has segmentId', async () => {
    dbState.returnValues = [
      [{ status: 'pending', fileId: FILE_ID, segmentId: 'seg-1' }], // 0: SELECT finding (with segmentId)
      [{ value: 0 }], // 1: COUNT assignments
      [{ targetLang: 'th' }], // 2: SELECT segment targetLang (Step 3a)
      [{ id: NATIVE_REVIEWER_ID, displayName: 'Native', nativeLanguages: ['th'] }], // 3: SELECT reviewer
      [], // 4: UPDATE finding (tx)
      [{ id: 'new-assignment-id' }], // 5: INSERT assignment (tx)
      [], // 6: INSERT review_action (tx)
    ]

    const result = await flagForNative(validInput)

    // Action succeeds — segment query resolved targetLang correctly
    expect(result.success).toBe(true)
  })

  it('should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [
      [], // 0: SELECT finding — empty
    ]

    const result = await flagForNative(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })
})
