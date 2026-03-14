/**
 * Tests — Story 4.1a: FindingCard (expanded detail view)
 *
 * Covers: STATUS_BG typing, finding number display, L3 markers,
 * suggestedFix, CJK/lang attributes, reduced motion, fallback badge.
 *
 * Guardrails referenced: #25, #36, #37, #39
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { FindingCard } from '@/features/review/components/FindingCard'
import { buildFindingForUI } from '@/test/factories'

function renderCard(overrides?: Record<string, unknown>) {
  const finding = buildFindingForUI({
    id: 'finding-1',
    severity: 'major',
    category: 'accuracy',
    description: 'Mistranslation of key term',
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
    />,
  )
}

describe('FindingCard', () => {
  // ── Basic rendering ──

  it('should render finding card with data-testid and finding-id', () => {
    renderCard()

    const card = screen.getByTestId('finding-card')
    expect(card).toBeInTheDocument()
    expect(card.getAttribute('data-finding-id')).toBe('finding-1')
  })

  it('should NOT have role="row" or aria-expanded (delegated to FindingCardCompact)', () => {
    renderCard()

    const card = screen.getByTestId('finding-card')
    expect(card.getAttribute('role')).toBeNull()
    expect(card.getAttribute('aria-expanded')).toBeNull()
  })

  it('should display finding number as #1/5', () => {
    renderCard()

    expect(screen.getByText('#1/5')).toBeInTheDocument()
  })

  it('should render category text', () => {
    renderCard({ category: 'terminology' })

    expect(screen.getByText('terminology')).toBeInTheDocument()
  })

  // ── STATUS_BG (typed — accepts FindingStatus keys only) ──

  it('should apply accepted status background class', () => {
    renderCard({ status: 'accepted' })

    const card = screen.getByTestId('finding-card')
    expect(card.className).toMatch(/finding-bg-accepted/)
  })

  it('should apply rejected status background class', () => {
    renderCard({ status: 'rejected' })

    const card = screen.getByTestId('finding-card')
    expect(card.className).toMatch(/finding-bg-rejected/)
  })

  it('should apply no extra background for pending status', () => {
    renderCard({ status: 'pending' })

    const card = screen.getByTestId('finding-card')
    // pending is not in STATUS_BG, so no special background
    expect(card.className).not.toMatch(/finding-bg-accepted|finding-bg-rejected|finding-bg-flagged/)
  })

  // ── L3 Markers ──

  it('should show "L3 Confirmed" badge when description contains L3 Confirmed marker', () => {
    renderCard({ description: 'Some finding [L3 Confirmed]' })

    expect(screen.getByTestId('l3-confirm-badge')).toHaveTextContent('L3 Confirmed')
  })

  it('should show "L3 disagrees" badge when description contains L3 Disagrees marker', () => {
    renderCard({ description: 'Some finding [L3 Disagrees]' })

    expect(screen.getByTestId('l3-disagree-badge')).toHaveTextContent('L3 disagrees')
  })

  it('should strip L3 markers from displayed description', () => {
    renderCard({ description: 'Actual issue [L3 Confirmed]' })

    // The clean description should not contain the marker
    expect(screen.getByText('Actual issue')).toBeInTheDocument()
  })

  // ── Suggested Fix ──

  it('should render suggested fix when present', () => {
    renderCard({ suggestedFix: 'Use "ระบบ" instead' })

    expect(screen.getByText(/Suggested:/)).toBeInTheDocument()
    expect(screen.getByText(/Use "ระบบ" instead/)).toBeInTheDocument()
  })

  it('should not render suggested fix section when null', () => {
    renderCard({ suggestedFix: null })

    expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument()
  })

  // ── Source/Target text with lang attribute (G#39) ──

  it('should set lang attribute on source text (G#39)', () => {
    renderCard({ sourceTextExcerpt: 'Source text here' })

    const sourceEl = screen.getByText('Source text here')
    expect(sourceEl.getAttribute('lang')).toBe('en-US')
  })

  it('should set lang attribute on target text (G#39)', () => {
    renderCard({ targetTextExcerpt: 'ข้อความเป้าหมาย' })

    const targetEl = screen.getByText('ข้อความเป้าหมาย')
    expect(targetEl.getAttribute('lang')).toBe('th-TH')
  })

  it('should apply CJK scale class for Japanese target text', () => {
    const finding = buildFindingForUI({
      id: 'cjk-1',
      targetTextExcerpt: '品質チェック',
    })

    render(
      <FindingCard
        finding={finding}
        findingIndex={0}
        totalFindings={1}
        sourceLang="en-US"
        targetLang="ja-JP"
      />,
    )

    const targetEl = screen.getByText('品質チェック')
    expect(targetEl.className).toMatch(/cjk-scale/)
  })

  // ── Reduced motion (G#37) ──

  it('should apply animate-fade-in when isNew=true and motion not reduced (G#37)', () => {
    // Default matchMedia mock returns no reduced motion preference
    const finding = buildFindingForUI({ id: 'new-1' })

    render(<FindingCard finding={finding} findingIndex={0} totalFindings={1} isNew />)

    const card = screen.getByTestId('finding-card')
    expect(card.className).toMatch(/animate-fade-in/)
  })

  it('should NOT apply animate-fade-in when reduced motion is active (G#37)', () => {
    // Mock reduced motion preference
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMediaMock)

    const finding = buildFindingForUI({ id: 'new-2' })

    render(<FindingCard finding={finding} findingIndex={0} totalFindings={1} isNew />)

    const card = screen.getByTestId('finding-card')
    expect(card.className).not.toMatch(/animate-fade-in/)

    vi.unstubAllGlobals()
  })

  // ── Fallback badge ──

  it('should show Fallback badge when aiModel differs from primary model', () => {
    renderCard({
      detectedByLayer: 'L2',
      aiModel: 'gpt-3.5-turbo',
    })

    expect(screen.getByTestId('fallback-badge')).toHaveTextContent('Fallback')
  })

  it('should NOT show Fallback badge for L1 findings', () => {
    renderCard({
      detectedByLayer: 'L1',
      aiModel: 'some-model',
    })

    expect(screen.queryByTestId('fallback-badge')).not.toBeInTheDocument()
  })

  it('should NOT show Fallback badge when aiModel is null', () => {
    renderCard({
      detectedByLayer: 'L2',
      aiModel: null,
    })

    expect(screen.queryByTestId('fallback-badge')).not.toBeInTheDocument()
  })

  // ── Quick action buttons (Story 4.2 — enabled) ──

  it('should render enabled accept and reject buttons for non-manual findings', () => {
    renderCard()

    const acceptBtn = screen.getByRole('button', { name: /Accept finding/i })
    const rejectBtn = screen.getByRole('button', { name: /Reject finding/i })

    expect(acceptBtn).toBeEnabled()
    expect(rejectBtn).toBeEnabled()
  })

  it('should disable accept and reject buttons for manual findings', () => {
    renderCard({ status: 'manual' })

    const acceptBtn = screen.getByRole('button', { name: /Accept finding/i })
    const rejectBtn = screen.getByRole('button', { name: /Reject finding/i })

    expect(acceptBtn).toBeDisabled()
    expect(rejectBtn).toBeDisabled()
  })

  // ── No source/target = no source/target sections ──

  it('should not render source/target sections when excerpts are null', () => {
    renderCard({
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
    })

    expect(screen.queryByText(/Source:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Target:/)).not.toBeInTheDocument()
  })
})
