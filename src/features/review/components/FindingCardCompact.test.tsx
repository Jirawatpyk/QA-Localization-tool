/**
 * ATDD Tests — Story 4.1a: Finding List Display & Progressive Disclosure
 * AC2: FindingCardCompact Scanning Format
 *
 * GREEN PHASE: FindingCardCompact implemented.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { FindingCardCompact } from '@/features/review/components/FindingCardCompact'
import type { FindingForDisplay } from '@/features/review/types'
import { buildDbFinding } from '@/test/factories'
import type { DetectedByLayer, FindingSeverity, FindingStatus } from '@/types/finding'

// ── Helper: convert DbFindingInsert → FindingForDisplay ──

function buildFindingForUI(overrides?: Record<string, unknown>): FindingForDisplay {
  const dbFinding = buildDbFinding({
    detectedByLayer: 'L2' as DetectedByLayer,
    aiConfidence: 88,
    severity: 'major',
    category: 'accuracy',
    description: 'Test finding description',
    ...overrides,
  })
  return {
    id: (overrides?.['id'] as string) ?? dbFinding.segmentId ?? `finding-${Date.now()}`,
    severity: (dbFinding.severity ?? 'major') as FindingSeverity,
    category: dbFinding.category ?? 'accuracy',
    description: dbFinding.description ?? 'Test finding',
    status: (dbFinding.status ?? 'pending') as FindingStatus,
    detectedByLayer: (dbFinding.detectedByLayer ?? 'L2') as DetectedByLayer,
    aiConfidence: dbFinding.aiConfidence ?? null,
    sourceTextExcerpt: dbFinding.sourceTextExcerpt ?? null,
    targetTextExcerpt: dbFinding.targetTextExcerpt ?? null,
    suggestedFix: dbFinding.suggestedFix ?? null,
    aiModel: (overrides?.['aiModel'] as string) ?? null,
  }
}

describe('FindingCardCompact', () => {
  // ── T2.1 [P0]: Dense row renders all required elements ──

  it('[T2.1][P0] should render dense row with severity icon + category + layer badge + preview + confidence + actions', () => {
    const finding = buildFindingForUI({
      severity: 'major',
      category: 'accuracy',
      detectedByLayer: 'L2',
      aiConfidence: 88,
      sourceTextExcerpt: 'Source preview text',
      targetTextExcerpt: 'Target preview text',
    })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={true}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    // Severity indicator with text label (G#36: never icon-only)
    expect(screen.getByText('Major')).toBeInTheDocument()
    // Category text
    expect(screen.getByText('accuracy')).toBeInTheDocument()
    // Layer badge — L2 renders as "AI" label
    expect(screen.getByTestId('layer-badge')).toBeInTheDocument()
    // Preview text
    expect(screen.getByText(/Source preview text/)).toBeInTheDocument()
    expect(screen.getByText(/Target preview text/)).toBeInTheDocument()
    // Confidence badge — renders as "High (88%)"
    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument()
    expect(screen.getByText(/88%/)).toBeInTheDocument()
    // Quick action buttons present (disabled)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(1)
  })

  // ── T2.2 [P1]: Quick action icons disabled ──

  it('[T2.2][P1] should render quick action icons with 50% opacity and cursor-not-allowed', () => {
    const finding = buildFindingForUI()

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    const actionButtons = screen.getAllByRole('button')
    for (const btn of actionButtons) {
      expect(btn).toHaveClass('opacity-50')
      expect(btn).toHaveClass('cursor-not-allowed')
      expect(btn).toBeDisabled()
    }
  })

  // ── T2.3 [P1]: Roving tabindex ──

  it('[T2.3][P1] should set tabIndex=0 when isActive=true and tabIndex=-1 when isActive=false', () => {
    const finding = buildFindingForUI()

    // Active row
    const { rerender } = render(
      <FindingCardCompact
        finding={finding}
        isActive={true}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    const row = screen.getByRole('row')
    expect(row).toHaveAttribute('tabindex', '0')

    // Inactive row
    rerender(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    expect(row).toHaveAttribute('tabindex', '-1')
  })

  // ── T2.4 [P1]: Focus indicator (G#27) ──

  it('[T2.4][P1] should apply focus-visible outline 2px primary with 4px offset (G#27)', () => {
    const finding = buildFindingForUI()

    render(
      <FindingCardCompact
        finding={finding}
        isActive={true}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    const row = screen.getByRole('row')
    // Tailwind focus-visible classes for G#27 compliance
    expect(row.className).toMatch(/focus-visible:outline/)
    expect(row.className).toMatch(/focus-visible:outline-2/)
    expect(row.className).toMatch(/focus-visible:outline-offset-4/)
  })

  // ── T2.5 [P1]: L3 markers badges ──

  it('[T2.5][P1] should render [L3 Confirmed] badge when description contains L3 confirmed marker', () => {
    const finding = buildFindingForUI({
      description: 'Test finding [L3 Confirmed] with extra details',
    })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    expect(screen.getByText(/L3 Confirmed/)).toBeInTheDocument()
  })

  it('[T2.5b][P1] should render [L3 Disagrees] badge when description contains L3 disagrees marker', () => {
    const finding = buildFindingForUI({
      description: 'Test finding [L3 Disagrees] with reasoning',
    })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    expect(screen.getByText(/L3 Disagrees/)).toBeInTheDocument()
  })

  // ── T2.6 [P2]: Fallback model badge ──

  it('[T2.6][P2] should show fallback model badge when aiModel differs from PRIMARY_MODELS', () => {
    const finding = buildFindingForUI({
      detectedByLayer: 'L2',
      aiModel: 'gpt-3.5-turbo',
    })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    expect(screen.getByText(/fallback/i)).toBeInTheDocument()
  })

  // ── T2.7 [P1]: aria-expanded toggles ──

  it('[T2.7][P1] should toggle aria-expanded on expand/collapse', () => {
    const finding = buildFindingForUI()
    const onExpand = vi.fn()

    render(
      <FindingCardCompact
        finding={finding}
        isActive={true}
        isExpanded={false}
        sourceLang="en"
        targetLang="th"
        onExpand={onExpand}
      />,
    )

    const row = screen.getByRole('row')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(row)
    expect(onExpand).toHaveBeenCalled()
  })

  // ── T2.8 [P1]: lang attribute on source/target preview (G#39) ──

  it('[T2.8][P1] should set lang attribute on source/target preview spans with BCP-47 value (G#39)', () => {
    const finding = buildFindingForUI({
      sourceTextExcerpt: 'Hello world',
      targetTextExcerpt: 'สวัสดีชาวโลก',
    })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    const sourceSpan = screen.getByText('Hello world')
    const targetSpan = screen.getByText('สวัสดีชาวโลก')
    expect(sourceSpan).toHaveAttribute('lang', 'en')
    expect(targetSpan).toHaveAttribute('lang', 'th')
  })

  // ── T2.9 [P1]: Confidence hidden for L1 findings ──

  it('[T2.9][P1] should hide confidence badge for L1 findings', () => {
    const finding = buildFindingForUI({
      detectedByLayer: 'L1',
      aiConfidence: null,
    })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    // No confidence percentage should be visible
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  // ── T2.10 [P1]: Click on disabled action does NOT trigger row expand ──

  it('[T2.10][P1] should NOT trigger row expand when clicking disabled action icon', () => {
    const finding = buildFindingForUI()
    const onExpand = vi.fn()

    render(
      <FindingCardCompact
        finding={finding}
        isActive={true}
        sourceLang="en"
        targetLang="th"
        onExpand={onExpand}
      />,
    )

    const disabledButtons = screen.getAllByRole('button')
    // Click each disabled action button
    for (const btn of disabledButtons) {
      fireEvent.click(btn)
    }

    // onExpand should NOT have been called
    expect(onExpand).not.toHaveBeenCalled()
  })

  // ── T3.10 [P2]: New finding fade-in animation ──

  it('[T3.10][P2] should apply fade-in animation class when isNew=true', () => {
    const finding = buildFindingForUI()

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        isNew={true}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    const row = screen.getByRole('row')
    expect(row.className).toMatch(/animate-fade/)
  })

  // ── B1 [P1]: Category exactly 20 chars → no truncation ──

  it('[B1][P1] should NOT truncate category when exactly 20 characters', () => {
    const category20 = 'abcdefghijklmnopqrst' // exactly 20 chars
    const finding = buildFindingForUI({ category: category20 })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    expect(screen.getByText(category20)).toBeInTheDocument()
    expect(screen.queryByText('...')).not.toBeInTheDocument()
  })

  // ── B2 [P1]: Category 21 chars → truncated with "..." ──

  it('[B2][P1] should truncate category with "..." when 21 characters', () => {
    const category21 = 'abcdefghijklmnopqrstu' // 21 chars
    const finding = buildFindingForUI({ category: category21 })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    // Full 21-char category should NOT be visible
    expect(screen.queryByText(category21)).not.toBeInTheDocument()
    // Truncated version should appear
    const truncated = screen.getByText(/abcdefghijklmnopqrst\.\.\./)
    expect(truncated).toBeInTheDocument()
  })

  // ── B3 [P1]: Preview exactly 60 chars → no "..." ──

  it('[B3][P1] should NOT truncate preview when exactly 60 characters', () => {
    const preview60 = 'A'.repeat(60) // exactly 60 chars
    const finding = buildFindingForUI({ sourceTextExcerpt: preview60 })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    expect(screen.getByText(preview60)).toBeInTheDocument()
  })

  // ── B4 [P1]: Preview 61 chars → "..." appended ──

  it('[B4][P1] should truncate preview with "..." when 61 characters', () => {
    const preview61 = 'B'.repeat(61) // 61 chars
    const finding = buildFindingForUI({ sourceTextExcerpt: preview61 })

    render(
      <FindingCardCompact
        finding={finding}
        isActive={false}
        sourceLang="en"
        targetLang="th"
        onExpand={() => {}}
      />,
    )

    // Full 61-char preview should NOT be visible
    expect(screen.queryByText(preview61)).not.toBeInTheDocument()
    // Truncated at 60 chars + "..."
    const truncated = 'B'.repeat(60) + '...'
    expect(screen.getByText(truncated)).toBeInTheDocument()
  })
})
