/**
 * useViewportTransition — Unit tests for viewport transition logic.
 *
 * T1-T3: Viewport transition scenarios (desktop↔laptop↔mobile selectedId sync)
 * T4-T5: Sheet close behavior (J/K nav, mobile close preserves selectedId)
 * T6: sheetOpen derivation for all 3 modes
 * T7-T9: handleFindingSelect behavior per layout mode
 * T10-T11: handleActiveFindingChange desktop vs non-desktop
 * T12: detailFindingId derivation
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useViewportTransition } from '@/features/review/hooks/use-viewport-transition'

// ── Mock useIsDesktop / useIsLaptop ──

let mockIsDesktop = true
let mockIsLaptop = true

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => mockIsDesktop,
  useIsLaptop: () => mockIsLaptop,
}))

function setViewport(mode: 'desktop' | 'laptop' | 'mobile') {
  if (mode === 'desktop') {
    mockIsDesktop = true
    mockIsLaptop = true
  } else if (mode === 'laptop') {
    mockIsDesktop = false
    mockIsLaptop = true
  } else {
    mockIsDesktop = false
    mockIsLaptop = false
  }
}

describe('useViewportTransition', () => {
  const mockSetSelectedFinding = vi.fn()

  beforeEach(() => {
    mockSetSelectedFinding.mockClear()
    setViewport('desktop')
  })

  function renderVTHook(selectedId: string | null = null) {
    return renderHook(
      ({ selectedId: sid }) =>
        useViewportTransition({
          setSelectedFinding: mockSetSelectedFinding,
          selectedId: sid,
        }),
      { initialProps: { selectedId } },
    )
  }

  // ── T1: Desktop → laptop syncs selectedId from activeFindingState ──
  it('T1: should sync selectedId from activeFindingState on desktop → laptop transition', () => {
    setViewport('desktop')
    const { result, rerender } = renderVTHook(null)

    // Set active finding at desktop (syncs to selectedId via handleActiveFindingChange)
    act(() => {
      result.current.handleActiveFindingChange('f-1')
    })

    // Transition to laptop
    setViewport('laptop')
    rerender({ selectedId: 'f-1' }) // store has f-1 from desktop sync

    expect(result.current.layoutMode).toBe('laptop')
    // activeFindingState should still be f-1
    expect(result.current.activeFindingState).toBe('f-1')
  })

  // ── T2: Non-desktop → desktop syncs selectedId from activeFindingState ──
  it('T2: should sync selectedId from activeFindingState on laptop → desktop transition', () => {
    setViewport('laptop')
    const { result, rerender } = renderVTHook(null)

    // Simulate user click at laptop (sets selectedId via store, activeFindingState via list)
    act(() => {
      result.current.handleActiveFindingChange('f-2')
    })

    // Transition to desktop — activeFindingState=f-2, selectedId might be null (not synced at laptop)
    setViewport('desktop')
    rerender({ selectedId: null })

    // Hook should call setSelectedFinding(activeFindingState) during render
    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-2')
  })

  // ── T3: Mobile → laptop clears selectedId when mobileDrawerOpen=false (phantom prevention) ──
  it('T3: should clear selectedId on mobile → laptop when mobileDrawerOpen is false', () => {
    setViewport('mobile')
    const { result, rerender } = renderVTHook(null)

    // User clicks finding at mobile → opens Sheet
    act(() => {
      result.current.handleFindingSelect('f-3')
    })

    // User closes Sheet at mobile (mobileDrawerOpen=false, selectedId preserved)
    act(() => {
      result.current.handleSheetChange(false)
    })

    // Transition mobile → laptop (selectedId still 'f-3' in store, but drawer closed)
    setViewport('laptop')
    rerender({ selectedId: 'f-3' })

    // Should clear selectedId to prevent phantom Sheet
    expect(mockSetSelectedFinding).toHaveBeenCalledWith(null)
  })

  // ── T4: J/K at non-desktop closes Sheet ──
  it('T4: should clear selectedId and mobileDrawerOpen on handleNavigateAway', () => {
    setViewport('laptop')
    const { result } = renderVTHook('f-4')

    act(() => {
      result.current.handleNavigateAway()
    })

    expect(mockSetSelectedFinding).toHaveBeenCalledWith(null)
    // sheetOpen should become false after rerender with null selectedId
  })

  // ── T5: Mobile Sheet close preserves selectedId for toggle button ──
  it('T5: should preserve selectedId when closing Sheet at mobile', () => {
    setViewport('mobile')
    const { result } = renderVTHook('f-5')

    // Open drawer first
    act(() => {
      result.current.handleToggleDrawer()
    })

    // Close Sheet at mobile
    act(() => {
      result.current.handleSheetChange(false)
    })

    // Should NOT have cleared selectedId — only cleared mobileDrawerOpen
    // (setSelectedFinding(null) should NOT have been called for mobile close)
    const nullCalls = mockSetSelectedFinding.mock.calls.filter(
      (call: unknown[]) => call[0] === null,
    )
    expect(nullCalls).toHaveLength(0)

    // Toggle button should be visible (selectedId present, drawer closed)
    expect(result.current.showToggleButton).toBe(true)
  })

  // ── T6: sheetOpen derivation for all 3 layout modes ──
  it('T6: should derive sheetOpen correctly for desktop, laptop, and mobile', () => {
    // Desktop: always false
    setViewport('desktop')
    const { result: desktopResult } = renderVTHook('f-6')
    expect(desktopResult.current.sheetOpen).toBe(false)

    // Laptop: true when selectedId is non-null
    setViewport('laptop')
    const { result: laptopWithId } = renderVTHook('f-6')
    expect(laptopWithId.current.sheetOpen).toBe(true)

    setViewport('laptop')
    const { result: laptopNoId } = renderVTHook(null)
    expect(laptopNoId.current.sheetOpen).toBe(false)

    // Mobile: true only when mobileDrawerOpen AND selectedId
    setViewport('mobile')
    const { result: mobileResult } = renderVTHook('f-6')
    // Drawer not opened yet — should be false
    expect(mobileResult.current.sheetOpen).toBe(false)

    // Open drawer
    act(() => {
      mobileResult.current.handleToggleDrawer()
    })
    expect(mobileResult.current.sheetOpen).toBe(true)
  })

  // ── T7: handleFindingSelect at desktop = no-op ──
  it('T7: should be a no-op when handleFindingSelect called at desktop', () => {
    setViewport('desktop')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleFindingSelect('f-7')
    })

    expect(mockSetSelectedFinding).not.toHaveBeenCalled()
  })

  // ── T8: handleFindingSelect at laptop = sets selectedId ──
  it('T8: should set selectedId when handleFindingSelect called at laptop', () => {
    setViewport('laptop')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleFindingSelect('f-8')
    })

    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-8')
  })

  // ── T9: handleFindingSelect at mobile = sets selectedId + mobileDrawerOpen ──
  it('T9: should set selectedId and open drawer when handleFindingSelect called at mobile', () => {
    setViewport('mobile')
    const { result, rerender } = renderVTHook(null)

    act(() => {
      result.current.handleFindingSelect('f-9')
    })

    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-9')

    // Rerender with the new selectedId to see sheetOpen
    rerender({ selectedId: 'f-9' })
    expect(result.current.sheetOpen).toBe(true)
  })

  // ── T10: handleActiveFindingChange at desktop syncs to selectedId ──
  it('T10: should sync to selectedId when handleActiveFindingChange called at desktop', () => {
    setViewport('desktop')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleActiveFindingChange('f-10')
    })

    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-10')
    expect(result.current.activeFindingState).toBe('f-10')
    expect(result.current.activeFindingIdRef.current).toBe('f-10')
  })

  // ── T11: handleActiveFindingChange at laptop does NOT sync to selectedId ──
  it('T11: should NOT sync to selectedId when handleActiveFindingChange called at laptop', () => {
    setViewport('laptop')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleActiveFindingChange('f-11')
    })

    expect(mockSetSelectedFinding).not.toHaveBeenCalled()
    expect(result.current.activeFindingState).toBe('f-11')
    expect(result.current.activeFindingIdRef.current).toBe('f-11')
  })

  // ── T12: detailFindingId derivation ──
  it('T12: should use activeFindingState at desktop and selectedId at non-desktop', () => {
    // Desktop: detailFindingId = activeFindingState
    setViewport('desktop')
    const { result: desktopResult } = renderVTHook('store-id')

    act(() => {
      desktopResult.current.handleActiveFindingChange('active-id')
    })

    expect(desktopResult.current.detailFindingId).toBe('active-id')

    // Laptop: detailFindingId = selectedId (from store)
    setViewport('laptop')
    const { result: laptopResult } = renderVTHook('store-id')
    expect(laptopResult.current.detailFindingId).toBe('store-id')

    // Mobile: detailFindingId = selectedId (from store)
    setViewport('mobile')
    const { result: mobileResult } = renderVTHook('store-id')
    expect(mobileResult.current.detailFindingId).toBe('store-id')
  })
})
