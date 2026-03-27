/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC4: NonNativeBadge visibility in FindingCard
 *
 * TDD RED PHASE — all tests skipped until implementation complete.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { FindingCard } from '@/features/review/components/FindingCard'
import { buildFindingForUI } from '@/test/factories'

// Mock useFileState (from review store) — same pattern as FindingCard.test.tsx
vi.mock('@/features/review/stores/review.store', () => ({
  useFileState: vi.fn(() => ({ overrideCounts: new Map() })),
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

function renderCard(overrides?: Record<string, unknown>) {
  const finding = buildFindingForUI({
    id: 'finding-1',
    severity: 'major',
    category: 'accuracy',
    description: 'Test finding for non-native badge',
    detectedByLayer: 'L2',
    aiConfidence: 85,
    ...overrides,
  })

  return render(
    <FindingCard
      finding={finding}
      findingIndex={0}
      totalFindings={5}
      sourceLang="en-US"
      targetLang="th-TH"
      hasNonNativeAction={overrides?.hasNonNativeAction as boolean | undefined}
    />,
  )
}

describe('FindingCard — NonNativeBadge (Story 5.2a)', () => {
  // ── AC4: Badge visible when hasNonNativeAction = true ──

  it('[P1][AC4] should show NonNativeBadge when hasNonNativeAction is true', () => {
    renderCard({ hasNonNativeAction: true })

    expect(screen.getByText('Subject to native audit')).toBeInTheDocument()
  })

  // ── AC4: Badge hidden when hasNonNativeAction = false ──

  it('[P1][AC4] should NOT show NonNativeBadge when hasNonNativeAction is false', () => {
    renderCard({ hasNonNativeAction: false })

    expect(screen.queryByText('Subject to native audit')).not.toBeInTheDocument()
  })

  // ── AC4: Badge placement after other badges ──

  it('[P1][AC4] should render NonNativeBadge after LayerBadge and ConfidenceBadge', () => {
    renderCard({ hasNonNativeAction: true })

    // Verify both badges exist
    const nonNativeBadge = screen.getByTestId('non-native-badge')
    expect(nonNativeBadge).toBeInTheDocument()

    // NonNativeBadge text should appear in the card
    expect(screen.getByText('Subject to native audit')).toBeInTheDocument()
  })
})
