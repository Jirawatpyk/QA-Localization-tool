import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only (throws in jsdom)
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockScoreFile, mockDbSelect } = vi.hoisted(() => {
  return {
    mockRequireRole: vi.fn(),
    mockScoreFile: vi.fn(),
    mockDbSelect: vi.fn(),
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: (...args: unknown[]) => mockScoreFile(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock db for file status guard (P-1 fix)
vi.mock('@/db/client', () => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() => {
      // Return value set by mockDbSelect
      return Promise.resolve(mockDbSelect())
    }),
  }
  return {
    db: {
      select: vi.fn().mockReturnValue(chain),
    },
  }
})

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn(),
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
  },
}))

import { calculateScore } from './calculateScore.action'

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

const mockUser = {
  id: 'user-uuid',
  tenantId: 'tenant-uuid',
  role: 'qa_reviewer',
  email: 'test@example.com',
}

const mockScoreResult = {
  scoreId: 'score-uuid',
  fileId: VALID_FILE_ID,
  mqmScore: 85,
  npt: 15,
  totalWords: 1000,
  criticalCount: 0,
  majorCount: 3,
  minorCount: 0,
  status: 'calculated' as const,
  autoPassRationale: null,
}

describe('calculateScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockUser)
    mockScoreFile.mockResolvedValue(mockScoreResult)
    // Default: file exists with terminal status (allows scoring)
    mockDbSelect.mockReturnValue([{ status: 'l1_completed' }])
  })

  // ── Input validation ──
  it('should return INVALID_INPUT for non-uuid fileId', async () => {
    const result = await calculateScore({ fileId: 'not-a-uuid', projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('should return INVALID_INPUT for non-uuid projectId', async () => {
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: 'bad-id' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  // ── Auth ──
  it('should return FORBIDDEN when user lacks permission', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should call requireRole with qa_reviewer and write', async () => {
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  // ── Delegation ──
  it('should call scoreFile with fileId, projectId, tenantId, userId', async () => {
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(mockScoreFile).toHaveBeenCalledWith({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
    })
  })

  // ── Success ──
  it('should return success with all AC#7 required fields', async () => {
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toMatchObject({
      scoreId: 'score-uuid',
      fileId: VALID_FILE_ID,
      mqmScore: 85,
      npt: 15,
      totalWords: 1000,
      criticalCount: 0,
      majorCount: 3,
      minorCount: 0,
      status: 'calculated',
      autoPassRationale: null,
    })
  })

  it('should return auto_passed status when scoreFile returns auto_passed', async () => {
    mockScoreFile.mockResolvedValue({
      ...mockScoreResult,
      status: 'auto_passed',
      autoPassRationale: 'Score 96 >= threshold',
    })
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('auto_passed')
    expect(result.data.autoPassRationale).toBe('Score 96 >= threshold')
  })

  // ── File status guard (P-1 fix) ──
  it('should return NOT_FOUND when file does not exist', async () => {
    mockDbSelect.mockReturnValue([])
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  it('should return CONFLICT when file is in active pipeline status', async () => {
    for (const activeStatus of ['parsing', 'l1_processing', 'l2_processing', 'l3_processing']) {
      mockDbSelect.mockReturnValue([{ status: activeStatus }])
      const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CONFLICT')
    }
  })

  it('should allow scoring when file is in terminal status', async () => {
    for (const terminalStatus of [
      'l1_completed',
      'l2_completed',
      'l3_completed',
      'ai_partial',
      'parsed',
    ]) {
      mockDbSelect.mockReturnValue([{ status: terminalStatus }])
      const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
      expect(result.success).toBe(true)
    }
  })

  // ── Error handling ──
  it('should return INTERNAL_ERROR when scoreFile throws', async () => {
    mockScoreFile.mockRejectedValue(new Error('DB error'))
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
    expect(result.error).toBe('Score calculation failed')
  })
})
