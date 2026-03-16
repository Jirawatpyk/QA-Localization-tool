/**
 * Shared test helpers for FindingList keyboard navigation tests (Story 4.1b).
 *
 * Extracted from FindingList.keyboard.test.tsx to keep split files < 300 lines.
 * Contains: factory helpers, default props builder, key press utility, navigate helper.
 */
import { fireEvent, act, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

/** Build 2C + 2M + 2m findings spanning all severity groups */
export function buildMixedSeverityFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
    buildFindingForUI({ id: 'c2', severity: 'critical', aiConfidence: 80 }),
    buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
    buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 }),
    buildFindingForUI({ id: 'n2', severity: 'minor', aiConfidence: 40 }),
  ]
}

/** Build default FindingList props with optional overrides */
export function defaultProps(overrides?: Record<string, unknown>) {
  return {
    findings: buildMixedSeverityFindings(),
    expandedIds: new Set<string>(),
    onToggleExpand: vi.fn(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    ...overrides,
  }
}

/** Fire keyDown on a grid element (wrapped in act) */
export function pressKeyOnGrid(
  grid: HTMLElement,
  key: string,
  eventInit?: Partial<KeyboardEventInit>,
) {
  act(() => {
    fireEvent.keyDown(grid, { key, bubbles: true, ...eventInit })
  })
}

/** Navigate forward N times via J key presses (RV-M1: extracted helper) */
export function navigateForward(grid: HTMLElement, count: number) {
  for (let i = 0; i < count; i++) {
    pressKeyOnGrid(grid, 'j')
  }
}

/** Open the Minor accordion by clicking its trigger */
export function openMinorAccordion() {
  const trigger = screen.getByText(/Minor \(2\)/)
  fireEvent.click(trigger)
}
