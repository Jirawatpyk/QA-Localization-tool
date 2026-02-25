/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockParseXbenchReport, mockCompareFindings, dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }
  return {
    mockRequireRole: vi.fn(),
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

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    category: 'category',
    severity: 'severity',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
    segmentId: 'segment_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
  },
}))

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

const mockUser = {
  id: faker.string.uuid(),
  tenantId: faker.string.uuid(),
  role: 'qa_reviewer',
  email: 'reviewer@test.com',
}

describe('compareWithXbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
    mockParseXbenchReport.mockResolvedValue({
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
    })
  })

  // ── P0: Validation ──

  it('[P0] should return VALIDATION_ERROR for invalid input', async () => {
    const { compareWithXbench } = await import('./compareWithXbench.action')
    const result = await compareWithXbench({ projectId: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('[P0] should return NOT_FOUND when project does not belong to tenant', async () => {
    dbState.returnValues = [
      [], // empty project result = not found
    ]

    const { compareWithXbench } = await import('./compareWithXbench.action')
    const result = await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  // ── P0: Tenant isolation ──

  it('[P0] should include withTenant on project ownership check', async () => {
    dbState.returnValues = [
      [{ id: VALID_PROJECT_ID }], // project found
      [
        {
          category: 'accuracy',
          severity: 'major',
          fileId: faker.string.uuid(),
          segmentId: faker.string.uuid(),
        },
      ], // tool findings
    ]

    const { compareWithXbench } = await import('./compareWithXbench.action')
    await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })

  // ── P1: Full flow ──

  it('[P1] should parse report, compare findings, and return structured result', async () => {
    dbState.returnValues = [
      [{ id: VALID_PROJECT_ID }], // project found
      [
        {
          sourceTextExcerpt: 'Test source',
          targetTextExcerpt: 'Test target',
          category: 'accuracy',
          severity: 'major',
          fileId: faker.string.uuid(),
          segmentId: faker.string.uuid(),
        },
      ], // tool findings
    ]

    const { compareWithXbench } = await import('./compareWithXbench.action')
    const result = await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveProperty('bothFound')
    expect(result.data).toHaveProperty('toolOnly')
    expect(result.data).toHaveProperty('xbenchOnly')
    expect(mockParseXbenchReport).toHaveBeenCalledTimes(1)
    expect(mockCompareFindings).toHaveBeenCalledTimes(1)
  })

  it('[P1] should return INVALID_INPUT when xlsx parsing fails', async () => {
    mockParseXbenchReport.mockRejectedValue(new Error('Bad file'))

    dbState.returnValues = [
      [{ id: VALID_PROJECT_ID }], // project found
    ]

    const { compareWithXbench } = await import('./compareWithXbench.action')
    const result = await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    expect(result.error).toContain('xlsx')
  })

  // ── L1: fileId propagation ──

  it('[P1] should pass fileId through to compareFindings when provided', async () => {
    const fileId = faker.string.uuid()

    dbState.returnValues = [
      [{ id: VALID_PROJECT_ID }], // project found
      [
        {
          sourceTextExcerpt: 'Test source',
          targetTextExcerpt: 'Test target',
          category: 'accuracy',
          severity: 'major',
          fileId,
          segmentId: faker.string.uuid(),
        },
      ], // tool findings
    ]

    const { compareWithXbench } = await import('./compareWithXbench.action')
    await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      fileId,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    // compareFindings should receive the fileId as third argument
    expect(mockCompareFindings).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), fileId)
  })

  // ── P2: Error handling ──

  it('[P2] should return INTERNAL_ERROR when requireRole throws (unauthorized)', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'))

    const { compareWithXbench } = await import('./compareWithXbench.action')
    const result = await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
  })

  it('[P2] should return INTERNAL_ERROR when DB query fails', async () => {
    dbState.throwAtCallIndex = 0

    const { compareWithXbench } = await import('./compareWithXbench.action')
    const result = await compareWithXbench({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
  })
})
