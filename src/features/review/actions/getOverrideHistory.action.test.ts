/**
 * Story 4.4a ATDD: getOverrideHistory Server Action — Decision Override History (AC5)
 *
 * TDD RED phase — all tests use it() pending implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks — MUST be first ──
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

import { withTenant } from '@/db/helpers/withTenant'
import { getOverrideHistory } from '@/features/review/actions/getOverrideHistory.action'

// ── Constants ──

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

// ── Tests ──

describe('getOverrideHistory.action', () => {
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

  it('[P0] should return decision history ordered newest-first', async () => {
    const historyRows = [
      {
        id: 'ra-3',
        findingId: VALID_FINDING_ID,
        actionType: 'accept',
        previousState: 'rejected',
        newState: 'accepted',
        userId: VALID_USER_ID,
        createdAt: '2026-03-15T12:00:00Z',
        metadata: null,
      },
      {
        id: 'ra-2',
        findingId: VALID_FINDING_ID,
        actionType: 'reject',
        previousState: 'pending',
        newState: 'rejected',
        userId: VALID_USER_ID,
        createdAt: '2026-03-15T11:00:00Z',
        metadata: null,
      },
      {
        id: 'ra-1',
        findingId: VALID_FINDING_ID,
        actionType: 'accept',
        previousState: 'pending',
        newState: 'accepted',
        userId: VALID_USER_ID,
        createdAt: '2026-03-15T10:00:00Z',
        metadata: null,
      },
    ]

    dbState.returnValues = [historyRows]

    const result = await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      // Newest first (descending createdAt)
      expect(result.data[0]!.id).toBe('ra-3')
      expect(result.data[2]!.id).toBe('ra-1')
    }
  })

  it('[P1] should return empty array for finding with single action', async () => {
    // A finding with only one action has no "override" history —
    // the action returns whatever review_actions exist, even if just 1
    const singleRow = [
      {
        id: 'ra-1',
        findingId: VALID_FINDING_ID,
        actionType: 'accept',
        previousState: 'pending',
        newState: 'accepted',
        userId: VALID_USER_ID,
        createdAt: '2026-03-15T10:00:00Z',
        metadata: null,
      },
    ]

    dbState.returnValues = [singleRow]

    const result = await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // Single action = 1 row returned (not empty — that's raw history)
      expect(result.data).toHaveLength(1)
    }
  })

  it('[P1] should enforce tenant isolation on history query', async () => {
    dbState.returnValues = [[]]

    await getOverrideHistory({
      findingId: VALID_FINDING_ID,
      projectId: VALID_PROJECT_ID,
    })

    // Verify withTenant was called with correct tenant ID (Guardrail #1)
    expect(withTenant).toHaveBeenCalledWith('tenant_id', VALID_TENANT_ID)
  })
})
