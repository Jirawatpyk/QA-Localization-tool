/**
 * TDD RED PHASE — Story 4.2: Core Review Actions
 * Server Action: flagFinding
 * Tests: success path with DB update + audit + review_actions + Inngest (no feedback_events)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('@/features/audit/helpers/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
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

// Will fail: module doesn't exist yet
import { flagFinding } from '@/features/review/actions/flagFinding.action'

// ── Constants ──

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function buildFindingMock(overrides?: Record<string, unknown>) {
  return {
    id: VALID_FINDING_ID,
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
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

describe('flagFinding.action', () => {
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

  it('[P0] U-SA8: should update finding status to flagged, write audit + review_actions, and send Inngest event', async () => {
    // Arrange: finding exists with pending status
    const findingMock = buildFindingMock({ status: 'pending' })
    const updatedFindingMock = buildFindingMock({ status: 'flagged' })
    // Call order: 1) select finding, 2) update finding, 3) insert review_actions
    dbState.returnValues = [[findingMock], [updatedFindingMock], []]

    // Act
    const result = await flagFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Assert: success
    expect(result.success).toBe(true)

    // Assert: audit log written
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'finding',
        action: expect.stringContaining('flag'),
        tenantId: VALID_TENANT_ID,
      }),
    )

    // Assert: review_actions row inserted (captured via valuesCaptures)
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)

    // Assert: Inngest event sent for score recalculation
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({
          findingId: VALID_FINDING_ID,
          previousState: 'pending',
          newState: 'flagged',
        }),
      }),
    )
  })

  it('[P0] U-SA8b: should NOT insert feedback_events for flag action (only reject does)', async () => {
    // Arrange: pending finding
    const findingMock = buildFindingMock({ status: 'pending' })
    const updatedFindingMock = buildFindingMock({ status: 'flagged' })
    dbState.returnValues = [[findingMock], [updatedFindingMock], []]

    // Act
    await flagFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Assert: no feedback_events INSERT — only reject writes feedback
    // The valuesCaptures should NOT contain any entry with action='flag' in feedbackEvents
    const feedbackCapture = dbState.valuesCaptures.find(
      (capture: unknown) =>
        typeof capture === 'object' &&
        capture !== null &&
        'isFalsePositive' in (capture as Record<string, unknown>),
    )
    expect(feedbackCapture).toBeUndefined()
  })

  it('[P0] U-SA8c: should return NOT_FOUND when finding does not exist', async () => {
    // Arrange: DB returns empty
    dbState.returnValues = [[]]

    // Act
    const result = await flagFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toMatch(/NOT_FOUND/)
    }
  })

  it('[P1] U-SA8d: should return success with no state change when already flagged (no-op)', async () => {
    // Arrange: finding already flagged
    const findingMock = buildFindingMock({ status: 'flagged' })
    dbState.returnValues = [[findingMock]]

    // Act
    const result = await flagFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Assert: no-op — no Inngest event
    expect(result.success).toBe(true)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('[P0] U-SA8e: should return error when user has insufficient role', async () => {
    // Arrange: requireRole rejects
    mockRequireRole.mockRejectedValue(new Error('Forbidden: insufficient role'))

    // Act
    const result = await flagFinding({
      findingId: VALID_FINDING_ID,
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Assert: unauthorized
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeDefined()
    }
  })
})
