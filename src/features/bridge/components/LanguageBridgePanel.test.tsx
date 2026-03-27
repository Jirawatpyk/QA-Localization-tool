/**
 * ATDD Story 5.1 — LanguageBridgePanel component unit tests
 *
 * Tests 5 visual states (AC4) + accessibility (AC5) + interactions:
 *   - Standard: full panel (back-translation, explanation, confidence, notes)
 *   - Hidden: not rendered when native pair / null segmentId
 *   - Confidence Warning: orange border + "Flag recommended" when < threshold
 *   - Loading: skeleton with reduced-motion support
 *   - Error: "Back-translation unavailable" + retry button
 *   - Cached badge + Refresh button (Guardrail #77)
 *   - aria-live="polite" on content updates (Guardrail #33)
 *   - lang attributes on text elements (Guardrail #70)
 *   - Confidence indicator with icon + text + color (Guardrail #25)
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

// Mock the hook to control states
const mockUseBackTranslation = vi.fn()
vi.mock('@/features/bridge/hooks/useBackTranslation', () => ({
  useBackTranslation: (...args: unknown[]) => mockUseBackTranslation(...args),
}))

// Mock useReducedMotion
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

import { LanguageBridgePanel } from './LanguageBridgePanel'

const MOCK_BT_DATA = {
  backTranslation: 'Hello there',
  contextualExplanation: 'Polite greeting with particle',
  confidence: 0.95,
  languageNotes: [] as Array<{ noteType: string; originalText: string; explanation: string }>,
  translationApproach: null,
  cached: false,
  latencyMs: 150,
}

const DEFAULT_PROPS = {
  segmentId: 'seg-1',
  sourceLang: 'en-US',
  projectId: 'proj-1',
  isNonNative: true,
  confidenceThreshold: 0.6,
}

describe('LanguageBridgePanel', () => {
  // ── AC4 / Scenario 4.1 [P1]: Standard state ───────────────────────────
  it('should render all sections in standard state', () => {
    mockUseBackTranslation.mockReturnValue({
      data: MOCK_BT_DATA,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)

    expect(screen.getByText('Hello there')).toBeDefined()
    expect(screen.getByText('Polite greeting with particle')).toBeDefined()
    expect(screen.getByText(/95%/)).toBeDefined()
  })

  // ── AC4 / Scenario 4.2 [P1]: Hidden state (native pair) ───────────────
  it('should not render when isNonNative is false (native pair)', () => {
    mockUseBackTranslation.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    const { container } = render(<LanguageBridgePanel {...DEFAULT_PROPS} isNonNative={false} />)

    expect(container.querySelector('[data-testid="language-bridge-panel"]')).toBeNull()
  })

  // ── AC4 / Scenario 4.3 [P1]: Confidence Warning state ─────────────────
  it('should show orange border and "Flag recommended" when confidence < threshold', () => {
    mockUseBackTranslation.mockReturnValue({
      data: { ...MOCK_BT_DATA, confidence: 0.45 },
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)

    expect(screen.getByText(/Flag recommended/i)).toBeDefined()
    expect(screen.getByTestId('language-bridge-panel').getAttribute('data-state')).toBe(
      'confidence-warning',
    )
  })

  // ── Confidence boundary: 0.59 → warning, 0.60 → standard ──────────────
  it('should show warning at confidence 0.59 (below default 0.6 threshold)', () => {
    mockUseBackTranslation.mockReturnValue({
      data: { ...MOCK_BT_DATA, confidence: 0.59 },
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })
    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('language-bridge-panel').getAttribute('data-state')).toBe(
      'confidence-warning',
    )
  })

  it('should show standard at confidence 0.60 (at threshold)', () => {
    mockUseBackTranslation.mockReturnValue({
      data: { ...MOCK_BT_DATA, confidence: 0.6 },
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })
    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('language-bridge-panel').getAttribute('data-state')).toBe('standard')
  })

  it('should show standard at confidence 0.61 (above threshold)', () => {
    mockUseBackTranslation.mockReturnValue({
      data: { ...MOCK_BT_DATA, confidence: 0.61 },
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })
    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('language-bridge-panel').getAttribute('data-state')).toBe('standard')
  })

  // ── AC4 / Scenario 4.4 [P2]: Loading state ────────────────────────────
  it('should show skeleton in loading state', () => {
    mockUseBackTranslation.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('bt-skeleton')).toBeDefined()
  })

  it('should respect prefers-reduced-motion for skeleton fade-in', async () => {
    const { useReducedMotion } = await import('@/hooks/useReducedMotion')
    vi.mocked(useReducedMotion).mockReturnValue(true)

    mockUseBackTranslation.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const skeleton = screen.getByTestId('bt-skeleton')
    // When reduced motion, no animate-pulse class
    expect(skeleton.innerHTML).not.toContain('animate-pulse')
  })

  // ── AC4 / Scenario 4.5 [P1]: Error state ──────────────────────────────
  it('should show error message with retry button in error state', () => {
    const mockRefresh = vi.fn()
    mockUseBackTranslation.mockReturnValue({
      data: null,
      loading: false,
      error: 'AI failed',
      cached: false,
      refresh: mockRefresh,
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    expect(screen.getByText(/Back-translation unavailable/i)).toBeDefined()
    expect(screen.getByTestId('bt-retry-button')).toBeDefined()
  })

  // ── AC4 / Scenario 4.6 [P2]: Cached badge ─────────────────────────────
  it('should show "Cached" badge when result is from cache', () => {
    mockUseBackTranslation.mockReturnValue({
      data: { ...MOCK_BT_DATA, cached: true },
      loading: false,
      error: null,
      cached: true,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('cached-badge')).toBeDefined()
    expect(screen.getByText(/Cached/i)).toBeDefined()
  })

  // ── AC4 / Scenario 4.7 [P2]: Refresh button ───────────────────────────
  it('should show Refresh button that triggers skipCache', async () => {
    const mockRefresh = vi.fn()
    mockUseBackTranslation.mockReturnValue({
      data: MOCK_BT_DATA,
      loading: false,
      error: null,
      cached: false,
      refresh: mockRefresh,
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const refreshBtn = screen.getByTestId('bt-refresh-button')
    await userEvent.click(refreshBtn)
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ── AC4 / Scenario 4.8 [P1]: aria-live="polite" ───────────────────────
  it('should have aria-live="polite" on content update region', () => {
    mockUseBackTranslation.mockReturnValue({
      data: MOCK_BT_DATA,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const liveRegion = screen
      .getByTestId('language-bridge-panel')
      .querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
  })

  // ── AC5 / Scenario 5.3 [P1]: lang attributes ──────────────────────────
  it('should set lang="{sourceLang}" on back-translation text', () => {
    mockUseBackTranslation.mockReturnValue({
      data: MOCK_BT_DATA,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const btText = screen.getByTestId('bt-text')
    expect(btText.getAttribute('lang')).toBe('en-US')
  })

  it('should set lang="en" on contextual explanation', () => {
    mockUseBackTranslation.mockReturnValue({
      data: MOCK_BT_DATA,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const explanation = screen.getByTestId('explanation-text')
    expect(explanation.getAttribute('lang')).toBe('en')
  })

  // ── AC1 / Scenario 1.3 [P2]: Hidden when no segmentId ─────────────────
  it('should not render when segmentId is null (cross-file finding)', () => {
    mockUseBackTranslation.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    const { container } = render(<LanguageBridgePanel {...DEFAULT_PROPS} segmentId={null} />)
    expect(container.querySelector('[data-testid="language-bridge-panel"]')).toBeNull()
  })

  // ── Confidence indicator: icon + text + color (Guardrail #25, #36) ─────
  it('should display confidence with icon, text label, and color', () => {
    mockUseBackTranslation.mockReturnValue({
      data: MOCK_BT_DATA,
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const indicator = screen.getByTestId('confidence-indicator')
    // Must have visible text (not icon-only)
    expect(indicator.textContent).toMatch(/95%|High/)
    // Must have icon (aria-hidden)
    const icon = indicator.querySelector('[aria-hidden="true"]')
    expect(icon).not.toBeNull()
  })

  // ── M4: ConfidenceIndicator 4-tier boundary values ─────────────────────
  describe('ConfidenceIndicator boundary tiers', () => {
    const renderWithConfidence = (confidence: number) => {
      mockUseBackTranslation.mockReturnValue({
        data: { ...MOCK_BT_DATA, confidence },
        loading: false,
        error: null,
        cached: false,
        refresh: vi.fn(),
      })
      render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
      return screen.getByTestId('confidence-indicator')
    }

    it('should show "High" at confidence 0.80 (boundary)', () => {
      const el = renderWithConfidence(0.8)
      expect(el.textContent).toMatch(/High/i)
    })

    it('should show "Moderate" at confidence 0.79 (below High)', () => {
      const el = renderWithConfidence(0.79)
      expect(el.textContent).toMatch(/Moderate/i)
    })

    it('should show "Moderate" at confidence 0.60 (boundary)', () => {
      const el = renderWithConfidence(0.6)
      expect(el.textContent).toMatch(/Moderate/i)
    })

    it('should show "Low" at confidence 0.59 (below Moderate)', () => {
      const el = renderWithConfidence(0.59)
      expect(el.textContent).toMatch(/Low/i)
    })

    it('should show "Low" at confidence 0.40 (boundary)', () => {
      const el = renderWithConfidence(0.4)
      expect(el.textContent).toMatch(/Low/i)
    })

    it('should show "Very Low" at confidence 0.39 (below Low)', () => {
      const el = renderWithConfidence(0.39)
      expect(el.textContent).toMatch(/Very Low/i)
    })
  })

  // ── L1: Language notes rendering with non-empty array ──────────────────
  it('should render language notes list when notes are present', () => {
    mockUseBackTranslation.mockReturnValue({
      data: {
        ...MOCK_BT_DATA,
        languageNotes: [
          { noteType: 'tone_marker', originalText: 'ต้น', explanation: 'Low tone' },
          { noteType: 'politeness_particle', originalText: 'ครับ', explanation: 'Male polite' },
        ],
      },
      loading: false,
      error: null,
      cached: false,
      refresh: vi.fn(),
    })

    render(<LanguageBridgePanel {...DEFAULT_PROPS} />)
    const notesList = screen.getByTestId('language-notes-list')
    expect(notesList).toBeDefined()
    expect(notesList.querySelectorAll('li').length).toBe(2)
  })
})
