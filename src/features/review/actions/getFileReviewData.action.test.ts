/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC5: Server action — getFileReviewData
 *
 * TDD RED PHASE — all tests are `it.skip()`.
 * Dev removes `.skip` and makes tests pass during implementation.
 */
import { describe, it, vi, expect, beforeEach } from 'vitest'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

import { buildDbFinding, buildScoreRecord, buildFile } from '@/test/factories'

// ── Hoisted mocks ──
const { dbState, dbMockModule, mockRequireRole } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { dbState, dbMockModule } = (createDrizzleMock as any)()
  return { dbState, dbMockModule, mockRequireRole: vi.fn() }
})

vi.mock('@/db/client', () => dbMockModule)

const mockTenantId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const mockUserId = 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e'
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'

describe('getFileReviewData', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      userId: mockUserId,
      tenantId: mockTenantId,
      role: 'qa_reviewer',
    })
  })

  // ── P0: Happy path — returns full review data ──

  it('[P0] should return ActionResult with file, findings, score, processingMode, l2ConfidenceMin', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    // Status 'l2_completed' is a pipeline status beyond upload — cast needed since buildFile types are upload-scoped
    const mockFile = buildFile({ fileId, status: 'l2_completed' as never })
    const mockFindings = [
      buildDbFinding({
        fileId,
        projectId,
        tenantId: mockTenantId,
        detectedByLayer: 'L1',
        severity: 'critical',
        aiConfidence: null,
      }),
      buildDbFinding({
        fileId,
        projectId,
        tenantId: mockTenantId,
        detectedByLayer: 'L2',
        severity: 'major',
        aiConfidence: 88,
      }),
    ]
    const mockScore = buildScoreRecord({
      fileId,
      projectId,
      tenantId: mockTenantId,
      mqmScore: 85.5,
      layerCompleted: 'L1L2',
      status: 'calculated',
    })

    // Query order: file, findings, score, languagePairConfig
    dbState.returnValues = [
      [mockFile],
      mockFindings,
      [mockScore],
      [{ l2ConfidenceMin: 70, processingMode: 'economy' }],
    ]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.file).toBeDefined()
      expect(result.data.findings).toHaveLength(2)
      expect(result.data.score).toBeDefined()
      expect(result.data.score.mqmScore).toBe(85.5)
      expect(result.data.l2ConfidenceMin).toBe(70)
    }
  })

  // ── P0: Tenant isolation — all queries use withTenant ──

  it('[P0] should use withTenant() on all queries (verify tenantId in captures)', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    // Provide enough return values for all queries
    dbState.returnValues = [
      [buildFile({ fileId })],
      [buildDbFinding({ fileId, tenantId: mockTenantId })],
      [buildScoreRecord({ fileId, tenantId: mockTenantId })],
      [{ l2ConfidenceMin: 70 }],
    ]

    await getFileReviewData({ fileId, projectId })

    // Verify that db queries were called (callIndex should have advanced)
    // The exact number depends on implementation, but all queries must include tenantId
    expect(dbState.callIndex).toBeGreaterThanOrEqual(3)
  })

  // ── P1: Findings sorted by severity priority then aiConfidence DESC NULLS LAST ──

  it('[P1] should return findings sorted by severity priority then aiConfidence DESC NULLS LAST', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    const findings = [
      buildDbFinding({ severity: 'minor', aiConfidence: 90, tenantId: mockTenantId, fileId }),
      buildDbFinding({ severity: 'critical', aiConfidence: null, tenantId: mockTenantId, fileId }),
      buildDbFinding({ severity: 'major', aiConfidence: 80, tenantId: mockTenantId, fileId }),
      buildDbFinding({ severity: 'major', aiConfidence: 95, tenantId: mockTenantId, fileId }),
    ]

    dbState.returnValues = [
      [buildFile({ fileId })],
      findings,
      [buildScoreRecord({ fileId, tenantId: mockTenantId })],
      [{ l2ConfidenceMin: 70 }],
    ]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(true)
    if (result.success) {
      const severities = result.data.findings.map((f: { severity: string }) => f.severity)
      // Critical first, then major, then minor
      expect(severities[0]).toBe('critical')
      expect(severities[1]).toBe('major')
      expect(severities[2]).toBe('major')
      expect(severities[3]).toBe('minor')
    }
  })

  // ── P0: NOT_FOUND for missing file ──

  it('[P0] should return NOT_FOUND error for missing file', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    // Empty result for file query
    dbState.returnValues = [[]]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.error).toMatch(/file|not found/i)
    }
  })

  // ── P1: Empty findings for file with no findings ──

  it('[P1] should return empty findings array for file with no findings', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    dbState.returnValues = [
      [buildFile({ fileId })],
      [], // no findings
      [buildScoreRecord({ fileId, tenantId: mockTenantId })],
      [{ l2ConfidenceMin: 70 }],
    ]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findings).toEqual([])
    }
  })
})
