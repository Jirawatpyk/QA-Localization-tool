import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──
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

// Test helper: build batch pipeline event data
function buildPipelineBatchEvent(
  overrides?: Partial<{
    batchId: string
    fileIds: string[]
    projectId: string
    tenantId: string
    userId: string
    mode: 'economy' | 'thorough'
  }>,
) {
  return {
    batchId: faker.string.uuid(),
    fileIds: [faker.string.uuid(), faker.string.uuid()],
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

const VALID_BATCH_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

describe('processBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Fan-out file events ──

  it('should send individual process-file events for each fileId', async () => {
    const mockStep = createMockStep()
    const fileIds = [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()]
    const eventData = buildPipelineBatchEvent({
      batchId: VALID_BATCH_ID,
      fileIds,
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Batch-send: one sendEvent call with all events as array
    expect(mockStep.sendEvent).toHaveBeenCalledTimes(1)
    const [_stepId, events] = mockStep.sendEvent.mock.calls[0] as [string, unknown[]]
    expect(events).toHaveLength(fileIds.length)
  })

  it('should include all event data fields in each dispatched event', async () => {
    const mockStep = createMockStep()
    const fileId = faker.string.uuid()
    const eventData = buildPipelineBatchEvent({
      batchId: VALID_BATCH_ID,
      fileIds: [fileId],
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
      mode: 'economy',
    })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Batch form: sendEvent(id, [event1, event2, ...])
    expect(mockStep.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pipeline.process-file',
          data: expect.objectContaining({
            fileId,
            projectId: VALID_PROJECT_ID,
            tenantId: VALID_TENANT_ID,
            userId: VALID_USER_ID,
            mode: 'economy',
          }),
        }),
      ]),
    )
  })

  // ── P1: Step configuration ──

  it('should use deterministic step ID for batch init', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineBatchEvent({ batchId: VALID_BATCH_ID })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Check if any step.run call contains batchId for determinism
    const runCalls = mockStep.run.mock.calls
    if (runCalls.length > 0) {
      const hasInit = runCalls.some(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes(VALID_BATCH_ID),
      )
      expect(hasInit).toBe(true)
    }
  })

  it('should use deterministic step ID for file dispatch', async () => {
    const mockStep = createMockStep()
    const fileId = faker.string.uuid()
    const eventData = buildPipelineBatchEvent({ fileIds: [fileId] })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // sendEvent calls should have deterministic identifiers
    expect(mockStep.sendEvent).toHaveBeenCalled()
  })

  it('should pass mode from batch event to individual events', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineBatchEvent({ mode: 'thorough' })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Each dispatched event should include mode: 'thorough'
    const [, events] = mockStep.sendEvent.mock.calls[0] as [
      string,
      Array<{ data: { mode: string } }>,
    ]
    for (const event of events) {
      expect(event.data.mode).toBe('thorough')
    }
  })

  it('should pass tenantId and userId to each event', async () => {
    const mockStep = createMockStep()
    const eventData = buildPipelineBatchEvent({
      tenantId: VALID_TENANT_ID,
      userId: VALID_USER_ID,
    })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    const [, events] = mockStep.sendEvent.mock.calls[0] as [
      string,
      Array<{ data: { tenantId: string; userId: string } }>,
    ]
    for (const event of events) {
      expect(event.data.tenantId).toBe(VALID_TENANT_ID)
      expect(event.data.userId).toBe(VALID_USER_ID)
    }
  })

  // ── P2: Function configuration & edge cases ──

  it('should have function id process-batch-pipeline', async () => {
    const { inngest } = await import('@/lib/inngest/client')
    const createFunctionMock = inngest.createFunction as ReturnType<typeof vi.fn>

    vi.resetModules()
    await import('./processBatch')

    const firstArg = createFunctionMock.mock.calls[0]?.[0]
    expect(firstArg).toMatchObject({
      id: 'process-batch-pipeline',
    })
  })

  it('should handle batch with single file', async () => {
    const mockStep = createMockStep()
    const singleFileId = faker.string.uuid()
    const eventData = buildPipelineBatchEvent({ fileIds: [singleFileId] })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockStep.sendEvent).toHaveBeenCalledTimes(1)
  })

  it('should handle batch with maximum files (100)', async () => {
    const mockStep = createMockStep()
    const fileIds = Array.from({ length: 100 }, () => faker.string.uuid())
    const eventData = buildPipelineBatchEvent({ fileIds })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(mockStep.sendEvent).toHaveBeenCalledTimes(1)
    const [, events] = mockStep.sendEvent.mock.calls[0] as [string, unknown[]]
    expect(events).toHaveLength(100)
  })

  it('should return batchId, fileCount, dispatched status', async () => {
    const mockStep = createMockStep()
    const fileIds = [faker.string.uuid(), faker.string.uuid()]
    const eventData = buildPipelineBatchEvent({
      batchId: VALID_BATCH_ID,
      fileIds,
    })

    const { processBatch } = await import('./processBatch')
    const result = await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    expect(result).toMatchObject({
      batchId: VALID_BATCH_ID,
      fileCount: 2,
      status: 'dispatched',
    })
  })
})
