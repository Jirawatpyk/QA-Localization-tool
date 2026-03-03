/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC5: Server action — getFileReviewData
 */
import { describe, it, vi, expect, beforeEach } from 'vitest'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { buildDbFinding, buildScoreRecord, buildFile } from '@/test/factories'

// ── Hoisted mocks ──
const { dbState, dbMockModule, mockRequireRole, mockWithTenant } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { dbState, dbMockModule } = (createDrizzleMock as any)()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn(),
    mockWithTenant: vi.fn((..._args: unknown[]) => 'mocked-tenant-filter'),
  }
})

vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}))

const mockTenantId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const mockUserId = 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e'
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('getFileReviewData', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockWithTenant.mockClear()
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

    // withTenant called for: files, findings, scores, languagePairConfigs(JOIN), projects(WHERE) = 5
    expect(mockWithTenant).toHaveBeenCalledTimes(5)
    // Every call must use the authenticated user's tenantId
    for (const call of mockWithTenant.mock.calls) {
      expect(call[1]).toBe(mockTenantId)
    }
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

  // ── P0: processingMode loaded from projects table ──

  it('[P0] should load processingMode from projects table', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    dbState.returnValues = [
      [buildFile({ fileId })],
      [buildDbFinding({ fileId, tenantId: mockTenantId })],
      [buildScoreRecord({ fileId, tenantId: mockTenantId })],
      [{ l2ConfidenceMin: 70, processingMode: 'thorough' }],
    ]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processingMode).toBe('thorough')
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

  // ── P1: Score fallback when no score record exists ──

  it('[P1] should return default score when no score record exists', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    dbState.returnValues = [
      [buildFile({ fileId })],
      [],
      [], // no score
      [{ l2ConfidenceMin: 70, processingMode: 'economy' }],
    ]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.score.mqmScore).toBeNull()
      expect(result.data.score.status).toBe('na')
      expect(result.data.score.layerCompleted).toBeNull()
      expect(result.data.score.criticalCount).toBe(0)
      expect(result.data.score.majorCount).toBe(0)
      expect(result.data.score.minorCount).toBe(0)
    }
  })

  // ── P1: Config fallback when no language pair config exists ──

  it('[P1] should return economy mode and null l2ConfidenceMin when no config record', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    dbState.returnValues = [
      [buildFile({ fileId })],
      [],
      [buildScoreRecord({ fileId, tenantId: mockTenantId })],
      [], // no config
    ]

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.processingMode).toBe('economy')
      expect(result.data.l2ConfidenceMin).toBeNull()
    }
  })

  // ── P1: Error handling — DB throws ──

  it('[P1] should return INTERNAL_ERROR when DB query throws', async () => {
    const fileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
    const projectId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'

    dbState.throwAtCallIndex = 0

    const result = await getFileReviewData({ fileId, projectId })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INTERNAL_ERROR')
    }
  })
})
