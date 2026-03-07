import { describe, it, expect } from 'vitest'

import { ALL_AVAILABLE_MODELS, AVAILABLE_L2_MODELS, AVAILABLE_L3_MODELS } from './models'

// No mocks needed — pure constants, no 'server-only' import in source.

describe('AVAILABLE_L2_MODELS', () => {
  it('should contain system default gpt-4o-mini', () => {
    expect(AVAILABLE_L2_MODELS).toContain('gpt-4o-mini')
  })
})

describe('AVAILABLE_L3_MODELS', () => {
  it('should contain system default claude-sonnet-4-5-20250929', () => {
    expect(AVAILABLE_L3_MODELS).toContain('claude-sonnet-4-5-20250929')
  })
})

describe('ALL_AVAILABLE_MODELS', () => {
  it('should be superset of AVAILABLE_L2_MODELS', () => {
    for (const model of AVAILABLE_L2_MODELS) {
      expect(ALL_AVAILABLE_MODELS.has(model)).toBe(true)
    }
  })

  it('should be superset of AVAILABLE_L3_MODELS', () => {
    for (const model of AVAILABLE_L3_MODELS) {
      expect(ALL_AVAILABLE_MODELS.has(model)).toBe(true)
    }
  })

  it('should have no duplicates (Set size equals combined unique length)', () => {
    const combined = [...AVAILABLE_L2_MODELS, ...AVAILABLE_L3_MODELS]
    const uniqueCount = new Set(combined).size
    expect(ALL_AVAILABLE_MODELS.size).toBe(uniqueCount)
    expect(ALL_AVAILABLE_MODELS.size).toBe(combined.length)
  })
})
