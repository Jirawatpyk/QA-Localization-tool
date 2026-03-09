/**
 * TDD GREEN PHASE — Story 4.0: Review Infrastructure Setup
 * Hook: useFocusManagement
 * Tests for focus trap, restore, auto-advance, Esc hierarchy
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useFocusManagement } from '@/features/review/hooks/use-focus-management'

describe('useFocusManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  // ── P0: Modal Focus Trap ──

  it('[P0] F1: should trap Tab within modal boundary', () => {
    // Create container with 3 focusable elements
    const container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const input = document.createElement('input')
    const btn2 = document.createElement('button')
    btn2.textContent = 'Last'
    container.appendChild(btn1)
    container.appendChild(input)
    container.appendChild(btn2)
    document.body.appendChild(container)

    const { result } = renderHook(() => useFocusManagement())

    let trap: ReturnType<typeof result.current.trapFocus>
    act(() => {
      trap = result.current.trapFocus(container)
      trap.activate()
    })

    // Focus should be on first element
    expect(document.activeElement).toBe(btn1)

    // Focus the last element
    btn2.focus()
    expect(document.activeElement).toBe(btn2)

    // Press Tab on last → should wrap to first
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
    })
    const preventSpy = vi.spyOn(tabEvent, 'preventDefault')
    container.dispatchEvent(tabEvent)

    expect(preventSpy).toHaveBeenCalled()
    expect(document.activeElement).toBe(btn1)

    // Cleanup
    act(() => {
      trap!.deactivate()
    })
  })

  // ── P0: Focus Restore After Modal Close ──

  it('[P0] F2: should restore focus to trigger element after modal close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open Modal'
    document.body.appendChild(trigger)
    trigger.focus()

    const { result } = renderHook(() => useFocusManagement())

    // Save focus before modal open
    act(() => {
      result.current.saveFocus()
    })

    // Simulate modal open — focus moves away
    const modalBtn = document.createElement('button')
    modalBtn.textContent = 'Modal Button'
    document.body.appendChild(modalBtn)
    modalBtn.focus()
    expect(document.activeElement).toBe(modalBtn)

    // Close modal — restore focus
    act(() => {
      result.current.restoreFocus()
    })

    expect(document.activeElement).toBe(trigger)
  })

  // ── P0: Auto-Advance to Next Pending ──

  it('[P0] F3: should auto-advance to next Pending finding, skipping reviewed', () => {
    const rAFSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    // Create finding elements in DOM
    const findingIds = ['f1', 'f2', 'f3', 'f4']
    const statusMap = new Map([
      ['f1', 'accepted'],
      ['f2', 'pending'],
      ['f3', 'accepted'],
      ['f4', 'pending'],
    ])

    for (const id of findingIds) {
      const el = document.createElement('div')
      el.setAttribute('data-finding-id', id)
      el.setAttribute('tabindex', '0')
      document.body.appendChild(el)
    }

    const { result } = renderHook(() => useFocusManagement())

    // Focus f2 (first pending), auto-advance from it (simulating action taken)
    let nextId: string | null = null
    act(() => {
      nextId = result.current.autoAdvance(findingIds, statusMap, 'f2')
    })

    // Should advance to f4 (next pending after f2, skipping f3 which is accepted)
    expect(nextId).toBe('f4')
    expect(rAFSpy).toHaveBeenCalled()
  })

  // ── P1: Focus Action Bar When No Pending ──

  it('[P1] F3b: should focus action bar when no Pending findings remain', () => {
    const rAFSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const findingIds = ['f1', 'f2']
    const statusMap = new Map([
      ['f1', 'accepted'],
      ['f2', 'accepted'],
    ])

    // Create action bar
    const actionBar = document.createElement('div')
    actionBar.setAttribute('role', 'toolbar')
    actionBar.setAttribute('tabindex', '0')
    document.body.appendChild(actionBar)

    const { result } = renderHook(() => useFocusManagement())

    let nextId: string | null
    act(() => {
      nextId = result.current.autoAdvance(findingIds, statusMap, 'f1')
    })

    expect(nextId!).toBeNull()
    expect(rAFSpy).toHaveBeenCalled()
    expect(document.activeElement).toBe(actionBar)
  })

  // ── P1: requestAnimationFrame for Auto-Advance ──

  it('[P1] F4: should use requestAnimationFrame for auto-advance focus', () => {
    const rAFSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)

    const findingIds = ['f1', 'f2']
    const statusMap = new Map([
      ['f1', 'pending'],
      ['f2', 'pending'],
    ])

    const { result } = renderHook(() => useFocusManagement())

    act(() => {
      result.current.autoAdvance(findingIds, statusMap, 'f1')
    })

    expect(rAFSpy).toHaveBeenCalled()
  })

  // ── P0: Escape Key Hierarchy ──

  it('[P0] F5: should close only innermost layer on Esc press with stopPropagation', () => {
    const outerClose = vi.fn()
    const innerClose = vi.fn()

    const { result } = renderHook(() => useFocusManagement())

    // Push 2 layers: outer (expanded) then inner (dropdown)
    act(() => {
      result.current.pushEscapeLayer('expanded', outerClose)
      result.current.pushEscapeLayer('dropdown', innerClose)
    })

    // Press Esc — only innermost should close
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    })
    const stopPropSpy = vi.spyOn(escEvent, 'stopPropagation')

    let closedLevel: string | null = null
    act(() => {
      closedLevel = result.current.handleEscape(escEvent)
    })

    expect(closedLevel).toBe('dropdown')
    expect(innerClose).toHaveBeenCalledTimes(1)
    expect(outerClose).not.toHaveBeenCalled()
    expect(stopPropSpy).toHaveBeenCalled()
  })

  // ── P1: Focus Restore After Re-Render ──

  it('[P1] F6: should handle focus restore after component re-render', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    const { result, rerender } = renderHook(() => useFocusManagement())

    // Save focus
    act(() => {
      result.current.saveFocus()
    })

    // Move focus away
    const otherEl = document.createElement('input')
    document.body.appendChild(otherEl)
    otherEl.focus()

    // Re-render the hook (simulating props change)
    rerender()

    // Restore focus — should still work after re-render (Guardrail #12: useRef persists)
    act(() => {
      result.current.restoreFocus()
    })

    expect(document.activeElement).toBe(trigger)
  })
})
