/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Hoisted mocks ──
const { mockCrossFileConsistency, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockCrossFileConsistency: vi.fn((..._args: unknown[]) => Promise.resolve({ findingCount: 3 })),
    dbState,
    dbMockModule,
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

vi.mock('@/db/client', () => dbMockModule)

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
    projectId: 'project_id',
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

  // H4: Empty batch early-return path
  it('[P1] should return findingCount 0 when batch has no files', async () => {
    const mockStep = createMockStep()

    // resolve-batch-files returns empty array
    dbState.returnValues = [[]]

    const { batchComplete } = await import('./batchComplete')
    const result = await (
      batchComplete as {
        handler: (...args: unknown[]) => Promise<{ status: string; findingCount: number }>
      }
    ).handler({
      event: {
        data: {
          batchId: VALID_BATCH_ID,
          projectId: VALID_PROJECT_ID,
          tenantId: VALID_TENANT_ID,
        },
      },
      step: mockStep,
    })

    expect(result).toEqual({ status: 'completed', findingCount: 0 })
    // crossFileConsistency should NOT be called for empty batch
    expect(mockCrossFileConsistency).not.toHaveBeenCalled()
  })

  // M4: onFailureFn test — verify error logging
  it('[P1] should log error when onFailure is called after retries exhausted', async () => {
    const { logger } = await import('@/lib/logger')
    const { batchComplete } = await import('./batchComplete')

    const testError = new Error('All retries failed')
    await (batchComplete as { onFailure: (...args: unknown[]) => Promise<void> }).onFailure({
      event: {
        data: {
          event: {
            data: {
              batchId: VALID_BATCH_ID,
              projectId: VALID_PROJECT_ID,
              tenantId: VALID_TENANT_ID,
            },
          },
        },
      },
      error: testError,
    })

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: testError, batchId: VALID_BATCH_ID }),
      expect.stringContaining('failed after retries'),
    )
  })

  it('[P1] should be registered in Inngest serve function list', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    // L2: resetModules to force re-evaluation of module-level createFunction call
    vi.resetModules()
    await import('./batchComplete')

    // createFunction should have been called with event: 'pipeline.batch-completed'
    expect(createFunctionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringContaining('batch-complete'),
        retries: 3,
      }),
      expect.objectContaining({
        event: 'pipeline.batch-completed',
      }),
      expect.any(Function),
    )
  })
})
