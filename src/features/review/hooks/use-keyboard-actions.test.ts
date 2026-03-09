/**
 * TDD GREEN PHASE — Story 4.0: Review Infrastructure Setup
 * Hook: useKeyboardActions
 * Tests for keyboard shortcut management, IME handling, scope isolation
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  useKeyboardActions,
  _setConflictWarnHandler,
  _resetRegistry,
} from '@/features/review/hooks/use-keyboard-actions'

describe('useKeyboardActions', () => {
  beforeEach(() => {
    _resetRegistry()
    vi.clearAllMocks()
  })

  afterEach(() => {
    _resetRegistry()
    vi.restoreAllMocks()
  })

  // ── P0: IME Composition Guard ──

  it('[P0] K1: should ignore keypress during IME composition', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', handler, {
        scope: 'review',
        description: 'Accept finding',
      })
    })

    // Dispatch with isComposing=true
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
      })
      Object.defineProperty(event, 'isComposing', { value: true })
      document.dispatchEvent(event)
    })

    expect(handler).not.toHaveBeenCalled()

    // Dispatch with keyCode=229
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        keyCode: 229,
        bubbles: true,
      })
      document.dispatchEvent(event)
    })

    expect(handler).not.toHaveBeenCalled()
  })

  // ── P0: Browser Shortcut Passthrough ──

  it('[P0] K2: should not preventDefault on browser shortcuts Ctrl+S/P/W/N/T/F5', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    // Register a global handler that would match these
    act(() => {
      result.current.register('ctrl+s', handler, {
        scope: 'global',
        description: 'test',
      })
    })

    const browserShortcuts = [
      { key: 's', ctrlKey: true },
      { key: 'p', ctrlKey: true },
      { key: 'w', ctrlKey: true },
      { key: 'n', ctrlKey: true },
      { key: 't', ctrlKey: true },
      { key: 'F5', ctrlKey: false },
    ]

    for (const shortcut of browserShortcuts) {
      const event = new KeyboardEvent('keydown', {
        key: shortcut.key,
        ctrlKey: shortcut.ctrlKey,
        bubbles: true,
      })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      act(() => {
        document.dispatchEvent(event)
      })

      expect(preventDefaultSpy).not.toHaveBeenCalled()
    }

    // Handler should NOT have been called for any browser shortcut
    expect(handler).not.toHaveBeenCalled()
  })

  // ── P0: Modal Scope Suppression ──

  it('[P0] K3: should suppress review hotkeys when modal scope active', () => {
    const reviewHandler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', reviewHandler, {
        scope: 'review',
        description: 'Accept finding',
      })
    })

    // Push modal scope (higher priority)
    act(() => {
      result.current.pushScope('modal')
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })

    expect(reviewHandler).not.toHaveBeenCalled()

    // Pop modal scope — review should work again
    act(() => {
      result.current.popScope('modal')
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })

    expect(reviewHandler).toHaveBeenCalledTimes(1)
  })

  // ── P1: Duplicate Key Warning ──

  it('[P1] K4: should warn when duplicate key registered in same scope', () => {
    const warnFn = vi.fn()
    _setConflictWarnHandler(warnFn)

    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', () => {}, {
        scope: 'review',
        description: 'First handler',
      })
    })

    act(() => {
      result.current.register('a', () => {}, {
        scope: 'review',
        description: 'Second handler',
      })
    })

    expect(warnFn).toHaveBeenCalledTimes(1)
    expect(warnFn).toHaveBeenCalledWith(expect.stringContaining('Duplicate key'))
  })

  // ── P1: Input Element Suppression ──

  it('[P1] K5: should suppress hotkeys in input/textarea/select/contenteditable', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', handler, {
        scope: 'review',
        description: 'Accept finding',
      })
    })

    const suppressedElements = ['INPUT', 'TEXTAREA', 'SELECT']

    for (const tagName of suppressedElements) {
      const element = document.createElement(tagName)
      document.body.appendChild(element)

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
      })
      Object.defineProperty(event, 'target', { value: element })

      act(() => {
        document.dispatchEvent(event)
      })

      document.body.removeChild(element)
    }

    // contenteditable
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    document.body.appendChild(div)

    const ceEvent = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
    })
    Object.defineProperty(ceEvent, 'target', { value: div })

    act(() => {
      document.dispatchEvent(ceEvent)
    })

    document.body.removeChild(div)

    expect(handler).not.toHaveBeenCalled()
  })

  // ── P1: Cleanup on Unmount ──

  it('[P1] K6: should cleanup event listener on component unmount', () => {
    const handler = vi.fn()
    const { result, unmount } = renderHook(() => useKeyboardActions())

    act(() => {
      result.current.register('a', handler, {
        scope: 'review',
        description: 'Accept finding',
      })
    })

    // Verify it works before unmount
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })
    expect(handler).toHaveBeenCalledTimes(1)

    // Unmount
    unmount()

    // Dispatch after unmount
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })

    // Handler should NOT be called again
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
