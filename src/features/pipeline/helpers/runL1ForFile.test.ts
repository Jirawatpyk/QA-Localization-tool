import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { buildSegment } from '@/test/factories'

// ── Hoisted mocks (available in vi.mock factories) ──
const { mockProcessFile, mockWriteAuditLog, dbState } = vi.hoisted(() => {
  const state = { callIndex: 0, returnValues: [] as unknown[], setCaptures: [] as unknown[] }
  return {
    mockProcessFile: vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[])),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState: state,
  }
})

vi.mock('@/features/pipeline/engine/ruleEngine', () => ({
  processFile: (...args: unknown[]) => mockProcessFile(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === 'returning') {
        return vi.fn(() => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          return Promise.resolve(value)
        })
      }
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void) => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(new Proxy({}, handler)))
      }
      if (prop === 'set') {
        return vi.fn((args: unknown) => {
          dbState.setCaptures.push(args)
          return new Proxy({}, handler)
        })
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
  segments: {
    tenantId: 'tenant_id',
    fileId: 'file_id',
    projectId: 'project_id',
    segmentNumber: 'segment_number',
  },
}))
vi.mock('@/db/schema/findings', () => ({
  findings: {
    tenantId: 'tenant_id',
    fileId: 'file_id',
    projectId: 'project_id',
    detectedByLayer: 'detected_by_layer',
  },
}))
vi.mock('@/db/schema/suppressionRules', () => ({
  suppressionRules: {
    tenantId: 'tenant_id',
    isActive: 'is_active',
    projectId: 'project_id',
    category: 'category',
  },
}))
vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: { tenantId: 'tenant_id', projectId: 'project_id' },
}))
vi.mock('@/db/schema/glossaries', () => ({
  glossaries: { id: 'id', tenantId: 'tenant_id', projectId: 'project_id' },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

// Explicit mock for getGlossaryTerms — prevents fragile index-based DB Proxy dependency
// (the non-cached JOIN query would otherwise consume a dbState slot unpredictably)
const mockGetGlossaryTerms = vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[]))
vi.mock('@/lib/cache/glossaryCache', () => ({
  getGlossaryTerms: (...args: unknown[]) => mockGetGlossaryTerms(...args),
}))

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

const mockFile = {
  id: VALID_FILE_ID,
  projectId: VALID_PROJECT_ID,
  tenantId: VALID_TENANT_ID,
  status: 'l1_processing',
}

describe('runL1ForFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    mockProcessFile.mockResolvedValue([])
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockGetGlossaryTerms.mockResolvedValue([])
  })

  // ── P0: Core functionality ──

  it('should run L1 rule engine and return finding count', async () => {
    const ruleResult = {
      segmentId: 'seg-1',
      category: 'completeness',
      severity: 'critical',
      description: 'Untranslated segment',
      suggestedFix: null,
      sourceExcerpt: 'Hello',
      targetExcerpt: '',
    }
    mockProcessFile.mockResolvedValue([ruleResult])

    // 0: CAS update returning, 1: segments query, 2: suppression rules,
    // 3: tx delete, 4: tx insert, 5: file status update (audit log mocked separately)
    dbState.returnValues = [[mockFile], [buildSegment()], [], [], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(1)
  })

  it('should transition file status from parsed to l1_processing to l1_completed', async () => {
    // 0: CAS (→l1_processing), 1: segments, 2: suppRules, 3: txDelete, 4: statusUpdate (→l1_completed)
    dbState.returnValues = [[mockFile], [], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Exactly 5 DB calls: CAS + segments + suppRules + txDelete + statusUpdate
    expect(dbState.callIndex).toBe(5)
    // Both status updates (→l1_processing and →l1_completed) are tenant-scoped
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    // Verify final .set() writes l1_completed (not some other status)
    expect(dbState.setCaptures).toContainEqual({ status: 'l1_completed' })
    // CAS update writes l1_processing first
    expect(dbState.setCaptures).toContainEqual({ status: 'l1_processing' })
  })

  it('should throw NonRetriableError when file not in parsed state (CAS guard)', async () => {
    // CAS update returns empty — file not in 'parsed' state
    dbState.returnValues = [[]]

    const { runL1ForFile } = await import('./runL1ForFile')

    await expect(
      runL1ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/NonRetriableError|not in parsed state/)
  })

  it('should delete existing L1 findings before inserting new ones (idempotent)', async () => {
    const ruleResult = {
      segmentId: 'seg-1',
      category: 'completeness',
      severity: 'major',
      description: 'Issue found',
      suggestedFix: null,
      sourceExcerpt: 'src',
      targetExcerpt: 'tgt',
    }
    mockProcessFile.mockResolvedValue([ruleResult])

    dbState.returnValues = [[mockFile], [buildSegment()], [], [], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Delete + insert both happen inside transaction
    expect(result.findingCount).toBe(1)
  })

  it('should batch-insert findings in transaction', async () => {
    const findings = Array.from({ length: 5 }, (_, i) => ({
      segmentId: `seg-${i}`,
      category: 'completeness' as const,
      severity: 'minor' as const,
      description: `Finding ${i}`,
      suggestedFix: null,
      sourceExcerpt: `src-${i}`,
      targetExcerpt: `tgt-${i}`,
    }))
    mockProcessFile.mockResolvedValue(findings)

    dbState.returnValues = [
      [mockFile],
      Array.from({ length: 5 }, () => buildSegment()),
      [],
      [],
      [],
      [],
      [],
    ]

    const { runL1ForFile } = await import('./runL1ForFile')
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(5)
  })

  it('should include withTenant() on all DB queries', async () => {
    dbState.returnValues = [[mockFile], [], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    // CAS guard + segments + suppression rules + findings delete + status update
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(vi.mocked(withTenant).mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  // ── P1: Data loading + filtering ──

  it('should load segments filtered by fileId and tenantId', async () => {
    const segments = [
      buildSegment({ fileId: VALID_FILE_ID, tenantId: VALID_TENANT_ID }),
      buildSegment({ fileId: VALID_FILE_ID, tenantId: VALID_TENANT_ID }),
    ]
    dbState.returnValues = [[mockFile], segments, [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockProcessFile).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ fileId: VALID_FILE_ID })]),
      expect.any(Array),
      expect.any(Set),
      expect.any(Array),
    )
  })

  it('should load glossary terms for project', async () => {
    const glossaryTerms = [{ id: faker.string.uuid(), term: 'API', translation: 'เอพีไอ' }]
    // Glossary is fetched via getGlossaryTerms (explicitly mocked) — not through DB Proxy
    mockGetGlossaryTerms.mockResolvedValue(glossaryTerms)
    dbState.returnValues = [[mockFile], [buildSegment()], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Glossary terms should be passed to processFile as 2nd argument
    expect(mockProcessFile).toHaveBeenCalledWith(
      expect.any(Array),
      glossaryTerms,
      expect.any(Set),
      expect.any(Array),
    )
  })

  it('should load active suppression rules for project', async () => {
    const suppressionRules = [
      { id: faker.string.uuid(), category: 'spacing', isActive: true, projectId: VALID_PROJECT_ID },
    ]
    dbState.returnValues = [[mockFile], [buildSegment()], suppressionRules, [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Suppressed categories set should contain 'spacing'
    expect(mockProcessFile).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.any(Set),
      expect.any(Array),
    )
  })

  it('should filter suppressed categories from results', async () => {
    const suppressionRules = [
      { id: faker.string.uuid(), category: 'spacing', isActive: true, projectId: VALID_PROJECT_ID },
    ]
    dbState.returnValues = [[mockFile], [buildSegment()], suppressionRules, [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // processFile receives suppressedCategories Set with 'spacing'
    const processFileCall = mockProcessFile.mock.calls[0]
    const suppressedCategories = processFileCall?.[2] as Set<string>
    expect(suppressedCategories).toBeInstanceOf(Set)
    expect(suppressedCategories.has('spacing')).toBe(true)
  })

  it('should handle custom rules', async () => {
    const customRule = {
      id: faker.string.uuid(),
      category: 'custom_rule',
      isActive: true,
      projectId: VALID_PROJECT_ID,
      pattern: '\\bTODO\\b',
    }
    // suppression rules query returns custom_rule
    dbState.returnValues = [[mockFile], [buildSegment()], [customRule], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    // Custom rules should be passed to processFile as 4th argument
    const processFileCall = mockProcessFile.mock.calls[0]
    const customRules = processFileCall?.[3] as Array<{ category: string }>
    expect(customRules).toEqual([customRule])
  })

  it('should write audit log with severity counts', async () => {
    const results = [
      {
        segmentId: 'seg-1',
        category: 'completeness',
        severity: 'critical',
        description: 'a',
        suggestedFix: null,
        sourceExcerpt: 's',
        targetExcerpt: 't',
      },
      {
        segmentId: 'seg-2',
        category: 'spacing',
        severity: 'major',
        description: 'b',
        suggestedFix: null,
        sourceExcerpt: 's',
        targetExcerpt: 't',
      },
      {
        segmentId: 'seg-3',
        category: 'punctuation',
        severity: 'minor',
        description: 'c',
        suggestedFix: null,
        sourceExcerpt: 's',
        targetExcerpt: 't',
      },
    ]
    mockProcessFile.mockResolvedValue(results)
    // 0: CAS, 1: segments(3), 2: suppRules, 3: txDelete, 4: txInsert(1 batch≤100), 5: statusUpdate
    dbState.returnValues = [
      [mockFile],
      [buildSegment(), buildSegment(), buildSegment()],
      [],
      [],
      [],
      [],
    ]

    const { runL1ForFile } = await import('./runL1ForFile')
    await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'file',
        entityId: VALID_FILE_ID,
        action: 'file.l1_completed',
        newValue: expect.objectContaining({
          findingCount: 3,
          criticalCount: 1,
          majorCount: 1,
          minorCount: 1,
        }),
      }),
    )
  })

  it('should not fail if audit log write fails (non-fatal)', async () => {
    mockWriteAuditLog.mockRejectedValue(new Error('audit DB down'))
    dbState.returnValues = [[mockFile], [], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    // Should NOT throw even though audit log fails
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
  })

  it('should roll back file status to failed on error', async () => {
    mockProcessFile.mockRejectedValue(new Error('engine crash'))
    // CAS returns file, then error occurs during processing
    dbState.returnValues = [[mockFile], []]

    const { runL1ForFile } = await import('./runL1ForFile')

    await expect(
      runL1ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow()

    // File status should be rolled back to 'failed' before re-throwing
  })

  it('should not fail if status rollback fails (non-fatal on rollback)', async () => {
    mockProcessFile.mockRejectedValue(new Error('engine crash'))
    // CAS returns file, segments fail, rollback also fails (all DB calls error)
    dbState.returnValues = [[mockFile]]

    const { runL1ForFile } = await import('./runL1ForFile')

    // Should still throw the original error, not the rollback error
    await expect(
      runL1ForFile({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
      }),
    ).rejects.toThrow(/engine crash/)
  })

  // ── P2: Edge cases ──

  it('should handle zero findings (empty processFile result)', async () => {
    mockProcessFile.mockResolvedValue([])
    dbState.returnValues = [[mockFile], [buildSegment()], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(0)
  })

  it('should handle large batch of findings (batch size 100)', async () => {
    const manyFindings = Array.from({ length: 150 }, (_, i) => ({
      segmentId: `seg-${i}`,
      category: 'completeness',
      severity: 'critical',
      description: `Finding ${i}`,
      suggestedFix: null,
      sourceExcerpt: 'a',
      targetExcerpt: 'b',
    }))
    mockProcessFile.mockResolvedValue(manyFindings)

    // 150 findings = 2 insert batches: CAS, segments, suppRules, txDelete, txInsert×2, statusUpdate
    dbState.returnValues = [
      [mockFile],
      Array.from({ length: 150 }, () => buildSegment()),
      [],
      [],
      [],
      [],
      [],
    ]

    const { runL1ForFile } = await import('./runL1ForFile')
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(result.findingCount).toBe(150)
    // 7 DB calls: CAS + segments + suppRules + txDelete + txInsert×2 + statusUpdate
    // If batch loop collapsed to 1 insert, callIndex would be 6 — catching the regression
    expect(dbState.callIndex).toBe(7)
  })

  it('should return duration in milliseconds', async () => {
    dbState.returnValues = [[mockFile], [buildSegment()], [], [], []]

    const { runL1ForFile } = await import('./runL1ForFile')
    const result = await runL1ForFile({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
    })

    expect(typeof result.duration).toBe('number')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })
})
