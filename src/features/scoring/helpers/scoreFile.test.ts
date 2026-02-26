import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──
const {
  mockCalculateMqmScore,
  mockCheckAutoPass,
  mockLoadPenaltyWeights,
  mockWriteAuditLog,
  dbState,
  dbMockModule,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockCalculateMqmScore: vi.fn(),
    mockCheckAutoPass: vi.fn(),
    mockLoadPenaltyWeights: vi.fn((..._args: unknown[]) =>
      Promise.resolve({ critical: 25, major: 5, minor: 1 }),
    ),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/features/scoring/mqmCalculator', () => ({
  calculateMqmScore: (...args: unknown[]) => mockCalculateMqmScore(...args),
}))

vi.mock('@/features/scoring/autoPassChecker', () => ({
  checkAutoPass: (...args: unknown[]) => mockCheckAutoPass(...args),
}))

vi.mock('@/features/scoring/penaltyWeightLoader', () => ({
  loadPenaltyWeights: (...args: unknown[]) => mockLoadPenaltyWeights(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => 'sql-expr'),
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    wordCount: 'word_count',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))
vi.mock('@/db/schema/findings', () => ({
  findings: {
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    detectedByLayer: 'detected_by_layer',
    severity: 'severity',
    status: 'status',
    segmentCount: 'segment_count',
  },
}))
vi.mock('@/db/schema/scores', () => ({
  scores: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    mqmScore: 'mqm_score',
    status: 'status',
    layerCompleted: 'layer_completed',
    totalWords: 'total_words',
    criticalCount: 'critical_count',
    majorCount: 'major_count',
    minorCount: 'minor_count',
    npt: 'npt',
    autoPassRationale: 'auto_pass_rationale',
    calculatedAt: 'calculated_at',
    createdAt: 'created_at',
  },
}))
vi.mock('@/db/schema/userRoles', () => ({
  userRoles: { tenantId: 'tenant_id', role: 'role', userId: 'user_id' },
}))
vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    tenantId: 'tenant_id',
    type: 'type',
    metadata: 'metadata',
    id: 'id',
  },
}))

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

const mockSegments = [
  { wordCount: 500, sourceLang: 'en-US', targetLang: 'th-TH' },
  { wordCount: 500, sourceLang: 'en-US', targetLang: 'th-TH' },
]

const mockScoreResult = {
  mqmScore: 85,
  npt: 15,
  criticalCount: 0,
  majorCount: 3,
  minorCount: 0,
  totalWords: 1000,
  status: 'calculated' as const,
}

const mockAutoPassNotEligible = {
  eligible: false as const,
  rationale: 'Score 85 below configured threshold 95',
  isNewPair: false,
  fileCount: 60,
}

const mockAutoPassEligible = {
  eligible: true as const,
  rationale: 'Score 96 >= configured threshold 95 with no critical findings',
  isNewPair: false,
  fileCount: 60,
}

const mockNewScore = {
  id: faker.string.uuid(),
  fileId: VALID_FILE_ID,
  projectId: VALID_PROJECT_ID,
  tenantId: VALID_TENANT_ID,
  mqmScore: 85,
  npt: 15,
  totalWords: 1000,
  criticalCount: 0,
  majorCount: 3,
  minorCount: 0,
  status: 'calculated',
  autoPassRationale: null,
  layerCompleted: 'L1',
  calculatedAt: new Date(),
  createdAt: new Date(),
}

describe('scoreFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    mockCalculateMqmScore.mockReturnValue(mockScoreResult)
    mockCheckAutoPass.mockResolvedValue(mockAutoPassNotEligible)
    mockLoadPenaltyWeights.mockResolvedValue({ critical: 25, major: 5, minor: 1 })
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  // ── P0: Core scoring flow ──

  it('should throw NonRetriableError when file has no segments', async () => {
    // Empty segments query — parser produced no segments for a valid file
    dbState.returnValues = [[]]

    const { scoreFile } = await import('./scoreFile')
    await expect(
      scoreFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/No segments found/)
  })

  it('should calculate MQM score and persist', async () => {
    // 0: segments, 1: findings, 2: prev score in tx, 3: delete in tx, 4: insert.returning
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.mqmScore).toBe(85)
    expect(result.scoreId).toBeDefined()
  })

  it('should delete existing score before inserting (idempotent)', async () => {
    const previousScore = { ...mockNewScore, mqmScore: 70 }
    // prev score exists → delete → insert new
    dbState.returnValues = [mockSegments, [], [previousScore], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.mqmScore).toBe(85)
  })

  it('should load penalty weights for tenant', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockLoadPenaltyWeights).toHaveBeenCalledWith(VALID_TENANT_ID)
  })

  it('should include withTenant on all queries', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(vi.mocked(withTenant).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('should include eq(findings.projectId, projectId) filter', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { eq } = await import('drizzle-orm')
    const eqMock = eq as ReturnType<typeof vi.fn>
    // Verify projectId filter on findings query (defense-in-depth)
    const projectIdCalls = eqMock.mock.calls.filter(
      (call: unknown[]) => call[1] === VALID_PROJECT_ID,
    )
    expect(projectIdCalls.length).toBeGreaterThanOrEqual(1)
  })

  // ── P1: Integration with scoring functions ──

  it('should call calculateMqmScore with correct args', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCalculateMqmScore).toHaveBeenCalledWith(
      expect.any(Array), // findings cast
      1000, // totalWords = 500 + 500
      expect.objectContaining({ critical: 25, major: 5, minor: 1 }),
    )
  })

  it('should call checkAutoPass with correct args', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCheckAutoPass).toHaveBeenCalledWith(
      expect.objectContaining({
        mqmScore: 85,
        criticalCount: 0,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        sourceLang: 'en-US',
        targetLang: 'th-TH',
      }),
    )
  })

  it('should set status to auto_passed when eligible', async () => {
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)
    const autoPassedScore = {
      ...mockNewScore,
      status: 'auto_passed',
      autoPassRationale: mockAutoPassEligible.rationale,
    }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoPassedScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.status).toBe('auto_passed')
    expect(result.autoPassRationale).toBe(mockAutoPassEligible.rationale)
    // M3: assert INSERT.values() was called with status: 'auto_passed' (not just the returned row)
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ status: 'auto_passed' }),
    )
  })

  // ── H1: INSERT returning guard ──

  it('should throw when score INSERT returns empty array', async () => {
    // Slot 4 returns [] → inserted = undefined → guard throws
    // 0: segments, 1: findings, 2: prev score tx, 3: delete tx, 4: insert.returning (EMPTY)
    dbState.returnValues = [mockSegments, [], [undefined], [], []]

    const { scoreFile } = await import('./scoreFile')
    await expect(
      scoreFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    ).rejects.toThrow(/Score insert returned no rows/)
  })

  it('should write audit log with score data (non-fatal)', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'score',
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
        action: expect.stringContaining('score.'),
        newValue: expect.objectContaining({
          mqmScore: expect.any(Number),
        }),
      }),
    )
  })

  it('should write audit log with action score.calculated when not auto-passed', async () => {
    mockCheckAutoPass.mockResolvedValue(mockAutoPassNotEligible)
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'score.calculated' }),
    )
  })

  it('should write audit log with action score.auto_passed when auto-passed', async () => {
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)
    const autoPassedScore = {
      ...mockNewScore,
      status: 'auto_passed',
      autoPassRationale: mockAutoPassEligible.rationale,
    }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoPassedScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'score.auto_passed' }),
    )
  })

  it('should not fail if audit log write fails', async () => {
    mockWriteAuditLog.mockRejectedValue(new Error('audit DB down'))
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    // Should NOT throw
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.scoreId).toBeDefined()
  })

  it('should fire graduation notification when file 51', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50, // fileCount=50 means this is file 51 (first eligible)
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    // 0: segments, 1: findings, 2: prev score tx, 3: delete tx, 4: insert.returning
    // 5: dedup check, 6: admin users, 7: notification insert
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [autoScore],
      [],
      [{ userId: 'admin-1' }],
      [],
    ]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.status).toBe('auto_passed')
    // Graduation notification path consumed all 8 DB values
    expect(dbState.callIndex).toBe(8)
  })

  it('should not fire notification when file < 51', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: false,
      rationale: 'New language pair: mandatory manual review (file 30/50)',
      isNewPair: true,
      fileCount: 30,
    })
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // Only 5 DB calls — notification path NOT triggered
    expect(dbState.callIndex).toBe(5)
  })

  it('should not fire notification when fileCount is 49 (boundary below threshold)', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Auto-pass',
      isNewPair: true,
      fileCount: 49,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // fileCount=49 !== NEW_PAIR_FILE_THRESHOLD(50) → notification NOT triggered
    expect(dbState.callIndex).toBe(5)
  })

  it('should not fire notification when fileCount is 51 (boundary above threshold)', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Auto-pass',
      isNewPair: true,
      fileCount: 51,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // fileCount=51 !== NEW_PAIR_FILE_THRESHOLD(50) → notification NOT triggered
    expect(dbState.callIndex).toBe(5)
  })

  // ── P2: Edge cases ──

  it('should handle zero findings', async () => {
    mockCalculateMqmScore.mockReturnValue({
      mqmScore: 100,
      npt: 0,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      totalWords: 1000,
      status: 'calculated' as const,
    })
    const perfectScore = { ...mockNewScore, mqmScore: 100, npt: 0, majorCount: 0, minorCount: 0 }
    dbState.returnValues = [mockSegments, [], [undefined], [], [perfectScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.mqmScore).toBe(100)
  })

  it('should round mqmScore to 2 decimal places', async () => {
    mockCalculateMqmScore.mockReturnValue({
      mqmScore: 85.67,
      npt: 14.33,
      criticalCount: 0,
      majorCount: 2,
      minorCount: 1,
      totalWords: 1000,
      status: 'calculated' as const,
    })
    const preciseScore = { ...mockNewScore, mqmScore: 85.67, npt: 14.33 }
    dbState.returnValues = [mockSegments, [], [undefined], [], [preciseScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // MQM score should be rounded to 2 decimal places
    const decimals = result.mqmScore.toString().split('.')[1]
    expect(decimals ? decimals.length : 0).toBeLessThanOrEqual(2)
  })

  it('should return ScoreFileResult with all fields', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result).toMatchObject({
      scoreId: expect.any(String),
      fileId: VALID_FILE_ID,
      mqmScore: expect.any(Number),
      npt: expect.any(Number),
      totalWords: expect.any(Number),
      criticalCount: expect.any(Number),
      majorCount: expect.any(Number),
      minorCount: expect.any(Number),
      status: expect.stringMatching(/^(calculated|na|auto_passed)$/),
      autoPassRationale: expect.toSatisfy((v: unknown) => v === null || typeof v === 'string'),
    })
  })

  // ── ATDD P0: layerFilter refactor (Story 3.0 AC3) ──

  it('should query ALL findings when layerFilter is undefined', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      // No layerFilter — should query all findings regardless of layer
    })

    // Verify findings query was actually executed (callIndex advanced past segments + findings)
    expect(dbState.callIndex).toBeGreaterThanOrEqual(2)

    const { eq } = await import('drizzle-orm')
    const eqMock = eq as ReturnType<typeof vi.fn>
    // Should NOT have eq(detectedByLayer, 'L1') when layerFilter is undefined
    const layerFilterCalls = eqMock.mock.calls.filter(
      (call: unknown[]) => call[0] === 'detected_by_layer',
    )
    expect(layerFilterCalls.length).toBe(0)
  })

  it('should query only L1 findings when layerFilter is L1', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      layerFilter: 'L1',
    })

    const { eq } = await import('drizzle-orm')
    const eqMock = eq as ReturnType<typeof vi.fn>
    // Should have eq(detectedByLayer, 'L1') when layerFilter is 'L1'
    const layerFilterCalls = eqMock.mock.calls.filter(
      (call: unknown[]) => call[0] === 'detected_by_layer' && call[1] === 'L1',
    )
    expect(layerFilterCalls.length).toBe(1)
  })

  it('should read existing layerCompleted from score row', async () => {
    const previousScore = { ...mockNewScore, layerCompleted: 'L1L2' }
    dbState.returnValues = [
      mockSegments,
      [],
      [previousScore],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // Verify the INSERT values include preserved layerCompleted
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  it('should preserve layerCompleted value (not hardcode L1)', async () => {
    const previousScore = { ...mockNewScore, layerCompleted: 'L1L2L3' }
    dbState.returnValues = [
      mockSegments,
      [],
      [previousScore],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2L3' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // Should preserve L1L2L3, not hardcode L1
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2L3' }),
    )
  })

  it('should maintain backward compatibility with existing callers', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    // Call without layerFilter (existing behavior) — should not throw
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.mqmScore).toBe(85)
    expect(result.scoreId).toBeDefined()
  })

  it('should handle recalculation with 0 contributing findings (score=100)', async () => {
    mockCalculateMqmScore.mockReturnValue({
      mqmScore: 100,
      npt: 0,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      totalWords: 1000,
      status: 'calculated' as const,
    })
    const perfectScore = { ...mockNewScore, mqmScore: 100, npt: 0, majorCount: 0, minorCount: 0 }
    dbState.returnValues = [mockSegments, [], [undefined], [], [perfectScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result.mqmScore).toBe(100)
  })
})
