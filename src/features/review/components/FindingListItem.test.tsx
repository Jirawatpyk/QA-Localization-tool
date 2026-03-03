/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC9: Individual finding display row
 *
 * TDD RED PHASE — all tests are `it.skip()`.
 * Dev removes `.skip` and makes tests pass during implementation.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { FindingListItem } from '@/features/review/components/FindingListItem'
import { buildDbFinding } from '@/test/factories'
import type { DetectedByLayer } from '@/types/finding'

// Helper to build a UI finding with AI fields from DB finding factory
function buildFindingForUI(overrides?: Record<string, unknown>) {
  const dbFinding = buildDbFinding({
    detectedByLayer: 'L2' as DetectedByLayer,
    aiConfidence: 88,
    severity: 'major',
    category: 'accuracy',
    description: 'Missing translation for key term.',
    ...overrides,
  })

  return {
    ...dbFinding,
    id: dbFinding.segmentId ?? `finding-${Date.now()}`,
    severity: (dbFinding.severity ?? 'major') as 'critical' | 'major' | 'minor',
    category: dbFinding.category ?? 'accuracy',
    description: dbFinding.description ?? 'Missing translation for key term.',
    detectedByLayer: (dbFinding.detectedByLayer ?? 'L2') as DetectedByLayer,
    aiConfidence: dbFinding.aiConfidence ?? null,
    sourceTextExcerpt: dbFinding.sourceTextExcerpt ?? null,
    targetTextExcerpt: dbFinding.targetTextExcerpt ?? null,
    suggestedFix: dbFinding.suggestedFix ?? null,
  }
}

describe('FindingListItem', () => {
  // ── P0: Required display elements ──

  it('[P0] should render severity badge, category, LayerBadge, description, and ConfidenceBadge', () => {
    const finding = buildFindingForUI()

    render(<FindingListItem finding={finding} />)

    // Severity badge
    expect(screen.getByText(/major/i)).toBeTruthy()
    // Category
    expect(screen.getByText(/accuracy/i)).toBeTruthy()
    // Layer badge (L2 = "AI")
    expect(screen.getByTestId('layer-badge')).toBeTruthy()
    // Description text
    expect(screen.getByText(/Missing translation for key term/i)).toBeTruthy()
    // Confidence badge (88%)
    expect(screen.getByTestId('confidence-badge')).toBeTruthy()
  })

  // ── P1: Truncation ──

  it('[P1] should truncate description at 100 chars with ellipsis', () => {
    const longDescription = 'A'.repeat(150)
    const finding = buildFindingForUI({ description: longDescription })

    render(<FindingListItem finding={finding} />)

    const descriptionEl = screen.getByTestId('finding-description')
    const displayText = descriptionEl.textContent ?? ''
    expect(displayText.length).toBeLessThanOrEqual(103) // 100 chars + "..."
    expect(displayText).toMatch(/\.{3}$/)
  })

  // ── P1: Expand/collapse ──

  it('[P1] should expand/collapse toggle detail area', () => {
    const longDescription = 'A'.repeat(150)
    const finding = buildFindingForUI({ description: longDescription })

    render(<FindingListItem finding={finding} />)

    // Initially collapsed — detail area not visible
    expect(screen.queryByTestId('finding-detail')).toBeNull()

    // Click to expand
    const toggleButton = screen.getByRole('button', { name: /expand|detail|more/i })
    fireEvent.click(toggleButton)

    // Detail area visible with full description
    const detail = screen.getByTestId('finding-detail')
    expect(detail).toBeTruthy()
    expect(detail.textContent).toContain('A'.repeat(150))

    // Click again to collapse
    fireEvent.click(toggleButton)
    expect(screen.queryByTestId('finding-detail')).toBeNull()
  })

  // ── P1: New finding highlight ──

  it('[P1] should mark newly inserted finding with data-new="true" and fade-in class', () => {
    const finding = buildFindingForUI()

    render(<FindingListItem finding={finding} isNew />)

    const item = screen.getByTestId('finding-list-item')
    expect(item.getAttribute('data-new')).toBe('true')
    expect(item.className).toMatch(/fade-in|animate-fade/i)
  })

  // ── P2: Reduced motion ──

  it('[P2] should disable animation when prefers-reduced-motion is enabled', () => {
    // Mock prefers-reduced-motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    const finding = buildFindingForUI()

    render(<FindingListItem finding={finding} isNew />)

    const item = screen.getByTestId('finding-list-item')
    expect(item.className).not.toMatch(/fade-in|animate-fade/i)
  })

  // ── P1: Accessibility ──

  it('[P1] should have aria-expanded reflecting expand/collapse state', () => {
    const longDescription = 'A'.repeat(150)
    const finding = buildFindingForUI({ description: longDescription })

    render(<FindingListItem finding={finding} />)

    const toggleButton = screen.getByRole('button', { name: /expand|detail|more/i })
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggleButton)
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false')
  })
})
