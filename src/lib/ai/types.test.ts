import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('getConfigForModel', () => {
  it('should return exact config for known model (gpt-4o-mini)', async () => {
    const { getConfigForModel, MODEL_CONFIG } = await import('./types')
    const config = getConfigForModel('gpt-4o-mini', 'L2')
    expect(config).toBe(MODEL_CONFIG['gpt-4o-mini'])
  })

  it('should return exact config for known model (claude-sonnet)', async () => {
    const { getConfigForModel, MODEL_CONFIG } = await import('./types')
    const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
    expect(config).toBe(MODEL_CONFIG['claude-sonnet-4-5-20250929'])
  })

  it('should fall back to L2 default for unknown model with layer=L2', async () => {
    const { getConfigForModel, MODEL_CONFIG } = await import('./types')
    const config = getConfigForModel('gpt-4o-mini-2024-07-18', 'L2')
    expect(config).toBe(MODEL_CONFIG['gpt-4o-mini'])
  })

  it('should fall back to L3 default for unknown model with layer=L3', async () => {
    const { getConfigForModel, MODEL_CONFIG } = await import('./types')
    const config = getConfigForModel('claude-sonnet-unknown-variant', 'L3')
    expect(config).toBe(MODEL_CONFIG['claude-sonnet-4-5-20250929'])
  })
})

describe('deriveProviderFromModelId', () => {
  it('should return openai for gpt-* models', async () => {
    const { deriveProviderFromModelId } = await import('./types')
    expect(deriveProviderFromModelId('gpt-4o-mini')).toBe('openai')
    expect(deriveProviderFromModelId('gpt-4o-mini-2024-07-18')).toBe('openai')
  })

  it('should return openai for o1-* and o3-* models', async () => {
    const { deriveProviderFromModelId } = await import('./types')
    expect(deriveProviderFromModelId('o1-preview')).toBe('openai')
    expect(deriveProviderFromModelId('o3-mini')).toBe('openai')
  })

  it('should return anthropic for claude-* models', async () => {
    const { deriveProviderFromModelId } = await import('./types')
    expect(deriveProviderFromModelId('claude-sonnet-4-5-20250929')).toBe('anthropic')
    expect(deriveProviderFromModelId('claude-haiku-3.5')).toBe('anthropic')
  })

  it('should return google for gemini-* models', async () => {
    const { deriveProviderFromModelId } = await import('./types')
    expect(deriveProviderFromModelId('gemini-2.0-flash')).toBe('google')
  })

  it('should return unknown for unrecognized models', async () => {
    const { deriveProviderFromModelId } = await import('./types')
    expect(deriveProviderFromModelId('llama-3')).toBe('unknown')
    expect(deriveProviderFromModelId('mistral-7b')).toBe('unknown')
  })
})
