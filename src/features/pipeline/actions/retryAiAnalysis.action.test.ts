/** Story 3.4 ATDD — retryAiAnalysis server action — RED PHASE */
import { faker } from '@faker-js/faker'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (throws in jsdom)
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const {
  mockRequireRole,
  mockWriteAuditLog,
  mockInngestSend,
  mockCheckProjectBudget,
  dbState,
  dbMockModule,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockRequireRole: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
        tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
        role: 'reviewer',
      }),
    ),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockInngestSend: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockCheckProjectBudget: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        hasQuota: true,
        remainingBudgetUsd: Infinity,
        monthlyBudgetUsd: null as number | null,
        usedBudgetUsd: 0,
      }),
    ),
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

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/ai/budget', () => ({
  checkProjectBudget: (...args: unknown[]) => mockCheckProjectBudget(...args),
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    projectId: 'project_id',
  },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    status: 'status',
    layerCompleted: 'layer_completed',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    processingMode: 'processing_mode',
    l2PinnedModel: 'l2_pinned_model',
    l3PinnedModel: 'l3_pinned_model',
  },
}))

// ── Helpers ──

type RetryAiAnalysisData = { retriedLayers: string[] }

/** Narrow ActionResult to success branch for test assertions */
function assertSuccess(result: { success: boolean; data?: unknown }) {
  if (!result.success) throw new Error('Expected success=true')
  return result as { success: true; data: RetryAiAnalysisData }
}

// ── Constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

function buildFileRow(overrides?: Record<string, unknown>) {
  return {
    id: VALID_FILE_ID,
    tenantId: VALID_TENANT_ID,
    projectId: VALID_PROJECT_ID,
    status: 'ai_partial',
    ...overrides,
  }
}

function buildScoreRow(overrides?: Record<string, unknown>) {
  return {
    id: faker.string.uuid(),
    fileId: VALID_FILE_ID,
    layerCompleted: 'L1',
    status: 'partial',
    ...overrides,
  }
}

function buildProjectRow(overrides?: Record<string, unknown>) {
  return {
    id: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    processingMode: 'economy',
    ...overrides,
  }
}

// ── Suite ──

describe('retryAiAnalysis action (Story 3.4)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null

    // Restore default mock implementations after resetAllMocks
    mockRequireRole.mockResolvedValue({
      id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'reviewer',
    })
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockInngestSend.mockResolvedValue(undefined)
    mockCheckProjectBudget.mockResolvedValue({
      hasQuota: true,
      remainingBudgetUsd: Infinity,
      monthlyBudgetUsd: null as number | null,
      usedBudgetUsd: 0,
    })

    // Default: file is ai_partial, score layerCompleted=L1, project mode=economy
    dbState.returnValues = [[buildFileRow()], [buildScoreRow()], [buildProjectRow()]]
  })

  describe('validation', () => {
    // T34
    it('[P0] should reject when file status is not ai_partial', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [
        [buildFileRow({ status: 'l2_completed' })], // file is already completed
      ]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/not eligible|not partial|invalid status/i),
        }),
      )
    })

    // T35
    it('[P0] should reject when file is already being processed', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [[buildFileRow({ status: 'l2_processing' })]]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/processing|in progress/i),
        }),
      )
    })

    // T71
    it('[P0] should reject retry on file in l2_processing state', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [[buildFileRow({ status: 'l2_processing' })]]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(result.success).toBe(false)
      // Must NOT have sent an Inngest event
      expect(mockInngestSend).not.toHaveBeenCalled()
    })
  })

  describe('layer detection', () => {
    // T36
    it('[P0] should retry L2 when layer_completed=L1 and mode=economy', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [
        [buildFileRow()], // file: ai_partial
        [buildScoreRow({ layerCompleted: 'L1' })], // score: L1 done
        [buildProjectRow({ processingMode: 'economy' })], // project: economy mode
      ]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      const success = assertSuccess(result)
      expect(success.data.retriedLayers).toContain('L2')
      // L3 must NOT be retried in economy mode
      expect(success.data.retriedLayers).not.toContain('L3')
    })

    // T37
    it('[P0] should retry L2+L3 when layer_completed=L1 and mode=thorough', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [
        [buildFileRow()],
        [buildScoreRow({ layerCompleted: 'L1' })],
        [buildProjectRow({ processingMode: 'thorough' })],
      ]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      const success = assertSuccess(result)
      expect(success.data.retriedLayers).toContain('L2')
      expect(success.data.retriedLayers).toContain('L3')
    })

    // T38
    it('[P0] should retry L3 only when layer_completed=L1L2 and mode=thorough', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [
        [buildFileRow()],
        [buildScoreRow({ layerCompleted: 'L1L2' })],
        [buildProjectRow({ processingMode: 'thorough' })],
      ]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      const success = assertSuccess(result)
      expect(success.data.retriedLayers).toContain('L3')
      expect(success.data.retriedLayers).not.toContain('L2')
    })

    // T39
    it('[P1] should recalculate as calculated when mode=economy and L1L2 already done', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      // File is ai_partial but L1L2 already done + economy mode = just recalculate score
      dbState.returnValues = [
        [buildFileRow()],
        [buildScoreRow({ layerCompleted: 'L1L2' })],
        [buildProjectRow({ processingMode: 'economy' })],
      ]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      const success = assertSuccess(result)
      // No layers to retry — just recalculate
      expect(success.data.retriedLayers.length).toBe(0)
    })
  })

  describe('security and guards', () => {
    // T41
    it('[P0] should validate tenantId ownership before processing', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      // File belongs to a different tenant
      dbState.returnValues = [
        [], // withTenant filter returns no file (tenant mismatch)
      ]

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/not found|unauthorized|tenant/i),
        }),
      )
      // Must NOT have sent Inngest event
      expect(mockInngestSend).not.toHaveBeenCalled()
    })

    // T42
    it('[P0] should check budget BEFORE resetting file status', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      // Budget exhausted
      mockCheckProjectBudget.mockResolvedValue({
        hasQuota: false,
        remainingBudgetUsd: 0,
        monthlyBudgetUsd: 10,
        usedBudgetUsd: 10,
      })

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/budget|quota/i),
        }),
      )
      // File status must NOT have been changed
      const statusChange = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status !== undefined,
      )
      expect(statusChange).toBeUndefined()
    })

    // T44
    it('[P1] should block non-reviewer role from retrying', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      // requireRole throws for viewer role
      mockRequireRole.mockRejectedValue(new Error('Insufficient permissions'))

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/permission|role|unauthorized/i),
        }),
      )
    })
  })

  describe('event dispatch', () => {
    // T40
    it('[P0] should NOT reset file status in server action (defer to Inngest step)', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      // Server action must NOT change file status — Inngest function handles state transitions
      const statusChange = (dbState.setCaptures as Record<string, unknown>[])?.find(
        (s) => s.status !== undefined,
      )
      expect(statusChange).toBeUndefined()
    })

    it('[P0] should send pipeline.retry-failed-layers event with correct data', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'pipeline.retry-failed-layers',
          data: expect.objectContaining({
            fileId: VALID_FILE_ID,
            projectId: VALID_PROJECT_ID,
            tenantId: VALID_TENANT_ID,
          }),
        }),
      )
    })

    it('[P0] should include mode from project config in event data', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      dbState.returnValues = [
        [buildFileRow()],
        [buildScoreRow()],
        [buildProjectRow({ processingMode: 'thorough' })],
      ]

      await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: 'thorough' }),
        }),
      )
    })

    it('[P1] should return ActionResult with retriedLayers array', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      const result = await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      const success = assertSuccess(result)
      expect(success.data).toHaveProperty('retriedLayers')
      expect(Array.isArray(success.data.retriedLayers)).toBe(true)
    })

    it('[P1] should write audit log for retry action', async () => {
      const { retryAiAnalysis } = await import('./retryAiAnalysis.action')

      await retryAiAnalysis({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.stringContaining('retry'),
          entityType: 'file',
          entityId: VALID_FILE_ID,
        }),
      )
    })
  })
})
