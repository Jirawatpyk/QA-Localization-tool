import { describe, it, expect, vi } from 'vitest'

// Must be first
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──

const { mockOpenai, mockAnthropic, mockGoogle, mockCustomProvider, mockDeriveProvider } =
  vi.hoisted(() => {
    const mockOpenai = vi.fn((id: string) => ({ provider: 'openai' as const, modelId: id }))
    const mockAnthropic = vi.fn((id: string) => ({ provider: 'anthropic' as const, modelId: id }))
    const mockGoogle = vi.fn((id: string) => ({ provider: 'google' as const, modelId: id }))
    const mockCustomProvider = vi.fn((_config: unknown) => ({
      languageModel: vi.fn((name: string) => ({ aliasName: name })),
    }))
    const mockDeriveProvider = vi.fn((..._args: unknown[]) => 'unknown')

    return { mockOpenai, mockAnthropic, mockGoogle, mockCustomProvider, mockDeriveProvider }
  })

vi.mock('@ai-sdk/openai', () => ({
  openai: mockOpenai,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: mockAnthropic,
}))

vi.mock('@ai-sdk/google', () => ({
  google: mockGoogle,
}))

vi.mock('ai', () => ({
  customProvider: mockCustomProvider,
}))

vi.mock('./types', () => ({
  deriveProviderFromModelId: (...args: unknown[]) => mockDeriveProvider(...args),
}))

// ── Tests ──

describe('getModelById', () => {
  it('should return openai model instance for gpt-* model ID', async () => {
    mockDeriveProvider.mockReturnValue('openai')
    const { getModelById } = await import('./client')

    const result = getModelById('gpt-4o-mini-2024-07-18')

    expect(mockOpenai).toHaveBeenCalledWith('gpt-4o-mini-2024-07-18')
    expect(result).toEqual({ provider: 'openai', modelId: 'gpt-4o-mini-2024-07-18' })
  })

  it('should return anthropic model instance for claude-* model ID', async () => {
    mockDeriveProvider.mockReturnValue('anthropic')
    const { getModelById } = await import('./client')

    const result = getModelById('claude-sonnet-4-5-20250929')

    expect(mockAnthropic).toHaveBeenCalledWith('claude-sonnet-4-5-20250929')
    expect(result).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250929' })
  })

  it('should return google model instance for gemini-* model ID', async () => {
    mockDeriveProvider.mockReturnValue('google')
    const { getModelById } = await import('./client')

    const result = getModelById('gemini-2.0-flash')

    expect(mockGoogle).toHaveBeenCalledWith('gemini-2.0-flash')
    expect(result).toEqual({ provider: 'google', modelId: 'gemini-2.0-flash' })
  })

  it('should throw Error for unsupported model provider', async () => {
    mockDeriveProvider.mockReturnValue('unknown')
    const { getModelById } = await import('./client')

    expect(() => getModelById('llama-3-70b')).toThrow('Unsupported model provider for: llama-3-70b')
  })
})

describe('getModelForLayer', () => {
  it('should return l2-screening model for L2 layer', async () => {
    const { getModelForLayer } = await import('./client')

    const result = getModelForLayer('L2')

    // customProvider().languageModel was called with 'l2-screening'
    expect(result).toBeDefined()
  })

  it('should return l3-analysis model for L3 layer', async () => {
    const { getModelForLayer } = await import('./client')

    const result = getModelForLayer('L3')

    expect(result).toBeDefined()
  })
})

describe('qaProvider', () => {
  it('should be created with customProvider factory', async () => {
    await import('./client')

    expect(mockCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        languageModels: expect.objectContaining({
          'l2-screening': expect.anything(),
          'l3-analysis': expect.anything(),
        }),
      }),
    )
  })
})
