import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useKeyboardStore } from '@/stores/keyboard.store'

describe('useKeyboardStore', () => {
  beforeEach(() => {
    useKeyboardStore.getState().clearAll()
  })

  it('should start with no active shortcuts', () => {
    expect(useKeyboardStore.getState().activeShortcuts.size).toBe(0)
  })

  it('should register a shortcut', () => {
    const handler = vi.fn()
    useKeyboardStore.getState().registerShortcut('ctrl+s', handler)

    expect(useKeyboardStore.getState().activeShortcuts.size).toBe(1)
    expect(useKeyboardStore.getState().activeShortcuts.get('ctrl+s')).toBe(handler)
  })

  it('should unregister a shortcut', () => {
    const handler = vi.fn()
    useKeyboardStore.getState().registerShortcut('ctrl+s', handler)
    useKeyboardStore.getState().unregisterShortcut('ctrl+s')

    expect(useKeyboardStore.getState().activeShortcuts.size).toBe(0)
  })

  it('should clear all shortcuts', () => {
    useKeyboardStore.getState().registerShortcut('ctrl+s', vi.fn())
    useKeyboardStore.getState().registerShortcut('ctrl+z', vi.fn())
    useKeyboardStore.getState().clearAll()

    expect(useKeyboardStore.getState().activeShortcuts.size).toBe(0)
  })
})
