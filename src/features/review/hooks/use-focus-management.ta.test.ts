/**
 * TA expansion — Story 4.0: useFocusManagement
 * Gap coverage for autoAdvance wrap-around and invalid currentFindingId
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useFocusManagement } from '@/features/review/hooks/use-focus-management'

describe('useFocusManagement — TA expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('[P2] G7a: autoAdvance should wrap around to beginning when current is last item', () => {
    const rAFSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const findingIds = ['f1', 'f2', 'f3']
    const statusMap = new Map<string, string>([
      ['f1', 'pending'],
      ['f2', 'reviewed'],
      ['f3', 'reviewed'],
    ])

    // Create finding elements in DOM so querySelector can find them
    for (const id of findingIds) {
      const el = document.createElement('div')
      el.setAttribute('data-finding-id', id)
      el.setAttribute('tabindex', '0')
      document.body.appendChild(el)
    }

    const { result } = renderHook(() => useFocusManagement())

    // currentFindingId = 'f3' (last item) — should wrap to 'f1' (first pending)
    let nextId: string | null = null
    act(() => {
      nextId = result.current.autoAdvance(findingIds, statusMap, 'f3')
    })

    // The search order from f3: [nothing after f3], then wraps to [f1, f2]
    // f1 is 'pending' so it should be returned
    expect(nextId).toBe('f1')
    expect(rAFSpy).toHaveBeenCalled()

    // Verify focus was set on the f1 element via requestAnimationFrame
    const f1Element = document.querySelector('[data-finding-id="f1"]')
    expect(document.activeElement).toBe(f1Element)
  })

  it('[P2] G7b: autoAdvance should return null when currentFindingId not in list', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const findingIds = ['f1', 'f2']
    const statusMap = new Map<string, string>([
      ['f1', 'pending'],
      ['f2', 'pending'],
    ])

    const { result } = renderHook(() => useFocusManagement())

    // currentFindingId = 'f999' — not in the list
    let nextId: string | null = null
    act(() => {
      nextId = result.current.autoAdvance(findingIds, statusMap, 'f999')
    })

    // indexOf returns -1, so autoAdvance should return null immediately
    expect(nextId).toBeNull()
  })
})
