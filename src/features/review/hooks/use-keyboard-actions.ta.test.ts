/**
 * TA expansion — Story 4.0: useKeyboardActions
 * Gap coverage for suspend/resume, SHIFT_KEY_MAP, getAllBindings, checkConflict, allowInInput
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetRegistry, useKeyboardActions } from '@/features/review/hooks/use-keyboard-actions'

describe('useKeyboardActions — TA expansion', () => {
  beforeEach(() => {
    _resetRegistry()
  })

  afterEach(() => {
    _resetRegistry()
  })

  it('[P1] G2: should ignore all keydown events when suspended', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('j', handler, {
        description: 'Navigate down',
        scope: 'review',
      })
    })

    // Suspend — all keydown events should be ignored
    act(() => {
      result.current.suspend()
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(handler).not.toHaveBeenCalled()

    // Resume — keydown events should work again
    act(() => {
      result.current.resume()
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('[P1] G3: should normalize Shift+/ to ? via SHIFT_KEY_MAP (cross-platform)', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('ctrl+shift+?', handler, {
        description: 'Show help',
        scope: 'review',
      })
    })

    // On Linux headless Chromium, Ctrl+Shift+/ sends event.key='/' with shiftKey=true
    // SHIFT_KEY_MAP normalizes '/' → '?' so the binding should match
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      )
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('[P2] G5a: getAllBindings should return all registered bindings', () => {
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', vi.fn(), {
        description: 'Accept finding',
        scope: 'review',
      })
      result.current.register('r', vi.fn(), {
        description: 'Reject finding',
        scope: 'review',
      })
      result.current.register('f', vi.fn(), {
        description: 'Flag finding',
        scope: 'review',
      })
    })

    const allBindings = result.current.getAllBindings()
    expect(allBindings).toHaveLength(3)

    const descriptions = allBindings.map((b) => b.description)
    expect(descriptions).toContain('Accept finding')
    expect(descriptions).toContain('Reject finding')
    expect(descriptions).toContain('Flag finding')
  })

  it('[P2] G5b: checkConflict should detect existing registration in same scope', () => {
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', vi.fn(), {
        description: 'Accept finding',
        scope: 'review',
      })
    })

    const conflict = result.current.checkConflict('a', 'review')
    expect(conflict.hasConflict).toBe(true)
    expect(conflict.conflictWith).toBe('Accept finding')
    expect(conflict.scope).toBe('review')
    expect(conflict.key).toBe('a')

    // No conflict in a different scope
    const noConflict = result.current.checkConflict('a', 'modal')
    expect(noConflict.hasConflict).toBe(false)
    expect(noConflict.conflictWith).toBeNull()
    expect(noConflict.scope).toBeNull()
    expect(noConflict.key).toBeNull()
  })

  it('[P2] G6: should allow hotkey in input element when allowInInput is true', () => {
    const blockedHandler = vi.fn()
    const allowedHandler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('k', blockedHandler, {
        description: 'Navigate up (blocked in input)',
        scope: 'review',
        allowInInput: false,
      })
    })

    // Create an INPUT element and append to body so events bubble to document
    const inputEl = document.createElement('input')
    document.body.appendChild(inputEl)

    try {
      // Dispatch 'k' from input — should be blocked (allowInInput=false)
      const blockedEvent = new KeyboardEvent('keydown', { key: 'k', bubbles: true })
      Object.defineProperty(blockedEvent, 'target', { value: inputEl })

      act(() => {
        document.dispatchEvent(blockedEvent)
      })
      expect(blockedHandler).not.toHaveBeenCalled()

      // Re-register with allowInInput: true
      act(() => {
        result.current.unregister('k', 'review')
        result.current.register('k', allowedHandler, {
          description: 'Navigate up (allowed in input)',
          scope: 'review',
          allowInInput: true,
        })
      })

      const allowedEvent = new KeyboardEvent('keydown', { key: 'k', bubbles: true })
      Object.defineProperty(allowedEvent, 'target', { value: inputEl })

      act(() => {
        document.dispatchEvent(allowedEvent)
      })
      expect(allowedHandler).toHaveBeenCalledTimes(1)
    } finally {
      inputEl.remove()
    }
  })
})
