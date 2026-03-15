/**
 * Story 4.3 ATDD: sourceIssueFinding Server Action
 * Tests: U-SA1 (happy path), U-SA2 (not found), U-SA3 (no-op source_issue)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'

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

import { sourceIssueFinding } from '@/features/review/actions/sourceIssueFinding.action'

const IDS = {
  findingId: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  userId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
}

function buildFinding(overrides?: Record<string, unknown>) {
  return {
    id: IDS.findingId,
    fileId: IDS.fileId,
    projectId: IDS.projectId,
    tenantId: IDS.tenantId,
    segmentId: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L1',
    sourceTextExcerpt: 'Hello',
    targetTextExcerpt: 'สวัสดี',
    ...overrides,
  }
}

describe('sourceIssueFinding.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: IDS.userId,
      tenantId: IDS.tenantId,
      role: 'qa_reviewer',
    })
  })

  it('[P0] U-SA1: should transition pending → source_issue with review_actions', async () => {
    dbState.returnValues = [[buildFinding({ status: 'pending' })], [], []]

    const result = await sourceIssueFinding({
      findingId: IDS.findingId,
      fileId: IDS.fileId,
      projectId: IDS.projectId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ previousState: 'pending', newState: 'source_issue' })
    }
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({ newState: 'source_issue' }),
      }),
    )
  })

  it('[P1] U-SA2: should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [[]]
    const result = await sourceIssueFinding({
      findingId: IDS.findingId,
      fileId: IDS.fileId,
      projectId: IDS.projectId,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
    expect(withTenant).toHaveBeenCalledWith('tenant_id', IDS.tenantId)
  })

  it('[P1] U-SA3: should return no-op when finding is already source_issue', async () => {
    dbState.returnValues = [[buildFinding({ status: 'source_issue' })]]
    const result = await sourceIssueFinding({
      findingId: IDS.findingId,
      fileId: IDS.fileId,
      projectId: IDS.projectId,
    })
    expect(result.success).toBe(true)
    if (result.success && 'noOp' in result.data) expect(result.data.noOp).toBe(true)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
