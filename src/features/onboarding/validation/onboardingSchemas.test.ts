import { describe, it, expect } from 'vitest'

import { updateTourStateSchema } from './onboardingSchemas'

describe('updateTourStateSchema', () => {
  it('should accept valid complete action', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'complete',
      tourId: 'setup',
    })
    expect(result.success).toBe(true)
  })

  it('should accept valid dismiss action with dismissedAtStep', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'dismiss',
      tourId: 'setup',
      dismissedAtStep: 2,
    })
    expect(result.success).toBe(true)
  })

  it('should reject dismiss action without dismissedAtStep', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'dismiss',
      tourId: 'setup',
    })
    expect(result.success).toBe(false)
  })

  it('should accept valid restart action', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'restart',
      tourId: 'review',
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid tourId', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'complete',
      tourId: 'unknown',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid action', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'invalid',
      tourId: 'setup',
    })
    expect(result.success).toBe(false)
  })

  it('should reject dismissedAtStep less than 1', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'dismiss',
      tourId: 'setup',
      dismissedAtStep: 0,
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-integer dismissedAtStep', () => {
    const result = updateTourStateSchema.safeParse({
      action: 'dismiss',
      tourId: 'setup',
      dismissedAtStep: 1.5,
    })
    expect(result.success).toBe(false)
  })
})
