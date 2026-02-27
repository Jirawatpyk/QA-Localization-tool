import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockWriteAuditLog, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockRequireRole: vi.fn(),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    l2PinnedModel: 'l2_pinned_model',
    l3PinnedModel: 'l3_pinned_model',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Test constants ──

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const adminUser = {
  id: 'admin-uuid-0001-0001-000000000001',
  tenantId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
  role: 'admin' as const,
  email: 'admin@test.com',
}

const _reviewerUser = {
  id: 'reviewer-uuid-0001-0001-000000000001',
  tenantId: adminUser.tenantId,
  role: 'qa_reviewer' as const,
  email: 'reviewer@test.com',
}

describe('updateModelPinning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(adminUser)
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  // ── P0: Core behavior ──

  it('should update l2_pinned_model when valid L2 model provided', async () => {
    // Arrange: UPDATE returns updated project row
    dbState.returnValues = [[{ id: VALID_PROJECT_ID, l2PinnedModel: 'gpt-4o-mini-2024-07-18' }]]

    const { updateModelPinning } = await import('./updateModelPinning.action')
    const result = await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: 'gpt-4o-mini-2024-07-18',
    })

    expect(result.success).toBe(true)
    // Verify correct column was updated
    expect(dbState.setCaptures[0]).toMatchObject({ l2PinnedModel: 'gpt-4o-mini-2024-07-18' })
    // RED: updateModelPinning.action.ts not yet created
  })

  it('should update l3_pinned_model when valid L3 model provided', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID, l3PinnedModel: 'claude-sonnet-4-5-20250929' }]]

    const { updateModelPinning } = await import('./updateModelPinning.action')
    const result = await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L3',
      model: 'claude-sonnet-4-5-20250929',
    })

    expect(result.success).toBe(true)
    expect(dbState.setCaptures[0]).toMatchObject({ l3PinnedModel: 'claude-sonnet-4-5-20250929' })
    // RED: L3 column must be set correctly
  })

  it('should return FORBIDDEN when user role is not admin', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { updateModelPinning } = await import('./updateModelPinning.action')
    const result = await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: 'gpt-4o-mini-2024-07-18',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
    // RED: admin-only action
  })

  it('should return INVALID_INPUT when model ID is not in AVAILABLE_MODELS allowlist', async () => {
    const { updateModelPinning } = await import('./updateModelPinning.action')
    const result = await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: 'gpt-4-turbo-malicious-injection',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    // RED: allowlist validation (AVAILABLE_MODELS constant)
  })

  it('should write audit log on successful model pin change', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]

    const { updateModelPinning } = await import('./updateModelPinning.action')
    await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: 'gpt-4o-mini-2024-07-18',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.stringContaining('model'),
        tenantId: adminUser.tenantId,
        entityType: expect.stringMatching(/project/),
        newValue: expect.objectContaining({
          layer: 'L2',
          model: 'gpt-4o-mini-2024-07-18',
        }),
      }),
    )
    // RED: audit log required for model pin changes (Guardrail: audit trail)
  })

  // ── P1: Edge cases ──

  it('should allow null to clear pinned model (reset to system default)', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID, l2PinnedModel: null }]]

    const { updateModelPinning } = await import('./updateModelPinning.action')
    const result = await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: null, // null = clear pinning, use system default
    })

    expect(result.success).toBe(true)
    expect(dbState.setCaptures[0]).toMatchObject({ l2PinnedModel: null })
    // RED: null model clears pinning
  })

  it('should use withTenant on projects UPDATE query', async () => {
    dbState.returnValues = [[{ id: VALID_PROJECT_ID }]]

    const { updateModelPinning } = await import('./updateModelPinning.action')
    await updateModelPinning({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: 'gpt-4o-mini-2024-07-18',
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), adminUser.tenantId)
    // RED: withTenant guard on UPDATE (Guardrail #1)
  })
})
