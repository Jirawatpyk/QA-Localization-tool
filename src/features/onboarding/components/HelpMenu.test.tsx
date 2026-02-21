import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

const mockUpdateTourState = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: { success: true } }),
)
vi.mock('@/features/onboarding/actions/updateTourState.action', () => ({
  updateTourState: (...args: unknown[]) => mockUpdateTourState(...args),
}))

import { HelpMenu } from './HelpMenu'

describe('HelpMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render help menu trigger with correct testid and aria-label', () => {
    render(<HelpMenu />)
    const trigger = screen.getByTestId('help-menu-trigger')
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('aria-label')).toBe('Help')
  })

  it('should render as a button element', () => {
    render(<HelpMenu />)
    const trigger = screen.getByTestId('help-menu-trigger')
    expect(trigger.tagName).toBe('BUTTON')
  })

  it('should not crash on multiple renders', () => {
    const { rerender } = render(<HelpMenu />)
    rerender(<HelpMenu />)
    expect(screen.getByTestId('help-menu-trigger')).toBeDefined()
  })
})
