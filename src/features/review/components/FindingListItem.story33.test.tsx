/** Story 3.3 ATDD — AC9: L3 Findings Display with Confirm/Contradict Badges — RED PHASE (TDD) */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FindingListItem } from '@/features/review/components/FindingListItem'
import { buildDbFinding } from '@/test/factories'
import type { DetectedByLayer } from '@/types/finding'

// Helper to build a UI finding with L3 fields from DB finding factory
function buildL3FindingForUI(overrides?: Record<string, unknown>) {
  const dbFinding = buildDbFinding({
    detectedByLayer: 'L3' as DetectedByLayer,
    aiConfidence: 92,
    severity: 'major',
    category: 'accuracy',
    description: 'Deep analysis found semantic mismatch',
    ...overrides,
  })

  return {
    ...dbFinding,
    id: dbFinding.segmentId ?? `finding-${Date.now()}`,
    severity: (dbFinding.severity ?? 'major') as 'critical' | 'major' | 'minor',
    category: dbFinding.category ?? 'accuracy',
    description: dbFinding.description ?? 'Deep analysis found semantic mismatch',
    detectedByLayer: (dbFinding.detectedByLayer ?? 'L3') as DetectedByLayer,
    aiConfidence: dbFinding.aiConfidence ?? null,
    sourceTextExcerpt: dbFinding.sourceTextExcerpt ?? null,
    targetTextExcerpt: dbFinding.targetTextExcerpt ?? null,
    suggestedFix: dbFinding.suggestedFix ?? null,
    aiModel: null,
  }
}

describe('FindingListItem — Story 3.3: L3 Confirm/Contradict Badges', () => {
  it('[P1] U30: should render green "Confirmed by L3" badge when description contains [L3 Confirmed]', () => {
    const finding = buildL3FindingForUI({
      detectedByLayer: 'L2' as DetectedByLayer,
      description: 'Mistranslation detected [L3 Confirmed]',
      aiConfidence: 88,
    })

    render(<FindingListItem finding={finding} />)

    // Should display a green "Confirmed by L3" badge/indicator
    const confirmBadge = screen.getByTestId('l3-confirm-badge')
    expect(confirmBadge).toBeTruthy()
    expect(confirmBadge.textContent).toMatch(/Confirmed by L3/i)
    // Badge should have green/success styling
    expect(confirmBadge.className).toContain('text-status-pass')
  })

  it('[P1] U31: should render amber "L3 disagrees" badge when description contains [L3 Disagrees]', () => {
    const finding = buildL3FindingForUI({
      detectedByLayer: 'L2' as DetectedByLayer,
      description: 'Mistranslation detected [L3 Disagrees]',
      aiConfidence: 85,
    })

    render(<FindingListItem finding={finding} />)

    // Should display an amber "L3 disagrees" badge/indicator
    const disagreeBadge = screen.getByTestId('l3-disagree-badge')
    expect(disagreeBadge).toBeTruthy()
    expect(disagreeBadge.textContent).toMatch(/L3 disagrees/i)
    // Badge should have amber/warning styling
    expect(disagreeBadge.className).toContain('text-warning')
  })

  it('[P1] U32: should strip [L3 Confirmed] and [L3 Disagrees] markers from visible description text', () => {
    const findingConfirmed = buildL3FindingForUI({
      detectedByLayer: 'L2' as DetectedByLayer,
      description: 'Mistranslation detected [L3 Confirmed]',
    })

    const { unmount } = render(<FindingListItem finding={findingConfirmed} />)

    // The visible description text should NOT show the raw marker
    const descriptionEl = screen.getByTestId('finding-description')
    expect(descriptionEl.textContent).not.toContain('[L3 Confirmed]')
    expect(descriptionEl.textContent).toContain('Mistranslation detected')

    unmount()

    // Test with [L3 Disagrees] marker
    const findingDisagrees = buildL3FindingForUI({
      detectedByLayer: 'L2' as DetectedByLayer,
      description: 'Awkward phrasing in translation [L3 Disagrees]',
    })

    render(<FindingListItem finding={findingDisagrees} />)

    const descriptionEl2 = screen.getByTestId('finding-description')
    expect(descriptionEl2.textContent).not.toContain('[L3 Disagrees]')
    expect(descriptionEl2.textContent).toContain('Awkward phrasing in translation')
  })

  it('[P1] U33: should display no L3 badge when description has no markers', () => {
    const finding = buildL3FindingForUI({
      detectedByLayer: 'L2' as DetectedByLayer,
      description: 'Regular L2 finding without L3 review',
    })

    render(<FindingListItem finding={finding} />)

    // No L3 confirm or disagree badge should be rendered
    expect(screen.queryByTestId('l3-confirm-badge')).toBeNull()
    expect(screen.queryByTestId('l3-disagree-badge')).toBeNull()
    // Description should render normally
    const descriptionEl = screen.getByTestId('finding-description')
    expect(descriptionEl.textContent).toContain('Regular L2 finding without L3 review')
  })
})
