/**
 * ATDD Story 5.1 — cleanBTCache Inngest cron function tests
 *
 * Guardrail #10: retries + onFailure required, Object.assign exposes handler + onFailure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDeleteExpiredBTCache = vi.fn()
vi.mock('@/features/bridge/helpers/btCache', () => ({
  deleteExpiredBTCache: (...args: unknown[]) => mockDeleteExpiredBTCache(...args),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: vi.fn((_config: unknown, _trigger: unknown, handler: unknown) => handler),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { cleanBTCache } from './cleanBTCache'

describe('cleanBTCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Guardrail #10: handler + onFailure + fnConfig exposed ─────────────
  it('should expose handler, onFailure, and fnConfig via Object.assign', () => {
    expect(cleanBTCache.handler).toBeDefined()
    expect(typeof cleanBTCache.handler).toBe('function')
    expect(cleanBTCache.onFailure).toBeDefined()
    expect(typeof cleanBTCache.onFailure).toBe('function')
    expect(cleanBTCache.fnConfig).toBeDefined()
  })

  it('should have correct function config', () => {
    expect(cleanBTCache.fnConfig.id).toBe('clean-bt-cache')
    expect(cleanBTCache.fnConfig.retries).toBe(3)
    expect(cleanBTCache.fnConfig.cron).toBe('0 3 * * *')
  })

  // ── Handler ───────────────────────────────────────────────────────────
  it('should call deleteExpiredBTCache in step.run and return deletedCount', async () => {
    mockDeleteExpiredBTCache.mockResolvedValue(5)

    const mockStep = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run: vi.fn(async (_id: string, fn: () => Promise<any>) => fn()),
    }

    const result = await cleanBTCache.handler({ step: mockStep })

    expect(mockStep.run).toHaveBeenCalledWith('delete-expired-bt-cache', expect.any(Function))
    expect(mockDeleteExpiredBTCache).toHaveBeenCalledOnce()
    expect(result).toEqual({ deletedCount: 5 })
  })

  it('should return deletedCount 0 when no expired entries exist', async () => {
    mockDeleteExpiredBTCache.mockResolvedValue(0)

    const mockStep = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run: vi.fn(async (_id: string, fn: () => Promise<any>) => fn()),
    }

    const result = await cleanBTCache.handler({ step: mockStep })
    expect(result).toEqual({ deletedCount: 0 })
  })

  // ── onFailure ─────────────────────────────────────────────────────────
  it('should log error in onFailure without throwing', async () => {
    const { logger } = await import('@/lib/logger')
    const error = new Error('DB connection failed')
    const event = { name: 'test-event', data: {} }

    await cleanBTCache.onFailure({ event, error })

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error }),
      expect.stringContaining('cleanup cron failed'),
    )
  })
})
