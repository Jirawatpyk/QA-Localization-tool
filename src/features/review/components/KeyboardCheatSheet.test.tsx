/**
 * TDD GREEN PHASE — Story 4.0: Review Infrastructure Setup
 * Component: KeyboardCheatSheet
 * Tests for keyboard shortcut reference dialog
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { KeyboardCheatSheet } from '@/features/review/components/KeyboardCheatSheet'

// Setup matchMedia for useReducedMotion
function setupMatchMedia(prefersReducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('KeyboardCheatSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMatchMedia(false)
  })

  it('[P0] C1: should open on Ctrl+Shift+/ key combination', () => {
    render(<KeyboardCheatSheet />)

    // Initially closed — no dialog visible
    expect(screen.queryByRole('dialog')).toBeNull()

    // Press Ctrl+Shift+?
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '?',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      )
    })

    // Dialog should now be open
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()
    expect(dialog.getAttribute('aria-modal') ?? dialog.getAttribute('data-state')).toBeDefined()
  })

  it('[P2] C2: should display hotkeys grouped by 5 categories', () => {
    render(<KeyboardCheatSheet />)

    // Open the dialog
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '?',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      )
    })

    // Check 5 category headings
    const expectedCategories = [
      'Navigation',
      'Review Actions',
      'Bulk Operations',
      'Search',
      'Panels',
    ]
    for (const category of expectedCategories) {
      expect(screen.getByText(category)).toBeDefined()
    }
  })
})
