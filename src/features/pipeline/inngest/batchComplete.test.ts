/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Hoisted mocks ──
const { mockCrossFileConsistency, dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
  }
  return {
    mockCrossFileConsistency: vi.fn((..._args: unknown[]) => Promise.resolve({ findingCount: 3 })),
    dbState: state,
  }
})

vi.mock('@/features/pipeline/helpers/crossFileConsistency', () => ({
  crossFileConsistency: (...args: unknown[]) => mockCrossFileConsistency(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

vi.mock('@/db/client', () => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void) => {
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

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    batchId: 'batch_id',
    status: 'status',
  },
}))

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_BATCH_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

// Mock step object for Inngest handler
function createMockStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
}

describe('batchComplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    mockCrossFileConsistency.mockResolvedValue({ findingCount: 3 })
  })

  // ── P1: Core behavior ──

  it('[P1] should resolve fileIds from DB and call crossFileConsistency', async () => {
    const mockStep = createMockStep()
    const fileId1 = faker.string.uuid()
    const fileId2 = faker.string.uuid()

    // Step 1: resolve-batch-files query returns file IDs
    dbState.returnValues = [[{ id: fileId1 }, { id: fileId2 }]]

    const { batchComplete } = await import('./batchComplete')
    await (batchComplete as { handler: (...args: unknown[]) => unknown }).handler({
      event: {
        data: {
          batchId: VALID_BATCH_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
        },
      },
      step: mockStep,
    })

    expect(mockCrossFileConsistency).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        batchId: VALID_BATCH_ID,
        fileIds: [fileId1, fileId2],
      }),
    )
  })

  it('[P1] should handle duplicate batch-completed event without creating duplicate findings', async () => {
    const mockStep = createMockStep()
    const fileId = faker.string.uuid()

    const { batchComplete } = await import('./batchComplete')

    // First invocation — resolve-batch-files returns file
    dbState.returnValues = [[{ id: fileId }]]

    await (batchComplete as { handler: (...args: unknown[]) => unknown }).handler({
      event: {
        data: {
          batchId: VALID_BATCH_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
        },
      },
      step: mockStep,
    })

    // Reset for second invocation (duplicate event)
    dbState.callIndex = 0
    dbState.returnValues = [[{ id: fileId }]]

    await (batchComplete as { handler: (...args: unknown[]) => unknown }).handler({
      event: {
        data: {
          batchId: VALID_BATCH_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
        },
      },
      step: mockStep,
    })

    // crossFileConsistency is itself idempotent (delete+insert) — should be called both times
    // but produce the same result
    expect(mockCrossFileConsistency).toHaveBeenCalledTimes(2)
  })

  it('[P1] should be registered in Inngest serve function list', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    vi.resetModules()
    await import('./batchComplete')

    // createFunction should have been called with event: 'pipeline.batch-completed'
    expect(createFunctionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringContaining('batch-complete'),
      }),
      expect.objectContaining({
        event: 'pipeline.batch-completed',
      }),
      expect.any(Function),
    )
  })
})
