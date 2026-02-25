/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

import type { ProcessingMode } from '@/types/pipeline'

// ── Hoisted mocks ──
const { mockRunL1ForFile, mockScoreFile, dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    setCaptures: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }
  return {
    mockRunL1ForFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({ findingCount: 5, duration: 120 }),
    ),
    mockScoreFile: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        scoreId: faker.string.uuid(),
        fileId: faker.string.uuid(),
        mqmScore: 85,
        npt: 15,
        totalWords: 1000,
        criticalCount: 0,
        majorCount: 3,
        minorCount: 0,
        status: 'calculated',
        autoPassRationale: null,
      }),
    ),
    dbState: state,
  }
})

vi.mock('@/features/pipeline/helpers/runL1ForFile', () => ({
  runL1ForFile: (...args: unknown[]) => mockRunL1ForFile(...args),
}))

vi.mock('@/features/scoring/helpers/scoreFile', () => ({
  scoreFile: (...args: unknown[]) => mockScoreFile(...args),
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
            reject?.(new Error('DB update failed'))
            return
          }
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
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
    batchId: 'batch_id',
  },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'
const VALID_UPLOAD_BATCH_ID = 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b'

// Build pipeline event data
function buildPipelineEvent(
  overrides?: Partial<{
    fileId: string
    projectId: string
    tenantId: string
    userId: string
    mode: ProcessingMode
    uploadBatchId: string
  }>,
) {
  return {
    fileId: overrides?.fileId ?? VALID_FILE_ID,
    projectId: overrides?.projectId ?? VALID_PROJECT_ID,
    tenantId: overrides?.tenantId ?? VALID_TENANT_ID,
    userId: overrides?.userId ?? VALID_USER_ID,
    mode: overrides?.mode ?? ('economy' as const),
    uploadBatchId: overrides?.uploadBatchId ?? VALID_UPLOAD_BATCH_ID,
  }
}

// Mock step with sendEvent tracking
function createMockStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
}

describe('processFile - batch completion step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRunL1ForFile.mockResolvedValue({ findingCount: 5, duration: 120 })
    mockScoreFile.mockResolvedValue({
      scoreId: faker.string.uuid(),
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

  // ── P0: Batch completion emission ──

  it.skip('[P0] should emit pipeline.batch-completed when all batch files are l1_completed or failed', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent()

    // After L1 + score steps, the handler should query sibling files in the same batch.
    // All files are terminal (l1_completed or failed) → emit batch-completed event.
    const siblingFiles = [
      { id: VALID_FILE_ID, status: 'l1_completed', batchId: VALID_UPLOAD_BATCH_ID },
      { id: faker.string.uuid(), status: 'l1_completed', batchId: VALID_UPLOAD_BATCH_ID },
      { id: faker.string.uuid(), status: 'failed', batchId: VALID_UPLOAD_BATCH_ID },
    ]
    dbState.returnValues = [siblingFiles]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Should emit batch-completed event via step.sendEvent
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      expect.stringContaining('batch-completed'),
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pipeline.batch-completed',
          data: expect.objectContaining({
            batchId: VALID_UPLOAD_BATCH_ID,
            projectId: VALID_PROJECT_ID,
            tenantId: VALID_TENANT_ID,
          }),
        }),
      ]),
    )
  })

  it.skip('[P0] should NOT emit batch-completed when some files still processing', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent()

    // Some files still in processing state
    const siblingFiles = [
      { id: VALID_FILE_ID, status: 'l1_completed', batchId: VALID_UPLOAD_BATCH_ID },
      { id: faker.string.uuid(), status: 'l1_processing', batchId: VALID_UPLOAD_BATCH_ID },
      { id: faker.string.uuid(), status: 'parsed', batchId: VALID_UPLOAD_BATCH_ID },
    ]
    dbState.returnValues = [siblingFiles]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Should NOT emit batch-completed
    expect(mockStep.sendEvent).not.toHaveBeenCalledWith(
      expect.stringContaining('batch-completed'),
      expect.anything(),
    )
  })

  it.skip('[P0] should include withTenant filter on batch files query', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent()

    const siblingFiles = [
      { id: VALID_FILE_ID, status: 'l1_completed', batchId: VALID_UPLOAD_BATCH_ID },
    ]
    dbState.returnValues = [siblingFiles]

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    // withTenant must be called for the batch siblings query (tenant isolation)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
  })
})
