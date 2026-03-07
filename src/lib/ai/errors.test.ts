import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──

const { mockLogger, mockIsInstance, MockNonRetriableError } = vi.hoisted(() => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  const mockIsInstance = vi.fn((..._args: unknown[]) => false)

  // Class so `instanceof` works in handleAIError assertions
  class MockNonRetriableError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NonRetriableError'
    }
  }

  return { mockLogger, mockIsInstance, MockNonRetriableError }
})

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

vi.mock('ai', () => ({
  NoObjectGeneratedError: {
    isInstance: (...args: unknown[]) => mockIsInstance(...args),
  },
}))

vi.mock('inngest', () => ({
  NonRetriableError: MockNonRetriableError,
}))

// ── Test constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const baseContext = {
  fileId: VALID_FILE_ID,
  model: 'gpt-4o-mini',
  layer: 'L2',
}

// ── Helpers ──

/** Create an Error with a numeric `status` property (mimics AI SDK HTTP errors). */
function createErrorWithStatus(status: number, message = 'API error'): Error {
  const err = new Error(message)
  ;(err as Error & { status: number }).status = status
  return err
}

/** Create an Error that mockIsInstance recognizes as NoObjectGeneratedError. */
function createNoObjectError(
  finishReason?: string,
  usage?: { inputTokens: number; outputTokens: number },
): Error {
  const err = new Error('No object generated')
  if (finishReason !== undefined) {
    ;(err as Error & { response: { finishReason: string } }).response = { finishReason }
  }
  if (usage !== undefined) {
    ;(err as Error & { usage: unknown }).usage = usage
  }
  return err
}

// ── Tests ──

describe('classifyAIError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsInstance.mockReturnValue(false)
  })

  it('should return rate_limit when error has status 429', async () => {
    const { classifyAIError } = await import('./errors')
    const error = createErrorWithStatus(429)

    expect(classifyAIError(error)).toBe('rate_limit')
  })

  it('should return auth when error has status 401', async () => {
    const { classifyAIError } = await import('./errors')
    const error = createErrorWithStatus(401)

    expect(classifyAIError(error)).toBe('auth')
  })

  it('should return schema_mismatch for NoObjectGeneratedError without content-filter', async () => {
    const { classifyAIError } = await import('./errors')
    const error = createNoObjectError('stop')
    mockIsInstance.mockReturnValue(true)

    expect(classifyAIError(error)).toBe('schema_mismatch')
  })

  it('should return content_filter when NoObjectGeneratedError has finishReason=content-filter', async () => {
    const { classifyAIError } = await import('./errors')
    const error = createNoObjectError('content-filter')
    mockIsInstance.mockReturnValue(true)

    expect(classifyAIError(error)).toBe('content_filter')
  })

  it('should return timeout when error message contains timeout', async () => {
    const { classifyAIError } = await import('./errors')
    const error = new Error('Request timeout after 30000ms')

    expect(classifyAIError(error)).toBe('timeout')
  })

  it('should return timeout when error message contains ETIMEDOUT', async () => {
    const { classifyAIError } = await import('./errors')
    const error = new Error('connect ETIMEDOUT 10.0.0.1:443')

    expect(classifyAIError(error)).toBe('timeout')
  })

  it('should return unknown for plain Error without status or known message', async () => {
    const { classifyAIError } = await import('./errors')
    const error = new Error('Something unexpected happened')

    expect(classifyAIError(error)).toBe('unknown')
  })

  it('should return unknown for non-Error values (string, number, null)', async () => {
    const { classifyAIError } = await import('./errors')

    expect(classifyAIError('string error')).toBe('unknown')
    expect(classifyAIError(42)).toBe('unknown')
    expect(classifyAIError(null)).toBe('unknown')
    expect(classifyAIError(undefined)).toBe('unknown')
  })
})

describe('handleAIError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsInstance.mockReturnValue(false)
  })

  // ── P0: Re-throw behavior (retriable errors) ──

  it('should re-throw original error for rate_limit kind', async () => {
    const { handleAIError } = await import('./errors')
    const error = createErrorWithStatus(429, 'Rate limited')

    expect(() => handleAIError(error, baseContext)).toThrow(error)
  })

  it('should re-throw original error for timeout kind', async () => {
    const { handleAIError } = await import('./errors')
    const error = new Error('Request timeout after 30s')

    expect(() => handleAIError(error, baseContext)).toThrow(error)
  })

  it('should re-throw original error for unknown kind', async () => {
    const { handleAIError } = await import('./errors')
    const error = new Error('Something unexpected')

    expect(() => handleAIError(error, baseContext)).toThrow(error)
  })

  // ── P0: NonRetriableError wrapping (non-retriable errors) ──

  it('should throw NonRetriableError for auth kind', async () => {
    const { handleAIError } = await import('./errors')
    const error = createErrorWithStatus(401, 'Unauthorized')

    expect(() => handleAIError(error, baseContext)).toThrow(MockNonRetriableError)
    try {
      handleAIError(error, baseContext)
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(MockNonRetriableError)
      expect((thrown as Error).message).toContain('AI auth failed')
      expect((thrown as Error).message).toContain('gpt-4o-mini')
      expect((thrown as Error).message).toContain('Unauthorized')
    }
  })

  it('should throw NonRetriableError for content_filter kind', async () => {
    const { handleAIError } = await import('./errors')
    const error = createNoObjectError('content-filter')
    mockIsInstance.mockReturnValue(true)

    expect(() => handleAIError(error, baseContext)).toThrow(MockNonRetriableError)
    try {
      handleAIError(error, baseContext)
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(MockNonRetriableError)
      expect((thrown as Error).message).toContain('content filter blocked')
      expect((thrown as Error).message).toContain(VALID_FILE_ID)
    }
  })

  it('should throw NonRetriableError for schema_mismatch kind', async () => {
    const { handleAIError } = await import('./errors')
    const error = createNoObjectError('stop')
    mockIsInstance.mockReturnValue(true)

    expect(() => handleAIError(error, baseContext)).toThrow(MockNonRetriableError)
    try {
      handleAIError(error, baseContext)
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(MockNonRetriableError)
      expect((thrown as Error).message).toContain('schema mismatch')
      expect((thrown as Error).message).toContain('gpt-4o-mini')
      expect((thrown as Error).message).toContain(VALID_FILE_ID)
    }
  })

  // ── P1: Logging behavior ──

  it('should log error with full context including aiErrorKind, fileId, model, layer', async () => {
    const { handleAIError } = await import('./errors')
    const error = createErrorWithStatus(429, 'Rate limited')
    const context = { fileId: VALID_FILE_ID, model: 'gpt-4o-mini', layer: 'L2', chunkIndex: 2 }

    try {
      handleAIError(error, context)
    } catch {
      // expected throw
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    const [logPayload, logMessage] = mockLogger.error.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ]

    expect(logPayload).toMatchObject({
      aiErrorKind: 'rate_limit',
      fileId: VALID_FILE_ID,
      model: 'gpt-4o-mini',
      layer: 'L2',
      chunkIndex: 2,
      errorMessage: 'Rate limited',
    })
    expect(logMessage).toContain('AI call failed')
    expect(logMessage).toContain('rate_limit')
  })

  it('should include finishReason and usage in log when error is NoObjectGeneratedError', async () => {
    const { handleAIError } = await import('./errors')
    const usageData = { inputTokens: 500, outputTokens: 100 }
    const error = createNoObjectError('content-filter', usageData)
    mockIsInstance.mockReturnValue(true)

    try {
      handleAIError(error, baseContext)
    } catch {
      // expected throw
    }

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    const [logPayload] = mockLogger.error.mock.calls[0] as [Record<string, unknown>]

    expect(logPayload).toMatchObject({
      aiErrorKind: 'content_filter',
      finishReason: 'content-filter',
      usage: usageData,
    })
  })
})
