/**
 * useViewportTransition — Unit tests for viewport transition logic.
 *
 * S-FIX-4: aside mode for ALL >= 1024px (desktop/laptop/compact), Sheet only at < 1024px (mobile).
 * Layout modes: desktop (>= 1440), laptop (1280-1439), compact (1024-1279), mobile (< 1024).
 *
 * T1-T3: Viewport transition scenarios (aside↔mobile selectedId sync)
 * T4-T5: Sheet close behavior (J/K nav, mobile close preserves selectedId)
 * T6: sheetOpen derivation for all 4 modes
 * T7-T9: handleFindingSelect behavior per layout mode
 * T10-T11: handleActiveFindingChange aside mode vs mobile
 * T12: detailFindingId derivation
 * T13: isAsideMode flag correctness
 * T14: mobile→aside transition syncs activeFindingState
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useViewportTransition } from '@/features/review/hooks/use-viewport-transition'

// ── Mock useIsDesktop / useIsXl / useIsLaptop ──

let mockIsDesktop = true
let mockIsXl = true
let mockIsLaptop = true

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => mockIsDesktop,
  useIsXl: () => mockIsXl,
  useIsLaptop: () => mockIsLaptop,
}))

function setViewport(mode: 'desktop' | 'laptop' | 'compact' | 'mobile') {
  if (mode === 'desktop') {
    mockIsDesktop = true
    mockIsXl = true
    mockIsLaptop = true
  } else if (mode === 'laptop') {
    mockIsDesktop = false
    mockIsXl = true
    mockIsLaptop = true
  } else if (mode === 'compact') {
    mockIsDesktop = false
    mockIsXl = false
    mockIsLaptop = true
  } else {
    mockIsDesktop = false
    mockIsXl = false
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

  // ── T1: Desktop → laptop is seamless (both aside mode — no special sync) ──
  it('T1: should keep aside mode when transitioning desktop → laptop', () => {
    setViewport('desktop')
    const { result, rerender } = renderVTHook(null)

    act(() => {
      result.current.handleActiveFindingChange('f-1')
    })
    mockSetSelectedFinding.mockClear()

    // Transition to laptop — both are aside mode, no sync needed
    setViewport('laptop')
    rerender({ selectedId: 'f-1' })

    expect(result.current.layoutMode).toBe('laptop')
    expect(result.current.isAsideMode).toBe(true)
    expect(result.current.activeFindingState).toBe('f-1')
  })

  // ── T2: Aside mode → mobile syncs selectedId from activeFindingState ──
  it('T2: should sync selectedId from activeFindingState on compact → mobile transition', () => {
    setViewport('compact')
    const { result, rerender } = renderVTHook(null)

    act(() => {
      result.current.handleActiveFindingChange('f-2')
    })
    mockSetSelectedFinding.mockClear()

    // Transition to mobile — activeFindingState=f-2, selectedId might lag
    setViewport('mobile')
    rerender({ selectedId: null })

    // Hook should call setSelectedFinding(activeFindingState) and open drawer
    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-2')
  })

  // ── T3: Mobile → aside transition syncs selectedId from activeFindingState ──
  it('T3: should sync selectedId on mobile → compact transition', () => {
    setViewport('mobile')
    const { result, rerender } = renderVTHook(null)

    // Set activeFindingState at mobile
    act(() => {
      result.current.handleActiveFindingChange('f-3')
    })
    mockSetSelectedFinding.mockClear()

    // Transition mobile → compact (aside mode)
    setViewport('compact')
    rerender({ selectedId: null })

    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-3')
    expect(result.current.isAsideMode).toBe(true)
  })

  // ── T4: J/K at mobile closes Sheet ──
  it('T4: should clear selectedId and mobileDrawerOpen on handleNavigateAway at mobile', () => {
    setViewport('mobile')
    const { result } = renderVTHook('f-4')

    act(() => {
      result.current.handleNavigateAway()
    })

    expect(mockSetSelectedFinding).toHaveBeenCalledWith(null)
  })

  // ── T4b: handleNavigateAway at aside mode is no-op ──
  it('T4b: should be no-op when handleNavigateAway called at aside mode', () => {
    setViewport('compact')
    const { result } = renderVTHook('f-4')

    act(() => {
      result.current.handleNavigateAway()
    })

    expect(mockSetSelectedFinding).not.toHaveBeenCalled()
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
    const nullCalls = mockSetSelectedFinding.mock.calls.filter(
      (call: unknown[]) => call[0] === null,
    )
    expect(nullCalls).toHaveLength(0)

    // Toggle button should be visible (selectedId present, drawer closed)
    expect(result.current.showToggleButton).toBe(true)
  })

  // ── T6: sheetOpen derivation for all 4 layout modes ──
  it('T6: should derive sheetOpen correctly for all layout modes', () => {
    // Desktop: always false (aside mode)
    setViewport('desktop')
    const { result: desktopResult } = renderVTHook('f-6')
    expect(desktopResult.current.sheetOpen).toBe(false)

    // Laptop: always false (aside mode — S-FIX-4 change)
    setViewport('laptop')
    const { result: laptopResult } = renderVTHook('f-6')
    expect(laptopResult.current.sheetOpen).toBe(false)

    // Tablet: always false (aside mode — S-FIX-4 change)
    setViewport('compact')
    const { result: compactResult } = renderVTHook('f-6')
    expect(compactResult.current.sheetOpen).toBe(false)

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

  // ── T7: handleFindingSelect at desktop = no-op (aside mode) ──
  it('T7: should be a no-op when handleFindingSelect called at desktop', () => {
    setViewport('desktop')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleFindingSelect('f-7')
    })

    expect(mockSetSelectedFinding).not.toHaveBeenCalled()
  })

  // ── T8: handleFindingSelect at compact = no-op (aside mode — S-FIX-4) ──
  it('T8: should be a no-op when handleFindingSelect called at compact (aside mode)', () => {
    setViewport('compact')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleFindingSelect('f-8')
    })

    expect(mockSetSelectedFinding).not.toHaveBeenCalled()
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

  // ── T10: handleActiveFindingChange at desktop syncs to selectedId (aside mode) ──
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

  // ── T11: handleActiveFindingChange at compact syncs to selectedId (aside mode — S-FIX-4) ──
  it('T11: should sync to selectedId when handleActiveFindingChange called at compact (aside mode)', () => {
    setViewport('compact')
    const { result } = renderVTHook(null)

    act(() => {
      result.current.handleActiveFindingChange('f-11')
    })

    // S-FIX-4: compact is aside mode, so selectedId should be synced
    expect(mockSetSelectedFinding).toHaveBeenCalledWith('f-11')
    expect(result.current.activeFindingState).toBe('f-11')
    expect(result.current.activeFindingIdRef.current).toBe('f-11')
  })

  // ── T12: detailFindingId derivation ──
  it('T12: should use activeFindingState at aside mode and selectedId at mobile', () => {
    // Desktop: detailFindingId = activeFindingState
    setViewport('desktop')
    const { result: desktopResult } = renderVTHook('store-id')

    act(() => {
      desktopResult.current.handleActiveFindingChange('active-id')
    })

    expect(desktopResult.current.detailFindingId).toBe('active-id')

    // Tablet: detailFindingId = activeFindingState (aside mode — S-FIX-4)
    setViewport('compact')
    const { result: compactResult } = renderVTHook('store-id')

    act(() => {
      compactResult.current.handleActiveFindingChange('compact-active')
    })

    expect(compactResult.current.detailFindingId).toBe('compact-active')

    // Mobile: detailFindingId = selectedId (from store)
    setViewport('mobile')
    const { result: mobileResult } = renderVTHook('store-id')
    expect(mobileResult.current.detailFindingId).toBe('store-id')
  })

  // ── T13: isAsideMode flag correctness ──
  it('T13: should set isAsideMode true for desktop/laptop/compact, false for mobile', () => {
    setViewport('desktop')
    const { result: dr } = renderVTHook(null)
    expect(dr.current.isAsideMode).toBe(true)

    setViewport('laptop')
    const { result: lr } = renderVTHook(null)
    expect(lr.current.isAsideMode).toBe(true)

    setViewport('compact')
    const { result: tr } = renderVTHook(null)
    expect(tr.current.isAsideMode).toBe(true)

    setViewport('mobile')
    const { result: mr } = renderVTHook(null)
    expect(mr.current.isAsideMode).toBe(false)
  })

  // ── T14: Layout mode derivation ──
  it('T14: should derive correct layoutMode for each viewport', () => {
    setViewport('desktop')
    const { result: dr } = renderVTHook(null)
    expect(dr.current.layoutMode).toBe('desktop')

    setViewport('laptop')
    const { result: lr } = renderVTHook(null)
    expect(lr.current.layoutMode).toBe('laptop')

    setViewport('compact')
    const { result: tr } = renderVTHook(null)
    expect(tr.current.layoutMode).toBe('compact')

    setViewport('mobile')
    const { result: mr } = renderVTHook(null)
    expect(mr.current.layoutMode).toBe('mobile')
  })
})
