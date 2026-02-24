import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only (throws in jsdom)
vi.mock('server-only', () => ({}))

// ── Hoisted mocks (available in vi.mock factories) ──
const { mockRequireRole, mockWriteAuditLog, mockGetCachedGlossaryTerms, mockProcessFile, dbState } =
  vi.hoisted(() => {
    const state = { callIndex: 0, returnValues: [] as unknown[] }
    return {
      mockRequireRole: vi.fn(),
      mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
      mockGetCachedGlossaryTerms: vi.fn((..._args: unknown[]) => Promise.resolve([])),
      mockProcessFile: vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[])),
      dbState: state,
    }
  })

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/lib/cache/glossaryCache', () => ({
  getCachedGlossaryTerms: (...args: unknown[]) => mockGetCachedGlossaryTerms(...args),
}))

vi.mock('@/features/pipeline/engine/ruleEngine', () => ({
  processFile: (...args: unknown[]) => mockProcessFile(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      // Terminal methods that return native Promises (consume from returnValues)
      if (prop === 'returning' || prop === 'orderBy') {
        return vi.fn(() => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          return Promise.resolve(value)
        })
      }
      // Thenable: when `await` is used on a Proxy (no explicit terminal method)
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void) => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'values') {
        return vi.fn(() => Promise.resolve())
      }
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<void>) => fn(new Proxy({}, handler)))
      }
      return vi.fn(() => new Proxy({}, handler))
    },
  }
  return { db: new Proxy({}, handler) }
})

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: { id: 'id', tenantId: 'tenant_id', status: 'status', projectId: 'project_id' },
}))
vi.mock('@/db/schema/segments', () => ({
  segments: { tenantId: 'tenant_id', fileId: 'file_id', segmentNumber: 'segment_number' },
}))
vi.mock('@/db/schema/findings', () => ({ findings: {} }))
vi.mock('@/db/schema/suppressionRules', () => ({
  suppressionRules: {
    tenantId: 'tenant_id',
    isActive: 'is_active',
    projectId: 'project_id',
    category: 'category',
  },
}))

import { runRuleEngine } from './runRuleEngine.action'

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const mockUser = {
  id: 'user-123',
  tenantId: 'tenant-123',
  role: 'qa_reviewer',
  email: 'test@test.com',
}

const mockFile = {
  id: VALID_UUID,
  projectId: 'project-123',
  tenantId: 'tenant-123',
  status: 'l1_processing',
}

describe('runRuleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    mockRequireRole.mockResolvedValue(mockUser)
    mockProcessFile.mockResolvedValue([])
    mockGetCachedGlossaryTerms.mockResolvedValue([])
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  it('should return INVALID_INPUT for invalid fileId', async () => {
    const result = await runRuleEngine({ fileId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('should return FORBIDDEN when user lacks permission', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should return CONFLICT when CAS guard fails', async () => {
    dbState.returnValues = [[]] // CAS returning() → empty
    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('CONFLICT')
  })

  it('should call requireRole with qa_reviewer and write', async () => {
    dbState.returnValues = [[]] // CAS fails → early return
    await runRuleEngine({ fileId: VALID_UUID })
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  it('should call processFile when CAS guard succeeds', async () => {
    // 0: CAS returning() → [file], 1: segments orderBy() → [],
    // 2: suppression rules .then() → [], 3: final status update .then() → []
    dbState.returnValues = [[mockFile], [], [], []]
    await runRuleEngine({ fileId: VALID_UUID })
    expect(mockProcessFile).toHaveBeenCalled()
  })

  it('should return findingCount in success result', async () => {
    dbState.returnValues = [[mockFile], [], [], []]
    mockProcessFile.mockResolvedValue([
      {
        segmentId: 'seg-1',
        category: 'completeness',
        severity: 'critical',
        description: 'test',
        suggestedFix: null,
        sourceExcerpt: 'a',
        targetExcerpt: 'b',
      },
    ])

    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.findingCount).toBe(1)
    expect(result.data.fileId).toBe(VALID_UUID)
    expect(typeof result.data.duration).toBe('number')
  })

  it('should write audit log on success', async () => {
    dbState.returnValues = [[mockFile], [], [], []]
    mockProcessFile.mockResolvedValue([
      {
        segmentId: 'seg-1',
        category: 'completeness',
        severity: 'critical',
        description: 'test',
        suggestedFix: null,
        sourceExcerpt: 'a',
        targetExcerpt: 'b',
      },
    ])

    await runRuleEngine({ fileId: VALID_UUID })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-123',
        userId: 'user-123',
        entityType: 'file',
        action: 'file.l1_completed',
      }),
    )
  })

  it('should return findingCount=0 for clean file', async () => {
    dbState.returnValues = [[mockFile], [], [], []]
    mockProcessFile.mockResolvedValue([])

    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.findingCount).toBe(0)
  })

  // ── C2: INTERNAL_ERROR catch-path tests ──

  it('should return INTERNAL_ERROR when processFile throws', async () => {
    // 0: CAS returning() → [file], 1: segments orderBy() → []
    dbState.returnValues = [[mockFile], []]
    mockProcessFile.mockRejectedValue(new Error('engine crash'))

    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
    expect(result.error).toBe('Rule engine processing failed')
  })

  it('should NOT call audit log when processFile throws', async () => {
    dbState.returnValues = [[mockFile], []]
    mockProcessFile.mockRejectedValue(new Error('engine crash'))

    await runRuleEngine({ fileId: VALID_UUID })
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  // ── H4: Batch insert >100 findings ──

  it('should handle >100 findings (batch insert)', async () => {
    dbState.returnValues = [[mockFile], [], [], []]
    const manyFindings = Array.from({ length: 150 }, (_, i) => ({
      segmentId: `seg-${i}`,
      category: 'completeness',
      severity: 'critical',
      description: `finding ${i}`,
      suggestedFix: null,
      sourceExcerpt: 'a',
      targetExcerpt: 'b',
    }))
    mockProcessFile.mockResolvedValue(manyFindings)

    const result = await runRuleEngine({ fileId: VALID_UUID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.findingCount).toBe(150)
  })
})
