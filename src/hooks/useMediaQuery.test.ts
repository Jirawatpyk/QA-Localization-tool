/**
 * RED PHASE: Will pass after Story 4.1d implementation
 *
 * Tests — Story 4.1d: useMediaQuery hook + breakpoint presets
 * Test IDs: T4.1, T4.2, T4.3, T4.4 + boundary tests
 *
 * Hook pattern based on existing useReducedMotion.ts
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useMediaQuery, useIsDesktop, useIsLaptop, useIsMobile } from '@/hooks/useMediaQuery'

// ── matchMedia mock factory ──

type MediaQueryListMock = {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  onchange: null
  addListener: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
}

function createMatchMediaMock(matches: boolean) {
  return vi.fn().mockImplementation(
    (query: string): MediaQueryListMock => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  )
}

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Core hook behavior
  // ═══════════════════════════════════════════════════════════════════════

  it('[P0] should return true when matchMedia matches', () => {
    // Arrange: stub matchMedia to return matches=true
    vi.stubGlobal('matchMedia', createMatchMediaMock(true))

    // Act
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))

    // Assert
    expect(result.current).toBe(true)
  })

  it('[P0] should return false when matchMedia does not match', () => {
    // Arrange: stub matchMedia to return matches=false
    vi.stubGlobal('matchMedia', createMatchMediaMock(false))

    // Act
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))

    // Assert
    expect(result.current).toBe(false)
  })

  it('[P1] should be SSR safe: returns false when window is undefined', () => {
    // Arrange: remove matchMedia to simulate SSR
    const originalMatchMedia = window.matchMedia
    // @ts-expect-error — intentionally removing for SSR simulation
    delete window.matchMedia

    // Act
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))

    // Assert: SSR default = false
    expect(result.current).toBe(false)

    // Cleanup
    window.matchMedia = originalMatchMedia
  })

  it('[P1] should update on change event (listener fires)', () => {
    // Arrange: start with matches=false, then simulate change to true
    let changeHandler: ((e: { matches: boolean }) => void) | null = null

    const mockMql: MediaQueryListMock = {
      matches: false,
      media: '(min-width: 1024px)',
      addEventListener: vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
        if (event === 'change') {
          changeHandler = handler
        }
      }),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql))

    // Act: render hook
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)

    // Simulate media change event
    act(() => {
      if (changeHandler) {
        changeHandler({ matches: true })
      }
    })

    // Assert: should update to true
    expect(result.current).toBe(true)
  })

  it('[P1] should cleanup: removes listener on unmount', () => {
    // Arrange
    const removeEventListenerMock = vi.fn()
    const mockMql: MediaQueryListMock = {
      matches: true,
      media: '(min-width: 1024px)',
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerMock,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMql))

    // Act: render and unmount
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    unmount()

    // Assert: removeEventListener called with 'change'
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })

  // ═══ TA Coverage: Story 4.1d gaps ═══

  it('[TA-G10][P2] should re-subscribe when query param changes (remove old listener, add new)', () => {
    // Arrange: track per-MQL listeners
    const mqlA: MediaQueryListMock = {
      matches: true,
      media: '(min-width: 1024px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
    const mqlB: MediaQueryListMock = {
      matches: false,
      media: '(min-width: 1440px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }

    const matchMediaMock = vi.fn((query: string) => {
      if (query === '(min-width: 1024px)') return mqlA
      if (query === '(min-width: 1440px)') return mqlB
      return mqlA
    })
    vi.stubGlobal('matchMedia', matchMediaMock)

    // Act: render with query A
    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useMediaQuery(query),
      { initialProps: { query: '(min-width: 1024px)' } },
    )

    // Assert: initial state from mqlA
    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(mqlA.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(result.current).toBe(true)

    // Act: change query to B
    rerender({ query: '(min-width: 1440px)' })

    // Assert: old listener removed, new one added
    expect(mqlA.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1440px)')
    expect(mqlB.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(result.current).toBe(false)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Breakpoint presets (boundary tests)
  // ═══════════════════════════════════════════════════════════════════════

  it('[P0] useIsDesktop — should return true at min-width 1440px', () => {
    // Arrange: mock matchMedia to match desktop breakpoint
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(
        (query: string): MediaQueryListMock => ({
          matches: query === '(min-width: 1440px)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      ),
    )

    // Act
    const { result } = renderHook(() => useIsDesktop())

    // Assert
    expect(result.current).toBe(true)
  })

  it('[P0] useIsLaptop — should return true at min-width 1024px', () => {
    // Arrange: mock matchMedia to match laptop breakpoint
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(
        (query: string): MediaQueryListMock => ({
          matches: query === '(min-width: 1024px)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      ),
    )

    // Act
    const { result } = renderHook(() => useIsLaptop())

    // Assert
    expect(result.current).toBe(true)
  })

  it('[P1] useIsMobile — should return true at max-width 767px', () => {
    // Arrange: mock matchMedia to match mobile breakpoint
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(
        (query: string): MediaQueryListMock => ({
          matches: query === '(max-width: 767px)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      ),
    )

    // Act
    const { result } = renderHook(() => useIsMobile())

    // Assert
    expect(result.current).toBe(true)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Negative boundary tests (preset hooks return false at boundary-1)
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] useIsDesktop — should return false below 1440px', () => {
    // Arrange: matchMedia returns false for all queries (viewport < 1440px)
    vi.stubGlobal('matchMedia', createMatchMediaMock(false))

    // Act
    const { result } = renderHook(() => useIsDesktop())

    // Assert
    expect(result.current).toBe(false)
  })

  it('[P1] useIsLaptop — should return false below 1024px', () => {
    // Arrange: matchMedia returns false for all queries (viewport < 1024px)
    vi.stubGlobal('matchMedia', createMatchMediaMock(false))

    // Act
    const { result } = renderHook(() => useIsLaptop())

    // Assert
    expect(result.current).toBe(false)
  })

  it('[P1] useIsMobile — should return false above 767px', () => {
    // Arrange: matchMedia returns false for all queries (viewport >= 768px)
    vi.stubGlobal('matchMedia', createMatchMediaMock(false))

    // Act
    const { result } = renderHook(() => useIsMobile())

    // Assert
    expect(result.current).toBe(false)
  })
})
