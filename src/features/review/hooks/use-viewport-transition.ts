/**
 * useViewportTransition — Encapsulates all responsive viewport transition logic.
 *
 * Extracted from ReviewPageClient.tsx to consolidate the 5+ state variables,
 * 2 render-time adjustment blocks, and 5 callbacks that manage viewport transitions
 * (desktop ↔ laptop ↔ tablet ↔ mobile) into a single source of truth.
 *
 * Key patterns:
 * - Render-time adjustment (NOT useEffect) for viewport transition sync (React 19)
 * - useCallback with correct deps for stable identity
 * - selectedId lives in Zustand store — this hook is a consumer, not owner
 *
 * S-FIX-4: aside mode for ALL >= 1024px viewports, Sheet only for < 1024px.
 * Layout modes: desktop (>= 1440), laptop (1280-1439), tablet (1024-1279), mobile (< 1024).
 */
import { useCallback, useRef, useState } from 'react'

import { useIsDesktop, useIsLaptop, useIsXl } from '@/hooks/useMediaQuery'

type LayoutMode = 'desktop' | 'laptop' | 'tablet' | 'mobile'

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
  /** S-FIX-4: true when >= 1024px — detail panel renders as aside (not Sheet) */
  isAsideMode: boolean

  // ── Sheet state (derived — only for mobile) ──
  sheetOpen: boolean

  // ── Mobile toggle button ──
  showToggleButton: boolean

  // ── Detail panel finding derivation ──
  /** Aside mode: activeFindingState, mobile: selectedId */
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

function getLayoutMode(isDesktop: boolean, isXl: boolean, isLaptop: boolean): LayoutMode {
  if (isDesktop) return 'desktop'
  if (isXl) return 'laptop'
  if (isLaptop) return 'tablet'
  return 'mobile'
}

export function useViewportTransition({
  setSelectedFinding,
  selectedId,
}: UseViewportTransitionOptions): UseViewportTransitionReturn {
  const isDesktop = useIsDesktop()
  const isXl = useIsXl()
  const isLaptop = useIsLaptop()
  const layoutMode = getLayoutMode(isDesktop, isXl, isLaptop)
  /** S-FIX-4: aside renders for ALL >= 1024px viewports */
  const isAsideMode = isDesktop || isLaptop

  // ── Internal state ──
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [activeFindingState, setActiveFindingState] = useState<string | null>(null)
  const activeFindingIdRef = useRef<string | null>(null)
  const selectedIdFromClickRef = useRef(false)

  // ── Render-time adjustment: viewport transition sync ──
  // S-FIX-4: Sync selectedId when transitioning between aside mode ↔ mobile
  const [prevIsAsideMode, setPrevIsAsideMode] = useState(isAsideMode)
  if (prevIsAsideMode !== isAsideMode) {
    setPrevIsAsideMode(isAsideMode)
    // Aside→mobile: sync selectedId from activeFindingState so Sheet can show it
    if (
      prevIsAsideMode &&
      !isAsideMode &&
      activeFindingState !== null &&
      selectedId !== activeFindingState
    ) {
      setSelectedFinding(activeFindingState)
      setMobileDrawerOpen(true)
    }
    // Mobile→aside: sync selectedId from activeFindingState so aside shows it
    if (
      !prevIsAsideMode &&
      isAsideMode &&
      activeFindingState !== null &&
      selectedId !== activeFindingState
    ) {
      setSelectedFinding(activeFindingState)
    }
  }

  // ── Derived values ──
  // S-FIX-4: toggle button only at mobile (< 1024px)
  const showToggleButton = !isAsideMode && selectedId !== null && !mobileDrawerOpen

  // S-FIX-4: Sheet only for mobile
  const sheetOpen = isAsideMode ? false : mobileDrawerOpen && selectedId !== null

  // S-FIX-4: aside mode uses activeFindingState, mobile uses selectedId
  const detailFindingId = isAsideMode ? activeFindingState : selectedId

  // ── Callbacks ──

  const handleActiveFindingChange = useCallback(
    (id: string | null) => {
      activeFindingIdRef.current = id
      setActiveFindingState(id)
      // S-FIX-4: Aside mode (>= 1024px): sync selectedId for aside detail panel (non-blocking).
      // Mobile: do NOT sync here — Sheet is a blocking overlay.
      if (isAsideMode) {
        selectedIdFromClickRef.current = true
        setSelectedFinding(id)
        queueMicrotask(() => {
          selectedIdFromClickRef.current = false
        })
      }
    },
    [isAsideMode, setSelectedFinding],
  )

  // Separate handler for finding selection at mobile (Sheet opening).
  // Called only from FindingCardCompact click — NOT from J/K navigation.
  const handleFindingSelect = useCallback(
    (id: string) => {
      if (isAsideMode) return
      selectedIdFromClickRef.current = true
      setSelectedFinding(id)
      queueMicrotask(() => {
        selectedIdFromClickRef.current = false
      })
      // S-FIX-4: Only open drawer at mobile
      setMobileDrawerOpen(true)
    },
    [isAsideMode, setSelectedFinding],
  )

  // Close Sheet when J/K navigates away at mobile (P1 fix: stale Sheet content).
  const handleNavigateAway = useCallback(() => {
    if (!isAsideMode && selectedId !== null) {
      setSelectedFinding(null)
      setMobileDrawerOpen(false)
    }
  }, [isAsideMode, selectedId, setSelectedFinding])

  const handleSheetChange = useCallback((open: boolean) => {
    if (!open) {
      // S-FIX-4: Sheet only at mobile — keep selectedId so toggle button appears (ATDD T3.3)
      setMobileDrawerOpen(false)
    }
  }, [])

  const handleToggleDrawer = useCallback(() => {
    setMobileDrawerOpen(true)
  }, [])

  return {
    layoutMode,
    isDesktop,
    isLaptop,
    isAsideMode,
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
