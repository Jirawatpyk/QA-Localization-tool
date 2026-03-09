/**
 * TA expansion — Story 4.0: KeyboardCheatSheet
 * Gap coverage for dialog close + focus restore behavior
 */
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

describe('KeyboardCheatSheet — TA expansion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setupMatchMedia(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('[P1] G4: should close dialog via close button and restore focus to trigger', async () => {
    // Use real timers — Radix Dialog animations + waitFor conflict with fake timers in jsdom
    vi.useRealTimers()

    render(<KeyboardCheatSheet />)

    // Create a focusable element as the trigger origin
    const triggerOrigin = document.createElement('button')
    triggerOrigin.setAttribute('data-testid', 'cheat-sheet-trigger')
    triggerOrigin.textContent = 'Trigger'
    document.body.appendChild(triggerOrigin)
    triggerOrigin.focus()
    expect(document.activeElement).toBe(triggerOrigin)

    // Open dialog via Ctrl+Shift+?
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

    // Dialog should be open
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()

    // Close via the close button (Radix Esc dispatch doesn't work in jsdom)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)

    // Wait for dialog to close + RADIX_EXIT_ANIMATION_MS (250ms) for focus restore
    await waitFor(
      () => {
        expect(document.activeElement).toBe(triggerOrigin)
      },
      { timeout: 2000 },
    )

    // Cleanup
    document.body.removeChild(triggerOrigin)
  })
})
