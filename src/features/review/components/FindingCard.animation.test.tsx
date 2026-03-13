/**
 * RED PHASE: Will pass after Story 4.1d implementation
 *
 * Tests — Story 4.1d: FindingCard expand/collapse animation
 * Test IDs: T5.1, T5.2, RT-4a, RT-4b
 *
 * Verifies that expand/collapse animations respect prefers-reduced-motion
 * and use the correct CSS transition properties.
 *
 * Guardrails referenced: #37 (prefers-reduced-motion)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

import { FindingCard } from '@/features/review/components/FindingCard'
import { buildFindingForUI } from '@/test/factories'

// ── matchMedia control for reduced motion simulation ──

function stubMatchMedia(prefersReducedMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

// ── Default render helper ──

function renderExpandedCard(overrides?: Record<string, unknown>) {
  const finding = buildFindingForUI({
    id: 'anim-test-1',
    severity: 'major',
    category: 'accuracy',
    description: 'Animation test finding',
    detectedByLayer: 'L2',
    aiConfidence: 80,
    ...overrides,
  })

  return render(
    <FindingCard
      finding={finding}
      findingIndex={0}
      totalFindings={3}
      sourceLang="en-US"
      targetLang="th-TH"
    />,
  )
}

describe('FindingCard — expand/collapse animation (Story 4.1d)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Animation with motion enabled
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] should apply transition class on expand when motion enabled', () => {
    // Arrange: motion NOT reduced
    stubMatchMedia(false)

    // Act
    renderExpandedCard()

    // Assert: card should have transition/animation classes for smooth expand
    const card = screen.getByTestId('finding-card')
    // The expand animation should use a transition class (e.g., animate-expand, transition-all)
    expect(card.className).toMatch(/transition|animate/)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Reduced motion (Guardrail #37)
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] should NOT apply transition class when useReducedMotion returns true', () => {
    // Arrange: motion reduced
    stubMatchMedia(true)

    // Act
    renderExpandedCard()

    // Assert: no transition/animation class — instant expand
    const card = screen.getByTestId('finding-card')
    expect(card.className).not.toMatch(/animate-fade-in|animate-expand/)
  })

  it('[P1] should have duration-0 class when reduced motion active', () => {
    // Arrange: motion reduced
    stubMatchMedia(true)

    // Act
    renderExpandedCard()

    // Assert: duration-0 ensures instant transition (Guardrail #37)
    const card = screen.getByTestId('finding-card')
    expect(card.className).toMatch(/duration-0/)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Animation timing specification
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] expansion animation should use 150ms ease-out', () => {
    // Arrange: motion NOT reduced
    stubMatchMedia(false)

    // Act
    renderExpandedCard()

    // Assert: the card or its animation wrapper uses 150ms ease-out timing
    const card = screen.getByTestId('finding-card')
    // Check for Tailwind duration-150 and ease-out classes
    expect(card.className).toMatch(/duration-150/)
    expect(card.className).toMatch(/ease-out/)
  })
})
