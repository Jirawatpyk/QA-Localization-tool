import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only (throws in jsdom)
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, mockWriteAuditLog, mockInngestSend, dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    setCaptures: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }
  return {
    mockRequireRole: vi.fn(),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockInngestSend: vi.fn((..._args: unknown[]) => Promise.resolve()),
    dbState: state,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
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
            reject?.(new Error('Injected DB error'))
            return
          }
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
  inArray: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    projectId: 'project_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    processingMode: 'processing_mode',
  },
}))

const VALID_FILE_ID_1 = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_FILE_ID_2 = 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e'
const VALID_PROJECT_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f'

const mockUser = {
  id: faker.string.uuid(),
  tenantId: faker.string.uuid(),
  role: 'qa_reviewer',
  email: 'reviewer@test.com',
}

describe('startProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
    mockWriteAuditLog.mockResolvedValue(undefined)
    mockInngestSend.mockResolvedValue(undefined)
  })

  // ── P0: Core behavior ──

  it('should send pipeline.batch-started Inngest event on success', async () => {
    // 0: file validation query returns all files in parsed status
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
      {
        id: VALID_FILE_ID_2,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]

    const { startProcessing } = await import('./startProcessing.action')
    await startProcessing({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('pipeline.batch-started'),
        data: expect.objectContaining({
          fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
          projectId: VALID_PROJECT_ID,
          tenantId: mockUser.tenantId,
          mode: 'economy',
        }),
      }),
    )
  })

  it('should return ActionResult with batchId and fileCount', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.batchId).toBeDefined()
    expect(result.data.fileCount).toBe(1)
  })

  it('should require qa_reviewer write permission', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]

    const { startProcessing } = await import('./startProcessing.action')
    await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  it('should return FORBIDDEN when auth fails', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should validate all files belong to project and tenant', async () => {
    // File validation returns fewer files than requested → some files invalid
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    // Request 2 files but only 1 found in DB
    dbState.returnValues = [validFiles]

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  it('should reject if any file not in parsed status', async () => {
    const filesWithWrongStatus = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'uploaded',
      },
    ]
    dbState.returnValues = [filesWithWrongStatus]

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('CONFLICT')
  })

  // ── P1: Validation ──

  it('should validate input with Zod schema', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    // Valid input should succeed (assuming DB returns good data)
    expect(result.success).toBe(true)
  })

  it('should return INVALID_INPUT for empty fileIds', async () => {
    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('should return INVALID_INPUT for invalid UUID', async () => {
    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: ['not-a-uuid'],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('should persist mode to projects.processing_mode', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, [], []]

    const { startProcessing } = await import('./startProcessing.action')
    await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'thorough',
    })

    // DB should be updated with processing_mode:
    //   slot 0 — file validation SELECT (.then terminal)
    //   slot 1 — projects UPDATE for processingMode (.then terminal)
    expect(dbState.callIndex).toBe(2)
    // L3: Verify .set() was called with the correct processingMode value (not hardcoded)
    expect(dbState.setCaptures).toContainEqual({ processingMode: 'thorough' })
  })

  it('should return INVALID_INPUT when fileIds contains duplicates', async () => {
    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('should return CONFLICT when batch contains mixed statuses (some parsed, some already processing)', async () => {
    const mixedFiles = [
      { id: VALID_FILE_ID_1, status: 'parsed' },
      { id: VALID_FILE_ID_2, status: 'l1_processing' },
    ]
    dbState.returnValues = [mixedFiles]

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('CONFLICT')
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('should return INTERNAL_ERROR and NOT call inngest.send when db.update(projects) throws', async () => {
    const validFiles = [{ id: VALID_FILE_ID_1, status: 'parsed' }]
    dbState.returnValues = [validFiles] // slot 0: file validation resolves
    dbState.throwAtCallIndex = 1 // slot 1: projects update throws

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
    expect(mockInngestSend).not.toHaveBeenCalled()
    // M1: audit log must NOT be written when DB throws (no partial-success audit trail)
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('should return INTERNAL_ERROR when inngest.send throws', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]
    mockInngestSend.mockRejectedValue(new Error('Inngest service unavailable'))

    const { startProcessing } = await import('./startProcessing.action')
    const result = await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
  })

  it('should write audit log pipeline.started', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]

    const { startProcessing } = await import('./startProcessing.action')
    await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pipeline.started',
        tenantId: mockUser.tenantId,
        entityType: expect.stringMatching(/project|pipeline/),
        newValue: expect.objectContaining({
          mode: 'economy',
          fileCount: 1,
        }),
      }),
    )
  })

  // ── P2: Tenant isolation ──

  it('should include withTenant on file validation query', async () => {
    const validFiles = [
      {
        id: VALID_FILE_ID_1,
        projectId: VALID_PROJECT_ID,
        tenantId: mockUser.tenantId,
        status: 'parsed',
      },
    ]
    dbState.returnValues = [validFiles, []]

    const { startProcessing } = await import('./startProcessing.action')
    await startProcessing({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })
})
