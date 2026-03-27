/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC5: Non-native badge in Override History
 *
 * TDD RED PHASE — all tests skipped until implementation complete.
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

describe('OverrideHistoryPanel — Non-Native Label (Story 5.2a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── AC5: Non-native action shows "(non-native)" label ──

  it('[P1][AC5] should show "(non-native)" label for actions with metadata.non_native = true', async () => {
    const entries: OverrideHistoryEntry[] = [
      buildHistoryEntry({
        id: 'ra-1',
        metadata: { non_native: true },
      }),
      buildHistoryEntry({
        id: 'ra-2',
        actionType: 'reject',
        previousState: 'accepted',
        newState: 'rejected',
        metadata: { non_native: false }, // native reviewer — no label
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
      // First entry (non-native) should have the label
      expect(screen.getByText(/\(non-native\)/)).toBeInTheDocument()
    })

    // Only ONE "(non-native)" label (not on the native action)
    const nonNativeLabels = screen.getAllByText(/\(non-native\)/)
    expect(nonNativeLabels).toHaveLength(1)
  })

  // ── AC5: Label styling — italic + muted color ──

  it('[P1][AC5] should render "(non-native)" in italic with muted color', async () => {
    const entries: OverrideHistoryEntry[] = [
      buildHistoryEntry({
        metadata: { non_native: true },
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
      const label = screen.getByText(/\(non-native\)/)
      expect(label).toBeInTheDocument()
      // Should have italic styling
      expect(label.className).toMatch(/italic/)
      // Should have muted color
      expect(label.className).toMatch(/text-muted-foreground/)
    })
  })
})
