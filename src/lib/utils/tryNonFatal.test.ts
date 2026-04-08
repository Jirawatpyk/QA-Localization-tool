import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

import { logger } from '@/lib/logger'

import { tryNonFatal } from './tryNonFatal'

describe('tryNonFatal', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear()
  })

  it('should return the operation result on success', async () => {
    const result = await tryNonFatal(() => Promise.resolve('ok'), {
      operation: 'test op',
    })

    expect(result).toBe('ok')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('should return null and log error on failure', async () => {
    const err = new Error('boom')
    const result = await tryNonFatal(() => Promise.reject(err), {
      operation: 'audit log',
      meta: { findingId: 'finding-1' },
    })

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      { err, findingId: 'finding-1' },
      'audit log failed (non-fatal)',
    )
  })

  it('should work without meta context', async () => {
    const err = new Error('fail')
    const result = await tryNonFatal(() => Promise.reject(err), {
      operation: 'inngest send',
    })

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith({ err }, 'inngest send failed (non-fatal)')
  })

  it('should not throw even if op throws synchronously inside the function', async () => {
    const result = await tryNonFatal(
      async () => {
        throw new Error('sync throw inside async')
      },
      { operation: 'test' },
    )

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })

  it('should handle non-Error throws (string)', async () => {
    const result = await tryNonFatal(() => Promise.reject('not an error'), {
      operation: 'oddball',
    })

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'not an error' }),
      'oddball failed (non-fatal)',
    )
  })

  it('should let `err` win over meta key collision (defensive)', async () => {
    const realErr = new Error('real error')
    await tryNonFatal(() => Promise.reject(realErr), {
      operation: 'collision',
      meta: { err: 'fake meta err', findingId: 'f1' },
    })

    const logCall = vi.mocked(logger.error).mock.calls.at(-1)!
    const payload = logCall[0] as { err: unknown; findingId: string }
    expect(payload.err).toBe(realErr) // real error wins over meta's 'err' key
    expect(payload.findingId).toBe('f1')
  })
})
