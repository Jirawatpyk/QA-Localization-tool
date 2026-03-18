/**
 * Story 4.4a TA: OverrideHistoryPanel — Component Tests
 * Tests: loading state, empty state, entries rendering, fetchHistory null guard
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  OverrideHistoryPanel,
  type OverrideHistoryPanelProps,
  type OverrideHistoryEntry,
} from '@/features/review/components/OverrideHistoryPanel'

const FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

function buildHistoryEntry(overrides?: Partial<OverrideHistoryEntry>): OverrideHistoryEntry {
  return {
    id: 'ra-1',
    findingId: FINDING_ID,
    actionType: 'accept',
    previousState: 'pending',
    newState: 'accepted',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    metadata: null,
    ...overrides,
  }
}

describe('OverrideHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should render null when isVisible is false', () => {
    const { container } = render(
      <OverrideHistoryPanel
        findingId={FINDING_ID}
        projectId={PROJECT_ID}
        isVisible={false}
        fetchHistory={undefined}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('[P1] should show "No history available." when fetchHistory returns empty', async () => {
    const mockFetch = vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: [] }))

    render(
      <OverrideHistoryPanel
        findingId={FINDING_ID}
        projectId={PROJECT_ID}
        isVisible={true}
        fetchHistory={mockFetch as OverrideHistoryPanelProps['fetchHistory']}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('No history available.')).toBeInTheDocument()
    })
  })

  it('[P1] should render entries with previousState and newState', async () => {
    const entries = [
      buildHistoryEntry({
        id: 'ra-2',
        previousState: 'accepted',
        newState: 'rejected',
        createdAt: '2026-03-15T12:00:00Z',
      }),
      buildHistoryEntry({
        id: 'ra-1',
        previousState: 'pending',
        newState: 'accepted',
        createdAt: '2026-03-15T10:00:00Z',
      }),
    ]
    const mockFetch = vi.fn((..._args: unknown[]) =>
      Promise.resolve({ success: true, data: entries }),
    )

    render(
      <OverrideHistoryPanel
        findingId={FINDING_ID}
        projectId={PROJECT_ID}
        isVisible={true}
        fetchHistory={mockFetch as OverrideHistoryPanelProps['fetchHistory']}
      />,
    )

    await waitFor(() => {
      // 'Accepted' appears twice: as previousState of entry 1, and newState of entry 2
      expect(screen.getAllByText('Accepted')).toHaveLength(2)
      expect(screen.getByText('Rejected')).toBeInTheDocument()
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  it('[P1] should have aria-label="Decision history"', async () => {
    const mockFetch = vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: [] }))

    render(
      <OverrideHistoryPanel
        findingId={FINDING_ID}
        projectId={PROJECT_ID}
        isVisible={true}
        fetchHistory={mockFetch as OverrideHistoryPanelProps['fetchHistory']}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Decision history')).toBeInTheDocument()
    })
  })

  it('[P1] should not call fetchHistory when fetchHistory is undefined', () => {
    render(
      <OverrideHistoryPanel
        findingId={FINDING_ID}
        projectId={PROJECT_ID}
        isVisible={true}
        fetchHistory={undefined}
      />,
    )

    // Should render the panel but show empty state without loading
    expect(screen.queryByText('Loading history...')).not.toBeInTheDocument()
  })

  it('[P1] should show loading then clear on fetch error (CR-M1)', async () => {
    const mockFetch = vi.fn((..._args: unknown[]) => Promise.reject(new Error('Network error')))

    render(
      <OverrideHistoryPanel
        findingId={FINDING_ID}
        projectId={PROJECT_ID}
        isVisible={true}
        fetchHistory={mockFetch as OverrideHistoryPanelProps['fetchHistory']}
      />,
    )

    // After error, loading should be cleared (CR-M1 fix: try/finally)
    await waitFor(() => {
      expect(screen.queryByText('Loading history...')).not.toBeInTheDocument()
    })
  })
})
