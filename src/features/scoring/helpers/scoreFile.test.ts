import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

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
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
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

  it('should return null when file has no segments (deleted file race condition)', async () => {
    // Empty segments query — file may have been deleted between event trigger and score calc
    dbState.returnValues = [[]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })
    expect(result).toBeNull()
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

    expect(result!.mqmScore).toBe(85)
    expect(result!.scoreId).toBeDefined()
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

    expect(result!.mqmScore).toBe(85)
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

    expect(result!.status).toBe('auto_passed')
    expect(result!.autoPassRationale).toBe(mockAutoPassEligible.rationale)
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

    expect(result!.scoreId).toBeDefined()
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

    expect(result!.status).toBe('auto_passed')
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
    // Provide 8 slots — if notification guard breaks, extra DB calls will push callIndex > 5
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
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // fileCount=49 !== NEW_PAIR_FILE_THRESHOLD(50) → notification NOT triggered
    expect(dbState.callIndex).toBe(5)
  })

  it('should fire notification when fileCount is 51 (CR-H3: >= threshold, dedup guard prevents duplicates)', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Auto-pass',
      isNewPair: true,
      fileCount: 51,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    // CR-H3: fileCount >= 50 → notification fires (dedup guard handles idempotency)
    // Provide slots for: segments, findings, tx(prev, delete, insert), dedup-check, admins, insert-notif
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [autoScore],
      [], // dedup check: no existing notification
      [{ userId: 'admin-1' }],
      [], // notification insert
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // fileCount=51 >= 50 → notification triggered (callIndex > 5 = DB calls for notification)
    expect(dbState.callIndex).toBeGreaterThan(5)
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

    expect(result!.mqmScore).toBe(100)
  })

  it('should pass through mqmScore from calculator without modification', async () => {
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

    // scoreFile passes through calculator result — DB numeric(5,2) handles rounding at persist layer
    expect(result!.mqmScore).toBe(85.67)
    expect(result!.npt).toBe(14.33)
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

    expect(result!).toMatchObject({
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

  // ── ATDD P0: layerCompleted override (Story 3.2b AC4, FM-1) ──

  it('[P0] should use input.layerCompleted=L1L2 over prev layerCompleted=L1', async () => {
    const previousScore = { ...mockNewScore, layerCompleted: 'L1' }
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
      layerCompleted: 'L1L2',
    })

    // Assert: INSERT values must contain layerCompleted: 'L1L2' from input,
    // NOT 'L1' from prev score
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  it('[P0] should fall back to prev.layerCompleted when input.layerCompleted is undefined', async () => {
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
      // No layerCompleted — verify fallback chain
    })

    // Assert: INSERT values must contain layerCompleted: 'L1L2' from prev score
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  it('[P0] should use input.layerCompleted=L1L2L3 over prev layerCompleted=L1L2', async () => {
    const previousScore = { ...mockNewScore, layerCompleted: 'L1L2' }
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
      layerCompleted: 'L1L2L3',
    })

    // Assert: INSERT values must contain layerCompleted: 'L1L2L3' from input,
    // NOT 'L1L2' from prev score
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2L3' }),
    )
  })

  it('[P0] should use input.layerCompleted=L1L2 when prev score is undefined (first-ever score)', async () => {
    // No previous score: slot 2 returns [undefined] (destructures to prev = undefined)
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      layerCompleted: 'L1L2',
    })

    // Assert: override 'L1L2' used even when prev is undefined
    // Tests the prev?.layerCompleted optional chaining path
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  it('[P0] should fall back to L1 when override, prev, and layerFilter are all undefined', async () => {
    // No previous score: slot 2 returns [undefined] (destructures to prev = undefined)
    // No layerCompleted override, no layerFilter → final fallback: 'L1'
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      // No layerCompleted, no layerFilter — exercises the ?? 'L1' final fallback
    })

    // Assert: INSERT values must contain layerCompleted: 'L1' from final fallback
    expect(dbState.valuesCaptures).toContainEqual(expect.objectContaining({ layerCompleted: 'L1' }))
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

    expect(result!.mqmScore).toBe(100)
  })

  // ── TA: Coverage Gap Tests ──

  // B2 [P1]: single segment — rows[0]! access + totalWords from 1 segment
  it('[P1] should handle single segment file (boundary: 1 row)', async () => {
    const singleSegment = [{ wordCount: 200, sourceLang: 'en-US', targetLang: 'ja-JP' }]
    dbState.returnValues = [singleSegment, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCalculateMqmScore).toHaveBeenCalledWith(expect.any(Array), 200, expect.any(Object))
    expect(result!.scoreId).toBeDefined()
  })

  // B3 [P2]: totalWords=0 — all segments have wordCount=0
  it('[P2] should pass totalWords=0 to calculator when all segments have zero words', async () => {
    const zeroWordSegments = [
      { wordCount: 0, sourceLang: 'en-US', targetLang: 'th-TH' },
      { wordCount: 0, sourceLang: 'en-US', targetLang: 'th-TH' },
    ]
    dbState.returnValues = [zeroWordSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCalculateMqmScore).toHaveBeenCalledWith(expect.any(Array), 0, expect.any(Object))
  })

  // B8 [P2]: exactly 1 finding (boundary between 0 and many)
  it('[P2] should handle exactly 1 finding', async () => {
    const oneFinding = [{ severity: 'major', status: 'open', segmentCount: 1 }]
    dbState.returnValues = [mockSegments, oneFinding, [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCalculateMqmScore).toHaveBeenCalledWith(oneFinding, 1000, expect.any(Object))
    expect(result!.scoreId).toBeDefined()
  })

  // F14 [P1]: scoreStatus='partial' skips auto-pass entirely
  it('[P1] should skip checkAutoPass when scoreStatus is partial', async () => {
    const partialScore = { ...mockNewScore, status: 'partial', autoPassRationale: null }
    dbState.returnValues = [mockSegments, [], [undefined], [], [partialScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      scoreStatus: 'partial',
    })

    expect(result!.status).toBe('partial')
    expect(mockCheckAutoPass).not.toHaveBeenCalled()
  })

  // F15 [P1]: scoreStatus='partial' → audit action = 'score.partial'
  it('[P1] should write audit log with action score.partial when scoreStatus is partial', async () => {
    const partialScore = { ...mockNewScore, status: 'partial', autoPassRationale: null }
    dbState.returnValues = [mockSegments, [], [undefined], [], [partialScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      scoreStatus: 'partial',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'score.partial' }),
    )
  })

  // F19 [P1]: layerCompleted falls back to layerFilter (position 3 in chain)
  it('[P1] should map layerFilter to valid LayerCompleted when override and prev are both undefined (CR-H1)', async () => {
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [{ ...mockNewScore, layerCompleted: 'L1L2' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      layerFilter: 'L2',
    })

    // CR-H1: layerFilter='L2' maps to LayerCompleted='L1L2' (not raw 'L2')
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ layerCompleted: 'L1L2' }),
    )
  })

  // F16 [P2]: graduation dedup guard prevents duplicate notification
  it('[P2] should skip graduation insert when dedup check finds existing notification', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [autoScore],
      [{ id: 'existing-notif' }],
    ]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result!.status).toBe('auto_passed')
    expect(dbState.callIndex).toBe(6)
  })

  // F17 [P2]: no admin users → skip notification insert
  it('[P2] should skip graduation insert when no admin users found', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoScore], [], []]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result!.status).toBe('auto_passed')
    expect(dbState.callIndex).toBe(7)
  })

  // F18 [P2]: graduation notification failure is non-fatal
  it('[P2] should not fail when graduation notification throws', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoScore]]
    dbState.throwAtCallIndex = 5

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result!.status).toBe('auto_passed')
    expect(result!.scoreId).toBeDefined()
  })

  // Gap #6 [P2]: status='na' overrides auto-pass eligible + autoPassRationale null
  it('[P2] should set status=na even when autoPass returns eligible', async () => {
    mockCalculateMqmScore.mockReturnValue({
      mqmScore: 100,
      npt: 0,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      totalWords: 1000,
      status: 'na' as const,
    })
    // autoPass says eligible — but status='na' should take priority
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)

    const naScore = { ...mockNewScore, status: 'na', autoPassRationale: null }
    dbState.returnValues = [mockSegments, [], [undefined], [], [naScore]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // status='na' overrides auto-pass eligible
    expect(result!.status).toBe('na')
    // autoPassRationale must be null when status is not 'auto_passed'
    expect(result!.autoPassRationale).toBeNull()
    // checkAutoPass must NOT be called when status='na' (S5 fix: skip auto-pass for totalWords=0)
    expect(mockCheckAutoPass).not.toHaveBeenCalled()
    // Verify INSERT values
    expect(dbState.valuesCaptures).toContainEqual(
      expect.objectContaining({ status: 'na', autoPassRationale: null }),
    )
  })

  // -- TA: Coverage Gap Tests (Story 2.5) --

  // T15 [P2] FM-37: Mixed language pairs in segments — uses first segment's lang pair
  it('[P2] should use first segment language pair when segments have mixed langs', async () => {
    const mixedSegments = [
      { wordCount: 500, sourceLang: 'en-US', targetLang: 'th-TH' },
      { wordCount: 500, sourceLang: 'en-US', targetLang: 'ja-JP' }, // different target
    ]
    dbState.returnValues = [mixedSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // checkAutoPass should be called with first segment's lang pair
    expect(mockCheckAutoPass).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLang: 'en-US',
        targetLang: 'th-TH', // first segment's targetLang, not 'ja-JP'
      }),
    )
  })

  // T16 [P2] PM-B3: Graceful null return on no segments (race condition: file deleted)
  it('[P2] should return null (not throw) when no segments — file may have been deleted', async () => {
    dbState.returnValues = [[]]

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(result).toBeNull()
  })

  // T17 [P2] PM-C1: checkAutoPass receives correct language pair from segments
  it('[P2] should pass segment language pair to checkAutoPass for auto-pass decision', async () => {
    // Language pair consistency: segments → checkAutoPass → graduation notification
    // Verifies the sourceLang/targetLang from segments[0] reaches checkAutoPass correctly
    const customSegments = [
      { wordCount: 300, sourceLang: 'ja-JP', targetLang: 'ko-KR' },
      { wordCount: 200, sourceLang: 'ja-JP', targetLang: 'ko-KR' },
    ]
    dbState.returnValues = [customSegments, [], [undefined], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    expect(mockCheckAutoPass).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLang: 'ja-JP',
        targetLang: 'ko-KR',
      }),
    )
  })

  // T20 [P3] FM-38: Previous score with different status — audit captures status transition
  it('[P3] should include previous score status in audit oldValue on re-score', async () => {
    const previousScore = { ...mockNewScore, mqmScore: 70, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [previousScore], [], [mockNewScore]]

    const { scoreFile } = await import('./scoreFile')
    await scoreFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // Audit log should capture the status transition (auto_passed → calculated)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: expect.objectContaining({
          mqmScore: 70,
          status: 'auto_passed',
        }),
        newValue: expect.objectContaining({
          mqmScore: 85,
          status: 'calculated',
        }),
      }),
    )
  })
})
