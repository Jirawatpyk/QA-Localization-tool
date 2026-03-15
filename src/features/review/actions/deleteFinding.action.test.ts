/**
 * Story 4.3 ATDD: deleteFinding Server Action
 * Tests: U-D1..U-D4 (delete in FK order, guard Manual only, not found, Inngest)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    detectedByLayer: 'detected_by_layer',
    severity: 'severity',
    category: 'category',
  },
}))
vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: { findingId: 'finding_id', tenantId: 'tenant_id' },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { deleteFinding } from '@/features/review/actions/deleteFinding.action'

const IDS = {
  findingId: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  userId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
}

describe('deleteFinding.action', () => {
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

  it('[P0] U-D1: should delete review_actions then finding in transaction', async () => {
    // SELECT finding, tx.delete review_actions, tx.delete finding
    dbState.returnValues = [
      [{ id: IDS.findingId, detectedByLayer: 'Manual', severity: 'minor', category: 'accuracy' }],
      [],
      [], // tx deletes
    ]

    const result = await deleteFinding({
      findingId: IDS.findingId,
      fileId: IDS.fileId,
      projectId: IDS.projectId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ findingId: IDS.findingId, deleted: true })
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finding.delete' }),
    )
  })

  it('[P0] U-D2: should reject delete for non-Manual findings', async () => {
    dbState.returnValues = [
      [{ id: IDS.findingId, detectedByLayer: 'L1', severity: 'major', category: 'accuracy' }],
    ]

    const result = await deleteFinding({
      findingId: IDS.findingId,
      fileId: IDS.fileId,
      projectId: IDS.projectId,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_MANUAL')
  })

  it('[P1] U-D3: should return NOT_FOUND when finding does not exist', async () => {
    dbState.returnValues = [[]]
    const result = await deleteFinding({
      findingId: IDS.findingId,
      fileId: IDS.fileId,
      projectId: IDS.projectId,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NOT_FOUND')
  })

  it('[P1] U-D4: should send Inngest event for score recalculation', async () => {
    dbState.returnValues = [
      [{ id: IDS.findingId, detectedByLayer: 'Manual', severity: 'minor', category: 'accuracy' }],
      [],
      [],
    ]

    await deleteFinding({ findingId: IDS.findingId, fileId: IDS.fileId, projectId: IDS.projectId })

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'finding.changed',
        data: expect.objectContaining({ previousState: 'manual', newState: 'manual' }),
      }),
    )
  })
})
