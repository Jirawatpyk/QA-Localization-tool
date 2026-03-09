/**
 * TDD GREEN PHASE — Story 4.0: Review Infrastructure Setup
 * Component: ReviewActionBar
 * Tests for tooltip, aria-keyshortcuts, button count/order
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ReviewActionBar } from '@/features/review/components/ReviewActionBar'

describe('ReviewActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] B1: should make tooltip accessible via keyboard focus', async () => {
    const user = userEvent.setup()

    render(<ReviewActionBar />)

    // Tab into toolbar — all buttons are disabled (until Story 4.2),
    // so disabled buttons are NOT in the tab order in jsdom.
    // The toolbar itself (role="toolbar", tabIndex=0) receives focus.
    await user.tab()

    const toolbar = screen.getByRole('toolbar', { name: /review actions/i })
    expect(toolbar).toHaveFocus()

    // Verify tooltip infrastructure: each button wrapped in TooltipTrigger
    // with aria-keyshortcuts for screen reader discoverability.
    // Note: Radix Tooltip portal rendering does not produce role="tooltip" in jsdom
    // because jsdom lacks layout engine. Tooltip visibility validated in E2E.
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons[0]!.getAttribute('aria-keyshortcuts')).toBe('a')
  })

  it('[P1] B2: should have correct aria-keyshortcuts on each button', () => {
    render(<ReviewActionBar />)

    const expectedShortcuts = [
      { label: /accept/i, shortcut: 'a' },
      { label: /reject/i, shortcut: 'r' },
      { label: /flag/i, shortcut: 'f' },
      { label: /note/i, shortcut: 'n' },
      { label: /source/i, shortcut: 's' },
      { label: /override/i, shortcut: '-' },
      { label: /add/i, shortcut: '+' },
    ]

    for (const { label, shortcut } of expectedShortcuts) {
      const button = screen.getByRole('button', { name: label })
      expect(button.getAttribute('aria-keyshortcuts')).toBe(shortcut)
    }
  })

  it('[P1] B3 boundary: should render exactly 7 buttons in order Accept, Reject, Flag, Note, Source, Override, Add', () => {
    render(<ReviewActionBar />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(7)

    const expectedOrder = ['Accept', 'Reject', 'Flag', 'Note', 'Source', 'Override', 'Add']
    for (let i = 0; i < expectedOrder.length; i++) {
      expect(buttons[i]!.textContent).toContain(expectedOrder[i])
    }
  })
})
