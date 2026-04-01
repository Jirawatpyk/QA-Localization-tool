import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { AppNotification } from '@/features/dashboard/types'

const mockMarkAsRead = vi.fn()
const mockMarkAllAsRead = vi.fn()

const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    tenantId: 't1',
    userId: 'u1',
    type: 'glossary_updated',
    projectId: 'p1',
    title: 'Glossary Updated',
    body: 'New terms added to glossary',
    isRead: false,
    metadata: null,
    createdAt: '2026-03-28T10:00:00Z',
  },
  {
    id: 'n2',
    tenantId: 't1',
    userId: 'u1',
    type: 'analysis_complete',
    projectId: 'p1',
    title: 'File Processed',
    body: 'Processing complete for report.xliff',
    isRead: false,
    metadata: null,
    createdAt: '2026-03-28T09:00:00Z',
  },
  {
    id: 'n3',
    tenantId: 't1',
    userId: 'u1',
    type: 'language_pair_graduated',
    projectId: 'p1',
    title: 'Score Updated',
    body: 'MQM score recalculated',
    isRead: true,
    metadata: null,
    createdAt: '2026-03-28T08:00:00Z',
  },
]

vi.mock('@/features/dashboard/hooks/useNotifications', () => ({
  useNotifications: vi.fn(),
}))

async function setupMock(overrides?: { notifications?: AppNotification[]; unreadCount?: number }) {
  const { useNotifications } = await import('@/features/dashboard/hooks/useNotifications')
  const notifs = overrides?.notifications ?? MOCK_NOTIFICATIONS
  const unread = overrides?.unreadCount ?? notifs.filter((n) => !n.isRead).length
  vi.mocked(useNotifications).mockReturnValue({
    notifications: notifs,
    unreadCount: unread,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  })
}

describe('NotificationDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Bell icon and badge ──

  it('should render bell icon button with accessible label', async () => {
    await setupMock()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    const bell = screen.getByTestId('notification-bell')
    expect(bell).toBeTruthy()
    expect(bell.getAttribute('aria-label')).toBe('Notifications')
  })

  it('should show unread count badge when there are unread notifications', async () => {
    await setupMock({ unreadCount: 2 })
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    const badge = screen.getByTestId('notification-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('2')
  })

  it('should show "9+" when unread count exceeds 9', async () => {
    await setupMock({ unreadCount: 15 })
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    const badge = screen.getByTestId('notification-badge')
    expect(badge.textContent).toBe('9+')
  })

  it('should not show badge when unread count is 0', async () => {
    await setupMock({ notifications: [MOCK_NOTIFICATIONS[2]!], unreadCount: 0 })
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    expect(screen.queryByTestId('notification-badge')).toBeNull()
  })

  // ── P0: Dropdown open/content ──

  it('should open dropdown and show notifications when bell is clicked', async () => {
    await setupMock()
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))

    const dropdown = screen.getByTestId('notification-dropdown')
    expect(dropdown).toBeTruthy()
    expect(screen.getByText('Notifications')).toBeTruthy()
  })

  it('should render each notification with title and body', async () => {
    await setupMock()
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))

    expect(screen.getByTestId('notification-item-n1')).toBeTruthy()
    expect(screen.getByTestId('notification-item-n2')).toBeTruthy()
    expect(screen.getByTestId('notification-item-n3')).toBeTruthy()

    expect(screen.getByText('Glossary Updated')).toBeTruthy()
    expect(screen.getByText('New terms added to glossary')).toBeTruthy()
    expect(screen.getByText('File Processed')).toBeTruthy()
  })

  it('should show "No notifications" when list is empty', async () => {
    await setupMock({ notifications: [], unreadCount: 0 })
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))

    expect(screen.getByText('No notifications')).toBeTruthy()
  })

  // ── P1: Mark as read ──

  it('should call markAsRead when clicking an unread notification', async () => {
    await setupMock()
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))
    await user.click(screen.getByTestId('notification-item-n1'))

    expect(mockMarkAsRead).toHaveBeenCalledWith('n1')
  })

  it('should not call markAsRead when clicking a read notification', async () => {
    await setupMock()
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))
    await user.click(screen.getByTestId('notification-item-n3'))

    expect(mockMarkAsRead).not.toHaveBeenCalled()
  })

  // ── P1: Mark all as read ──

  it('should show "Mark all read" button when there are unread notifications', async () => {
    await setupMock({ unreadCount: 2 })
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))

    expect(screen.getByTestId('notification-mark-all-read')).toBeTruthy()
  })

  it('should not show "Mark all read" button when unread count is 0', async () => {
    await setupMock({ notifications: [MOCK_NOTIFICATIONS[2]!], unreadCount: 0 })
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))

    expect(screen.queryByTestId('notification-mark-all-read')).toBeNull()
  })

  it('should call markAllAsRead when "Mark all read" button is clicked', async () => {
    await setupMock({ unreadCount: 2 })
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))
    await user.click(screen.getByTestId('notification-mark-all-read'))

    expect(mockMarkAllAsRead).toHaveBeenCalledOnce()
  })

  // ── P1: Unread indicator dot ──

  it('should show unread dot for unread notifications only', async () => {
    await setupMock()
    const user = userEvent.setup()
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    await user.click(screen.getByTestId('notification-bell'))

    // Unread n1 should have sr-only "Unread" text
    const n1 = screen.getByTestId('notification-item-n1')
    expect(within(n1).getByText('Unread')).toBeTruthy()

    // Read n3 should NOT have "Unread" text
    const n3 = screen.getByTestId('notification-item-n3')
    expect(within(n3).queryByText('Unread')).toBeNull()
  })

  // ── Boundary: badge values ──

  it('should show exact count for unread counts 1-9', async () => {
    await setupMock({ unreadCount: 1 })
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    expect(screen.getByTestId('notification-badge').textContent).toBe('1')
  })

  it('should show "9+" for exactly 10 unread', async () => {
    await setupMock({ unreadCount: 10 })
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    expect(screen.getByTestId('notification-badge').textContent).toBe('9+')
  })

  it('should show "9" for exactly 9 unread', async () => {
    await setupMock({ unreadCount: 9 })
    const { NotificationDropdown } = await import('./NotificationDropdown')
    render(<NotificationDropdown userId="u1" tenantId="t1" />)

    expect(screen.getByTestId('notification-badge').textContent).toBe('9')
  })
})
