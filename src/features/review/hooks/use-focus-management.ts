'use client'

import { useCallback, useRef } from 'react'

// ── Types ──

type FocusZone = 'filter-bar' | 'finding-list' | 'detail-panel' | 'action-bar'

type EscapeLevel = 'dropdown' | 'modal' | 'expanded' | 'filter' | 'selection'

type EscapeLayerEntry = {
  level: EscapeLevel
  close: () => void
}

export type { FocusZone, EscapeLevel, EscapeLayerEntry }

// ── Focus Trap ──

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
}

export function createFocusTrap(container: HTMLElement): {
  activate: () => void
  deactivate: () => void
} {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return

    const focusable = getFocusableElements(container)
    if (focusable.length === 0) return

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    if (event.shiftKey) {
      // Shift+Tab: if at first element, wrap to last
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      // Tab: if at last element, wrap to first
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return {
    activate() {
      container.addEventListener('keydown', handleKeyDown)
      // Focus first focusable element
      const focusable = getFocusableElements(container)
      if (focusable.length > 0) {
        focusable[0]!.focus()
      }
    },
    deactivate() {
      container.removeEventListener('keydown', handleKeyDown)
    },
  }
}

// ── Hook ──

type UseFocusManagementReturn = {
  /** Create and manage focus trap for a container */
  trapFocus: (container: HTMLElement) => { activate: () => void; deactivate: () => void }

  /** Save current focus for later restore (Guardrail #30) */
  saveFocus: () => void

  /** Restore previously saved focus */
  restoreFocus: () => void

  /** Auto-advance to next Pending finding, skipping reviewed (Guardrail #32) */
  autoAdvance: (
    findingIds: string[],
    statusMap: Map<string, string>,
    currentFindingId: string,
    actionBarSelector?: string,
  ) => string | null

  /** Register an escape layer (Guardrail #31) */
  pushEscapeLayer: (level: EscapeLevel, close: () => void) => void

  /** Remove an escape layer */
  popEscapeLayer: (level: EscapeLevel) => void

  /** Handle Esc: close innermost layer, stopPropagation */
  handleEscape: (event: KeyboardEvent) => EscapeLevel | null

  /** Get saved focus ref (for testing/debugging) */
  savedFocusRef: React.RefObject<HTMLElement | null>

  /** Escape layer stack (for testing) */
  escapeLayersRef: React.RefObject<EscapeLayerEntry[]>
}

export function useFocusManagement(): UseFocusManagementReturn {
  const savedFocusRef = useRef<HTMLElement | null>(null)
  const escapeLayersRef = useRef<EscapeLayerEntry[]>([])

  const trapFocus = useCallback((container: HTMLElement) => {
    return createFocusTrap(container)
  }, [])

  const saveFocus = useCallback(() => {
    savedFocusRef.current = document.activeElement as HTMLElement | null
  }, [])

  const restoreFocus = useCallback(() => {
    if (savedFocusRef.current) {
      savedFocusRef.current.focus()
    }
  }, [])

  const autoAdvance = useCallback(
    (
      findingIds: string[],
      statusMap: Map<string, string>,
      currentFindingId: string,
      actionBarSelector?: string,
    ): string | null => {
      const currentIndex = findingIds.indexOf(currentFindingId)
      if (currentIndex === -1) return null

      // Look for next pending finding after current, then wrap around (M6 fix)
      const searchOrder = [
        ...findingIds.slice(currentIndex + 1),
        ...findingIds.slice(0, currentIndex),
      ]
      for (const id of searchOrder) {
        const status = statusMap.get(id)
        if (status === 'pending') {
          // Use requestAnimationFrame (Guardrail #32)
          const targetId = id
          requestAnimationFrame(() => {
            const element = document.querySelector(
              `[data-finding-id="${CSS.escape(targetId)}"]`,
            ) as HTMLElement | null
            element?.focus()
          })
          return targetId
        }
      }

      // No pending found — focus action bar (Guardrail #32)
      requestAnimationFrame(() => {
        const actionBar = document.querySelector(
          actionBarSelector ?? '[role="toolbar"]',
        ) as HTMLElement | null
        actionBar?.focus()
      })
      return null
    },
    [],
  )

  const pushEscapeLayer = useCallback((level: EscapeLevel, close: () => void) => {
    escapeLayersRef.current.push({ level, close })
  }, [])

  const popEscapeLayer = useCallback((level: EscapeLevel) => {
    // Use findLastIndex to remove innermost (most recent) match (L3)
    const idx = escapeLayersRef.current.findLastIndex((l) => l.level === level)
    if (idx >= 0) {
      escapeLayersRef.current.splice(idx, 1)
    }
  }, [])

  const handleEscape = useCallback((event: KeyboardEvent): EscapeLevel | null => {
    if (escapeLayersRef.current.length === 0) return null

    // Close innermost (last) layer
    const innermost = escapeLayersRef.current.pop()!
    innermost.close()
    event.stopPropagation()
    return innermost.level
  }, [])

  return {
    trapFocus,
    saveFocus,
    restoreFocus,
    autoAdvance,
    pushEscapeLayer,
    popEscapeLayer,
    handleEscape,
    savedFocusRef,
    escapeLayersRef,
  }
}
