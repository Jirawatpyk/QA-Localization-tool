/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockWriteAuditLog, mockParseXbenchReport, mockCompareFindings, dbState } =
  vi.hoisted(() => {
    const state = {
      callIndex: 0,
      returnValues: [] as unknown[],
      valuesCaptures: [] as unknown[],
      throwAtCallIndex: null as number | null,
    }
    return {
      mockRequireRole: vi.fn(),
      mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
      mockParseXbenchReport: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          findings: [
            {
              sourceText: 'Test source',
              targetText: 'Test target',
              category: 'accuracy',
              severity: 'major',
              fileName: 'test.sdlxliff',
              segmentNumber: 1,
            },
          ],
          fileGroups: { 'test.sdlxliff': [{ category: 'accuracy', severity: 'major' }] },
        }),
      ),
      mockCompareFindings: vi.fn((..._args: unknown[]) => ({
        matched: [{ xbenchCategory: 'accuracy', toolCategory: 'accuracy', severity: 'major' }],
        xbenchOnly: [],
        toolOnly: [],
      })),
      dbState: state,
    }
  })

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/features/parity/helpers/xbenchReportParser', () => ({
  parseXbenchReport: (...args: unknown[]) => mockParseXbenchReport(...args),
}))

vi.mock('@/features/parity/helpers/parityComparator', () => ({
  compareFindings: (...args: unknown[]) => mockCompareFindings(...args),
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
        return (resolve?: (v: unknown) => void, reject?: (err: unknown) => void) => {
          if (dbState.throwAtCallIndex !== null && dbState.callIndex === dbState.throwAtCallIndex) {
            dbState.callIndex++
            reject?.(new Error('DB error'))
            return
          }
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'values') {
        return vi.fn((args: unknown) => {
          dbState.valuesCaptures.push(args)
          return new Proxy({}, handler)
        })
      }
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(new Proxy({}, handler)))
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
  sql: vi.fn(() => 'sql-expr'),
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    category: 'category',
    severity: 'severity',
    detectedByLayer: 'detected_by_layer',
  },
}))

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

const mockUser = {
  id: faker.string.uuid(),
  tenantId: faker.string.uuid(),
  role: 'qa_reviewer',
  email: 'reviewer@test.com',
}

describe('generateParityReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  // ── P0: Tenant isolation ──

  it.skip('[P0] should include withTenant on all queries', async () => {
    // Tool findings query + report insert should both use withTenant
    dbState.returnValues = [
      [{ category: 'accuracy', severity: 'major' }], // tool findings query
      [{ id: faker.string.uuid() }], // report insert returning
    ]

    const { generateParityReport } = await import('./generateParityReport.action')
    await generateParityReport({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: Buffer.from('mock-xlsx'),
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })

  // ── P1: Full flow ──

  it.skip('[P1] should parse xlsx, compare with tool findings, persist report and write audit log', async () => {
    const reportId = faker.string.uuid()
    dbState.returnValues = [
      [{ category: 'accuracy', severity: 'major', fileId: faker.string.uuid() }], // tool findings
      [{ id: reportId }], // report insert returning
    ]

    const { generateParityReport } = await import('./generateParityReport.action')
    const result = await generateParityReport({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: Buffer.from('mock-xlsx'),
    })

    // 1) parseXbenchReport called
    expect(mockParseXbenchReport).toHaveBeenCalledTimes(1)

    // 2) compareFindings called with parsed xbench + tool findings
    expect(mockCompareFindings).toHaveBeenCalledTimes(1)

    // 3) Report persisted
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.reportId).toBeDefined()

    // 4) Audit log written
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.stringContaining('parity'),
        tenantId: mockUser.tenantId,
      }),
    )
  })

  it.skip('[P1] should return ActionResult error for invalid xlsx', async () => {
    mockParseXbenchReport.mockRejectedValue(new Error('Invalid xlsx format'))

    const { generateParityReport } = await import('./generateParityReport.action')
    const result = await generateParityReport({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: Buffer.from('not-xlsx'),
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('xlsx')
  })

  it.skip('[P1] should store valid JSON in comparisonData that roundtrips correctly', async () => {
    const comparisonResult = {
      matched: [{ xbenchCategory: 'accuracy', toolCategory: 'accuracy', severity: 'major' }],
      xbenchOnly: [],
      toolOnly: [],
    }
    mockCompareFindings.mockReturnValue(comparisonResult)

    dbState.returnValues = [
      [{ category: 'accuracy', severity: 'major' }], // tool findings
      [{ id: faker.string.uuid() }], // report insert
    ]

    const { generateParityReport } = await import('./generateParityReport.action')
    await generateParityReport({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: Buffer.from('mock-xlsx'),
    })

    // Verify the values captured contain serializable JSON
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const insertedValues = dbState.valuesCaptures[0] as Record<string, unknown>
    // comparisonData should be valid JSON (roundtrip-safe)
    const comparisonData = insertedValues?.comparisonData
    if (typeof comparisonData === 'string') {
      expect(() => JSON.parse(comparisonData)).not.toThrow()
    } else if (typeof comparisonData === 'object') {
      expect(() => JSON.parse(JSON.stringify(comparisonData))).not.toThrow()
    }
  })
})
