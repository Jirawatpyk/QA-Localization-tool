/**
 * ATDD Story 4.8 — Baseline Fix #5: NotificationDropdown (TDD Green Phase)
 * Test: TA-05 (AC2, P0)
 *
 * Verifies that unread notification indicator has sr-only text
 * for screen reader accessibility (WCAG SC 1.4.1 — Guardrail #25).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { NotificationDropdown } from './NotificationDropdown'

// Mock the useNotifications hook
vi.mock('@/features/dashboard/hooks/useNotifications', () => ({
  useNotifications: vi.fn((..._args: unknown[]) => ({
    notifications: [
      {
        id: 'n1',
        tenantId: 't1',
        userId: 'u1',
        type: 'glossary_updated',
        title: 'Glossary Updated',
        body: 'New terms added',
        isRead: false,
        metadata: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'n2',
        tenantId: 't1',
        userId: 'u1',
        type: 'glossary_updated',
        title: 'File Processed',
        body: 'Processing complete',
        isRead: true,
        metadata: null,
        createdAt: new Date().toISOString(),
      },
    ],
    unreadCount: 1,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  })),
}))

describe('NotificationDropdown Accessibility', () => {
  describe('TA-05: Unread indicator has sr-only text (AC2 Major #5, P0)', () => {
    it('should render sr-only "Unread" text inside unread dot', async () => {
      const user = userEvent.setup()
      render(<NotificationDropdown userId="u1" tenantId="t1" />)

      // Open dropdown
      const bell = screen.getByTestId('notification-bell')
      await user.click(bell)

      // Find the unread notification item
      const unreadItem = screen.getByTestId('notification-item-n1')

      // Should have visually hidden "Unread" text (accessible to screen readers)
      const unreadText = within(unreadItem).getByText('Unread')
      expect(unreadText).toBeTruthy()
      expect(unreadText.textContent).toBe('Unread')
    })

    it('should not render sr-only text when notification is read', async () => {
      const user = userEvent.setup()
      render(<NotificationDropdown userId="u1" tenantId="t1" />)

      // Open dropdown
      const bell = screen.getByTestId('notification-bell')
      await user.click(bell)

      // Find the read notification item
      const readItem = screen.getByTestId('notification-item-n2')

      // Should NOT have "Unread" text for read notifications
      const unreadTexts = within(readItem).queryAllByText('Unread')
      expect(unreadTexts).toHaveLength(0)
    })
  })
})
