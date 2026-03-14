/**
 * Story 4.2: Core Review Actions — acceptFinding Server Action
 * Tests: success path, not-found, auth, tenant isolation, no-op
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'

// ── Hoisted mocks — MUST be first ──
const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog, mockInngestSend } = vi.hoisted(
  () => {
    const { dbState, dbMockModule } = createDrizzleMock()
    return {
      dbState,
      dbMockModule,
      mockRequireRole: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
          tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
          role: 'qa_reviewer',
        }),
      ),
      mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
      mockInngestSend: vi.fn((..._args: unknown[]) => Promise.resolve()),
    }
  },
)

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

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    segmentId: 'segment_id',
    status: 'status',
    severity: 'severity',
    category: 'category',
    detectedByLayer: 'detected_by_layer',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
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
    batchId: 'batch_id',
    metadata: 'metadata',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { acceptFinding } from '@/features/review/actions/acceptFinding.action'

// ── Constants ──

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

// M3+M6 fix: mock shape matches executeReviewAction SELECT fields, includes segmentId
function buildFindingMock(overrides?: Record<string, unknown>) {
  return {
    id: VALID_FINDING_ID,
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    segmentId: VALID_SEGMENT_ID,
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L1',
    sourceTextExcerpt: 'Hello world',
    targetTextExcerpt: 'สวัสดีชาวโลก',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ──

describe('acceptFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: VALID_USER_ID,
      tenantId: VALID_TENANT_ID,
      role: 'qa_reviewer',
    })
  })

  it('[P0] U-SA1: should update finding status, write audit + review_actions, and send Inngest event on success', async () => {
    // Arrange: finding exists with pending status
    const findingMock = buildFindingMock({ status: 'pending' })
    dbState.returnValues = [[findingMock], []]

    // Act
    const result = await acceptFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Assert: success
    expect(result.success).toBe(true)

    // H5 fix: Assert review_actions INSERT payload via valuesCaptures
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const reviewActionValues = dbState.valuesCaptures.find(
      (capture: unknown) =>
        typeof capture === 'object' &&
        capture !== null &&
        'actionType' in (capture as Record<string, unknown>) &&
        (capture as Record<string, string>).actionType === 'accept',
    ) as Record<string, unknown> | undefined
    expect(reviewActionValues).toBeDefined()
    expect(reviewActionValues).toMatchObject({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      actionType: 'accept',
      previousState: 'pending',
      newState: 'accepted',
      userId: VALID_USER_ID,
      batchId: null,
      metadata: null,
    })

    // Assert: audit log written
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding',
        action: 'finding.accept',
        tenantId: VALID_TENANT_ID,
      }),
    )

    // Assert: Inngest event sent for score recalculation
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({
          findingId: VALID_FINDING_ID,
          previousState: 'pending',
          newState: 'accepted',
        }),
      }),
    )
  })

  it('[P0] U-SA2: should return NOT_FOUND error when finding does not exist', async () => {
    dbState.returnValues = [[]]

    const result = await acceptFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toMatch(/NOT_FOUND/)
    }
  })

  it('[P0] U-SA3: should return UNAUTHORIZED error when user has insufficient role', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden: insufficient role'))

    const result = await acceptFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
      expect(result.error).toBe('Unauthorized')
    }
  })

  it('[P0] U-SA4: should return NOT_FOUND for cross-tenant access and verify withTenant was called', async () => {
    dbState.returnValues = [[]]

    const result = await acceptFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    // M4 (TQA): verify withTenant was actually called with correct tenant
    expect(withTenant).toHaveBeenCalledWith('tenant_id', VALID_TENANT_ID)
  })

  it('[P1] U-SA5: should return success with no DB update when already accepted (no-op)', async () => {
    const findingMock = buildFindingMock({ status: 'accepted' })
    dbState.returnValues = [[findingMock]]

    const result = await acceptFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
