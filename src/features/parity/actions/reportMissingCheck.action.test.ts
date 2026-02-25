/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockWriteAuditLog, dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    valuesCaptures: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }
  return {
    mockRequireRole: vi.fn(),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState: state,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
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

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const mockUser = {
  id: faker.string.uuid(),
  tenantId: faker.string.uuid(),
  role: 'qa_reviewer',
  email: 'reviewer@test.com',
}

describe('reportMissingCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  // ── P0: Tenant isolation + audit ──

  it.skip('[P0] should include withTenant and write audit log', async () => {
    const reportId = faker.string.uuid()
    const trackingRef = 'MCR-20260225-abc123'
    dbState.returnValues = [
      [{ id: reportId, trackingReference: trackingRef }], // insert returning
    ]

    const { reportMissingCheck } = await import('./reportMissingCheck.action')
    await reportMissingCheck({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 42,
      expectedCategory: 'accuracy',
      expectedDescription: 'Number format inconsistency not detected',
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.stringContaining('missing_check'),
        tenantId: mockUser.tenantId,
      }),
    )
  })

  // ── P1: Success response ──

  it.skip('[P1] should return ActionResult with tracking reference on success', async () => {
    const reportId = faker.string.uuid()
    const trackingRef = 'MCR-20260225-a1b2c3'
    dbState.returnValues = [[{ id: reportId, trackingReference: trackingRef }]]

    const { reportMissingCheck } = await import('./reportMissingCheck.action')
    const result = await reportMissingCheck({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 10,
      expectedCategory: 'completeness',
      expectedDescription: 'Untranslated segment not caught by tool',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.trackingReference).toBeDefined()
    expect(typeof result.data.trackingReference).toBe('string')
  })

  it.skip('[P1] should generate tracking reference in format MCR-YYYYMMDD-6chars', async () => {
    const reportId = faker.string.uuid()
    dbState.returnValues = [[{ id: reportId, trackingReference: 'MCR-20260225-x1y2z3' }]]

    const { reportMissingCheck } = await import('./reportMissingCheck.action')
    const result = await reportMissingCheck({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 5,
      expectedCategory: 'terminology',
      expectedDescription: 'Glossary term mismatch not flagged',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    // Format: MCR-YYYYMMDD-6alphanumeric
    const refPattern = /^MCR-\d{8}-[a-zA-Z0-9]{6}$/
    expect(result.data.trackingReference).toMatch(refPattern)
  })

  // ── P2: Validation ──

  it.skip('[P2] should validate required fields and segmentNumber > 0 via Zod', async () => {
    const { reportMissingCheck } = await import('./reportMissingCheck.action')

    // segmentNumber = 0 should be invalid
    const result = await reportMissingCheck({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 0,
      expectedCategory: 'accuracy',
      expectedDescription: 'Missing check description',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })
})
