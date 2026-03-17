/**
 * Story 4.6: deactivateSuppressionRule Server Action (CR-C2)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbState, dbMockModule, mockRequireRole, mockWriteAuditLog } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
        role: 'admin',
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
vi.mock('@/db/schema/suppressionRules', () => ({
  suppressionRules: {
    id: 'id',
    tenantId: 'tenant_id',
    isActive: 'is_active',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { deactivateSuppressionRule } from './deactivateSuppressionRule.action'

const VALID_RULE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

describe('deactivateSuppressionRule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'admin',
    })
    // .returning() resolves at callIndex 0
    dbState.returnValues = [[{ id: VALID_RULE_ID }]]
  })

  it('[P0] should deactivate rule and return success', async () => {
    const result = await deactivateSuppressionRule(VALID_RULE_ID)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.ruleId).toBe(VALID_RULE_ID)
  })

  it('[P0] should return UNAUTHORIZED for non-admin users', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'))
    const result = await deactivateSuppressionRule(VALID_RULE_ID)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('UNAUTHORIZED')
  })

  it('[P0] should return VALIDATION_ERROR for invalid UUID', async () => {
    const result = await deactivateSuppressionRule('not-a-uuid')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('[P0] should return NOT_FOUND when rule does not exist', async () => {
    dbState.returnValues = [[]] // Empty returning
    const result = await deactivateSuppressionRule(VALID_RULE_ID)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  it('[P1] should write audit log after deactivation', async () => {
    await deactivateSuppressionRule(VALID_RULE_ID)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'suppression_rule',
        entityId: VALID_RULE_ID, // R2-L5: verify correct rule ID
        action: 'suppression_rule.deactivated',
      }),
    )
  })
})
