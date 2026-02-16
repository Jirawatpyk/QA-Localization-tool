import { describe, it, expect, vi, beforeEach } from 'vitest'

import { edgeLogger } from '@/lib/logger-edge'

describe('edgeLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should output valid JSON for info level', () => {
    edgeLogger.info('test message', { key: 'value' })
    // eslint-disable-next-line no-console
    expect(console.log).toHaveBeenCalledOnce()
    // eslint-disable-next-line no-console
    const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? '{}')
    expect(output.level).toBe('info')
    expect(output.msg).toBe('test message')
    expect(output.key).toBe('value')
    expect(output.timestamp).toBeDefined()
  })

  it('should output valid JSON for warn level', () => {
    edgeLogger.warn('warning message')
    expect(console.warn).toHaveBeenCalledOnce()
    const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? '{}')
    expect(output.level).toBe('warn')
    expect(output.msg).toBe('warning message')
  })

  it('should output valid JSON for error level', () => {
    edgeLogger.error('error message', { code: 500 })
    expect(console.error).toHaveBeenCalledOnce()
    const output = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? '{}')
    expect(output.level).toBe('error')
    expect(output.msg).toBe('error message')
    expect(output.code).toBe(500)
  })

  it('should include ISO timestamp', () => {
    edgeLogger.info('timestamp test')
    // eslint-disable-next-line no-console
    const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? '{}')
    expect(() => new Date(output.timestamp)).not.toThrow()
    expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
