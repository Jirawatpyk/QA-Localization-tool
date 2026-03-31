/**
 * useViewportTransition — Encapsulates all responsive viewport transition logic.
 *
 * Extracted from ReviewPageClient.tsx to consolidate the 5+ state variables,
 * 2 render-time adjustment blocks, and 5 callbacks that manage viewport transitions
 * (desktop ↔ laptop ↔ mobile) into a single source of truth.
 *
 * Key patterns:
 * - Render-time adjustment (NOT useEffect) for viewport transition sync (React 19)
 * - useCallback with correct deps for stable identity
 * - selectedId lives in Zustand store — this hook is a consumer, not owner
 */
import { useCallback, useRef, useState } from 'react'

import { useIsDesktop, useIsLaptop } from '@/hooks/useMediaQuery'

type LayoutMode = 'desktop' | 'laptop' | 'mobile'

type UseViewportTransitionOptions = {
  /** Zustand store setter for selectedId */
  setSelectedFinding: (id: string | null) => void
  /** Current selectedId from Zustand store */
  selectedId: string | null
}

type UseViewportTransitionReturn = {
  // ── Read-only state ──
  layoutMode: LayoutMode
  isDesktop: boolean
  isLaptop: boolean

  // ── Sheet state (derived) ──
  sheetOpen: boolean

  // ── Mobile toggle button ──
  showToggleButton: boolean

  // ── Detail panel finding derivation ──
  /** Desktop: activeFindingState, non-desktop: selectedId */
  detailFindingId: string | null

  // ── Callbacks for consumers ──
  handleFindingSelect: (id: string) => void
  handleNavigateAway: () => void
  handleSheetChange: (open: boolean) => void
  handleToggleDrawer: () => void
  handleActiveFindingChange: (id: string | null) => void

  // ── Refs + state for hotkey access ──
  activeFindingIdRef: React.RefObject<string | null>
  activeFindingState: string | null
  selectedIdFromClickRef: React.RefObject<boolean>
}

function getLayoutMode(isDesktop: boolean, isLaptop: boolean): LayoutMode {
  if (isDesktop) return 'desktop'
  if (isLaptop) return 'laptop'
  return 'mobile'
}

export function useViewportTransition({
  setSelectedFinding,
  selectedId,
}: UseViewportTransitionOptions): UseViewportTransitionReturn {
  const isDesktop = useIsDesktop()
  const isLaptop = useIsLaptop()
  const layoutMode = getLayoutMode(isDesktop, isLaptop)

  // ── Internal state ──
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [activeFindingState, setActiveFindingState] = useState<string | null>(null)
  const activeFindingIdRef = useRef<string | null>(null)
  const selectedIdFromClickRef = useRef(false)

  // ── Render-time adjustment: viewport transition sync ──
  // AC6 / TD-UX-005: Sync selectedId when viewport transitions (desktop ↔ laptop/mobile)
  const [prevLayoutMode, setPrevLayoutMode] = useState(layoutMode)
  if (prevLayoutMode !== layoutMode) {
    setPrevLayoutMode(layoutMode)
    // Desktop→non-desktop: sync selectedId from activeFindingState
    if (
      prevLayoutMode === 'desktop' &&
      activeFindingState !== null &&
      selectedId !== activeFindingState
    ) {
      setSelectedFinding(activeFindingState)
    }
    // CR-R2 F8: Non-desktop→desktop: sync selectedId from activeFindingState
    // Prevents empty detail panel after mobile J/K nav → resize to desktop
    if (
      prevLayoutMode !== 'desktop' &&
      layoutMode === 'desktop' &&
      activeFindingState !== null &&
      selectedId !== activeFindingState
    ) {
      setSelectedFinding(activeFindingState)
    }
  }

  // ── Render-time adjustment: phantom Sheet prevention ──
  // CR R2 P1: Mobile→laptop viewport transition — prevent phantom Sheet re-open.
  // When user explicitly closed Sheet at mobile (mobileDrawerOpen=false but selectedId
  // preserved for toggle button), clear selectedId on transition to laptop.
  const [prevLayoutForSheet, setPrevLayoutForSheet] = useState(layoutMode)
  if (prevLayoutForSheet !== layoutMode) {
    setPrevLayoutForSheet(layoutMode)
    if (
      prevLayoutForSheet === 'mobile' &&
      layoutMode === 'laptop' &&
      !mobileDrawerOpen &&
      selectedId !== null
    ) {
      setSelectedFinding(null)
    }
  }

  // ── Derived values ──
  const showToggleButton = !isDesktop && !isLaptop && selectedId !== null && !mobileDrawerOpen

  const sheetOpen = isDesktop
    ? false
    : isLaptop
      ? selectedId !== null
      : mobileDrawerOpen && selectedId !== null

  const detailFindingId = isDesktop ? activeFindingState : selectedId

  // ── Callbacks ──

  const handleActiveFindingChange = useCallback(
    (id: string | null) => {
      activeFindingIdRef.current = id
      setActiveFindingState(id)
      // Desktop only: sync selectedId for aside detail panel (non-blocking, side-by-side).
      // Laptop/mobile: do NOT sync here — Sheet is a blocking overlay.
      if (isDesktop) {
        selectedIdFromClickRef.current = true
        setSelectedFinding(id)
        queueMicrotask(() => {
          selectedIdFromClickRef.current = false
        })
      }
    },
    [isDesktop, setSelectedFinding],
  )

  // Separate handler for finding selection at non-desktop (Sheet opening).
  // Called only from FindingCardCompact click — NOT from J/K navigation.
  const handleFindingSelect = useCallback(
    (id: string) => {
      if (isDesktop) return
      selectedIdFromClickRef.current = true
      setSelectedFinding(id)
      queueMicrotask(() => {
        selectedIdFromClickRef.current = false
      })
      if (!isLaptop) {
        setMobileDrawerOpen(true)
      }
    },
    [isDesktop, isLaptop, setSelectedFinding],
  )

  // Close Sheet when J/K navigates away at non-desktop (P1 fix: stale Sheet content).
  const handleNavigateAway = useCallback(() => {
    if (!isDesktop && selectedId !== null) {
      setSelectedFinding(null)
      setMobileDrawerOpen(false)
    }
  }, [isDesktop, selectedId, setSelectedFinding])

  const handleSheetChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (isLaptop) {
          // Laptop: clear selectedId to close Sheet (no toggle button at laptop)
          setSelectedFinding(null)
        } else {
          // Mobile: keep selectedId so toggle button appears (ATDD T3.3)
          setMobileDrawerOpen(false)
        }
      }
    },
    [isLaptop, setSelectedFinding],
  )

  const handleToggleDrawer = useCallback(() => {
    setMobileDrawerOpen(true)
  }, [])

  return {
    layoutMode,
    isDesktop,
    isLaptop,
    sheetOpen,
    showToggleButton,
    detailFindingId,
    handleFindingSelect,
    handleNavigateAway,
    handleSheetChange,
    handleToggleDrawer,
    handleActiveFindingChange,
    activeFindingIdRef,
    activeFindingState,
    selectedIdFromClickRef,
  }
}
