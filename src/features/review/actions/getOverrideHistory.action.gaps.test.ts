/**
 * Story 4.4a TA: getOverrideHistory Server Action — Coverage Gap Tests
 * Tests: Auth failure, Zod edge cases, empty results, metadata handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbState, dbMockModule, mockRequireRole } = vi.hoisted(() => {
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
  desc: vi.fn((...args: unknown[]) => args),
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
    isBulk: 'is_bulk',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { getOverrideHistory } from '@/features/review/actions/getOverrideHistory.action'

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

describe('getOverrideHistory.action — coverage gaps', () => {
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

  it('[P0] should return UNAUTHORIZED when requireRole throws', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Not authenticated'))

    const result = await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  it('[P0] should reject invalid UUID format', async () => {
    const result = await getOverrideHistory({
      findingId: 'not-a-uuid',
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('[P1] should return empty array when no review_actions exist', async () => {
    dbState.returnValues = [[]]

    const result = await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('[P1] should handle Date object in createdAt (convert to ISO string)', async () => {
    const dateObj = new Date('2026-03-15T10:00:00Z')
    dbState.returnValues = [
      [
        {
          id: 'ra-1',
          findingId: VALID_FINDING_ID,
          actionType: 'accept',
          previousState: 'pending',
          newState: 'accepted',
          userId: VALID_USER_ID,
          createdAt: dateObj,
          metadata: null,
        },
      ],
    ]

    const result = await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]!.createdAt).toBe('2026-03-15T10:00:00.000Z')
    }
  })

  it('[P2] should handle metadata with values (not null)', async () => {
    dbState.returnValues = [
      [
        {
          id: 'ra-1',
          findingId: VALID_FINDING_ID,
          actionType: 'accept',
          previousState: 'pending',
          newState: 'accepted',
          userId: VALID_USER_ID,
          createdAt: '2026-03-15T10:00:00Z',
          metadata: { is_bulk: true, batch_size: 5, action_index: 0 },
        },
      ],
    ]

    const result = await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]!.metadata).toEqual({ is_bulk: true, batch_size: 5, action_index: 0 })
    }
  })
})
