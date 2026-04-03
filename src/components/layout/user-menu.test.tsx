/// <reference types="vitest/globals" />
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppRole } from '@/lib/auth/getCurrentUser'

import { UserMenu } from './user-menu'

// Hoist mock functions
const { mockSignOut, mockToastError } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockToastError: vi.fn(),
}))

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}))

// Mock window.location
const mockLocationHref = vi.fn()
beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, 'href', {
    set: mockLocationHref,
    configurable: true,
  })
})

const defaultProps = {
  displayName: 'Mona Test',
  email: 'mona@example.com',
  role: 'qa_reviewer' as const,
}

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
  })

  // T4.2: Dropdown opens on trigger click, shows displayName, email, and formatted role
  it('should open dropdown showing user info on trigger click', async () => {
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} />)

    const trigger = screen.getByRole('button', { name: 'User menu' })
    await user.click(trigger)

    expect(screen.getByText('Mona Test')).toBeInTheDocument()
    expect(screen.getByText('mona@example.com')).toBeInTheDocument()
    expect(screen.getByText('QA Reviewer')).toBeInTheDocument()
  })

  // T4.3: Role label formatting
  it('should format role "admin" as "Admin"', async () => {
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} role="admin" />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('should format role "native_reviewer" as "Native Reviewer"', async () => {
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} role="native_reviewer" />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    expect(screen.getByText('Native Reviewer')).toBeInTheDocument()
  })

  it('should show raw role string for unknown roles', async () => {
    const user = userEvent.setup()
    // Cast to test fallback behavior for unexpected role values
    render(<UserMenu {...defaultProps} role={'super_admin' as AppRole} />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    expect(screen.getByText('super_admin')).toBeInTheDocument()
  })

  // T4.4: Sign-out calls supabase and redirects
  it('should call signOut and redirect to /login on success', async () => {
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    const signOutItem = screen.getByRole('menuitem', { name: /sign out/i })
    await user.click(signOutItem)

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce()
    })
    expect(mockLocationHref).toHaveBeenCalledWith('/login')
  })

  // T4.5: Sign-out failure shows error toast (thrown error)
  it('should show error toast when signOut throws', async () => {
    mockSignOut.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    const signOutItem = screen.getByRole('menuitem', { name: /sign out/i })
    await user.click(signOutItem)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to sign out. Please try again.')
    })
    expect(mockLocationHref).not.toHaveBeenCalled()
  })

  // F2: Sign-out failure via returned error object (Supabase pattern)
  it('should show error toast when signOut returns error object', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('Session expired') })
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    const signOutItem = screen.getByRole('menuitem', { name: /sign out/i })
    await user.click(signOutItem)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to sign out. Please try again.')
    })
    expect(mockLocationHref).not.toHaveBeenCalled()
  })

  // Trigger button renders with correct aria-label
  it('should render trigger button with aria-label "User menu"', () => {
    render(<UserMenu {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument()
  })

  // Sign out item shows "Sign out" with LogOut icon text
  it('should show "Sign out" menu item', async () => {
    const user = userEvent.setup()
    render(<UserMenu {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })
})
