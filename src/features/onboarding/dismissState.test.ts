import { describe, it, expect, afterEach } from 'vitest'

import { _resetForTesting, clearDismissed, isDismissed, markDismissed } from './dismissState'

describe('dismissState', () => {
  afterEach(() => {
    _resetForTesting()
  })

  it('should return false for a tour that has not been dismissed', () => {
    expect(isDismissed('setup')).toBe(false)
    expect(isDismissed('project')).toBe(false)
    expect(isDismissed('review')).toBe(false)
  })

  it('should return true after markDismissed is called', () => {
    markDismissed('setup')
    expect(isDismissed('setup')).toBe(true)
  })

  it('should not affect other tour IDs when marking one dismissed', () => {
    markDismissed('setup')
    expect(isDismissed('setup')).toBe(true)
    expect(isDismissed('project')).toBe(false)
    expect(isDismissed('review')).toBe(false)
  })

  it('should clear a specific tour ID without affecting others', () => {
    markDismissed('setup')
    markDismissed('project')

    clearDismissed('setup')

    expect(isDismissed('setup')).toBe(false)
    expect(isDismissed('project')).toBe(true)
  })

  it('should handle clearDismissed on a non-dismissed tour gracefully', () => {
    clearDismissed('setup')
    expect(isDismissed('setup')).toBe(false)
  })

  it('should handle markDismissed called multiple times (idempotent)', () => {
    markDismissed('setup')
    markDismissed('setup')
    expect(isDismissed('setup')).toBe(true)
  })

  it('should reset all dismiss state via _resetForTesting', () => {
    markDismissed('setup')
    markDismissed('project')
    markDismissed('review')

    _resetForTesting()

    expect(isDismissed('setup')).toBe(false)
    expect(isDismissed('project')).toBe(false)
    expect(isDismissed('review')).toBe(false)
  })

  it('should allow re-dismiss after clear (dismiss → clear → dismiss)', () => {
    markDismissed('setup')
    clearDismissed('setup')
    markDismissed('setup')
    expect(isDismissed('setup')).toBe(true)
  })
})
