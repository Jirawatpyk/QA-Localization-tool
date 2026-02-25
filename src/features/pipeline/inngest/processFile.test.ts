import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──
const { mockRunL1ForFile, mockScoreFile, dbState } = vi.hoisted(() => {
  const state = { callIndex: 0, returnValues: [] as unknown[], setCaptures: [] as unknown[] }
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
        return (resolve?: (v: unknown) => void) => {
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
}))

vi.mock('@/db/schema/files', () => ({
  files: { id: 'id', tenantId: 'tenant_id', status: 'status' },
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((..._args: unknown[]) => ({
      handler: vi.fn(),
    })),
  },
}))

// Test helper: build pipeline event data
function buildPipelineEvent(
  overrides?: Partial<{
    fileId: string
    projectId: string
    tenantId: string
    userId: string
    mode: 'economy' | 'thorough'
  }>,
) {
  return {
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    mode: 'economy' as const,
    ...overrides,
  }
}

// Mock step object simulating Inngest step API
function createMockStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
}

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

describe('processFilePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
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

  // ── P0: Core pipeline steps ──

  it('should run L1 rules step then score step in order', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    // Access the processFilePipeline function's handler
    const { processFilePipeline } = await import('./processFile')

    // Simulate Inngest handler invocation
    // The handler receives { event, step }
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // step.run should be called at least twice: L1 rules + scoring
    expect(mockStep.run).toHaveBeenCalledTimes(2)

    // Verify exact step IDs — changing IDs breaks in-flight Inngest pipeline resumes
    const firstCall = mockStep.run.mock.calls[0]
    const secondCall = mockStep.run.mock.calls[1]
    expect(firstCall?.[0]).toBe(`l1-rules-${eventData.fileId}`)
    expect(secondCall?.[0]).toBe(`score-${eventData.fileId}`)
  })

  it('should use deterministic step IDs containing fileId', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ fileId: VALID_FILE_ID })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Step IDs should contain fileId for determinism
    for (const call of mockStep.run.mock.calls) {
      const stepId = call[0] as string
      expect(stepId).toContain(VALID_FILE_ID)
    }
  })

  it('should call runL1ForFile with correct args from event data', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL1ForFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  it('should call scoreFile with correct args from event data', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        tenantId: VALID_TENANT_ID,
        userId: VALID_USER_ID,
      }),
    )
  })

  it('should return fileId, findingCount, mqmScore, layerCompleted', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processFilePipeline } = await import('./processFile')
    const result = await (
      processFilePipeline as { handler: (...args: unknown[]) => unknown }
    ).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(result).toMatchObject({
      fileId: VALID_FILE_ID,
      findingCount: expect.any(Number),
      mqmScore: expect.any(Number),
      layerCompleted: 'L1',
    })
  })

  // ── P1: Mode handling ──

  it('should not run L2/L3 steps in economy mode', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ mode: 'economy' })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Only L1 + score steps — no L2/L3
    expect(mockStep.run).toHaveBeenCalledTimes(2)
  })

  it('should not run L2/L3 steps in thorough mode (deferred)', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ mode: 'thorough' })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // L2/L3 deferred to future stories — still only L1 + score for now
    expect(mockStep.run).toHaveBeenCalledTimes(2)
  })

  it('should pass tenantId from event data to helpers', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ tenantId: VALID_TENANT_ID })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockRunL1ForFile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: VALID_TENANT_ID }),
    )
    expect(mockScoreFile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: VALID_TENANT_ID }),
    )
  })

  it('should pass userId from event data to scoreFile', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineEvent({ userId: VALID_USER_ID })

    const { processFilePipeline } = await import('./processFile')
    await (processFilePipeline as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockScoreFile).toHaveBeenCalledWith(expect.objectContaining({ userId: VALID_USER_ID }))
  })

  // ── P0: onFailure handler ──

  it('onFailure should set file status to failed', async () => {
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')

    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure
    expect(onFailure).toBeDefined()

    if (onFailure) {
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
              },
            },
          },
        },
        error: new Error('step failed'),
      })
    }

    // Exactly 1 DB call: the db.update(files).set({ status: 'failed' })
    expect(dbState.callIndex).toBe(1)
    // withTenant must be called with the correct tenantId (tenant isolation in failure path)
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    // Verify .set() was called with status: 'failed' (not some other status)
    expect(dbState.setCaptures).toContainEqual({ status: 'failed' })
  })

  it('onFailure should log error with fileId context', async () => {
    const { logger } = await import('@/lib/logger')
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure

    const testError = new Error('step failed')
    if (onFailure) {
      await onFailure({
        event: {
          data: {
            event: {
              data: {
                fileId: VALID_FILE_ID,
                tenantId: VALID_TENANT_ID,
              },
            },
          },
        },
        error: testError,
      })
    }

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: testError, fileId: VALID_FILE_ID }),
      expect.any(String),
    )
  })

  it('onFailure should access original event data via v3 nested structure', async () => {
    dbState.returnValues = [[]]

    const { processFilePipeline } = await import('./processFile')
    const { withTenant } = await import('@/db/helpers/withTenant')
    const onFailure = (processFilePipeline as { onFailure?: (...args: unknown[]) => unknown })
      .onFailure

    // Inngest v3 onFailure event structure: event.data.event.data
    const nestedEvent = {
      event: {
        data: {
          event: {
            data: {
              fileId: VALID_FILE_ID,
              tenantId: VALID_TENANT_ID,
              projectId: VALID_PROJECT_ID,
            },
          },
        },
      },
      error: new Error('step failed'),
    }

    if (onFailure) {
      await onFailure(nestedEvent)
    }

    // withTenant must be called with the correct tenantId — verifies tenant-scoped WHERE clause
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
    expect(dbState.callIndex).toBe(1)
  })

  // ── P2: Function configuration ──

  it('should have function id process-file-pipeline', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    // Re-import to trigger createFunction call
    vi.resetModules()
    await import('./processFile')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      id: 'process-file-pipeline',
    })
  })

  it('should have retries: 3', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    vi.resetModules()
    await import('./processFile')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      retries: 3,
    })
  })

  it('should have concurrency key on projectId with limit 1', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    vi.resetModules()
    await import('./processFile')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      concurrency: expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining('projectId'),
          limit: 1,
        }),
      ]),
    })
  })
})
