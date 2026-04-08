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
})
