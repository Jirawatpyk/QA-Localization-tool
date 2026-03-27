import { faker } from '@faker-js/faker'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ProcessingMode, UploadBatchId } from '@/types/pipeline'

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

// ── Test helpers ──

function buildPipelineBatchEvent(
  overrides?: Partial<{
    batchId: string
    fileIds: string[]
    projectId: string
    tenantId: string
    userId: string
    mode: ProcessingMode
    uploadBatchId: string
  }>,
) {
  return {
    batchId: faker.string.uuid(),
    fileIds: [faker.string.uuid(), faker.string.uuid()],
    projectId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    userId: faker.string.uuid(),
    mode: 'economy' as const,
    uploadBatchId: faker.string.uuid() as UploadBatchId,
    ...overrides,
  }
}

function createMockStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn((..._args: unknown[]) => Promise.resolve()),
  }
}

describe('processBatch — payload size (P1-05, R3-033)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should keep 10-file payload under 512KB', async () => {
    const mockStep = createMockStep()
    const fileIds = Array.from({ length: 10 }, () => faker.string.uuid())
    const eventData = buildPipelineBatchEvent({ fileIds })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    // Measure the payload passed to sendEvent
    const [, events] = mockStep.sendEvent.mock.calls[0] as [string, unknown[]]
    const payloadSize = new TextEncoder().encode(JSON.stringify(events)).byteLength

    // 512KB = 524288 bytes
    expect(payloadSize).toBeLessThan(524288)
    expect(events).toHaveLength(10)
  })

  it('[P1] should keep 50-file payload measurable and under 512KB', async () => {
    const mockStep = createMockStep()
    const fileIds = Array.from({ length: 50 }, () => faker.string.uuid())
    const eventData = buildPipelineBatchEvent({ fileIds })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    const [, events] = mockStep.sendEvent.mock.calls[0] as [string, unknown[]]
    const payloadSize = new TextEncoder().encode(JSON.stringify(events)).byteLength

    // 50 files each ~200 bytes ≈ ~10KB — well under 512KB
    expect(payloadSize).toBeLessThan(524288)
    expect(events).toHaveLength(50)
  })

  it('[P1] should include only required fields in dispatched events (no bloat)', async () => {
    const mockStep = createMockStep()
    const fileId = faker.string.uuid()
    const projectId = faker.string.uuid()
    const tenantId = faker.string.uuid()
    const userId = faker.string.uuid()
    const uploadBatchId = faker.string.uuid()

    const eventData = buildPipelineBatchEvent({
      fileIds: [fileId],
      projectId,
      tenantId,
      userId,
      mode: 'economy',
      uploadBatchId,
    })

    const { processBatch } = await import('./processBatch')
    await (processBatch as { handler: (...args: unknown[]) => unknown }).handler({
      event: { data: eventData },
      step: mockStep,
    })

    const [, events] = mockStep.sendEvent.mock.calls[0] as [
      string,
      Array<{ name: string; data: Record<string, unknown> }>,
    ]
    const eventPayload = events[0]!

    // Only required fields — no extras like batchId, metadata, timestamps
    const dataKeys = Object.keys(eventPayload.data).sort()
    const requiredKeys = ['fileId', 'mode', 'projectId', 'tenantId', 'uploadBatchId', 'userId']
    expect(dataKeys).toEqual(requiredKeys)

    // Verify the event name
    expect(eventPayload.name).toBe('pipeline.process-file')
  })
})
